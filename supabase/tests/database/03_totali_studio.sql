-- Modulo studio: scritture solo proprie, vincoli di plausibilità, visibilità a chi condivide un gruppo.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');
select pg_temp.salva('oggi', (now() at time zone 'utc')::date::text);

-- ─── Dispositivi ───
select pg_temp.entra('anna');
select lives_ok($$select public.touch_device('aaaaaaaa-0000-4000-8000-000000000001', 'windows')$$, 'registra un dispositivo');
select lives_ok($$select public.touch_device('aaaaaaaa-0000-4000-8000-000000000002', 'macos')$$, 'e un secondo');
select lives_ok($$select public.touch_device('aaaaaaaa-0000-4000-8000-000000000001', 'windows')$$,
  'ripetere la registrazione è innocuo');
select throws_ok($$select public.touch_device('aaaaaaaa-0000-4000-8000-000000000003', 'amiga')$$, '23514', null,
  'piattaforma sconosciuta rifiutata');
select throws_ok($$insert into public.devices (id, user_id, platform) values (gen_random_uuid(), auth.uid(), 'linux')$$,
  '42501', null, 'i dispositivi non si scrivono direttamente');
select pg_temp.esci();

select pg_temp.entra('bruno');
select lives_ok($$select public.touch_device('bbbbbbbb-0000-4000-8000-000000000001', 'linux')$$, 'bruno registra il suo');
select throws_ok($$select public.touch_device('aaaaaaaa-0000-4000-8000-000000000001', 'linux')$$, '22023', null,
  $$non si prende il dispositivo di un altro$$);
select pg_temp.esci();

-- ─── Scrittura dei propri totali (upsert idempotente) ───
select pg_temp.entra('anna');
select lives_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L, 3600)$$, pg_temp.leggi('oggi')), 'inserisce il proprio totale');
select lives_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L, 4000)
  on conflict (user_id, device_id, day) do update set seconds = excluded.seconds$$, pg_temp.leggi('oggi')),
  'upsert dello stesso giorno');
select lives_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000002', %L, 1000)$$, pg_temp.leggi('oggi')), 'secondo dispositivo');
select is((select count(*)::int from public.study_daily_totals where user_id = auth.uid()), 2, 'nessun doppione');
select is((select seconds from public.study_totals_by_user where user_id = auth.uid() and day = pg_temp.leggi('oggi')::date),
  5000, 'il server somma i dispositivi');

-- ─── Vincoli ───
select throws_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L::date - 1, 86401)$$, pg_temp.leggi('oggi')),
  '23514', null, 'seconds oltre 86400 rifiutato');
select throws_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L::date - 1, -1)$$, pg_temp.leggi('oggi')),
  '23514', null, 'seconds negativo rifiutato');
select lives_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L::date - 2, 86400)$$, pg_temp.leggi('oggi')),
  '86400 è ammesso');
select lives_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L::date + 1, 60)$$, pg_temp.leggi('oggi')),
  'domani UTC è ammesso (fusi orari a est)');
select throws_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L::date + 2, 60)$$, pg_temp.leggi('oggi')),
  '22008', null, 'giorno nel futuro rifiutato');
select throws_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L::date - 61, 60)$$, pg_temp.leggi('oggi')),
  '22008', null, 'giorno troppo vecchio rifiutato');
select pg_temp.esci();

-- ─── Nessuno scrive i totali di un altro ───
select pg_temp.entra('bruno');
insert into public.study_daily_totals (user_id, device_id, day, seconds)
values (auth.uid(), 'bbbbbbbb-0000-4000-8000-000000000001', pg_temp.leggi('oggi')::date, 600);
select throws_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (%L, 'aaaaaaaa-0000-4000-8000-000000000001', %L, 1)$$, pg_temp.uid('anna'), pg_temp.leggi('oggi')),
  '42501', null, 'non inserisce totali a nome di un altro');
select throws_ok(format($$insert into public.study_daily_totals (user_id, device_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', %L, 1)$$, pg_temp.leggi('oggi')),
  '23503', null, 'non usa il dispositivo di un altro');
select lives_ok(format($$update public.study_daily_totals set seconds = 0 where user_id = %L$$, pg_temp.uid('anna')),
  $$l'update sulle righe altrui non dà errore...$$);
select throws_ok(format($$update public.study_daily_totals set user_id = %L where user_id = auth.uid()$$,
  pg_temp.uid('anna')), '42501', null, 'non sposta i propri totali su un altro utente');
select throws_ok(format($$delete from public.study_daily_totals where user_id = %L$$, pg_temp.uid('anna')),
  '42501', null, 'non cancella i totali');

-- ─── Visibilità: chi condivide un gruppo sì ───
select is((select seconds from public.study_totals_by_user where user_id = pg_temp.uid('anna') and day = pg_temp.leggi('oggi')::date),
  5000, '...e non cambia nulla; un membro dello stesso gruppo vede i totali');
select pg_temp.esci();

-- ─── ...chi non lo condivide no ───
select pg_temp.entra('dario');
select is((select count(*)::int from public.study_daily_totals), 0, 'non-membro: non vede i totali');
select is((select count(*)::int from public.study_totals_by_user), 0, 'non-membro: non vede i totali sommati');
select pg_temp.esci();

-- ─── Uscito dal gruppo, i totali non si vedono più ───
select pg_temp.entra('bruno');
select public.leave_group(pg_temp.gid('g'));
select is((select count(*)::int from public.study_totals_by_user where user_id = pg_temp.uid('anna')), 0,
  'dopo aver abbandonato il gruppo non vede più i totali');
select pg_temp.esci();

select * from finish();
rollback;
