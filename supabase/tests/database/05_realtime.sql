-- Realtime: un solo controllo per i canali "group:<id>:<feature>".
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');
select pg_temp.salva('topic', 'group:' || pg_temp.gid('g') || ':study');

select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and policyname = 'gruppi: ricevere nei canali dei propri gruppi' and cmd = 'SELECT'), 'policy di ricezione presente');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and policyname = 'gruppi: inviare nei canali dei propri gruppi' and cmd = 'INSERT'), 'policy di invio presente');

select pg_temp.entra('bruno');
select ok(private.can_access_channel(pg_temp.leggi('topic')), 'un membro entra nel canale study del suo gruppo');
select ok(not private.can_access_channel('group:' || pg_temp.gid('g') || ':cinema'), 'non in un modulo non attivo');
select ok(not private.can_access_channel('group:non-un-uuid:study'), 'topic malformato: false, non errore');
select ok(not private.can_access_channel('group:' || pg_temp.gid('g')), 'topic senza modulo');
select ok(not private.can_access_channel('stanza-pubblica'), 'topic estraneo');
select ok(not private.can_access_channel(null), 'topic nullo');
select ok(not private.can_access_channel('group:' || gen_random_uuid() || ':study'), 'gruppo inesistente');
select pg_temp.esci();

select pg_temp.entra('dario');
select ok(not private.can_access_channel(pg_temp.leggi('topic')), 'un non-membro non entra');
select pg_temp.esci();

update public.group_features set enabled = false where group_id = pg_temp.gid('g') and feature_key = 'study';
select pg_temp.entra('anna');
select ok(not private.can_access_channel(pg_temp.leggi('topic')), 'modulo disattivato: nessuno entra');
select pg_temp.esci();

select * from finish();
rollback;
