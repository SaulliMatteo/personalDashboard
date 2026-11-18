-- Sync: anche il Calendario (src/core/sync/tables.ts: calendar_category, calendar_property, calendar_event,
-- calendar_note). Si allarga solo l'elenco dei tipi ammessi; righe, letture e sync_push restano come prima.
-- Va applicata al server PRIMA di distribuire una versione dell'app che sincronizza il Calendario: con il vincolo
-- vecchio sync_push rifiuterebbe l'intero blocco e il sync di quell'utente si fermerebbe.

alter table public.sync_records drop constraint sync_records_kind;

alter table public.sync_records
  add constraint sync_records_kind check (kind in ('subject', 'session', 'folder', 'note', 'page', 'attachment',
    'collection', 'field', 'row', 'view', 'screen_usage', 'setting',
    'calendar_category', 'calendar_property', 'calendar_event', 'calendar_note'));
