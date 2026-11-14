# Sync tra dispositivi

I file senza cartella stanno in `src/core/sync/`. Server e flusso completo: `docs/GRUPPI.md` § 5 ("Sync dei miei
dati"); ricetta per una tabella nuova: `docs/ARCHITETTURA.md`.

Prove: `scripts/sync/records.test.mts`, `schema.test.mts` (SQLite vero con `node:sqlite`, tutte le migrazioni da
zero), `round.test.mts` (due dispositivi su SQLite vero e un server finto), `files.test.mts` per `filePlan.ts`.

## Righe

- Le tabelle sincronizzate (`SYNC_TABLES` in `tables.ts`: Studio, Note, Raccolte, impostazioni) hanno trigger SQLite
  (migrazione 23) che danno a ogni riga un id globale (`sync_map`) e segnano le righe cambiate (`sync_outbox`); tacciono
  con `sync_state.applying = 1`.
- Una colonna nuova in una di quelle tabelle va aggiunta ai trigger (migrazione nuova con DROP/CREATE TRIGGER) e in
  `tables.ts`, altrimenti non viaggia (`schema.test.mts` lo segnala). Nei trigger niente `OR IGNORE`/`OR REPLACE`: con
  un UPSERT esterno SQLite non li rispetta.
- Gli id locali dentro i contenuti (`data-view`, `data-ref-row`, campi delle righe e delle viste) li traduce
  `engine/records.ts`: un riferimento nuovo a un id va aggiunto lì.
- Impostazioni del singolo dispositivo: `PER_DEVICE_SETTINGS` in `core/settings/schema.ts`.
- Il giro (`engine/round.ts`, puro: pull per `seq`, poi push del registro) lo fa partire `SyncProvider`
  (`SyncContext.tsx`, solo con l'account pronto e `syncEnabled`); l'SQL sta tutto in `syncRepository.ts` e la rete in
  `core/cloud/syncApi.ts` (server: `supabase/migrations/…_sync.sql`, righe leggibili solo dal proprio utente).
- Le scritture del sync tengono i trigger accesi e tolgono subito la loro voce dal registro (il flag `applying` serve
  solo a "Usa i dati del cloud").
- Chi tiene in memoria righe sincronizzate le rilegge con `onSyncApplied` (`syncEvents.ts`, come fanno impostazioni e
  timer dello Studio; le Note passano da `widgets/notes/sync/NotesSyncProvider.tsx`, che toglie le cartelle su disco
  delle note cancellate, ricalcola segni e copia su disco e poi avvisa pagina, card e mini con `lib/remoteChanges.ts`).
- I tipi accesi sono `SYNC_KINDS` in `syncSetup.ts`: uno nuovo entra nel registro da solo al primo giro.
- I totali dei Gruppi contano solo le sessioni con `origin_device` NULL (fatte qui).

## File

Allegati, immagini e PDF delle pagine, campi File delle raccolte non sono righe: li muove
`widgets/notes/sync/fileSync.ts` dopo ogni giro (registrato con `registerSyncTask` di `syncTasks.ts`) nel bucket
privato `sync-files` (`<user_id>/<note|collection>/<uid>/<nome in base64url>`, rete solo in
`core/cloud/syncFilesApi.ts`). Cosa caricare, scaricare o togliere lo decide `filePlan.ts` (puro) dalle righe che li
citano e da `sync_files` (migrazione 24: i file già sia qui sia nel cloud). Un riferimento nuovo a un file va in
`listFileReferences` di `notesRepository.ts`. Lo Storage non si svuota da SQL: `deleteAccount` cancella prima i file.
