-- Amici e messaggi diretti (docs/design/amici-notifiche.html, docs/GRUPPI.md § Amici).
-- Gli amici sono un elenco a parte dai gruppi: ci si aggiunge con un codice personale (o il link
-- personaldashboard://amici/<codice>) e l'altro deve accettare. Con un amico si ha una chat 1-a-1 SALVATA sul server
-- per 90 giorni (a differenza della chat dei gruppi, che resta solo dal vivo), con messaggi di testo e "schede" dei
-- widget (un video, una nota, un invito a studiare: `kind` + `payload`, che il server non interpreta).
--
-- Sicurezza (come nel nucleo): RLS su ogni tabella, al client solo letture; ogni scrittura passa dalle RPC qui sotto
-- (SECURITY DEFINER, search_path vuoto). Il tempo reale arriva sul topic privato "inbox:<user_id>": lo legge solo il
-- proprietario e ci scrive solo il server (realtime.send dentro le RPC), nessun client.

-- ─── Tabelle ──────────────────────────────────────────────────────────────────────────────────────────────────

-- Il codice personale per farsi aggiungere: interno (il client lo legge solo con my_friend_code()), così chi
-- condivide un gruppo con te non lo vede dal tuo profilo. Stesso alfabeto dei codici dei gruppi.
create table private.friend_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique
    constraint friend_codes_format check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  created_at timestamptz not null default now()
);

-- Richiesta in attesa: da from_user a to_user. Accettata diventa un'amicizia e sparisce.
create table public.friend_requests (
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  constraint friend_requests_not_self check (from_user <> to_user)
);
create index friend_requests_to_user on public.friend_requests (to_user);

-- Un'amicizia, una riga per coppia (user_a < user_b).
create table public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_order check (user_a < user_b)
);
create index friendships_user_b on public.friendships (user_b);

-- Messaggi diretti. kind 'text' = testo; gli altri sono le schede dei widget (payload jsonb, al massimo 512 KB).
-- Si tengono 90 giorni: la lettura li filtra e send_dm cancella quelli più vecchi della coppia.
create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text'
    constraint direct_messages_kind check (kind ~ '^[a-z][a-z0-9_]{0,19}$'),
  body text not null default ''
    constraint direct_messages_body check (char_length(body) <= 500),
  payload jsonb
    constraint direct_messages_payload check (payload is null or pg_catalog.pg_column_size(payload) <= 524288),
  -- clock_timestamp: due messaggi della stessa transazione restano ordinati
  created_at timestamptz not null default clock_timestamp(),
  deleted boolean not null default false,
  constraint direct_messages_not_self check (sender <> recipient)
);
create index direct_messages_sender_time on public.direct_messages (sender, created_at);
create index direct_messages_recipient_time on public.direct_messages (recipient, created_at);

-- Fin dove ho letto la chat con un amico: per i non letti (sui miei dispositivi) e per le ✓✓ (all'amico).
create table public.direct_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  read_until timestamptz not null,
  primary key (user_id, friend_id)
);

-- Tentativi di request_friend, per limitarne la frequenza (come join_attempts).
create table private.friend_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index friend_attempts_user_time on private.friend_attempts (user_id, attempted_at);

alter table private.friend_codes enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_reads enable row level security;
alter table private.friend_attempts enable row level security;

revoke all on public.friend_requests, public.friendships, public.direct_messages, public.direct_reads
  from public, anon, authenticated;
revoke all on private.friend_codes, private.friend_attempts from public, anon, authenticated;

-- ─── Helper delle policy ──────────────────────────────────────────────────────────────────────────────────────

create function private.are_friends(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(p_user_id, (select auth.uid())) and f.user_b = greatest(p_user_id, (select auth.uid()))
  );
$$;

-- C'è una richiesta in attesa tra l'utente corrente e p_user_id, in un verso o nell'altro.
create function private.has_friend_request_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friend_requests r
    where (r.from_user = (select auth.uid()) and r.to_user = p_user_id)
       or (r.from_user = p_user_id and r.to_user = (select auth.uid()))
  );
$$;

grant execute on function private.are_friends(uuid), private.has_friend_request_with(uuid) to authenticated;

-- ─── Policy ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Le policy di select si sommano a quelle del nucleo: il nome di un amico (o di chi ti ha chiesto l'amicizia) e il
-- suo "visto alle" diventano leggibili anche senza un gruppo in comune.

create policy "profili: degli amici e delle richieste" on public.profiles
  for select to authenticated
  using (private.are_friends(id) or private.has_friend_request_with(id));

create policy "visto: degli amici" on public.last_seen
  for select to authenticated
  using (private.are_friends(user_id));

create policy "richieste: solo le proprie" on public.friend_requests
  for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

create policy "amicizie: solo le proprie" on public.friendships
  for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

create policy "messaggi diretti: solo i propri, ultimi 90 giorni" on public.direct_messages
  for select to authenticated
  using (
    (sender = (select auth.uid()) or recipient = (select auth.uid()))
    and created_at > now() - interval '90 days'
  );

-- La propria lettura (non letti sugli altri dispositivi) e quella dell'amico (le ✓✓).
create policy "letture: proprie o dell'amico" on public.direct_reads
  for select to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));

grant select on public.friend_requests, public.friendships, public.direct_messages, public.direct_reads to authenticated;

-- Tempo reale: si riceve solo sulla propria casella. Nessuna policy di invio: ci scrive solo il server.
create policy "amici: ricevere nella propria casella" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'inbox:' || (select auth.uid())::text
  );

-- ─── Funzioni interne ─────────────────────────────────────────────────────────────────────────────────────────

-- Un codice nuovo, diverso da quelli già dati (e da quelli dei gruppi, che new_invite_code già evita).
create function private.new_friend_code()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := private.new_invite_code();
    exit when not exists (select 1 from private.friend_codes c where c.code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Avvisa la casella di un utente (evento "m", come i canali dei gruppi). Se il tempo reale non risponde la
-- scrittura vale lo stesso: l'app rilegge alla riapertura e al rientro.
create function private.notify_inbox(p_user_id uuid, p_payload jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform realtime.send(p_payload, 'm', 'inbox:' || p_user_id::text, true);
exception when others then
  null;
end;
$$;

-- Una riga di direct_messages come la riceve il client.
create function private.dm_json(m public.direct_messages)
returns jsonb
language sql immutable set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', m.id, 'sender', m.sender, 'recipient', m.recipient, 'kind', m.kind, 'body', m.body,
    'payload', m.payload, 'created_at', m.created_at, 'deleted', m.deleted
  );
$$;

revoke all on function private.new_friend_code(), private.notify_inbox(uuid, jsonb), private.dm_json(public.direct_messages)
  from public, anon, authenticated;

-- ─── RPC ──────────────────────────────────────────────────────────────────────────────────────────────────────

-- Il proprio codice (creato la prima volta).
create function public.my_friend_code()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  found_code text;
begin
  select c.code into found_code from private.friend_codes c where c.user_id = uid;
  if found_code is null then
    found_code := private.new_friend_code();
    insert into private.friend_codes (user_id, code) values (uid, found_code)
    on conflict (user_id) do nothing;
    select c.code into found_code from private.friend_codes c where c.user_id = uid;
  end if;
  return found_code;
end;
$$;

-- Un codice nuovo: quello vecchio smette di funzionare (le richieste già arrivate restano).
create function public.regenerate_friend_code()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  new_code text := private.new_friend_code();
begin
  insert into private.friend_codes (user_id, code) values (uid, new_code)
  on conflict (user_id) do update set code = excluded.code, created_at = now();
  return new_code;
end;
$$;

-- Chiede l'amicizia a chi ha il codice. Restituisce uno stato (come join_group, così il tentativo registrato non
-- viene annullato): 'sent' | 'accepted' (l'altro te l'aveva già chiesta: ora siete amici) | 'invalid' | 'self' |
-- 'already_friends' | 'already_sent' | 'too_many' (troppe richieste in attesa) | 'rate_limited'.
create function public.request_friend(p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  clean text := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  target uuid;
  attempts int;
  pending int;
begin
  delete from private.friend_attempts a where a.user_id = uid and a.attempted_at < now() - interval '1 day';
  select count(*) into attempts
  from private.friend_attempts a
  where a.user_id = uid and a.attempted_at > now() - interval '1 hour';
  if attempts >= 20 then
    return 'rate_limited';
  end if;
  insert into private.friend_attempts (user_id) values (uid);

  select c.user_id into target from private.friend_codes c where c.code = clean;
  if target is null or not exists (select 1 from public.profiles p where p.id = target) then
    return 'invalid';
  end if;
  if target = uid then
    return 'self';
  end if;
  if exists (select 1 from public.friendships f where f.user_a = least(uid, target) and f.user_b = greatest(uid, target)) then
    return 'already_friends';
  end if;
  -- l'altro te l'aveva già chiesta: si diventa amici subito
  if exists (select 1 from public.friend_requests r where r.from_user = target and r.to_user = uid) then
    delete from public.friend_requests r where r.from_user = target and r.to_user = uid;
    insert into public.friendships (user_a, user_b) values (least(uid, target), greatest(uid, target));
    perform private.notify_inbox(target, pg_catalog.jsonb_build_object('t', 'accepted', 'by', uid));
    return 'accepted';
  end if;
  if exists (select 1 from public.friend_requests r where r.from_user = uid and r.to_user = target) then
    return 'already_sent';
  end if;
  select count(*) into pending from public.friend_requests r where r.from_user = uid;
  if pending >= 50 then
    return 'too_many';
  end if;
  insert into public.friend_requests (from_user, to_user) values (uid, target);
  perform private.notify_inbox(target, pg_catalog.jsonb_build_object('t', 'request', 'from', uid));
  return 'sent';
end;
$$;

-- Risponde a una richiesta ricevuta.
create function public.answer_friend(p_from uuid, p_accept boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
begin
  delete from public.friend_requests r where r.from_user = p_from and r.to_user = uid;
  if not found then
    raise exception 'no_request' using errcode = '22023';
  end if;
  if p_accept then
    insert into public.friendships (user_a, user_b) values (least(uid, p_from), greatest(uid, p_from))
    on conflict do nothing;
    perform private.notify_inbox(p_from, pg_catalog.jsonb_build_object('t', 'accepted', 'by', uid));
  end if;
  perform private.notify_inbox(uid, pg_catalog.jsonb_build_object('t', 'friends'));
end;
$$;

-- Ritira una richiesta mandata.
create function public.cancel_friend_request(p_to uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  delete from public.friend_requests r where r.from_user = uid and r.to_user = p_to;
  perform private.notify_inbox(p_to, pg_catalog.jsonb_build_object('t', 'friends'));
end;
$$;

-- Toglie un amico: sparisce anche la chat, per tutti e due.
create function public.remove_friend(p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  delete from public.friendships f where f.user_a = least(uid, p_user_id) and f.user_b = greatest(uid, p_user_id);
  if not found then
    raise exception 'not_friend' using errcode = '42501';
  end if;
  delete from public.direct_messages m
  where (m.sender = uid and m.recipient = p_user_id) or (m.sender = p_user_id and m.recipient = uid);
  delete from public.direct_reads d
  where (d.user_id = uid and d.friend_id = p_user_id) or (d.user_id = p_user_id and d.friend_id = uid);
  perform private.notify_inbox(p_user_id, pg_catalog.jsonb_build_object('t', 'friends'));
  perform private.notify_inbox(uid, pg_catalog.jsonb_build_object('t', 'friends'));
end;
$$;

-- Manda un messaggio a un amico. Ora e mittente li decide il server. Al massimo 30 al minuto.
create function public.send_dm(p_to uuid, p_kind text, p_body text, p_payload jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  clean_kind text := coalesce(p_kind, 'text');
  clean_body text := pg_catalog.btrim(coalesce(p_body, ''));
  recent int;
  msg_row public.direct_messages;
  msg jsonb;
begin
  if not private.are_friends(p_to) then
    raise exception 'not_friend' using errcode = '42501';
  end if;
  if clean_kind = 'text' and (clean_body = '' or p_payload is not null) then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if clean_kind <> 'text' and (p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object') then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if char_length(clean_body) > 500 then
    raise exception 'message_too_long' using errcode = '22001';
  end if;
  if p_payload is not null and pg_catalog.pg_column_size(p_payload) > 524288 then
    raise exception 'payload_too_large' using errcode = '22001';
  end if;
  select count(*) into recent
  from public.direct_messages m
  where m.sender = uid and m.created_at > now() - interval '1 minute';
  if recent >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- i 90 giorni: via i messaggi vecchi di questa coppia
  delete from public.direct_messages m
  where ((m.sender = uid and m.recipient = p_to) or (m.sender = p_to and m.recipient = uid))
    and m.created_at < now() - interval '90 days';

  insert into public.direct_messages (sender, recipient, kind, body, payload)
  values (uid, p_to, clean_kind, clean_body, p_payload)
  returning * into msg_row;
  msg := private.dm_json(msg_row);
  perform private.notify_inbox(p_to, pg_catalog.jsonb_build_object('t', 'dm', 'message', msg));
  -- anche agli altri dispositivi di chi scrive
  perform private.notify_inbox(uid, pg_catalog.jsonb_build_object('t', 'dm', 'message', msg));
  return msg;
end;
$$;

-- Elimina un proprio messaggio: resta "Messaggio eliminato", senza testo né scheda.
create function public.delete_dm(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  msg_row public.direct_messages;
begin
  update public.direct_messages m set deleted = true, body = '', payload = null
  where m.id = p_id and m.sender = uid
  returning * into msg_row;
  if msg_row.id is null then
    raise exception 'not_author' using errcode = '42501';
  end if;
  perform private.notify_inbox(msg_row.recipient, pg_catalog.jsonb_build_object('t', 'dm', 'message', private.dm_json(msg_row)));
  perform private.notify_inbox(uid, pg_catalog.jsonb_build_object('t', 'dm', 'message', private.dm_json(msg_row)));
end;
$$;

-- Ho letto la chat con un amico fino a p_until (mai oltre adesso, mai indietro).
create function public.mark_dm_read(p_friend uuid, p_until timestamptz)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  read_to timestamptz := least(coalesce(p_until, now()), now());
begin
  if not private.are_friends(p_friend) then
    raise exception 'not_friend' using errcode = '42501';
  end if;
  insert into public.direct_reads (user_id, friend_id, read_until) values (uid, p_friend, read_to)
  on conflict (user_id, friend_id) do update set read_until = greatest(public.direct_reads.read_until, excluded.read_until);
  perform private.notify_inbox(p_friend, pg_catalog.jsonb_build_object('t', 'read', 'by', uid, 'until', read_to));
  perform private.notify_inbox(uid, pg_catalog.jsonb_build_object('t', 'read', 'by', uid, 'friend', p_friend, 'until', read_to));
end;
$$;

revoke all on function
  public.my_friend_code(),
  public.regenerate_friend_code(),
  public.request_friend(text),
  public.answer_friend(uuid, boolean),
  public.cancel_friend_request(uuid),
  public.remove_friend(uuid),
  public.send_dm(uuid, text, text, jsonb),
  public.delete_dm(uuid),
  public.mark_dm_read(uuid, timestamptz)
  from public, anon;

grant execute on function
  public.my_friend_code(),
  public.regenerate_friend_code(),
  public.request_friend(text),
  public.answer_friend(uuid, boolean),
  public.cancel_friend_request(uuid),
  public.remove_friend(uuid),
  public.send_dm(uuid, text, text, jsonb),
  public.delete_dm(uuid),
  public.mark_dm_read(uuid, timestamptz)
  to authenticated;
