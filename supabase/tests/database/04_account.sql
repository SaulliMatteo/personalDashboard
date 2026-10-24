-- Nome utente, profilo obbligatorio, eliminazione dell'account.
begin;
\ir _aiuti.psql
select * from no_plan();

-- ─── Nome utente ───
select pg_temp.utente('nuovo', false);
select pg_temp.utente('anna');
select pg_temp.entra('nuovo');
select throws_ok($$select public.create_group('x', '')$$, 'P0001', 'profile_required',
  'senza nome utente non si crea un gruppo');
select throws_ok($$select public.join_group('ABCDEFGH')$$, 'P0001', 'profile_required',
  'senza nome utente non si entra in un gruppo');
select throws_ok($$select public.set_username('ab')$$, '22023', 'invalid_username', 'troppo corto');
select throws_ok($$select public.set_username(repeat('a', 21))$$, '22023', 'invalid_username', 'troppo lungo');
select throws_ok($$select public.set_username('con spazio')$$, '22023', 'invalid_username', 'spazi non ammessi');
select throws_ok($$select public.set_username('àccento')$$, '22023', 'invalid_username', 'accenti non ammessi');
select throws_ok($$select public.set_username('.anna')$$, '22023', 'invalid_username', 'punto iniziale');
select throws_ok($$select public.set_username('anna.')$$, '22023', 'invalid_username', 'punto finale');
select throws_ok($$select public.set_username('an..na')$$, '22023', 'invalid_username', 'due punti di fila');
select throws_ok($$select public.set_username('ANNA')$$, '23505', 'username_taken',
  'nome già preso, senza distinzione di maiuscole');
select is(public.set_username('  Mario_Rossi.2 '), 'mario_rossi.2', 'salvato in minuscolo e senza spazi ai lati');
select is(public.set_username('mario'), 'mario', 'il nome si può cambiare');
select is((select count(*)::int from public.profiles where id = auth.uid()), 1, 'un solo profilo');
select throws_ok($$update public.profiles set username = 'hacker' where id = auth.uid()$$, '42501', null,
  'il profilo non si modifica direttamente');
select pg_temp.esci();

-- ─── Elimina account ───
select pg_temp.utente('bruno');
select pg_temp.utente('carla');
select pg_temp.gruppo('condiviso', 'anna');
select is(pg_temp.unisci('bruno', 'condiviso'), 'ok', 'preparazione: bruno entra nel gruppo');
select pg_temp.gruppo('solo', 'anna');

select pg_temp.entra('anna');
select public.touch_device('cccccccc-0000-4000-8000-000000000001', 'windows');
insert into public.study_daily_totals (user_id, device_id, day, seconds)
values (auth.uid(), 'cccccccc-0000-4000-8000-000000000001', (now() at time zone 'utc')::date, 1800);
select public.join_group('ZZZZZZZ9');
select lives_ok('select public.delete_account()', 'anna elimina il proprio account');
select pg_temp.esci();

select is((select count(*)::int from auth.users where id = pg_temp.uid('anna')), 0, 'utente di Auth cancellato');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('anna')), 0, 'profilo cancellato');
select is((select count(*)::int from public.devices where user_id = pg_temp.uid('anna')), 0, 'dispositivi cancellati');
select is((select count(*)::int from public.study_daily_totals where user_id = pg_temp.uid('anna')), 0, 'totali cancellati');
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('anna')), 0, 'iscrizioni cancellate');
select is((select count(*)::int from private.join_attempts where user_id = pg_temp.uid('anna')), 0, 'tentativi cancellati');
select is((select owner_id from public.groups where id = pg_temp.gid('condiviso')), pg_temp.uid('bruno'),
  'il gruppo condiviso passa al membro rimasto');
select is((select count(*)::int from public.groups where id = pg_temp.gid('solo')), 0,
  'il gruppo in cui era da sola viene eliminato');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('bruno')), 1, 'gli altri utenti restano');

-- delete_account cancella solo sé stessi
select pg_temp.entra('carla');
select public.delete_account();
select pg_temp.esci();
select is((select count(*)::int from auth.users where id = pg_temp.uid('bruno')), 1, 'nessun effetto sugli altri');

select * from finish();
rollback;
