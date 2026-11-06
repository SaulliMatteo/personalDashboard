-- Sync dei propri dati: righe leggibili solo dal proprio utente, scritture solo con sync_push, ultima modifica vince.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('carla', false);
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno è nel gruppo di anna');

select pg_temp.entra('anna');
select public.touch_device('aaaaaaaa-0000-4000-8000-000000000001', 'windows');
select public.touch_device('aaaaaaaa-0000-4000-8000-000000000002', 'android');
select pg_temp.esci();
select pg_temp.entra('bruno');
select public.touch_device('bbbbbbbb-0000-4000-8000-000000000001', 'linux');
select pg_temp.esci();

-- ─── Scrittura ───
select pg_temp.entra('anna');
select is(public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', $$[
  {"kind": "subject", "uid": "11111111-1111-4111-8111-111111111111", "changed_at": 1000, "deleted": false,
   "data": {"name": "Analisi"}},
  {"kind": "setting", "uid": "theme", "changed_at": 1000, "deleted": false, "data": {"value": "\"opaco\""}}
]$$::jsonb), '[]'::jsonb, 'scrive due elementi, nessun rifiuto');
select is((select count(*)::int from public.sync_records), 2, 'li rilegge');
select ok((select seq from public.sync_records where uid = 'theme') >
          (select seq from public.sync_records where kind = 'subject'), 'seq crescente nell''ordine di scrittura');

select pg_temp.salva('seq1', (select max(seq)::text from public.sync_records));
select is(public.sync_push('aaaaaaaa-0000-4000-8000-000000000002', $$[
  {"kind": "subject", "uid": "11111111-1111-4111-8111-111111111111", "changed_at": 2000, "deleted": false,
   "data": {"name": "Analisi 2"}}
]$$::jsonb), '[]'::jsonb, 'una modifica più nuova da un altro dispositivo vince');
select is((select data ->> 'name' from public.sync_records where kind = 'subject'), 'Analisi 2', 'dati aggiornati');
select is((select device_id from public.sync_records where kind = 'subject'),
  'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'con il dispositivo che l''ha cambiata');
select is((select array_agg(uid order by seq) from public.sync_records where seq > pg_temp.leggi('seq1')::bigint),
  array['11111111-1111-4111-8111-111111111111'], 'il pull da seq vede solo ciò che è cambiato');

-- più vecchia: rifiutata, con la versione del server
select is((public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', $$[
  {"kind": "subject", "uid": "11111111-1111-4111-8111-111111111111", "changed_at": 1500, "deleted": false,
   "data": {"name": "Vecchia"}}
]$$::jsonb) -> 0 -> 'data' ->> 'name'), 'Analisi 2', 'una modifica più vecchia è rifiutata e torna quella del server');
select is((select data ->> 'name' from public.sync_records where kind = 'subject'), 'Analisi 2', 'e non sovrascrive');

-- stesso istante: decide il device_id più alto
select is(public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', $$[
  {"kind": "subject", "uid": "11111111-1111-4111-8111-111111111111", "changed_at": 2000, "deleted": false,
   "data": {"name": "Pari"}}
]$$::jsonb) -> 0 ->> 'device_id', 'aaaaaaaa-0000-4000-8000-000000000002', 'a parità vince il device_id più alto');

-- lo stesso elemento rimandato (risposta persa) non è un rifiuto e non cambia seq
select pg_temp.salva('seq2', (select seq::text from public.sync_records where kind = 'subject'));
select is(public.sync_push('aaaaaaaa-0000-4000-8000-000000000002', $$[
  {"kind": "subject", "uid": "11111111-1111-4111-8111-111111111111", "changed_at": 2000, "deleted": false,
   "data": {"name": "Analisi 2"}}
]$$::jsonb), '[]'::jsonb, 'rimandare lo stesso elemento è innocuo');
select is((select seq::text from public.sync_records where kind = 'subject'), pg_temp.leggi('seq2'), 'seq invariato');

-- cancellazione: resta la riga (per chi non l'ha ancora vista) senza dati
select is(public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', $$[
  {"kind": "subject", "uid": "11111111-1111-4111-8111-111111111111", "changed_at": 3000, "deleted": true,
   "data": {"name": "ignorato"}}
]$$::jsonb), '[]'::jsonb, 'cancellazione accettata');
select ok((select deleted and data is null from public.sync_records where kind = 'subject'), 'resta come cancellata, senza dati');

-- orologio avanti: abbassato all'ora del server
select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', $$[
  {"kind": "setting", "uid": "userName", "changed_at": 99999999999999, "deleted": false, "data": {"value": "\"A\""}}
]$$::jsonb);
select ok((select changed_at from public.sync_records where uid = 'userName') <= (extract(epoch from clock_timestamp()) * 1000)::bigint,
  'changed_at nel futuro abbassato all''ora del server');

-- ─── Dati non validi ───
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "lavagna", "uid": "x", "changed_at": 1, "data": {}}]')$$, '23514', null, 'tipo sconosciuto rifiutato');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "note", "uid": "x", "changed_at": 1, "data": [1]}]')$$, '23514', null, 'dati che non sono un oggetto');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "note", "uid": "x", "changed_at": 1}]')$$, '23514', null, 'elemento non cancellato senza dati');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "note", "uid": "x", "data": {}}]')$$, '22023', null, 'changed_at mancante');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "note", "uid": "x", "changed_at": "ieri", "data": {}}]')$$, '22023', null, 'changed_at non numerico');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', '{"kind": "note"}')$$,
  '22023', null, 'non un array');
select throws_ok(format($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', %L)$$,
  (select jsonb_agg(jsonb_build_object('kind', 'note', 'uid', i::text, 'changed_at', 1, 'data', '{}'::jsonb))
   from generate_series(1, 501) i)), '22023', null, 'più di 500 elementi in un blocco');
select throws_ok(format($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', %L)$$,
  jsonb_build_array(jsonb_build_object('kind', 'page', 'uid', 'grande', 'changed_at', 1,
    'data', jsonb_build_object('content', repeat('x', 2000001))))), '23514', null, 'elemento oltre i 2 MB');
select is((select count(*)::int from public.sync_records where kind = 'note'), 0, 'un blocco con errori non scrive nulla');
select pg_temp.esci();

-- ─── Solo i propri dati ───
select pg_temp.entra('bruno');
select is((select count(*)::int from public.sync_records), 0, 'bruno (stesso gruppo) non vede i dati di anna');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "setting", "uid": "theme", "changed_at": 9000, "data": {"value": "\"notte\""}}]')$$,
  '22023', null, 'non scrive dal dispositivo di un altro');
select throws_ok($$select public.sync_push('cccccccc-0000-4000-8000-000000000001',
  '[{"kind": "setting", "uid": "theme", "changed_at": 9000, "data": {"value": "\"notte\""}}]')$$,
  '22023', null, 'né da un dispositivo non registrato');
select is(public.sync_push('bbbbbbbb-0000-4000-8000-000000000001',
  '[{"kind": "setting", "uid": "theme", "changed_at": 9000, "data": {"value": "\"notte\""}}]'), '[]'::jsonb,
  'lo stesso uid di anna, per bruno, è un elemento suo');
select is((select count(*)::int from public.sync_records), 1, 'e vede solo quello');
select throws_ok($$insert into public.sync_records (user_id, kind, uid, data, changed_at, device_id, seq)
  values (auth.uid(), 'note', 'x', '{}', 1, 'bbbbbbbb-0000-4000-8000-000000000001', 1)$$,
  '42501', null, 'niente insert diretti');
select throws_ok($$update public.sync_records set data = '{}'$$, '42501', null, 'niente update diretti');
select throws_ok($$delete from public.sync_records$$, '42501', null, 'niente delete diretti');
select throws_ok($$select user_id from public.sync_records$$, '42501', null, 'user_id non leggibile');
select pg_temp.esci();

select is((select data ->> 'value' from public.sync_records where user_id = pg_temp.uid('anna') and uid = 'theme'),
  '"opaco"', 'il tema di anna non è cambiato');

-- ─── Senza profilo o non autenticati ───
select pg_temp.entra('carla');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', '[]')$$, 'P0001', null,
  'senza profilo niente sync');
select pg_temp.esci();
select pg_temp.anonimo();
select throws_ok($$select * from public.sync_records$$, '42501', null, 'anon: non legge');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', '[]')$$, '42501', null,
  'anon: non scrive');
select throws_ok($$select public.sync_clear()$$, '42501', null, 'anon: non cancella');
select pg_temp.esci();

-- ─── Cancellazione ───
select pg_temp.entra('anna');
select lives_ok($$select public.sync_clear()$$, 'anna cancella i suoi dati dal server');
select is((select count(*)::int from public.sync_records), 0, 'non ne restano');
select pg_temp.esci();
select is((select count(*)::int from public.sync_records where user_id = pg_temp.uid('bruno')), 1,
  'quelli di bruno restano');

select pg_temp.entra('bruno');
select public.delete_account();
select pg_temp.esci();
select is((select count(*)::int from public.sync_records), 0, 'eliminando l''account se ne vanno anche i dati');

select * from finish();
rollback;
