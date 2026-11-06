import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";
import type { Row, SyncRecord } from "../sync/engine/records";
import { isSyncKind } from "../sync/tables";

/*
 * Sync dei propri dati tra i propri dispositivi (supabase/migrations/…_sync.sql). Le righe sono leggibili solo
 * dal loro utente (RLS), si scrivono solo con sync_push, che tiene l'ultima modifica e restituisce quelle rifiutate.
 */

/** Elementi per blocco: lo stesso limite di sync_push e della lettura. */
export const SYNC_BATCH = 500;

/** Dimensione massima di un elemento accettata dal server (JSON di `data`). */
export const SYNC_RECORD_MAX_BYTES = 2_000_000;

/** Un elemento letto dal server, con la sua posizione nell'ordine di scrittura. */
export interface PulledRecord extends SyncRecord {
  seq: number;
}

interface RecordRow {
  kind: string;
  uid: string;
  data: Row | null;
  changed_at: number;
  deleted: boolean;
  device_id: string;
  seq: number;
}

function fromRow(r: RecordRow): PulledRecord | null {
  // un tipo che questa versione dell'app non conosce (scritto da una più nuova) si salta
  if (!isSyncKind(r.kind)) return null;
  return {
    kind: r.kind,
    uid: r.uid,
    changedAt: Number(r.changed_at),
    deleted: r.deleted,
    deviceId: r.device_id,
    data: r.deleted ? null : r.data,
    seq: Number(r.seq),
  };
}

/**
 * Manda un blocco (al massimo SYNC_BATCH) da questo dispositivo, già registrato con touchDevice.
 * Restituisce gli elementi per cui il server ha una versione più nuova: vanno applicati al posto di quelli locali.
 */
export async function pushRecords(deviceId: string, records: readonly SyncRecord[]): Promise<PulledRecord[]> {
  if (records.length === 0) return [];
  if (records.length > SYNC_BATCH) throw new Error(`Al massimo ${SYNC_BATCH} elementi per blocco`);
  const rows = records.map((r) => ({
    kind: r.kind,
    uid: r.uid,
    changed_at: Math.round(r.changedAt),
    deleted: r.deleted,
    data: r.deleted ? null : r.data,
  }));
  const result = await requireCloudClient().rpc("sync_push", { p_device_id: deviceId, p_rows: rows });
  throwIfFailed(result);
  return ((result.data ?? []) as RecordRow[]).flatMap((r) => fromRow(r) ?? []);
}

/**
 * Gli elementi scritti dopo `afterSeq` (0 = tutti), in ordine. Se ne arrivano SYNC_BATCH ce ne sono altri: si
 * richiama con il seq dell'ultimo. `seq` torna anche per i tipi sconosciuti saltati, così il cursore avanza.
 */
export async function pullRecords(afterSeq: number): Promise<{ records: PulledRecord[]; lastSeq: number; more: boolean }> {
  const result = await requireCloudClient()
    .from("sync_records")
    .select("kind, uid, data, changed_at, deleted, device_id, seq")
    .gt("seq", afterSeq)
    .order("seq")
    .limit(SYNC_BATCH);
  throwIfFailed(result);
  const rows = (result.data ?? []) as RecordRow[];
  return {
    records: rows.flatMap((r) => fromRow(r) ?? []),
    lastSeq: rows.length > 0 ? Number(rows[rows.length - 1].seq) : afterSeq,
    more: rows.length === SYNC_BATCH,
  };
}

/** C'è già qualcosa nel cloud? (primo sync di un dispositivo: unire o usare i dati del cloud) */
export async function hasCloudRecords(): Promise<boolean> {
  const result = await requireCloudClient().from("sync_records").select("seq").limit(1);
  throwIfFailed(result);
  return (result.data ?? []).length > 0;
}

/** Cancella dal server tutti i propri dati sincronizzati; i dispositivi tengono i loro. */
export async function clearCloudRecords(): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("sync_clear"));
}
