-- "Visto fa" (last_seen): ora del server, scritta solo con mark_seen, letta solo dai compagni di gruppo.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.utente('senza_nome', false);
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');

select pg_temp.anonimo();
select throws_ok('select * from public.last_seen', '42501', null, 'anon: non legge last_seen');
select throws_ok('select public.mark_seen()', '42501', null, 'anon: non chiama mark_seen');
select pg_temp.esci();

select pg_temp.entra('anna');
select lives_ok('select public.mark_seen()', 'anna segna la sua presenza');
select lives_ok('select public.mark_seen()', 'ripeterlo aggiorna la stessa riga');
select is((select count(*)::int from public.last_seen where user_id = auth.uid()), 1, 'una riga per utente');
select ok((select seen_at from public.last_seen where user_id = auth.uid()) = now(), 'ora del server');
select throws_ok($$insert into public.last_seen (user_id, seen_at) values (auth.uid(), now() + interval '1 day')$$,
  '42501', null, 'non si scrive direttamente (niente ore scelte dal client)');
select throws_ok($$update public.last_seen set seen_at = now() + interval '1 day'$$,
  '42501', null, 'non si modifica direttamente');
select throws_ok('delete from public.last_seen', '42501', null, 'non si cancella direttamente');
select pg_temp.esci();

select pg_temp.entra('bruno');
select is((select count(*)::int from public.last_seen where user_id = pg_temp.uid('anna')), 1,
  'un compagno di gruppo vede quando anna è stata connessa');
select pg_temp.esci();

select pg_temp.entra('dario');
select is((select count(*)::int from public.last_seen), 0, 'chi non condivide un gruppo non vede nulla');
select pg_temp.esci();

select pg_temp.entra('senza_nome');
select throws_ok('select public.mark_seen()', 'P0001', 'profile_required', 'serve il profilo');
select pg_temp.esci();

-- uscito dal gruppo, bruno non la vede più
select pg_temp.entra('bruno');
select public.leave_group(pg_temp.gid('g'));
select is((select count(*)::int from public.last_seen where user_id = pg_temp.uid('anna')), 0,
  'dopo essere uscito dal gruppo non si vede più');
select pg_temp.esci();

-- eliminando l'account la riga sparisce
select pg_temp.entra('anna');
select public.delete_account();
select pg_temp.esci();
select is((select count(*)::int from public.last_seen where user_id = pg_temp.uid('anna')), 0,
  'eliminato l''account, eliminato anche last_seen');

select * from finish();
rollback;
