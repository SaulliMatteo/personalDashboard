import { getDatabase, getMeta, setMeta } from "../../../../core/db";
import type { SubjectLink, SubjectSessionSpan } from "../subjects/subjectPlan";

/*
 * Report per materie, lato locale: le materie e le sessioni del widget Studio (solo lettura, come
 * studyTotalsRepository) e gli abbinamenti dei Gruppi (tabella group_subject_links, migrazione 14). Tutto qui resta
 * sul computer: al server vanno solo i secondi per materia del gruppo.
 */

/** Una materia del widget Studio, come serve ai Gruppi. */
export interface LocalSubject {
  id: number;
  name: string;
  archived: boolean;
}

export async function listLocalSubjects(): Promise<LocalSubject[]> {
  const db = await getDatabase();
  const rows = await db.select<{ id: number; name: string; archived_at: number | null }[]>(
    `SELECT id, name, archived_at FROM subjects ORDER BY name COLLATE NOCASE`
  );
  return rows.map((r) => ({ id: r.id, name: r.name, archived: r.archived_at !== null }));
}

export async function getSubjectSessionsBetween(startMs: number, endMs: number): Promise<SubjectSessionSpan[]> {
  const db = await getDatabase();
  const rows = await db.select<{ ended_at: number; duration_seconds: number; subject_id: number }[]>(
    `SELECT ended_at, duration_seconds, subject_id FROM study_sessions WHERE ended_at >= ? AND ended_at < ?`,
    [startMs, endMs]
  );
  return rows.map((r) => ({ endedAt: r.ended_at, durationSeconds: r.duration_seconds, subjectId: r.subject_id }));
}

/** Gli abbinamenti dell'account; quelli di materie locali che non esistono più si tolgono (niente FK, vedi la v14). */
export async function loadSubjectLinks(userId: string): Promise<SubjectLink[]> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM group_subject_links WHERE user_id = ? AND local_subject_id NOT IN (SELECT id FROM subjects)`,
    [userId]
  );
  const rows = await db.select<{ group_id: string; local_subject_id: number; group_subject_id: string | null }[]>(
    `SELECT group_id, local_subject_id, group_subject_id FROM group_subject_links WHERE user_id = ?`,
    [userId]
  );
  return rows.map((r) => ({ groupId: r.group_id, localSubjectId: r.local_subject_id, groupSubjectId: r.group_subject_id }));
}

/** Conferma (o cambia) un abbinamento: `groupSubjectId` null = "Non condividere". */
export async function saveSubjectLink(userId: string, link: SubjectLink): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO group_subject_links (user_id, group_id, local_subject_id, group_subject_id, confirmed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, group_id, local_subject_id)
     DO UPDATE SET group_subject_id = excluded.group_subject_id, confirmed_at = excluded.confirmed_at`,
    [userId, link.groupId, link.localSubjectId, link.groupSubjectId, Date.now()]
  );
}

/** Il proprietario ha unito una materia del gruppo: gli abbinamenti la seguono. */
export async function retargetSubjectLinks(userId: string, groupId: string, fromId: string, toId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE group_subject_links SET group_subject_id = ? WHERE user_id = ? AND group_id = ? AND group_subject_id = ?`,
    [toId, userId, groupId, fromId]
  );
}

/** La materia del gruppo non c'è più: i suoi abbinamenti tornano da confermare. */
export async function dropSubjectLinksTo(userId: string, groupId: string, groupSubjectId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM group_subject_links WHERE user_id = ? AND group_id = ? AND group_subject_id = ?`, [
    userId,
    groupId,
    groupSubjectId,
  ]);
}

/** Fuori dal gruppo: i suoi abbinamenti non servono più (le righe sul server le cancella il server). */
export async function dropGroupSubjectLinks(userId: string, groupId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM group_subject_links WHERE user_id = ? AND group_id = ?`, [userId, groupId]);
}

/**
 * Operazioni da fare sul server appena si può (senza rete restano qui, anche dopo un riavvio):
 *  - `consent`: il consenso da mandare (l'interruttore è stato cambiato);
 *  - `revoke`: righe da cancellare (abbinamento tolto o cambiato), `subjectId` null = tutto il gruppo;
 *  - `backfillAt`: da quando c'è da rimandare lo storico (fino a 60 giorni), perché un abbinamento è cambiato.
 */
export interface SubjectPending {
  consent?: boolean;
  revoke: { groupId: string; subjectId: string | null }[];
  backfillAt: number | null;
}

function pendingKey(userId: string): string {
  return `groups_subjects_pending:${userId}`;
}

async function readPending(userId: string): Promise<SubjectPending> {
  const empty: SubjectPending = { revoke: [], backfillAt: null };
  try {
    const raw = await getMeta(pendingKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SubjectPending>;
    return {
      consent: typeof parsed.consent === "boolean" ? parsed.consent : undefined,
      revoke: Array.isArray(parsed.revoke)
        ? parsed.revoke.filter((r) => typeof r?.groupId === "string" && (r.subjectId === null || typeof r.subjectId === "string"))
        : [],
      backfillAt: typeof parsed.backfillAt === "number" ? parsed.backfillAt : null,
    };
  } catch {
    return empty;
  }
}

// Le modifiche passano una alla volta: l'invio che toglie ciò che ha fatto non cancella ciò che la pagina aggiunge.
let queue: Promise<unknown> = Promise.resolve();

export function loadSubjectPending(userId: string): Promise<SubjectPending> {
  return updateSubjectPending(userId, (p) => p);
}

/** Legge, cambia e salva le operazioni in sospeso, in fila con le altre modifiche. */
export function updateSubjectPending(userId: string, change: (pending: SubjectPending) => SubjectPending): Promise<SubjectPending> {
  const next = queue.then(async () => {
    const updated = change(await readPending(userId));
    await setMeta(pendingKey(userId), JSON.stringify(updated));
    return updated;
  });
  queue = next.catch(() => undefined);
  return next;
}
