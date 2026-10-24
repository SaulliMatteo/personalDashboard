-- update_group: solo il proprietario cambia nome e descrizione, con i vincoli della tabella.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.gruppo('g', 'anna');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo');

select pg_temp.anonimo();
select throws_ok(format($$select public.update_group(%L, 'x')$$, pg_temp.gid('g')), '42501', null,
  'anon: non modifica');
select pg_temp.esci();

select pg_temp.entra('anna');
select lives_ok(format($$select public.update_group(%L, '  Fisica 2  ', ' Esame di giugno ')$$, pg_temp.gid('g')),
  'il proprietario cambia nome e descrizione');
select is((select name from public.groups where id = pg_temp.gid('g')), 'Fisica 2', 'nome senza spazi ai bordi');
select is((select description from public.groups where id = pg_temp.gid('g')), 'Esame di giugno', 'descrizione salvata');
select lives_ok(format($$select public.update_group(%L, 'Fisica 2', null)$$, pg_temp.gid('g')),
  'descrizione nulla = vuota');
select is((select description from public.groups where id = pg_temp.gid('g')), '', 'descrizione vuota');
select throws_ok(format($$select public.update_group(%L, '   ')$$, pg_temp.gid('g')), '23514', null,
  'nome vuoto rifiutato');
select throws_ok(format($$select public.update_group(%L, %L)$$, pg_temp.gid('g'), repeat('a', 41)), '23514', null,
  'nome oltre 40 caratteri rifiutato');
select throws_ok(format($$select public.update_group(%L, 'ok', %L)$$, pg_temp.gid('g'), repeat('a', 201)), '23514', null,
  'descrizione oltre 200 caratteri rifiutata');
select throws_ok($$update public.groups set name = 'diretto'$$, '42501', null, 'non si modifica la tabella direttamente');
select pg_temp.esci();

select pg_temp.entra('bruno');
select throws_ok(format($$select public.update_group(%L, 'Preso')$$, pg_temp.gid('g')), '42501', 'not_owner',
  'un membro non modifica');
select pg_temp.esci();

select pg_temp.entra('dario');
select throws_ok(format($$select public.update_group(%L, 'Preso')$$, pg_temp.gid('g')), '42501', 'not_owner',
  'chi non è nel gruppo non modifica');
select pg_temp.esci();

select is((select name from public.groups where id = pg_temp.gid('g')), 'Fisica 2', 'il nome è rimasto quello del proprietario');

select * from finish();
rollback;
