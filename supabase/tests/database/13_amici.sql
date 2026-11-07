-- Amici e messaggi diretti: codice, richieste, accetta/rifiuta, chi legge cosa, limiti, 90 giorni, casella in tempo
-- reale, rimozione e cascata con l'account.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('carla');
select pg_temp.utente('dario');
select pg_temp.utente('senza', false);

-- ─── Struttura ───
select ok(not has_table_privilege('authenticated', 'public.direct_messages', 'insert'), 'messaggi: niente insert diretto');
select ok(not has_table_privilege('authenticated', 'public.direct_messages', 'update'), 'messaggi: niente update diretto');
select ok(not has_table_privilege('authenticated', 'public.friendships', 'insert'), 'amicizie: niente insert diretto');
select ok(not has_table_privilege('authenticated', 'public.friend_requests', 'insert'), 'richieste: niente insert diretto');
select ok(not has_table_privilege('authenticated', 'private.friend_codes', 'select'), 'i codici non si leggono');
select ok(not has_function_privilege('anon', 'public.send_dm(uuid, text, text, jsonb)', 'execute'), 'anon non manda');
select ok(not has_function_privilege('authenticated', 'private.notify_inbox(uuid, jsonb)', 'execute'),
  'il client non scrive nelle caselle');

-- ─── Codice ───
select pg_temp.entra('anna');
select pg_temp.salva('codice:anna', public.my_friend_code());
select ok(pg_temp.leggi('codice:anna') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'codice di 8 caratteri');
select is(public.my_friend_code(), pg_temp.leggi('codice:anna'), 'il codice resta lo stesso');
select pg_temp.salva('vecchio:anna', pg_temp.leggi('codice:anna'));
select pg_temp.salva('codice:anna', public.regenerate_friend_code());
select isnt(pg_temp.leggi('codice:anna'), pg_temp.leggi('vecchio:anna'), 'rigenerato è diverso');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'self', 'il proprio codice: self');
select pg_temp.esci();

select pg_temp.entra('senza');
select throws_ok('select public.my_friend_code()', null, null, 'senza profilo niente codice');
select pg_temp.esci();

-- ─── Richiesta ───
select pg_temp.entra('bruno');
select is(public.request_friend(pg_temp.leggi('vecchio:anna')), 'invalid', 'codice vecchio: invalid');
select is(public.request_friend('ZZZZZZZZ'), 'invalid', 'codice inesistente: invalid');
select is(public.request_friend(lower(substr(pg_temp.leggi('codice:anna'), 1, 4)) || '-' || substr(pg_temp.leggi('codice:anna'), 5)),
  'sent', 'minuscole e trattino vanno bene');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'already_sent', 'seconda volta: already_sent');
select is((select count(*)::int from public.friend_requests), 1, 'bruno vede la sua richiesta');
select is((select username from public.profiles where id = pg_temp.uid('anna')), 'anna', 'e il nome di anna');
select throws_ok(format('select public.send_dm(%L, ''text'', ''ciao'')', pg_temp.uid('anna')), '42501', 'not_friend',
  'prima di accettare non si scrive');
select pg_temp.esci();

select pg_temp.entra('dario');
select is((select count(*)::int from public.friend_requests), 0, 'dario non vede richieste altrui');
select is((select count(*)::int from public.profiles where id in (pg_temp.uid('anna'), pg_temp.uid('bruno'))), 0,
  'né i profili di chi non conosce');
select pg_temp.esci();

select pg_temp.entra('anna');
select is((select username from public.profiles where id = pg_temp.uid('bruno')), 'bruno', 'anna vede chi le ha chiesto');
select throws_ok(format('select public.answer_friend(%L, true)', pg_temp.uid('dario')), '22023', 'no_request',
  'rispondere a una richiesta che non c''è');
select lives_ok(format('select public.answer_friend(%L, true)', pg_temp.uid('bruno')), 'anna accetta bruno');
select is((select count(*)::int from public.friendships), 1, 'amicizia creata');
select is((select count(*)::int from public.friend_requests), 0, 'richiesta sparita');
select pg_temp.esci();

select pg_temp.entra('bruno');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'already_friends', 'già amici');
select pg_temp.esci();

-- carla chiede ad anna e anna (senza saperlo) chiede a carla: amici subito
select pg_temp.entra('carla');
select pg_temp.salva('codice:carla', public.my_friend_code());
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'sent', 'carla chiede ad anna');
select pg_temp.esci();
select pg_temp.entra('anna');
select is(public.request_friend(pg_temp.leggi('codice:carla')), 'accepted', 'richiesta incrociata: accepted');
select is((select count(*)::int from public.friendships), 2, 'anna ha due amici');
select pg_temp.esci();

-- dario chiede ad anna, anna rifiuta; poi dario ritira una seconda richiesta
select pg_temp.entra('dario');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'sent', 'dario chiede ad anna');
select pg_temp.esci();
select pg_temp.entra('anna');
select lives_ok(format('select public.answer_friend(%L, false)', pg_temp.uid('dario')), 'anna rifiuta');
select is((select count(*)::int from public.friendships where pg_temp.uid('dario') in (user_a, user_b)), 0, 'nessuna amicizia');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('dario')), 0, 'dario torna invisibile');
select pg_temp.esci();
select pg_temp.entra('dario');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'sent', 'dario chiede di nuovo');
select lives_ok(format('select public.cancel_friend_request(%L)', pg_temp.uid('anna')), 'e ritira');
select is((select count(*)::int from public.friend_requests), 0, 'richiesta ritirata');
select pg_temp.esci();

-- limite: 20 tentativi l'ora
select pg_temp.entra('dario');
select is((select count(*)::int from generate_series(1, 18) where public.request_friend('ZZZZZZZZ') = 'invalid'), 18,
  'altri tentativi sbagliati');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'rate_limited', 'al ventunesimo: rate_limited');
select pg_temp.esci();

-- ─── Visto ───
select pg_temp.entra('bruno');
select public.mark_seen();
select pg_temp.esci();
select pg_temp.entra('anna');
select is((select count(*)::int from public.last_seen where user_id = pg_temp.uid('bruno')), 1, 'anna vede quando c''era bruno');
select pg_temp.esci();
select pg_temp.entra('dario');
select is((select count(*)::int from public.last_seen where user_id = pg_temp.uid('bruno')), 0, 'dario no');
select pg_temp.esci();

-- ─── Messaggi ───
select pg_temp.entra('anna');
select pg_temp.salva('m1', public.send_dm(pg_temp.uid('bruno'), 'text', '  ciao bruno  ') ->> 'id');
select is((select body from public.direct_messages where id = pg_temp.leggi('m1')::uuid), 'ciao bruno', 'testo ripulito');
select is((select sender from public.direct_messages where id = pg_temp.leggi('m1')::uuid), pg_temp.uid('anna'),
  'mittente deciso dal server');
select lives_ok(format('select public.send_dm(%L, ''youtube'', ''guarda'', ''{"youtubeId":"abc"}'')', pg_temp.uid('bruno')),
  'una scheda con payload');
select throws_ok(format('select public.send_dm(%L, ''text'', ''   '')', pg_temp.uid('bruno')), '22023', 'invalid_message',
  'testo vuoto');
select throws_ok(format('select public.send_dm(%L, ''youtube'', '''')', pg_temp.uid('bruno')), '22023', 'invalid_message',
  'scheda senza payload');
select throws_ok(format('select public.send_dm(%L, ''text'', ''x'', ''{"a":1}'')', pg_temp.uid('bruno')), '22023',
  'invalid_message', 'testo con payload');
select throws_ok(format('select public.send_dm(%L, ''Brutto Tipo'', '''', ''{}'')', pg_temp.uid('bruno')), '23514', null,
  'kind non valido');
select throws_ok(format('select public.send_dm(%L, ''text'', %L)', pg_temp.uid('bruno'), repeat('a', 501)), '22001',
  'message_too_long', 'oltre 500 caratteri');
select throws_ok(format('select public.send_dm(%L, ''note'', '''', %L::jsonb)', pg_temp.uid('bruno'),
  jsonb_build_object('html', repeat(md5(random()::text), 20000))), '22001', 'payload_too_large', 'payload oltre 512 KB');
select throws_ok(format('select public.send_dm(%L, ''text'', ''ciao'')', pg_temp.uid('dario')), '42501', 'not_friend',
  'a un non amico no');
select is((select count(*)::int from public.direct_messages), 2, 'anna vede i suoi due messaggi');
select pg_temp.esci();

select pg_temp.entra('bruno');
select is((select count(*)::int from public.direct_messages where recipient = pg_temp.uid('bruno')), 2, 'bruno li riceve');
select throws_ok(format('select public.delete_dm(%L)', pg_temp.leggi('m1')), '42501', 'not_author',
  'bruno non cancella i messaggi di anna');
select lives_ok(format('select public.mark_dm_read(%L, now() + interval ''1 day'')', pg_temp.uid('anna')), 'bruno segna letto');
select ok((select read_until <= now() from public.direct_reads where user_id = pg_temp.uid('bruno')), 'mai oltre adesso');
select lives_ok(format('select public.mark_dm_read(%L, now() - interval ''1 day'')', pg_temp.uid('anna')), 'segnare indietro');
select ok((select read_until > now() - interval '1 hour' from public.direct_reads where user_id = pg_temp.uid('bruno')),
  'non torna indietro');
select pg_temp.esci();

select pg_temp.entra('anna');
select is((select count(*)::int from public.direct_reads where user_id = pg_temp.uid('bruno')), 1, 'anna vede fin dove ha letto bruno');
select lives_ok(format('select public.delete_dm(%L)', pg_temp.leggi('m1')), 'anna cancella il suo');
select ok((select deleted and body = '' and payload is null from public.direct_messages where id = pg_temp.leggi('m1')::uuid),
  'resta "messaggio eliminato", senza testo');
select pg_temp.esci();

select pg_temp.entra('carla');
select is((select count(*)::int from public.direct_messages), 0, 'carla non legge la chat di anna e bruno');
select is((select count(*)::int from public.direct_reads), 0, 'né le letture');
select pg_temp.esci();

select pg_temp.entra('dario');
select is((select count(*)::int from public.direct_messages), 0, 'dario nemmeno');
select pg_temp.esci();

-- limite: 30 al minuto
insert into public.direct_messages (sender, recipient, body)
select pg_temp.uid('carla'), pg_temp.uid('anna'), 'm' || i from generate_series(1, 30) i;
select pg_temp.entra('carla');
select throws_ok(format('select public.send_dm(%L, ''text'', ''ancora'')', pg_temp.uid('anna')), 'P0001', 'rate_limited',
  'al trentunesimo in un minuto: rate_limited');
select pg_temp.esci();

-- 90 giorni: i vecchi non si leggono e il prossimo messaggio della coppia li cancella
update public.direct_messages set created_at = now() - interval '91 days'
where sender = pg_temp.uid('carla');
select pg_temp.entra('anna');
select is((select count(*)::int from public.direct_messages where sender = pg_temp.uid('carla')), 0, 'oltre 90 giorni: invisibili');
select lives_ok(format('select public.send_dm(%L, ''text'', ''ciao carla'')', pg_temp.uid('carla')), 'anna scrive a carla');
select pg_temp.esci();
select is((select count(*)::int from public.direct_messages where sender = pg_temp.uid('carla')), 0, 'e i vecchi sono cancellati');

-- ─── Casella in tempo reale ───
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and policyname = 'amici: ricevere nella propria casella' and cmd = 'SELECT'), 'policy della casella presente');
select ok(not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and cmd = 'INSERT' and (with_check like '%inbox%')), 'nessuna policy di invio sulle caselle');
select pg_temp.entra('anna');
select ok(not private.can_access_channel('inbox:' || pg_temp.uid('anna')), 'la casella non è un canale dei gruppi (niente invio)');
select set_config('realtime.topic', 'inbox:' || pg_temp.uid('anna'), true);
select ok((select realtime.topic()) = 'inbox:' || auth.uid()::text, 'la propria casella corrisponde alla regola');
select set_config('realtime.topic', 'inbox:' || pg_temp.uid('bruno'), true);
select ok((select realtime.topic()) <> 'inbox:' || auth.uid()::text, 'quella di bruno no');
select set_config('realtime.topic', '', true);
select pg_temp.esci();

-- ─── Togliere un amico ───
select pg_temp.entra('bruno');
select throws_ok(format('select public.remove_friend(%L)', pg_temp.uid('dario')), '42501', 'not_friend', 'non amico');
select lives_ok(format('select public.remove_friend(%L)', pg_temp.uid('anna')), 'bruno toglie anna');
select is((select count(*)::int from public.direct_messages), 0, 'la chat sparisce');
select is((select count(*)::int from public.direct_reads), 0, 'e le letture');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('anna')), 0, 'anna non si vede più');
select pg_temp.esci();

-- ─── Cascata con l'account ───
select pg_temp.entra('anna');
select lives_ok('select public.delete_account()', 'anna elimina l''account');
select pg_temp.esci();
select is((select count(*)::int from public.friendships where pg_temp.uid('anna') in (user_a, user_b)), 0, 'amicizie cancellate');
select is((select count(*)::int from public.direct_messages
  where pg_temp.uid('anna') in (sender, recipient)), 0, 'messaggi cancellati');
select is((select count(*)::int from private.friend_codes where user_id = pg_temp.uid('anna')), 0, 'codice cancellato');
select is((select count(*)::int from public.friend_requests where pg_temp.uid('anna') in (from_user, to_user)), 0,
  'richieste cancellate');

select * from finish();
rollback;
