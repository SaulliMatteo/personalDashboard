-- Moduli "chat" e "todo": accesi nei gruppi nuovi, canali riservati ai membri, nessuna tabella.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');

select ok((select enabled from public.group_features where group_id = pg_temp.gid('g') and feature_key = 'chat'),
  'un gruppo nuovo ha il modulo chat acceso');
select ok((select enabled from public.group_features where group_id = pg_temp.gid('g') and feature_key = 'todo'),
  'e anche il modulo todo');
select ok(not has_function_privilege('authenticated', 'private.enable_chat_todo_features()', 'execute'),
  'il client non chiama la funzione del trigger');
select is((select count(*)::int from information_schema.tables
  where table_schema = 'public' and (table_name ilike '%chat%' or table_name ilike '%todo%' or table_name ilike '%message%')), 0,
  'nessuna tabella per messaggi o liste: non restano sul server');

select pg_temp.entra('bruno');
select ok(private.can_access_channel('group:' || pg_temp.gid('g') || ':chat'), 'un membro entra nel canale chat');
select ok(private.can_access_channel('group:' || pg_temp.gid('g') || ':todo'), 'un membro entra nel canale todo');
select pg_temp.esci();

select pg_temp.entra('dario');
select ok(not private.can_access_channel('group:' || pg_temp.gid('g') || ':chat'), 'un non-membro non entra nel canale chat');
select ok(not private.can_access_channel('group:' || pg_temp.gid('g') || ':todo'), 'né in quello todo');
select pg_temp.esci();

update public.group_features set enabled = false where group_id = pg_temp.gid('g') and feature_key = 'chat';
select pg_temp.entra('anna');
select ok(not private.can_access_channel('group:' || pg_temp.gid('g') || ':chat'), 'chat spenta: nessuno entra');
select ok(private.can_access_channel('group:' || pg_temp.gid('g') || ':todo'), 'todo resta raggiungibile');
select pg_temp.esci();

select * from finish();
rollback;
