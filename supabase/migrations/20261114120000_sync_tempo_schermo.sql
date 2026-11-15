-- Sync: il tipo `screen_usage` (Tempo allo schermo: secondi per giorno, ora e app di ogni dispositivo; mai titoli
-- né siti). Va applicata PRIMA di installare l'app che lo manda: un tipo sconosciuto fa rifiutare a sync_push tutto il
-- blocco, e si fermerebbe il sync di ogni cosa. Le righe restano leggibili solo dal proprio utente (RLS invariata).

alter table public.sync_records drop constraint sync_records_kind;
alter table public.sync_records add constraint sync_records_kind check (kind in ('subject', 'session', 'folder', 'note',
  'page', 'attachment', 'collection', 'field', 'row', 'view', 'screen_usage', 'setting'));
