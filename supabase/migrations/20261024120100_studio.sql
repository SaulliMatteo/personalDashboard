-- Gruppi — modulo studio: totali giornalieri per utente e dispositivo.
-- Escono dall'app solo i secondi studiati per giorno locale; sessioni singole e materie restano sul PC.
-- I totali sono dell'utente (non del gruppo): li vede chi condivide almeno un gruppo con lui.

create table public.study_daily_totals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid not null,
  -- giorno locale dell'utente
  day date not null,
  seconds int not null
    constraint study_daily_totals_seconds check (seconds between 0 and 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, day),
  -- FK composta: si scrive solo su un proprio dispositivo
  constraint study_daily_totals_device foreign key (user_id, device_id)
    references public.devices (user_id, id) on delete cascade
);

-- Limiti di plausibilità sul giorno (il tempo resta dichiarato dal client, vedi docs/GRUPPI.md):
-- non oltre domani UTC (fuso massimo +14 h), non più vecchio di 60 giorni. Aggiorna anche updated_at.
create function private.check_study_daily_total()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  today_utc date := (now() at time zone 'utc')::date;
begin
  if new.day > today_utc + 1 or new.day < today_utc - 60 then
    raise exception 'day_out_of_range' using errcode = '22008';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.check_study_daily_total() from public, anon, authenticated;

create trigger study_daily_totals_check
  before insert or update on public.study_daily_totals
  for each row execute function private.check_study_daily_total();

alter table public.study_daily_totals enable row level security;
revoke all on public.study_daily_totals from public, anon, authenticated;

create policy "totali studio: propri o di chi condivide un gruppo" on public.study_daily_totals
  for select to authenticated
  using (private.shares_group_with(user_id));

create policy "totali studio: inserire solo i propri" on public.study_daily_totals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "totali studio: aggiornare solo i propri" on public.study_daily_totals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Upsert idempotente dall'app (INSERT … ON CONFLICT DO UPDATE): servono insert e update sulle colonne inviate.
grant select on public.study_daily_totals to authenticated;
grant insert (user_id, device_id, day, seconds) on public.study_daily_totals to authenticated;
grant update (user_id, device_id, day, seconds) on public.study_daily_totals to authenticated;

-- Il server somma i dispositivi. security_invoker: valgono le RLS di chi legge.
create view public.study_totals_by_user
with (security_invoker = true)
as
  select t.user_id, t.day, sum(t.seconds)::int as seconds
  from public.study_daily_totals t
  group by t.user_id, t.day;

revoke all on public.study_totals_by_user from public, anon, authenticated;
grant select on public.study_totals_by_user to authenticated;
