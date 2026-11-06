import { useEffect, type ReactNode } from "react";
import { onSyncApplied } from "../../../core/sync/syncEvents";
import { registerSyncTask } from "../../../core/sync/syncTasks";
import type { SyncKind } from "../../../core/sync/tables";
import { afterRemoteChanges } from "../data/notesRepository";
import { loadCollections } from "../lib/collectionsStore";
import { emitRemoteNotesChange } from "../lib/remoteChanges";
import { removeNoteDir } from "../lib/vault";
import { syncNoteFiles } from "./fileSync";

const NOTE_KINDS: readonly SyncKind[] = ["folder", "note", "page", "attachment"];
const COLLECTION_KINDS: readonly SyncKind[] = ["collection", "field", "row", "view"];

const numbers = (ids: readonly unknown[] | undefined) => (ids ?? []).filter((id): id is number => typeof id === "number");

/**
 * Note e Raccolte arrivate dagli altri dispositivi (core/sync/): sempre montato, anche con la pagina Notes chiusa.
 * Toglie le cartelle su disco delle note cancellate, riallinea segni e copia su disco, poi avvisa chi le mostra; dopo
 * ogni giro allinea i file (fileSync.ts).
 */
export function NotesSyncProvider({ children }: { children: ReactNode }) {
  useEffect(
    () =>
      onSyncApplied(({ kinds, written, deleted }) => {
        const notes = NOTE_KINDS.some((k) => kinds.has(k));
        const collections = COLLECTION_KINDS.some((k) => kinds.has(k));
        if (!notes && !collections) return;
        void (async () => {
          try {
            for (const row of deleted.get("note") ?? []) {
              if (typeof row.disk_path === "string" && row.disk_path) await removeNoteDir(row.disk_path);
            }
            const noteIds = await afterRemoteChanges(numbers(written.get("note")), numbers(written.get("page")));
            if (collections) await loadCollections(true);
            emitRemoteNotesChange({ noteIds: new Set(noteIds) });
          } catch (error) {
            console.error("Errore nel riallineare le note arrivate:", error);
          }
        })();
      }),
    []
  );
  // i file (allegati, immagini, PDF, file delle raccolte) dopo ogni giro
  useEffect(() => registerSyncTask(syncNoteFiles), []);

  return <>{children}</>;
}
