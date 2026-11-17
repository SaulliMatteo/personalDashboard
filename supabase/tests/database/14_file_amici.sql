-- File delle note mandate agli amici: bucket privato, carica solo il mittente verso un amico (cartella
-- <mittente>/<destinatario>/<lotto>), leggono e cancellano solo i due, al massimo 200 file per mittente (caricamento e
-- scaricamento con l'API di Storage si provano dal vivo: qui le regole sulle righe di storage.objects).
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('carla');

-- anna e bruno amici; carla no
select pg_temp.entra('anna');
select pg_temp.salva('codice:anna', public.my_friend_code());
select pg_temp.esci();
select pg_temp.entra('bruno');
select is(public.request_friend(pg_temp.leggi('codice:anna')), 'sent', 'preparazione: bruno chiede l''amicizia');
select pg_temp.esci();
select pg_temp.entra('anna');
select lives_ok(format('select public.answer_friend(%L, true)', pg_temp.uid('bruno')), 'preparazione: anna accetta');
select pg_temp.esci();

select pg_temp.salva('lotto', '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b');
select pg_temp.salva('a->b', pg_temp.uid('anna') || '/' || pg_temp.uid('bruno') || '/' || pg_temp.leggi('lotto'));

select ok((select not public from storage.buckets where id = 'friend-files'), 'il bucket non è pubblico');
select is((select file_size_limit from storage.buckets where id = 'friend-files'), 10485760::bigint, 'al massimo 10 MB per file');

-- ─── Caricare ───
select pg_temp.entra('anna');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.leggi('a->b') || '/YQ', pg_temp.uid('anna')), 'anna carica verso bruno (amico)');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.uid('anna') || '/' || pg_temp.uid('carla') || '/' || pg_temp.leggi('lotto') || '/YQ', pg_temp.uid('anna')),
  '42501', null, 'non verso chi non è amico');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.uid('bruno') || '/' || pg_temp.uid('anna') || '/' || pg_temp.leggi('lotto') || '/YQ', pg_temp.uid('anna')),
  '42501', null, 'non a nome di un altro');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.uid('anna') || '/' || pg_temp.uid('bruno') || '/YQ', pg_temp.uid('anna')),
  '42501', null, 'non senza il lotto');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.uid('anna') || '/' || pg_temp.uid('bruno') || '/x/YQ', pg_temp.uid('anna')),
  '42501', null, 'non con un lotto che non è un uuid');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.leggi('a->b') || '/sotto/YQ', pg_temp.uid('anna')),
  '42501', null, 'non in sottocartelle');
select is((select count(*)::int from storage.objects where bucket_id = 'friend-files'), 1, 'anna vede il file mandato');
select pg_temp.esci();

-- ─── Leggere ───
select pg_temp.entra('bruno');
select is((select count(*)::int from storage.objects where bucket_id = 'friend-files'), 1, 'bruno vede il file ricevuto');
select pg_temp.esci();
select pg_temp.entra('carla');
select is((select count(*)::int from storage.objects where bucket_id = 'friend-files'), 0, 'carla non vede niente');
select lives_ok($$delete from storage.objects where bucket_id = 'friend-files'$$, 'il delete di carla...');
select pg_temp.esci();
select is((select count(*)::int from storage.objects where bucket_id = 'friend-files'), 1, '...non cancella niente');

select pg_temp.anonimo();
select is((select count(*)::int from storage.objects where bucket_id = 'friend-files'), 0, 'anon: non vede nulla');
select pg_temp.esci();

-- ─── Niente update ───
select pg_temp.entra('anna');
select lives_ok($$update storage.objects set name = name || 'x' where bucket_id = 'friend-files'$$, 'l''update...');
select pg_temp.esci();
select is((select name from storage.objects where bucket_id = 'friend-files'), pg_temp.leggi('a->b') || '/YQ', '...non cambia niente');

-- ─── Cancellare: il destinatario dopo il salvataggio ───
select pg_temp.entra('bruno');
select lives_ok($$delete from storage.objects where bucket_id = 'friend-files'$$, 'bruno cancella il file ricevuto');
select pg_temp.esci();
select is((select count(*)::int from storage.objects where bucket_id = 'friend-files'), 0, 'il file non c''è più');

-- ─── Quota: 200 file per mittente ───
insert into storage.objects (bucket_id, name, owner_id)
select 'friend-files', pg_temp.leggi('a->b') || '/f' || i, pg_temp.uid('anna') from generate_series(1, 200) i;
select pg_temp.entra('anna');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('friend-files', %L, %L)$$,
  pg_temp.leggi('a->b') || '/ancora', pg_temp.uid('anna')), '42501', null, 'oltre 200 file: no');
select pg_temp.esci();

select * from finish();
rollback;
