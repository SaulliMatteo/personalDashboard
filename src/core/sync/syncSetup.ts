import { specOf, SYNC_TABLES, type SyncKind } from "./tables";
import type { Row } from "./engine/records";
import type { SyncRepository } from "./syncRepository";

/*
 * Stato del sync di un account su questo dispositivo (tabella meta) e i passi in cui una tabella comincia a
 * sincronizzarsi: primo sync (cloud vuoto, "Unisci" o "Usa i dati del cloud") e tipi nuovi in una versione dopo.
 */

/** I tipi che questa versione sincronizza (gli allegati delle note arrivano dopo, con i loro file). */
export const SYNC_KINDS: readonly SyncKind[] = ["subject", "session", "folder", "note", "page", "collection", "field", "row", "view", "setting"];

/**
 * Tipi che "Usa i dati del cloud" cancella qui prima di scaricare, in ordine di dipendenza. Le impostazioni restano
 * (vince il cloud); gli allegati se ne vanno con le loro note.
 */
const REPLACED_KINDS: readonly SyncKind[] = SYNC_TABLES.map((t) => t.kind).filter((k) => k !== "setting");

const tablesOf = (kinds: readonly SyncKind[]) => kinds.map((k) => specOf(k).table);

export function syncKeys(userId: string) {
  return {
    cursor: `sync_cursor:${userId}`,
    pending: `sync_pending:${userId}`,
    /** tipi già messi nel registro per questo account (JSON) */
    kinds: `sync_kinds:${userId}`,
    /** "1": il prossimo giro riconosce gli elementi uguali (adopt) invece di duplicarli */
    adopt: `sync_adopt:${userId}`,
  };
}

/**
 * Le voci messe nel registro quando una tabella comincia a sincronizzarsi hanno un istante finto: 1 se nel cloud
 * non c'è niente (primo dispositivo), 0 se ci sono già dati (vince sempre la versione del cloud, che ha l'ora vera).
 */
const FIRST_DEVICE = 1;
const JOINING = 0;

export type SyncSetup = { kind: "ready"; adopt: boolean } | { kind: "needsChoice" };

async function storedKinds(repo: SyncRepository, userId: string): Promise<SyncKind[] | null> {
  const raw = await repo.getMeta(syncKeys(userId).kinds);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SyncKind[]) : [];
  } catch {
    return [];
  }
}

/** Prima di ogni giro: decide se si può partire o se serve la scelta dell'utente. */
export async function prepareSync(repo: SyncRepository, userId: string, cloudHasData: () => Promise<boolean>): Promise<SyncSetup> {
  const keys = syncKeys(userId);
  const stored = await storedKinds(repo, userId);
  if (stored === null) {
    if (await cloudHasData()) return { kind: "needsChoice" };
    await repo.enqueueAll(tablesOf(SYNC_KINDS), FIRST_DEVICE);
    await repo.setMeta(keys.kinds, JSON.stringify(SYNC_KINDS));
    return { kind: "ready", adopt: false };
  }
  const added = SYNC_KINDS.filter((k) => !stored.includes(k));
  if (added.length > 0) {
    // un tipo nuovo: le sue righe vanno nel cloud e quelle del cloud vanno lette da capo
    await repo.enqueueAll(tablesOf(added), JOINING);
    await repo.setMeta(keys.cursor, null);
    await repo.setMeta(keys.adopt, "1");
    await repo.setMeta(keys.kinds, JSON.stringify(SYNC_KINDS));
  }
  return { kind: "ready", adopt: (await repo.getMeta(keys.adopt)) === "1" };
}

/** "Unisci": i dati di qui si aggiungono a quelli del cloud; gli elementi uguali diventano uno solo. */
export async function chooseMerge(repo: SyncRepository, userId: string): Promise<void> {
  const keys = syncKeys(userId);
  await repo.enqueueAll(tablesOf(SYNC_KINDS), JOINING);
  await repo.setMeta(keys.cursor, null);
  await repo.setMeta(keys.adopt, "1");
  await repo.setMeta(keys.kinds, JSON.stringify(SYNC_KINDS));
}

/**
 * "Usa i dati del cloud": Studio, Note e Raccolte di qui si cancellano (la copia di sicurezza la fa prima la pagina).
 * Restituisce le righe cancellate dei tipi con `localColumns` (es. le cartelle su disco delle note), per la pulizia.
 */
export async function chooseReplace(repo: SyncRepository, userId: string): Promise<Map<SyncKind, Row[]>> {
  const keys = syncKeys(userId);
  const deleted = new Map<SyncKind, Row[]>();
  for (const kind of REPLACED_KINDS) deleted.set(kind, specOf(kind).localColumns ? await repo.localRows(specOf(kind)) : []);
  await repo.whileApplying(() => repo.wipe(tablesOf(REPLACED_KINDS)));
  await repo.clearOutbox(tablesOf(SYNC_KINDS));
  await repo.setMeta(keys.cursor, null);
  await repo.setMeta(keys.pending, null);
  await repo.setMeta(keys.adopt, null);
  await repo.setMeta(keys.kinds, JSON.stringify(SYNC_KINDS));
  return deleted;
}

/** Dopo un giro riuscito: il riconoscimento degli elementi uguali serve una volta sola. */
export async function finishAdopt(repo: SyncRepository, userId: string): Promise<void> {
  await repo.setMeta(syncKeys(userId).adopt, null);
}

export const SYNC_TABLES_ON = tablesOf(SYNC_KINDS);
