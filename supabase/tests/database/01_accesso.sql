-- Accesso di base: RLS ovunque, niente per i non autenticati, nessun dato personale esposto.
begin;
\ir _aiuti.psql
select * from no_plan();

-- RLS attiva su ogni tabella dei nostri schemi (anche quelle dei moduli futuri)
select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0,
  'RLS attiva su ogni tabella di public e private'
);

-- Nessuna colonna con dati personali di Google nelle tabelle esposte
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and column_name in ('email', 'full_name', 'name_real', 'avatar_url', 'phone')),
  0,
  'nessuna colonna email/nome reale/avatar nello schema public'
);

-- Dati di esempio: anna con un gruppo, un dispositivo e un totale
select pg_temp.utente('anna');
select pg_temp.gruppo('g', 'anna');
select pg_temp.entra('anna');
select public.touch_device('11111111-1111-4111-8111-111111111111', 'windows');
insert into public.study_daily_totals (user_id, device_id, day, seconds)
values (pg_temp.uid('anna'), '11111111-1111-4111-8111-111111111111', (now() at time zone 'utc')::date, 1200);
select pg_temp.esci();

-- ─── Non autenticato ───
select pg_temp.anonimo();
select throws_ok('select * from public.profiles', '42501', null, 'anon: non legge i profili');
select throws_ok('select * from public.devices', '42501', null, 'anon: non legge i dispositivi');
select throws_ok('select * from public.groups', '42501', null, 'anon: non legge i gruppi');
select throws_ok('select * from public.group_members', '42501', null, 'anon: non legge i membri');
select throws_ok('select * from public.group_features', '42501', null, 'anon: non legge i moduli dei gruppi');
select throws_ok('select * from public.study_daily_totals', '42501', null, 'anon: non legge i totali');
select throws_ok('select * from public.study_totals_by_user', '42501', null, 'anon: non legge i totali sommati');
select throws_ok('select * from private.join_attempts', '42501', null, 'anon: non legge i tentativi');
select throws_ok('select * from public.last_seen', '42501', null, 'anon: non legge last_seen');
select throws_ok($$select public.join_group('ABCDEFGH')$$, '42501', null, 'anon: non chiama join_group');
select throws_ok($$select public.create_group('x', '')$$, '42501', null, 'anon: non chiama create_group');
select throws_ok($$select public.set_username('intruso')$$, '42501', null, 'anon: non chiama set_username');
select throws_ok('select public.delete_account()', '42501', null, 'anon: non chiama delete_account');
select throws_ok('select public.server_now()', '42501', null, 'anon: non chiama server_now');
select throws_ok($$select private.is_group_member(gen_random_uuid())$$, '42501', null,
  'anon: non usa gli helper privati');
select pg_temp.esci();

-- ─── Email non leggibile da altri utenti ───
select pg_temp.utente('bruno');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');
select pg_temp.entra('bruno');
select throws_ok('select email from auth.users', '42501', null, 'utente: non legge auth.users (email)');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.uid('anna')),
  1,
  'utente: vede il profilo di chi è nel suo gruppo...'
);
select is(
  (select to_jsonb(p) - 'id' - 'username' - 'created_at' from public.profiles p where id = pg_temp.uid('anna')),
  '{}'::jsonb,
  '...ma solo nome utente e data di creazione'
);
select throws_ok('select * from private.join_attempts', '42501', null, 'utente: non legge i tentativi');
select throws_ok($$select private.leave_group_internal(gen_random_uuid(), gen_random_uuid())$$, '42501', null,
  'utente: non chiama le funzioni interne');
select throws_ok($$select private.new_invite_code()$$, '42501', null, 'utente: non genera codici da sé');
select is(
  (select count(*)::int from public.devices),
  0,
  'utente: non vede i dispositivi degli altri'
);
select pg_temp.esci();

select * from finish();
rollback;
