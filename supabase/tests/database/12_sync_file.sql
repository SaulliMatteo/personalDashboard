-- File del sync: bucket privato, ognuno legge e scrive solo nella propria cartella (caricamento, scaricamento e
-- cancellazione con l'API di Storage si provano dal vivo: qui le regole sulle righe di storage.objects).
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno è nel gruppo di anna');

select ok((select not public from storage.buckets where id = 'sync-files'), 'il bucket non è pubblico');
select is((select file_size_limit from storage.buckets where id = 'sync-files'), 52428800::bigint, 'al massimo 50 MB per file');

select pg_temp.entra('anna');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('sync-files', %L, %L)$$,
  pg_temp.uid('anna') || '/note/n1/YQ', pg_temp.uid('anna')), 'anna carica nella sua cartella');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id) values ('sync-files', %L, %L)$$,
  pg_temp.uid('bruno') || '/note/n1/YQ', pg_temp.uid('anna')), '42501', null, 'non nella cartella di un altro');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sync-files', 'note/n1/YQ')$$,
  '42501', null, 'né fuori da una cartella utente');
select is((select count(*)::int from storage.objects where bucket_id = 'sync-files'), 1, 'vede il suo file');
select pg_temp.esci();

select pg_temp.entra('bruno');
select is((select count(*)::int from storage.objects where bucket_id = 'sync-files'), 0, 'bruno (stesso gruppo) non vede i file di anna');
select lives_ok($$update storage.objects set name = name || 'x' where bucket_id = 'sync-files'$$, 'l''update dei file altrui...');
select pg_temp.esci();
select is((select name from storage.objects where bucket_id = 'sync-files'), pg_temp.uid('anna') || '/note/n1/YQ', '...non cambia niente');

select pg_temp.anonimo();
select is((select count(*)::int from storage.objects where bucket_id = 'sync-files'), 0, 'anon: non vede nulla');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('sync-files', %L)$$, pg_temp.uid('anna') || '/x'),
  '42501', null, 'anon: non carica');
select pg_temp.esci();

select * from finish();
rollback;
