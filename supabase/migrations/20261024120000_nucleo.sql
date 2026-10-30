-- Gruppi — nucleo: profili, dispositivi, gruppi, membri, funzioni dei gruppi.
-- Vedi docs/GRUPPI.md. Regole delle migrazioni cloud (come quelle locali): solo aggiunte in fondo con un nuovo file,
-- mai modificare una migrazione rilasciata, nessuna modifica dello schema fatta a mano nel pannello.
--
-- Sicurezza:
-- - RLS attiva su ogni tabella; ad `anon` non resta nessun privilegio; ad `authenticated` solo quelli elencati.
-- - Le operazioni sensibili passano da funzioni RPC SECURITY DEFINER con `search_path = ''`, nomi completamente
--   qualificati e controllo di auth.uid().
-- - Lo schema `private` non è esposto dall'API: contiene gli helper delle policy e le tabelle interne.

-- ─── Privilegi di default ──────────────────────────────────────────────────────────────────────────────────────
-- Supabase concede di default tutto su tabelle e funzioni nuove ad anon/authenticated: qui si toglie, così ogni
-- oggetto (anche dei moduli futuri) parte chiuso e va aperto esplicitamente.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ─── Tabelle ──────────────────────────────────────────────────────────────────────────────────────────────────

-- Profilo pubblico: solo il nome scelto nell'app. Email, nome reale e avatar di Google restano in auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- minuscolo (unicità quindi case-insensitive), 3–20 caratteri tra a-z 0-9 _ . ; niente punto iniziale/finale né ".."
  username text not null unique
    constraint profiles_username_format check (
      username ~ '^[a-z0-9_.]{3,20}$' and username !~ '(^\.)|(\.$)|(\.\.)'
    ),
  created_at timestamptz not null default now()
);

-- Un dispositivo per installazione (id generato dall'app). È ciò che permette di aggiungere il mobile.
create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null
    constraint devices_platform check (platform in ('windows', 'macos', 'linux', 'android', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- destinazione della FK composta dei moduli: un utente scrive solo sui propri dispositivi
  constraint devices_user_id_id unique (user_id, id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint groups_name_length check (char_length(name) between 1 and 40 and name = btrim(name)),
  description text not null default ''
    constraint groups_description_length check (char_length(description) <= 200),
  -- copia del membro con ruolo 'owner' (tenuta allineata solo dalle funzioni di questo file)
  owner_id uuid not null references public.profiles (id),
  invite_code text not null unique
    constraint groups_invite_code_format check (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  max_members int not null default 30
    constraint groups_max_members check (max_members between 2 and 30),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    constraint group_members_role check (role in ('owner', 'member')),
  -- clock_timestamp: due ingressi nella stessa transazione restano ordinabili (eredità della proprietà)
  joined_at timestamptz not null default clock_timestamp(),
  primary key (group_id, user_id)
);
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';
create index group_members_user_id on public.group_members (user_id);

-- Moduli attivi in un gruppo (oggi solo 'study'). Il nome del modulo compare nel topic Realtime.
create table public.group_features (
  group_id uuid not null references public.groups (id) on delete cascade,
  feature_key text not null
    constraint group_features_key_format check (feature_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  enabled boolean not null default true,
  primary key (group_id, feature_key)
);

-- Tentativi di join_group, per limitarne la frequenza. Interna: nessun client la vede.
create table private.join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_time on private.join_attempts (user_id, attempted_at);

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_features enable row level security;
alter table private.join_attempts enable row level security;

revoke all on public.profiles, public.devices, public.groups, public.group_members, public.group_features
  from public, anon, authenticated;
revoke all on private.join_attempts from public, anon, authenticated;

-- ─── Helper delle policy (riusati da tutti i moduli, presenti e futuri) ──────────────────────────────────────
-- SECURITY DEFINER: leggono group_members senza ricorrere nelle sue stesse policy.

create function private.is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid())
  );
$$;

create function private.is_group_owner(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Vero per sé stessi e per chi condivide almeno un gruppo con l'utente corrente.
create function private.shares_group_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_user_id = (select auth.uid()), false) or exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user_id
  );
$$;

-- Topic Realtime "group:<uuid>:<feature_key>": membro del gruppo e modulo attivo.
-- Il formato si controlla prima del cast, così un topic malformato dà false e non un errore.
create function private.can_access_channel(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  parts text[];
begin
  if p_topic is null or p_topic !~
    '^group:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z][a-z0-9_]{1,30}$' then
    return false;
  end if;
  parts := pg_catalog.string_to_array(p_topic, ':');
  return exists (
    select 1
    from public.group_members m
    join public.group_features f on f.group_id = m.group_id
    where m.group_id = parts[2]::uuid
      and m.user_id = (select auth.uid())
      and f.feature_key = parts[3]
      and f.enabled
  );
end;
$$;

grant execute on function
  private.is_group_member(uuid),
  private.is_group_owner(uuid),
  private.shares_group_with(uuid),
  private.can_access_channel(text)
  to authenticated;

-- ─── Funzioni interne ─────────────────────────────────────────────────────────────────────────────────────────

-- Codice invito: 8 caratteri da un alfabeto senza caratteri ambigui (niente 0 O 1 I L), da byte crittografici.
-- Campionamento con rifiuto (byte < 248 = 31·8) per non favorire nessun carattere.
create function private.new_invite_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
  b int;
begin
  loop
    bytes := extensions.gen_random_bytes(32);
    code := '';
    for i in 0..31 loop
      b := pg_catalog.get_byte(bytes, i);
      if b < 248 then
        code := code || pg_catalog.substr(alphabet, (b % 31) + 1, 1);
        exit when pg_catalog.length(code) = 8;
      end if;
    end loop;
    continue when pg_catalog.length(code) < 8;
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
  end loop;
  return code;
end;
$$;

-- Toglie un membro; se era l'owner la proprietà passa al membro più anziano; un gruppo vuoto viene eliminato.
create function private.leave_group_internal(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  was_owner boolean;
  heir uuid;
begin
  -- serializza uscite e ingressi concorrenti sullo stesso gruppo
  perform 1 from public.groups g where g.id = p_group_id for update;

  delete from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id
  returning m.role = 'owner' into was_owner;
  if not found then
    return;
  end if;

  select m.user_id into heir
  from public.group_members m
  where m.group_id = p_group_id
  order by m.joined_at, m.user_id
  limit 1;

  if heir is null then
    delete from public.groups g where g.id = p_group_id;
  elsif was_owner then
    update public.group_members m set role = 'owner' where m.group_id = p_group_id and m.user_id = heir;
    update public.groups g set owner_id = heir where g.id = p_group_id;
  end if;
end;
$$;

-- Qualunque sia il modo in cui sparisce un profilo (elimina account o cancellazione dal pannello), prima esce da
-- tutti i suoi gruppi con le stesse regole di leave_group.
create function private.on_profile_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
begin
  for gid in select m.group_id from public.group_members m where m.user_id = old.id loop
    perform private.leave_group_internal(gid, old.id);
  end loop;
  return old;
end;
$$;

create trigger profiles_leave_groups
  before delete on public.profiles
  for each row execute function private.on_profile_delete();

revoke all on function private.new_invite_code(), private.leave_group_internal(uuid, uuid),
  private.on_profile_delete() from public, anon, authenticated;

-- ─── Policy ───────────────────────────────────────────────────────────────────────────────────────────────────

create policy "profili: propri o di chi condivide un gruppo" on public.profiles
  for select to authenticated
  using (private.shares_group_with(id));

create policy "dispositivi: solo i propri" on public.devices
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "gruppi: solo i propri" on public.groups
  for select to authenticated
  using (private.is_group_member(id));

create policy "membri: solo dei propri gruppi" on public.group_members
  for select to authenticated
  using (private.is_group_member(group_id));

create policy "moduli: solo dei propri gruppi" on public.group_features
  for select to authenticated
  using (private.is_group_member(group_id));

-- Lettura soltanto: ogni scrittura su queste tabelle passa dalle RPC qui sotto.
grant select on public.profiles, public.devices, public.groups, public.group_members, public.group_features
  to authenticated;

-- ─── RPC ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Errori con messaggi-codice fissi (es. 'username_taken'): l'app li traduce, non mostra il testo del server.

create function private.require_uid()
returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return uid;
end;
$$;

create function private.require_profile()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.profiles p where p.id = uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  return uid;
end;
$$;

revoke all on function private.require_uid(), private.require_profile() from public, anon, authenticated;

-- Ora del server, per correggere lo scarto degli orologi dei PC.
create function public.server_now()
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.require_uid();
  return pg_catalog.clock_timestamp();
end;
$$;

-- Primo accesso (crea il profilo) o cambio nome. Restituisce il nome salvato.
create function public.set_username(p_username text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  clean text := pg_catalog.lower(pg_catalog.btrim(p_username));
begin
  if clean is null or clean !~ '^[a-z0-9_.]{3,20}$' or clean ~ '(^\.)|(\.$)|(\.\.)' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  begin
    insert into public.profiles (id, username) values (uid, clean)
    on conflict (id) do update set username = excluded.username;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
  return clean;
end;
$$;

-- Registra il dispositivo (o ne aggiorna l'ultimo accesso). L'id lo genera l'app al primo accesso.
create function public.touch_device(p_device_id uuid, p_platform text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
begin
  if p_device_id is null then
    raise exception 'invalid_device' using errcode = '22023';
  end if;
  insert into public.devices as d (id, user_id, platform) values (p_device_id, uid, p_platform)
  on conflict (id) do update set last_seen_at = now(), platform = excluded.platform
    where d.user_id = uid;
  if not found then
    -- l'id esiste già ma è di un altro utente
    raise exception 'invalid_device' using errcode = '22023';
  end if;
end;
$$;

create function public.create_group(p_name text, p_description text default '')
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  gid uuid;
begin
  insert into public.groups (name, description, owner_id, invite_code)
  values (pg_catalog.btrim(p_name), coalesce(pg_catalog.btrim(p_description), ''), uid, private.new_invite_code())
  returning id into gid;

  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  insert into public.group_features (group_id, feature_key, enabled) values (gid, 'study', true);
  return gid;
end;
$$;

-- Restituisce uno stato invece di sollevare un'eccezione: con un'eccezione il rollback cancellerebbe anche il
-- tentativo appena registrato e il limite non funzionerebbe.
-- Stati: 'ok' | 'invalid' | 'full' | 'rate_limited' | 'already_member'.
create function public.join_group(p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  clean text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));
  gid uuid;
  cap int;
  attempts int;
  members int;
begin
  delete from private.join_attempts a where a.user_id = uid and a.attempted_at < now() - interval '1 day';

  select count(*) into attempts
  from private.join_attempts a
  where a.user_id = uid and a.attempted_at > now() - interval '10 minutes';
  if attempts >= 10 then
    return 'rate_limited';
  end if;
  insert into private.join_attempts (user_id) values (uid);

  -- FOR UPDATE: due ingressi contemporanei non superano max_members
  select g.id, g.max_members into gid, cap from public.groups g where g.invite_code = clean for update;
  if gid is null then
    return 'invalid';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid) then
    return 'already_member';
  end if;
  select count(*) into members from public.group_members m where m.group_id = gid;
  if members >= cap then
    return 'full';
  end if;

  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'member');
  return 'ok';
end;
$$;

create function public.leave_group(p_group_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not private.is_group_member(p_group_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  perform private.leave_group_internal(p_group_id, uid);
end;
$$;

create function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not private.is_group_owner(p_group_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'cannot_remove_self' using errcode = '22023';
  end if;
  delete from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id and m.role = 'member';
  if not found then
    raise exception 'not_member' using errcode = '22023';
  end if;
end;
$$;

create function public.regenerate_invite_code(p_group_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  code text;
begin
  perform private.require_uid();
  if not private.is_group_owner(p_group_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  code := private.new_invite_code();
  update public.groups g set invite_code = code where g.id = p_group_id;
  return code;
end;
$$;

-- Cancella l'utente da auth.users: a cascata profilo (che prima esce dai gruppi), dispositivi, iscrizioni, totali.
-- Niente service_role nel client: lo fa il server con i privilegi del proprietario della funzione.
create function public.delete_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  delete from auth.users u where u.id = uid;
end;
$$;

revoke all on function
  public.server_now(),
  public.set_username(text),
  public.touch_device(uuid, text),
  public.create_group(text, text),
  public.join_group(text),
  public.leave_group(uuid),
  public.remove_member(uuid, uuid),
  public.regenerate_invite_code(uuid),
  public.delete_account()
  from public, anon;

grant execute on function
  public.server_now(),
  public.set_username(text),
  public.touch_device(uuid, text),
  public.create_group(text, text),
  public.join_group(text),
  public.leave_group(uuid),
  public.remove_member(uuid, uuid),
  public.regenerate_invite_code(uuid),
  public.delete_account()
  to authenticated;
