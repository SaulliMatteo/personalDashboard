-- Gruppi: visibilità, codice invito, limite ai tentativi, limite membri, ruoli, passaggio di proprietà.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('carla');
select pg_temp.utente('dario');
select pg_temp.utente('elio');

-- ─── Creazione e codice ───
select pg_temp.gruppo('g', 'anna');
select matches(pg_temp.leggi('codice:g'), '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$',
  'codice invito: 8 caratteri senza 0 O 1 I L');
select is((select role from public.group_members where group_id = pg_temp.gid('g') and user_id = pg_temp.uid('anna')),
  'owner', 'chi crea il gruppo ne è owner');
select is((select owner_id from public.groups where id = pg_temp.gid('g')), pg_temp.uid('anna'), 'owner_id allineato');
select ok((select enabled from public.group_features where group_id = pg_temp.gid('g') and feature_key = 'study'),
  'il modulo study è attivo alla creazione');

select pg_temp.entra('anna');
select throws_ok($$select public.create_group(repeat('x', 41), '')$$, '23514', null, 'nome oltre 40 caratteri rifiutato');
select throws_ok($$select public.create_group('ok', repeat('x', 201))$$, '23514', null, 'descrizione oltre 200 rifiutata');
select throws_ok($$select public.create_group('   ', '')$$, '23514', null, 'nome vuoto rifiutato');
select pg_temp.esci();

-- ─── Ingresso ───
select pg_temp.entra('bruno');
select is(public.join_group(lower(pg_temp.leggi('codice:g'))), 'ok', 'il codice giusto fa entrare (anche minuscolo)');
select pg_temp.esci();
select is(pg_temp.unisci('carla', 'g'), 'ok', 'un secondo membro entra');
select is(pg_temp.unisci('carla', 'g'), 'already_member', 'rientrare dà already_member');

-- ─── Un non-membro non vede nulla ───
select pg_temp.entra('dario');
select is(public.join_group('ZZZZZZZ9'), 'invalid', 'un codice errato non fa entrare');
select is((select count(*)::int from public.groups), 0, 'non-membro: non vede il gruppo (né il codice)');
select is((select count(*)::int from public.group_members), 0, 'non-membro: non vede i membri');
select is((select count(*)::int from public.group_features), 0, 'non-membro: non vede i moduli');
select is((select count(*)::int from public.profiles where id <> pg_temp.uid('dario')), 0,
  'non-membro: non vede i profili degli altri');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('dario')), 1, 'vede il proprio profilo');
select throws_ok(format('select public.leave_group(%L)', pg_temp.gid('g')), '42501', null,
  'non-membro: non può abbandonare un gruppo altrui');
select pg_temp.esci();

-- ─── Un membro vede il gruppo ma non lo modifica direttamente ───
select pg_temp.entra('bruno');
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid('g')), 3, 'membro: vede i membri');
select is((select invite_code from public.groups where id = pg_temp.gid('g')), pg_temp.leggi('codice:g'),
  'membro: vede il codice invito');
select is((select count(*)::int from public.profiles), 3, 'membro: vede solo i profili del suo gruppo');
select throws_ok(format($$insert into public.group_members (group_id, user_id) values (%L, %L)$$,
  pg_temp.gid('g'), pg_temp.uid('dario')), '42501', null, 'membro: non aggiunge membri a mano');
select throws_ok(format($$update public.group_members set role = 'owner' where group_id = %L$$, pg_temp.gid('g')),
  '42501', null, 'membro: non si promuove owner');
select throws_ok(format($$update public.groups set max_members = 30 where id = %L$$, pg_temp.gid('g')),
  '42501', null, 'membro: non modifica il gruppo');
select throws_ok(format($$delete from public.groups where id = %L$$, pg_temp.gid('g')),
  '42501', null, 'membro: non elimina il gruppo');

-- ─── Solo l'owner rimuove membri e rigenera il codice ───
select throws_ok(format('select public.remove_member(%L, %L)', pg_temp.gid('g'), pg_temp.uid('carla')),
  '42501', null, 'membro: non rimuove altri membri');
select throws_ok(format('select public.regenerate_invite_code(%L)', pg_temp.gid('g')),
  '42501', null, 'membro: non rigenera il codice');
select pg_temp.esci();

select pg_temp.entra('anna');
select pg_temp.salva('codice:g:nuovo', public.regenerate_invite_code(pg_temp.gid('g')));
select isnt(pg_temp.leggi('codice:g:nuovo'), pg_temp.leggi('codice:g'), 'owner: rigenera il codice');
select lives_ok(format('select public.remove_member(%L, %L)', pg_temp.gid('g'), pg_temp.uid('carla')),
  'owner: rimuove un membro');
select throws_ok(format('select public.remove_member(%L, %L)', pg_temp.gid('g'), pg_temp.uid('anna')),
  '22023', null, 'owner: non rimuove sé stesso');
select pg_temp.esci();
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid('g') and user_id = pg_temp.uid('carla')),
  0, 'il membro rimosso non è più nel gruppo');
select is(pg_temp.unisci('carla', 'g'), 'invalid', 'il vecchio codice non vale più');

-- ─── Limite ai tentativi (10 ogni 10 minuti) ───
select pg_temp.entra('elio');
select is(
  (select count(*)::int from (select public.join_group('ZZZZZZZ' || i) as esito from generate_series(1, 10) i) t
   where esito = 'invalid'),
  10,
  '10 codici errati di fila'
);
select is(public.join_group(pg_temp.leggi('codice:g:nuovo')), 'rate_limited',
  $$all'11° tentativo si blocca, anche con il codice giusto$$);
select pg_temp.esci();
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('elio')), 0,
  'bloccato: non è entrato');

-- ─── Limite di 30 membri ───
select pg_temp.gruppo('pieno', 'anna');
do $$
begin
  for i in 1..28 loop
    insert into public.group_members (group_id, user_id)
    values (pg_temp.gid('pieno'), pg_temp.utente('riempi' || i));
  end loop;
end;
$$;
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid('pieno')), 29, '29 membri');
select is(pg_temp.unisci('bruno', 'pieno'), 'ok', 'il 30° membro entra');
select is(pg_temp.unisci('carla', 'pieno'), 'full', 'il 31° membro viene rifiutato');
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid('pieno')), 30, 'restano 30 membri');

-- ─── Passaggio di proprietà ed eliminazione del gruppo vuoto ───
select pg_temp.gruppo('eredita', 'anna');
select is(pg_temp.unisci('bruno', 'eredita'), 'ok', 'bruno entra per primo');
select is(pg_temp.unisci('carla', 'eredita'), 'ok', 'carla entra dopo');

select pg_temp.entra('anna');
select lives_ok(format('select public.leave_group(%L)', pg_temp.gid('eredita')), $$l'owner abbandona$$);
select pg_temp.esci();
select is((select owner_id from public.groups where id = pg_temp.gid('eredita')), pg_temp.uid('bruno'),
  'la proprietà passa al membro più anziano');
select is((select role from public.group_members where group_id = pg_temp.gid('eredita') and user_id = pg_temp.uid('bruno')),
  'owner', 'il nuovo owner ha il ruolo owner');
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid('eredita') and role = 'owner'),
  1, 'un solo owner');

select pg_temp.entra('carla');
select lives_ok(format('select public.leave_group(%L)', pg_temp.gid('eredita')), 'un membro abbandona');
select pg_temp.esci();
select is((select owner_id from public.groups where id = pg_temp.gid('eredita')), pg_temp.uid('bruno'),
  $$se esce un membro l'owner non cambia$$);

select pg_temp.entra('bruno');
select lives_ok(format('select public.leave_group(%L)', pg_temp.gid('eredita')), $$l'ultimo membro abbandona$$);
select pg_temp.esci();
select is((select count(*)::int from public.groups where id = pg_temp.gid('eredita')), 0, 'il gruppo vuoto viene eliminato');
select is((select count(*)::int from public.group_features where group_id = pg_temp.gid('eredita')), 0,
  'e con lui i suoi moduli');

select * from finish();
rollback;
