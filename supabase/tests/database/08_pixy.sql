-- Modulo "pixy": acceso nei gruppi nuovi, canale riservato ai membri, il client non lo tocca.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');
select pg_temp.salva('topic', 'group:' || pg_temp.gid('g') || ':pixy');

select ok((select enabled from public.group_features where group_id = pg_temp.gid('g') and feature_key = 'pixy'),
  'un gruppo nuovo ha il modulo pixy acceso');
select ok((select enabled from public.group_features where group_id = pg_temp.gid('g') and feature_key = 'study'),
  'e anche study, come prima');
select ok(not has_function_privilege('authenticated', 'private.enable_pixy_feature()', 'execute'),
  'il client non chiama la funzione del trigger');

select pg_temp.entra('bruno');
select ok(private.can_access_channel(pg_temp.leggi('topic')), 'un membro entra nel canale pixy');
select is((select count(*)::int from public.group_features where group_id = pg_temp.gid('g')), 2,
  'il membro vede i due moduli del gruppo');
select throws_ok(format($$insert into public.group_features values (%L, 'cinema', true)$$, pg_temp.gid('g')),
  '42501', null, 'un membro non accende moduli');
select throws_ok(format($$update public.group_features set enabled = false where group_id = %L$$, pg_temp.gid('g')),
  '42501', null, 'un membro non spegne moduli');
select pg_temp.esci();

select pg_temp.entra('dario');
select ok(not private.can_access_channel(pg_temp.leggi('topic')), 'un non-membro non entra nel canale pixy');
select pg_temp.esci();

update public.group_features set enabled = false where group_id = pg_temp.gid('g') and feature_key = 'pixy';
select pg_temp.entra('anna');
select ok(not private.can_access_channel(pg_temp.leggi('topic')), 'pixy spento: nessuno entra');
select ok(private.can_access_channel('group:' || pg_temp.gid('g') || ':study'), 'study resta raggiungibile');
select pg_temp.esci();

select * from finish();
rollback;
