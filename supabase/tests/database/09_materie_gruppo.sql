-- Report per materie: materie del gruppo (chi crea, chi modifica, limiti), totali per materia (scrittura solo
-- propria, somma ≤ totale giornaliero, materia dello stesso gruppo), consenso dell'account e revoca.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.utente('bruno');
select pg_temp.utente('dario');
select pg_temp.gruppo('g', 'anna');
select pg_temp.gruppo('h', 'dario');
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'preparazione: bruno entra nel gruppo g');
select pg_temp.salva('oggi', (now() at time zone 'utc')::date::text);

select pg_temp.entra('anna');
select public.touch_device('aaaaaaaa-0000-4000-8000-000000000001', 'windows');
select public.touch_device('aaaaaaaa-0000-4000-8000-000000000002', 'macos');
insert into public.study_daily_totals (user_id, device_id, day, seconds) values
  (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', pg_temp.leggi('oggi')::date, 3600),
  (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', pg_temp.leggi('oggi')::date - 1, 7200),
  (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000002', pg_temp.leggi('oggi')::date, 1000);
select pg_temp.esci();
select pg_temp.entra('bruno');
select public.touch_device('bbbbbbbb-0000-4000-8000-000000000001', 'linux');
insert into public.study_daily_totals (user_id, device_id, day, seconds)
values (auth.uid(), 'bbbbbbbb-0000-4000-8000-000000000001', pg_temp.leggi('oggi')::date, 5000);
select pg_temp.esci();

-- ─── Chiave dei nomi ───
select is(private.subject_key('Àrte, Moderna!!  II.'), 'arte moderna ii', 'chiave: minuscole, accenti, punteggiatura');
select is(private.subject_key('Fisica I'), 'fisica i', 'chiave: i numeri restano');

-- ─── Creare materie del gruppo ───
select pg_temp.anonimo();
select throws_ok(format($$select public.create_group_subject(%L, 'Analisi')$$, pg_temp.gid('g')), '42501', null,
  'anon: non crea');
select pg_temp.esci();

select pg_temp.entra('bruno');
select pg_temp.salva('analisi', public.create_group_subject(pg_temp.gid('g'), '  Analisi  ')::text);
select is((select name from public.group_subjects where id = pg_temp.leggi('analisi')::uuid), 'Analisi',
  'un membro crea una materia (nome senza spazi ai bordi)');
select is((select created_by from public.group_subjects where id = pg_temp.leggi('analisi')::uuid), pg_temp.uid('bruno'),
  'autore salvato');
select is(public.create_group_subject(pg_temp.gid('g'), 'analisi!')::text, pg_temp.leggi('analisi'),
  'stesso nome normalizzato: restituisce la materia esistente');
select pg_temp.salva('fisica1', public.create_group_subject(pg_temp.gid('g'), 'Fisica I')::text);
select pg_temp.salva('fisica2', public.create_group_subject(pg_temp.gid('g'), 'Fisica II')::text);
select isnt(pg_temp.leggi('fisica1'), pg_temp.leggi('fisica2'), 'Fisica I e Fisica II possono essere due materie');
select throws_ok(format($$select public.create_group_subject(%L, %L)$$, pg_temp.gid('g'), repeat('a', 41)), '23514', null,
  'nome oltre 40 caratteri rifiutato');
select throws_ok(format($$select public.create_group_subject(%L, '   ')$$, pg_temp.gid('g')), '23514', null,
  'nome vuoto rifiutato');
select throws_ok(format($$select public.create_group_subject(%L, '!?')$$, pg_temp.gid('g')), '23514', null,
  'nome di sola punteggiatura rifiutato');
select throws_ok(format($$select public.create_group_subject(%L, 'X', 12::smallint)$$, pg_temp.gid('g')), '23514', null,
  'colore fuori palette rifiutato');
select throws_ok(format($$select public.create_group_subject(%L, 'Storia')$$, pg_temp.gid('h')), '42501', 'not_member',
  'non crea nei gruppi altrui');
select throws_ok(format($$insert into public.group_subjects (group_id, name) values (%L, 'Diretta')$$, pg_temp.gid('g')),
  '42501', null, 'la tabella non si scrive direttamente');
select pg_temp.esci();

-- limite di frequenza: 20 creazioni all'ora
insert into private.subject_attempts (user_id) select pg_temp.uid('bruno') from generate_series(1, 20);
select pg_temp.entra('bruno');
select throws_ok(format($$select public.create_group_subject(%L, 'Chimica')$$, pg_temp.gid('g')), 'P0001', 'rate_limited',
  'oltre 20 creazioni in un''ora: rifiutato');
select is(public.create_group_subject(pg_temp.gid('g'), 'ANALISI')::text, pg_temp.leggi('analisi'),
  '...ma un nome già presente si abbina comunque');
select pg_temp.esci();
delete from private.subject_attempts;

-- limite di 50 materie attive per gruppo
insert into public.group_subjects (group_id, name)
select pg_temp.gid('g'), 'Riempitivo ' || n from generate_series(1, 47) n;
select pg_temp.entra('anna');
select throws_ok(format($$select public.create_group_subject(%L, 'Cinquantunesima')$$, pg_temp.gid('g')), 'P0001',
  'subject_limit', 'oltre 50 materie attive: rifiutato');
select pg_temp.esci();
delete from public.group_subjects where name like 'Riempitivo %';

-- ─── Lettura ───
select pg_temp.entra('dario');
select is((select count(*)::int from public.group_subjects where group_id = pg_temp.gid('g')), 0,
  'non-membro: non vede le materie del gruppo');
select pg_temp.esci();
select pg_temp.entra('anna');
select is((select count(*)::int from public.group_subjects where group_id = pg_temp.gid('g')), 3,
  'un membro vede le materie del gruppo');
select pg_temp.esci();

-- ─── Modificare (solo il proprietario) ───
select pg_temp.entra('bruno');
select throws_ok(format($$select public.update_group_subject(%L, 'Analisi 1', null)$$, pg_temp.leggi('analisi')),
  '42501', 'not_owner', 'un membro non rinomina');
select throws_ok(format($$select public.delete_group_subject(%L)$$, pg_temp.leggi('analisi')), '42501', 'not_owner',
  'un membro non elimina');
select throws_ok(format($$select public.merge_group_subjects(%L, %L)$$, pg_temp.leggi('fisica2'), pg_temp.leggi('fisica1')),
  '42501', 'not_owner', 'un membro non unisce');
select pg_temp.esci();

select pg_temp.entra('anna');
select lives_ok(format($$select public.update_group_subject(%L, 'Analisi matematica', 3::smallint)$$, pg_temp.leggi('analisi')),
  'il proprietario rinomina e cambia colore');
select is((select color::int from public.group_subjects where id = pg_temp.leggi('analisi')::uuid), 3, 'colore salvato');
select throws_ok(format($$select public.update_group_subject(%L, 'fisica  i', null)$$, pg_temp.leggi('analisi')),
  'P0001', 'subject_exists', 'nome già usato da un''altra materia: rifiutato');
select pg_temp.esci();

-- ─── Consenso ───
select pg_temp.entra('anna');
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(jsonb_build_object('subject_id', pg_temp.leggi('analisi'),
  'day', pg_temp.leggi('oggi'), 'seconds', 600))), 'disabled', 'senza consenso non si manda niente');
select is((select count(*)::int from public.group_subject_daily_totals), 0, '...e non resta niente');
select lives_ok($$select public.set_subject_report_consent(true)$$, 'consenso acceso');
select is((select enabled from public.subject_report_consent where user_id = auth.uid()), true, 'consenso salvato');
select pg_temp.esci();
select pg_temp.entra('bruno');
select is((select count(*)::int from public.subject_report_consent), 0, 'il consenso degli altri non si vede');
select public.set_subject_report_consent(true);
select pg_temp.esci();

-- ─── Mandare i totali per materia ───
select pg_temp.entra('anna');
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date, pg_temp.leggi('oggi')::date - 1],
  jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 1800),
    jsonb_build_object('subject_id', pg_temp.leggi('fisica1'), 'day', pg_temp.leggi('oggi'), 'seconds', 1800),
    jsonb_build_object('subject_id', pg_temp.leggi('fisica1'), 'day', (pg_temp.leggi('oggi')::date - 1)::text, 'seconds', 0))),
  'ok', 'manda i totali per materia');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = auth.uid()), 2,
  'le righe a 0 non si salvano');
select throws_ok(format($$select public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', %L,
  array[%L::date], jsonb_build_array(jsonb_build_object('subject_id', %L, 'day', %L, 'seconds', 3601)))$$,
  pg_temp.gid('g'), pg_temp.leggi('oggi'), pg_temp.leggi('analisi'), pg_temp.leggi('oggi')),
  '23514', 'exceeds_daily_total', 'somma oltre il totale giornaliero: rifiutata');
select throws_ok(format($$select public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000002', %L,
  array[%L::date], jsonb_build_array(jsonb_build_object('subject_id', %L, 'day', %L, 'seconds', 1001)))$$,
  pg_temp.gid('g'), pg_temp.leggi('oggi'), pg_temp.leggi('analisi'), pg_temp.leggi('oggi')),
  '23514', 'exceeds_daily_total', 'il limite è il totale dello stesso dispositivo');
select is((select sum(seconds)::int from public.group_subject_daily_totals where user_id = auth.uid()), 3600,
  '...e un invio rifiutato non cambia nulla');
select throws_ok(format($$select public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', %L,
  array[%L::date], jsonb_build_array(jsonb_build_object('subject_id', %L, 'day', %L, 'seconds', 60)))$$,
  pg_temp.gid('g'), (pg_temp.leggi('oggi')::date - 61)::text, pg_temp.leggi('analisi'), (pg_temp.leggi('oggi')::date - 61)::text),
  '22008', 'day_out_of_range', 'giorno troppo vecchio rifiutato');
select throws_ok(format($$select public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', %L,
  array[%L::date], jsonb_build_array(jsonb_build_object('subject_id', %L, 'day', %L, 'seconds', 60)))$$,
  pg_temp.gid('g'), pg_temp.leggi('oggi'), pg_temp.leggi('analisi'), (pg_temp.leggi('oggi')::date - 1)::text),
  '22023', 'invalid_rows', 'una riga fuori dai giorni mandati è rifiutata');
select throws_ok(format($$select public.sync_group_subject_totals('bbbbbbbb-0000-4000-8000-000000000001', %L,
  array[%L::date], '[]'::jsonb)$$, pg_temp.gid('g'), pg_temp.leggi('oggi')),
  '22023', 'unknown_device', 'non scrive sul dispositivo di un altro');
select throws_ok($$insert into public.group_subject_daily_totals (user_id, device_id, group_id, subject_id, day, seconds)
  values (auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid(), current_date, 1)$$,
  '42501', null, 'la tabella dei totali non si scrive direttamente');
select throws_ok($$delete from public.group_subject_daily_totals$$, '42501', null, 'né si cancella direttamente');
select pg_temp.esci();

-- materia di un altro gruppo
select pg_temp.entra('dario');
select pg_temp.salva('storia', public.create_group_subject(pg_temp.gid('h'), 'Storia')::text);
select public.touch_device('dddddddd-0000-4000-8000-000000000001', 'windows');
select throws_ok(format($$select public.sync_group_subject_totals('dddddddd-0000-4000-8000-000000000001', %L,
  array[%L::date], '[]'::jsonb)$$, pg_temp.gid('g'), pg_temp.leggi('oggi')),
  '42501', 'not_member', 'non-membro: non scrive nel gruppo');
select pg_temp.esci();
select pg_temp.entra('anna');
select throws_ok(format($$select public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', %L,
  array[%L::date], jsonb_build_array(jsonb_build_object('subject_id', %L, 'day', %L, 'seconds', 60)))$$,
  pg_temp.gid('g'), pg_temp.leggi('oggi'), pg_temp.leggi('storia'), pg_temp.leggi('oggi')),
  '22023', 'invalid_subject', 'materia di un altro gruppo rifiutata');
-- sostituzione: il giorno mandato di nuovo sostituisce le righe di prima
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(jsonb_build_object('subject_id', pg_temp.leggi('analisi'),
  'day', pg_temp.leggi('oggi'), 'seconds', 600))), 'ok', 'rimanda lo stesso giorno');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = auth.uid()), 1,
  'la materia non più mandata sparisce da quel giorno');
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 1800),
    jsonb_build_object('subject_id', pg_temp.leggi('fisica2'), 'day', pg_temp.leggi('oggi'), 'seconds', 1200))), 'ok', 'preparazione: invio');
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000002', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 500))), 'ok', 'preparazione: invio');
select is((select seconds from public.group_subject_totals_by_user
           where user_id = auth.uid() and subject_id = pg_temp.leggi('analisi')::uuid), 2300,
  'il server somma i dispositivi');
select pg_temp.esci();

select pg_temp.entra('bruno');
select is(public.sync_group_subject_totals('bbbbbbbb-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('fisica1'), 'day', pg_temp.leggi('oggi'), 'seconds', 3000))), 'ok', 'preparazione: invio');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = pg_temp.uid('anna')), 3,
  'un membro vede i totali per materia degli altri');
select pg_temp.esci();
select pg_temp.entra('dario');
select is((select count(*)::int from public.group_subject_daily_totals where group_id = pg_temp.gid('g')), 0,
  'non-membro: non vede i totali per materia');
select is((select count(*)::int from public.group_subject_totals_by_user where group_id = pg_temp.gid('g')), 0,
  'non-membro: non vede i totali sommati');
select pg_temp.esci();

-- ─── Report del gruppo ───
select pg_temp.entra('bruno');
select pg_temp.salva('report', public.group_subject_report(pg_temp.gid('g'), pg_temp.leggi('oggi')::date - 6,
  pg_temp.leggi('oggi')::date)::text);
select is((select sum((e->>'seconds')::int)::int from jsonb_array_elements(pg_temp.leggi('report')::jsonb->'subjects') e
           where e->>'subject_id' = pg_temp.leggi('analisi')), 2300, 'report: Analisi sommata sui membri e sui dispositivi');
select is((select sum((e->>'seconds')::int)::int from jsonb_array_elements(pg_temp.leggi('report')::jsonb->'subjects') e
           where e->>'subject_id' = pg_temp.leggi('fisica1')), 3000, 'report: Fisica I di bruno');
-- anna oggi: 4600 condivisi − 3500 abbinati = 1100; ieri 7200 senza materie; bruno: 5000 − 3000 = 2000
select is((select sum((e->>'seconds')::int)::int from jsonb_array_elements(pg_temp.leggi('report')::jsonb->'other') e
           where e->>'day' = pg_temp.leggi('oggi')), 3100, 'report: "Altre materie" = totale meno la parte abbinata');
select is((select sum((e->>'seconds')::int)::int from jsonb_array_elements(pg_temp.leggi('report')::jsonb->'other') e
           where e->>'day' = (pg_temp.leggi('oggi')::date - 1)::text), 7200, 'report: un giorno senza materie va tutto in Altre');
select is((select jsonb_array_length(e->'user_ids') from jsonb_array_elements(pg_temp.leggi('report')::jsonb->'contributors') e
           where e->>'subject_id' = pg_temp.leggi('analisi')), 1, 'report: chi ha contribuito a una materia');
select is(pg_temp.leggi('report')::jsonb->>'first_day', (pg_temp.leggi('oggi')::date - 1)::text, 'report: primo giorno con dati');
select throws_ok(format($$select public.group_subject_report(%L, current_date - 400, current_date)$$, pg_temp.gid('g')),
  '22023', 'invalid_range', 'report: al massimo un anno');
select pg_temp.esci();
select pg_temp.entra('dario');
select throws_ok(format($$select public.group_subject_report(%L, current_date - 6, current_date)$$, pg_temp.gid('g')),
  '42501', 'not_member', 'non-membro: niente report');
select pg_temp.esci();

-- ─── Unire ───
select pg_temp.entra('anna');
select throws_ok(format($$select public.merge_group_subjects(%L, %L)$$, pg_temp.leggi('fisica2'), pg_temp.leggi('storia')),
  '22023', 'invalid_subject', 'non si unisce a una materia di un altro gruppo');
select lives_ok(format($$select public.merge_group_subjects(%L, %L)$$, pg_temp.leggi('fisica2'), pg_temp.leggi('fisica1')),
  'il proprietario unisce Fisica II in Fisica I');
select is((select merged_into::text from public.group_subjects where id = pg_temp.leggi('fisica2')::uuid),
  pg_temp.leggi('fisica1'), 'la materia unita resta come segnaposto');
select is((select coalesce(sum(seconds), 0)::int from public.group_subject_daily_totals
           where subject_id = pg_temp.leggi('fisica2')::uuid), 0, 'i totali lasciano la materia unita...');
select is((select seconds from public.group_subject_daily_totals
           where user_id = auth.uid() and subject_id = pg_temp.leggi('fisica1')::uuid), 1200, '...e passano all''altra');
select throws_ok(format($$select public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', %L,
  array[%L::date], jsonb_build_array(jsonb_build_object('subject_id', %L, 'day', %L, 'seconds', 60)))$$,
  pg_temp.gid('g'), pg_temp.leggi('oggi'), pg_temp.leggi('fisica2'), pg_temp.leggi('oggi')),
  '22023', 'invalid_subject', 'non si scrive su una materia unita');
select lives_ok(format($$select public.create_group_subject(%L, 'Fisica II')$$, pg_temp.gid('g')),
  'dopo l''unione il nome si può riusare (separare di nuovo)');
select pg_temp.esci();

-- ─── Revoca ───
select pg_temp.entra('anna');
select lives_ok(format($$select public.revoke_group_subject_totals(%L, %L)$$, pg_temp.gid('g'), pg_temp.leggi('analisi')),
  'revoca di una materia');
select is((select count(*)::int from public.group_subject_daily_totals
           where user_id = auth.uid() and subject_id = pg_temp.leggi('analisi')::uuid), 0,
  'cancellate le righe di quella materia, su tutti i dispositivi');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = pg_temp.uid('bruno')), 1,
  'le righe degli altri restano');
select lives_ok(format($$select public.revoke_group_subject_totals(%L)$$, pg_temp.gid('g')), 'revoca di un gruppo');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = auth.uid()), 0,
  'cancellate tutte le proprie righe del gruppo');
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 100))), 'ok', 'preparazione: invio');
select lives_ok($$select public.set_subject_report_consent(false)$$, 'consenso spento');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = auth.uid()), 0,
  'consenso spento: cancellate tutte le proprie righe');
select is(public.sync_group_subject_totals('aaaaaaaa-0000-4000-8000-000000000002', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(jsonb_build_object('subject_id', pg_temp.leggi('analisi'),
  'day', pg_temp.leggi('oggi'), 'seconds', 100))), 'disabled', '...e nessun dispositivo può rimandarle');
select is((select count(*)::int from public.group_subject_daily_totals where user_id = auth.uid()), 0, '...davvero');
select pg_temp.esci();

-- eliminare una materia cancella i suoi totali
select pg_temp.entra('anna');
select lives_ok(format($$select public.delete_group_subject(%L)$$, pg_temp.leggi('fisica1')), 'il proprietario elimina');
select pg_temp.esci();
select is((select count(*)::int from public.group_subject_daily_totals where subject_id = pg_temp.leggi('fisica1')::uuid), 0,
  'eliminata la materia, spariscono i suoi totali');
select is((select count(*)::int from public.group_subjects where id = pg_temp.leggi('fisica2')::uuid), 0,
  '...e i suoi segnaposto');

-- uscire dal gruppo cancella le proprie righe
select pg_temp.entra('bruno');
select is(public.sync_group_subject_totals('bbbbbbbb-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 3000))), 'ok', 'preparazione: invio');
select public.leave_group(pg_temp.gid('g'));
select pg_temp.esci();
select is((select count(*)::int from public.group_subject_daily_totals where user_id = pg_temp.uid('bruno')), 0,
  'abbandonato il gruppo, le sue righe per materia sono cancellate');

-- rimozione da parte del proprietario
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'bruno rientra');
select pg_temp.entra('bruno');
select is(public.sync_group_subject_totals('bbbbbbbb-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 3000))), 'ok', 'preparazione: invio');
select pg_temp.esci();
select pg_temp.entra('anna');
select public.remove_member(pg_temp.gid('g'), pg_temp.uid('bruno'));
select pg_temp.esci();
select is((select count(*)::int from public.group_subject_daily_totals where user_id = pg_temp.uid('bruno')), 0,
  'rimosso dal gruppo, le sue righe per materia sono cancellate');

-- eliminare l'account
select is(pg_temp.unisci('bruno', 'g'), 'ok', 'bruno rientra ancora');
select pg_temp.entra('bruno');
select is(public.sync_group_subject_totals('bbbbbbbb-0000-4000-8000-000000000001', pg_temp.gid('g'),
  array[pg_temp.leggi('oggi')::date], jsonb_build_array(
    jsonb_build_object('subject_id', pg_temp.leggi('analisi'), 'day', pg_temp.leggi('oggi'), 'seconds', 3000))), 'ok', 'preparazione: invio');
select public.delete_account();
select pg_temp.esci();
select is((select count(*)::int from public.group_subject_daily_totals where user_id = pg_temp.uid('bruno')), 0,
  'account eliminato: nessuna riga per materia');
select is((select count(*)::int from public.subject_report_consent where user_id = pg_temp.uid('bruno')), 0,
  '...né il consenso');

select * from finish();
rollback;
