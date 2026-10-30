-- Gruppi — modulo studio, report per materie: materie del gruppo e totali giornalieri per materia del gruppo.
-- Gli abbinamenti "mia materia → materia del gruppo" restano sul dispositivo: qui non arrivano mai nomi o id delle
-- materie locali, solo "materia del gruppo X, giorno G: N secondi". Vedi docs/GRUPPI.md (Report per materie).
--
-- Regole:
-- - ogni membro crea materie del gruppo (al massimo 50 attive per gruppo, 20 creazioni all'ora per utente);
--   solo il proprietario le rinomina, le unisce e le elimina;
-- - il consenso ("Includi le mie materie nei report dei gruppi") è dell'account, non del dispositivo: spento,
--   le righe dell'utente vengono cancellate e il server rifiuta le nuove da qualsiasi dispositivo;
-- - i totali si scrivono solo con sync_group_subject_totals (sostituisce i giorni mandati e controlla che la somma
--   per giorno non superi il totale giornaliero già condiviso); si cancellano con le RPC di revoca, con l'uscita
--   dal gruppo o con l'eliminazione della materia.

-- ─── Chiave dei nomi ──────────────────────────────────────────────────────────────────────────────────────────
-- Minuscole, senza accenti, punteggiatura e spazi ridotti a uno spazio. I numeri restano: "Fisica I" e "Fisica II"
-- possono essere due materie del gruppo (a unirle "di base" ci pensa la proposta, lato app).
create function private.subject_key(p_name text)
returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(pg_catalog.lower(p_name),
      'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįòóôõöøōŏőùúûüũūŭůűųýÿçćĉċčñńņňśŝşšźżžđ',
      'aaaaaaaaaeeeeeeeeeiiiiiiiiooooooooouuuuuuuuuuyycccccnnnnsssszzzd'),
    '[[:punct:][:space:]]+', ' ', 'g'));
$$;

revoke all on function private.subject_key(text) from public, anon, authenticated;

-- ─── Tabelle ──────────────────────────────────────────────────────────────────────────────────────────────────

create table public.group_subjects (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null
    constraint group_subjects_name_length check (char_length(name) between 1 and 40 and name = btrim(name)),
  name_key text generated always as (private.subject_key(name)) stored
    constraint group_subjects_name_key check (name_key <> ''),
  -- indice della palette delle materie del gruppo (token --group-subject-N dell'app)
  color smallint not null default 0
    constraint group_subjects_color check (color between 0 and 11),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- unita in un'altra materia dello stesso gruppo: resta come "segnaposto" perché gli abbinamenti la seguano
  merged_into uuid,
  constraint group_subjects_group_id_id unique (group_id, id),
  constraint group_subjects_merged foreign key (group_id, merged_into)
    references public.group_subjects (group_id, id) on delete cascade,
  constraint group_subjects_not_self check (merged_into is null or merged_into <> id)
);

create unique index group_subjects_unique_key on public.group_subjects (group_id, name_key) where merged_into is null;

create table public.group_subject_daily_totals (
  user_id uuid not null,
  device_id uuid not null,
  group_id uuid not null,
  subject_id uuid not null,
  -- giorno locale dell'utente
  day date not null,
  seconds int not null
    constraint group_subject_daily_totals_seconds check (seconds between 1 and 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, subject_id, day),
  -- si scrive solo su un proprio dispositivo
  constraint group_subject_daily_totals_device foreign key (user_id, device_id)
    references public.devices (user_id, id) on delete cascade,
  -- la materia è dello stesso gruppo della riga
  constraint group_subject_daily_totals_subject foreign key (group_id, subject_id)
    references public.group_subjects (group_id, id) on delete cascade
);

create index group_subject_daily_totals_group_day on public.group_subject_daily_totals (group_id, day);

-- Consenso dell'account al report per materie (spento se manca la riga).
create table public.subject_report_consent (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table private.subject_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index subject_attempts_user_time on private.subject_attempts (user_id, attempted_at);

alter table public.group_subjects enable row level security;
alter table public.group_subject_daily_totals enable row level security;
alter table public.subject_report_consent enable row level security;
alter table private.subject_attempts enable row level security;

revoke all on public.group_subjects, public.group_subject_daily_totals, public.subject_report_consent
  from public, anon, authenticated;
revoke all on private.subject_attempts from public, anon, authenticated;

-- ─── Policy: solo lettura, ogni scrittura passa dalle RPC ─────────────────────────────────────────────────────

create policy "materie del gruppo: solo dei propri gruppi" on public.group_subjects
  for select to authenticated
  using (private.is_group_member(group_id));

create policy "totali per materia: solo dei propri gruppi" on public.group_subject_daily_totals
  for select to authenticated
  using (private.is_group_member(group_id));

create policy "consenso report: solo il proprio" on public.subject_report_consent
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.group_subjects, public.group_subject_daily_totals, public.subject_report_consent
  to authenticated;

-- Il server somma i dispositivi. security_invoker: valgono le RLS di chi legge.
create view public.group_subject_totals_by_user
with (security_invoker = true)
as
  select t.group_id, t.subject_id, t.user_id, t.day, sum(t.seconds)::int as seconds
  from public.group_subject_daily_totals t
  group by t.group_id, t.subject_id, t.user_id, t.day;

revoke all on public.group_subject_totals_by_user from public, anon, authenticated;
grant select on public.group_subject_totals_by_user to authenticated;

-- ─── Revoca automatica ────────────────────────────────────────────────────────────────────────────────────────

-- Chi esce da un gruppo (abbandono, rimozione, account eliminato) perde le sue righe per materia in quel gruppo.
create function private.on_member_leave_subjects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.group_subject_daily_totals t where t.group_id = old.group_id and t.user_id = old.user_id;
  return old;
end;
$$;

revoke all on function private.on_member_leave_subjects() from public, anon, authenticated;

create trigger group_members_leave_subjects
  after delete on public.group_members
  for each row execute function private.on_member_leave_subjects();

-- ─── RPC ──────────────────────────────────────────────────────────────────────────────────────────────────────

-- Consenso dell'account. Spento: cancella subito tutte le righe per materia dell'utente, in tutti i gruppi.
create function public.set_subject_report_consent(p_enabled boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
begin
  insert into public.subject_report_consent (user_id, enabled, updated_at)
  values (uid, coalesce(p_enabled, false), now())
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = excluded.updated_at;
  if not coalesce(p_enabled, false) then
    delete from public.group_subject_daily_totals t where t.user_id = uid;
  end if;
end;
$$;

-- Nuova materia del gruppo (ogni membro). Se ne esiste già una con lo stesso nome normalizzato restituisce quella:
-- "Nuova materia…" con un nome già presente abbina all'esistente invece di dare errore.
create function public.create_group_subject(p_group_id uuid, p_name text, p_color smallint default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  clean text := pg_catalog.btrim(coalesce(p_name, ''));
  existing uuid;
  active int;
  attempts int;
  new_id uuid;
begin
  if not private.is_group_member(p_group_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  -- serializza le creazioni nello stesso gruppo (limite e unicità)
  perform 1 from public.groups g where g.id = p_group_id for update;

  select s.id into existing
  from public.group_subjects s
  where s.group_id = p_group_id and s.merged_into is null and s.name_key = private.subject_key(clean);
  if existing is not null then
    return existing;
  end if;

  delete from private.subject_attempts a where a.user_id = uid and a.attempted_at < now() - interval '1 day';
  select count(*) into attempts
  from private.subject_attempts a
  where a.user_id = uid and a.attempted_at > now() - interval '1 hour';
  if attempts >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select count(*) into active from public.group_subjects s where s.group_id = p_group_id and s.merged_into is null;
  if active >= 50 then
    raise exception 'subject_limit' using errcode = 'P0001';
  end if;

  insert into private.subject_attempts (user_id) values (uid);
  insert into public.group_subjects (group_id, name, color, created_by)
  values (p_group_id, clean, coalesce(p_color, (active % 12)::smallint), uid)
  returning id into new_id;
  return new_id;
end;
$$;

-- Rinomina e/o cambia colore (solo il proprietario; colore nullo = invariato). Un nome già usato da un'altra materia
-- è rifiutato.
create function public.update_group_subject(p_subject_id uuid, p_name text, p_color smallint)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  gid uuid;
begin
  perform private.require_uid();
  select s.group_id into gid from public.group_subjects s where s.id = p_subject_id and s.merged_into is null;
  if gid is null or not private.is_group_owner(gid) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  begin
    update public.group_subjects s
    set name = pg_catalog.btrim(coalesce(p_name, '')), color = coalesce(p_color, s.color)
    where s.id = p_subject_id;
  exception when unique_violation then
    raise exception 'subject_exists' using errcode = 'P0001';
  end;
end;
$$;

-- Unisce p_from in p_into (solo il proprietario, stesso gruppo): i totali si sommano (mai oltre 86400 per riga),
-- p_from resta come segnaposto con merged_into, e i segnaposto che puntavano a p_from passano a p_into.
create function public.merge_group_subjects(p_from uuid, p_into uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  gid uuid;
  gid_into uuid;
begin
  perform private.require_uid();
  select s.group_id into gid from public.group_subjects s where s.id = p_from and s.merged_into is null;
  select s.group_id into gid_into from public.group_subjects s where s.id = p_into and s.merged_into is null;
  if gid is null or gid_into is null or gid <> gid_into or p_from = p_into then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if not private.is_group_owner(gid) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  insert into public.group_subject_daily_totals (user_id, device_id, group_id, subject_id, day, seconds)
  select t.user_id, t.device_id, t.group_id, p_into, t.day, t.seconds
  from public.group_subject_daily_totals t
  where t.subject_id = p_from
  on conflict (user_id, device_id, subject_id, day) do update
    set seconds = least(86400, public.group_subject_daily_totals.seconds + excluded.seconds), updated_at = now();
  delete from public.group_subject_daily_totals t where t.subject_id = p_from;

  update public.group_subjects s set merged_into = p_into where s.merged_into = p_from;
  update public.group_subjects s set merged_into = p_into where s.id = p_from;
end;
$$;

-- Elimina una materia del gruppo (solo il proprietario): i suoi totali e i suoi segnaposto spariscono con lei.
create function public.delete_group_subject(p_subject_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  gid uuid;
begin
  perform private.require_uid();
  select s.group_id into gid from public.group_subjects s where s.id = p_subject_id and s.merged_into is null;
  if gid is null or not private.is_group_owner(gid) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  delete from public.group_subjects s where s.id = p_subject_id;
end;
$$;

-- Sostituisce i totali per materia di un proprio dispositivo in un gruppo, per i giorni indicati: cancella quei
-- giorni e inserisce le righe mandate (quelle a 0 si saltano). Tutto o niente: se per un giorno la somma supera il
-- totale giornaliero già condiviso dallo stesso dispositivo, non cambia nulla.
-- p_rows: [{"subject_id": uuid, "day": "AAAA-MM-GG", "seconds": int}, …]. Restituisce 'ok' o 'disabled'.
create function public.sync_group_subject_totals(p_device_id uuid, p_group_id uuid, p_days date[], p_rows jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  today_utc date := (now() at time zone 'utc')::date;
begin
  if not exists (select 1 from public.devices d where d.id = p_device_id and d.user_id = uid) then
    raise exception 'unknown_device' using errcode = '22023';
  end if;
  if not private.is_group_member(p_group_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not coalesce((select c.enabled from public.subject_report_consent c where c.user_id = uid), false) then
    -- difesa in più: senza consenso non resta niente, qualunque dispositivo mandi
    delete from public.group_subject_daily_totals t where t.user_id = uid;
    return 'disabled';
  end if;
  if p_days is null or coalesce(pg_catalog.array_length(p_days, 1), 0) not between 1 and 61
     or exists (select 1 from pg_catalog.unnest(p_days) d where d is null or d > today_utc + 1 or d < today_utc - 60) then
    raise exception 'day_out_of_range' using errcode = '22008';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;

  create temp table if not exists pg_temp.gs_rows (subject_id uuid, day date, seconds int) on commit drop;
  truncate pg_temp.gs_rows;
  insert into pg_temp.gs_rows (subject_id, day, seconds)
  select r.subject_id, r.day, r.seconds
  from pg_catalog.jsonb_to_recordset(p_rows) as r (subject_id uuid, day date, seconds int)
  where r.seconds is distinct from 0;

  if exists (select 1 from pg_temp.gs_rows r where r.day is null or r.subject_id is null or r.seconds is null
                                                   or not (r.day = any (p_days))) then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.gs_rows r group by r.subject_id, r.day having count(*) > 1) then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  -- la materia deve essere attiva e di questo gruppo (la FK composta controlla il gruppo; qui anche "non unita")
  if exists (select 1 from pg_temp.gs_rows r
             where not exists (select 1 from public.group_subjects s
                               where s.id = r.subject_id and s.group_id = p_group_id and s.merged_into is null)) then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if exists (select 1
             from pg_temp.gs_rows r
             group by r.day
             having sum(r.seconds) > coalesce((select t.seconds from public.study_daily_totals t
                                                where t.user_id = uid and t.device_id = p_device_id and t.day = r.day), 0)) then
    raise exception 'exceeds_daily_total' using errcode = '23514';
  end if;

  delete from public.group_subject_daily_totals t
  where t.user_id = uid and t.device_id = p_device_id and t.group_id = p_group_id and t.day = any (p_days);
  insert into public.group_subject_daily_totals (user_id, device_id, group_id, subject_id, day, seconds)
  select uid, p_device_id, p_group_id, r.subject_id, r.day, r.seconds from pg_temp.gs_rows r;
  return 'ok';
end;
$$;

-- Revoca di una parte: tutte le proprie righe di un gruppo, o di una sola materia del gruppo (tutti i dispositivi,
-- tutti i giorni). Serve quando si toglie o cambia un abbinamento.
create function public.revoke_group_subject_totals(p_group_id uuid, p_subject_id uuid default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  delete from public.group_subject_daily_totals t
  where t.user_id = uid and t.group_id = p_group_id and (p_subject_id is null or t.subject_id = p_subject_id);
end;
$$;

-- Il report di un gruppo tra due giorni (al massimo 366 giorni), già sommato sui membri attuali:
--  subjects:     [{subject_id, day, seconds}]  tempo per materia del gruppo e giorno;
--  other:        [{day, seconds}]              "Altre materie": per ogni membro, totale giornaliero condiviso meno la
--                                               sua parte abbinata (mai sotto zero), sommato;
--  contributors: [{subject_id, user_ids}]      chi ha tempo su quella materia nel periodo;
--  first_day:    il primo giorno con un totale di un membro (prima non ci sono dati: il report lo dice).
-- Un solo valore jsonb: niente limite di righe dell'API anche per un anno intero con 30 membri.
create function public.group_subject_report(p_group_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_uid();
  if not private.is_group_member(p_group_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  with members as (
    select m.user_id from public.group_members m where m.group_id = p_group_id
  ),
  subj as (
    select t.subject_id, t.user_id, t.day, sum(t.seconds)::int as seconds
    from public.group_subject_daily_totals t
    where t.group_id = p_group_id and t.day between p_from and p_to and t.user_id in (select user_id from members)
    group by t.subject_id, t.user_id, t.day
  ),
  daily as (
    select t.user_id, t.day, sum(t.seconds)::int as seconds
    from public.study_daily_totals t
    where t.user_id in (select user_id from members) and t.day between p_from and p_to
    group by t.user_id, t.day
  ),
  shared as (
    select s.user_id, s.day, sum(s.seconds)::int as seconds from subj s group by s.user_id, s.day
  ),
  other as (
    select d.day, sum(greatest(0, d.seconds - coalesce(sh.seconds, 0)))::int as seconds
    from daily d
    left join shared sh on sh.user_id = d.user_id and sh.day = d.day
    group by d.day
  )
  select pg_catalog.jsonb_build_object(
    'subjects', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('subject_id', x.subject_id, 'day', x.day, 'seconds', x.seconds))
      from (select s.subject_id, s.day, sum(s.seconds)::int as seconds from subj s group by s.subject_id, s.day) x
    ), '[]'::jsonb),
    'other', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('day', o.day, 'seconds', o.seconds))
      from other o where o.seconds > 0
    ), '[]'::jsonb),
    'contributors', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('subject_id', c.subject_id, 'user_ids', c.ids))
      from (select s.subject_id, pg_catalog.jsonb_agg(distinct s.user_id) as ids from subj s group by s.subject_id) c
    ), '[]'::jsonb),
    'first_day', (select min(t.day) from public.study_daily_totals t where t.user_id in (select user_id from members))
  ) into result;
  return result;
end;
$$;

revoke all on function public.set_subject_report_consent(boolean), public.create_group_subject(uuid, text, smallint),
  public.update_group_subject(uuid, text, smallint), public.merge_group_subjects(uuid, uuid),
  public.delete_group_subject(uuid), public.sync_group_subject_totals(uuid, uuid, date[], jsonb),
  public.revoke_group_subject_totals(uuid, uuid), public.group_subject_report(uuid, date, date)
  from public, anon;
grant execute on function public.set_subject_report_consent(boolean), public.create_group_subject(uuid, text, smallint),
  public.update_group_subject(uuid, text, smallint), public.merge_group_subjects(uuid, uuid),
  public.delete_group_subject(uuid), public.sync_group_subject_totals(uuid, uuid, date[], jsonb),
  public.revoke_group_subject_totals(uuid, uuid), public.group_subject_report(uuid, date, date)
  to authenticated;
