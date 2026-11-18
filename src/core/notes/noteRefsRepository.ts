import { getDatabase } from "../db";

/*
 * Lettura delle note del Quaderno per chi non è il Quaderno (il Calendario collega note a giorni ed eventi):
 * solo SELECT, mai scritture. Per aprire una nota: requestWidgetIntent("notes", { type: "openNote", noteId })
 * di core/nav/intents.ts, poi openWidgetDetail("notes").
 */

/** Quanto serve per mostrare una nota collegata: titolo e cartella. */
export interface NoteRef {
  id: number;
  title: string;
  folderName: string | null;
}

const NOTE_REF_SELECT = `SELECT n.id, n.title, f.name AS folder_name FROM notes n LEFT JOIN note_folders f ON f.id = n.folder_id`;

function toRef(r: { id: number; title: string; folder_name: string | null }): NoteRef {
  return { id: r.id, title: r.title, folderName: r.folder_name };
}

/** Le note con questi id che esistono e non sono nel cestino (quelle sparite semplicemente mancano). */
export async function getNoteRefs(ids: readonly number[]): Promise<NoteRef[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const db = await getDatabase();
  const rows = await db.select<{ id: number; title: string; folder_name: string | null }[]>(
    `${NOTE_REF_SELECT} WHERE n.deleted_at IS NULL AND n.id IN (${unique.map(() => "?").join(", ")})`,
    unique
  );
  return rows.map(toRef);
}

/** Note da collegare: per titolo (vuoto = le più recenti), escluse quelle nel cestino. */
export async function searchNoteRefs(query: string, limit = 20): Promise<NoteRef[]> {
  const db = await getDatabase();
  const q = query.trim();
  const rows = await db.select<{ id: number; title: string; folder_name: string | null }[]>(
    q
      ? `${NOTE_REF_SELECT} WHERE n.deleted_at IS NULL AND n.title LIKE ? ESCAPE '\\' ORDER BY n.updated_at DESC LIMIT ?`
      : `${NOTE_REF_SELECT} WHERE n.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT ?`,
    q ? [`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit] : [limit]
  );
  return rows.map(toRef);
}
