/**
 * Limiti giornalieri di Tempo allo schermo: avviso all'80 % (se voluto) e allo scadere, una volta al giorno per limite.
 * Puro: il tempo usato e lo stato degli avvisi arrivano da fuori (lo stato si salva in core/db/meta.ts).
 */
export type LimitKind = "app" | "category";

export interface ScreenLimit {
  id: number;
  kind: LimitKind;
  /** app_key o categoria. */
  target: string;
  /** Nome da mostrare. */
  label: string;
  minutes: number;
  /** Avviso anche all'80 %. */
  warn: boolean;
  /** A tempo finito una schermata copre l'app (solo Windows, src-tauri/src/screen_block.rs). */
  block: boolean;
}

export const NEAR_RATIO = 0.8;

/** Avvisi già mandati oggi: id del limite → livello. */
export interface LimitNoticeState {
  day: string;
  sent: Record<string, "near" | "over">;
}

export interface LimitNotice {
  limit: ScreenLimit;
  level: "near" | "over";
  usedSeconds: number;
}

export function emptyNoticeState(day: string): LimitNoticeState {
  return { day, sent: {} };
}

/**
 * Quali avvisi mandare adesso. `usedSeconds(limit)` = tempo di oggi per quel limite. Ritorna gli avvisi e lo stato
 * nuovo; un giorno nuovo riparte da zero. Se il limite è già superato quando lo si guarda la prima volta, arriva solo
 * l'avviso dello scadere (non anche quello dell'80 %).
 */
export function dueNotices(
  limits: ScreenLimit[],
  usedSeconds: (limit: ScreenLimit) => number,
  state: LimitNoticeState,
  today: string
): { notices: LimitNotice[]; state: LimitNoticeState } {
  const next: LimitNoticeState = state.day === today ? { day: today, sent: { ...state.sent } } : emptyNoticeState(today);
  const notices: LimitNotice[] = [];
  for (const limit of limits) {
    if (limit.minutes <= 0) continue;
    const used = usedSeconds(limit);
    const max = limit.minutes * 60;
    const sent = next.sent[limit.id];
    if (used >= max) {
      if (sent !== "over") {
        notices.push({ limit, level: "over", usedSeconds: used });
        next.sent[limit.id] = "over";
      }
    } else if (limit.warn && used >= max * NEAR_RATIO && !sent) {
      notices.push({ limit, level: "near", usedSeconds: used });
      next.sent[limit.id] = "near";
    }
  }
  return { notices, state: next };
}

export function parseNoticeState(raw: string | null): LimitNoticeState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as LimitNoticeState;
    return typeof v?.day === "string" && v.sent && typeof v.sent === "object" ? v : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- blocco (solo Windows)

/** "Altri 15 minuti": quanto dura e quante volte al giorno per limite (una). */
export const EXTENSION_MS = 15 * 60_000;

/** Proroghe chieste oggi: id del limite → fine della proroga (ms). Si salva in `meta`. */
export interface BlockExtensions {
  day: string;
  until: Record<string, number>;
}

export function emptyExtensions(day: string): BlockExtensions {
  return { day, until: {} };
}

export function parseExtensions(raw: string | null, today: string): BlockExtensions {
  try {
    const v = raw ? (JSON.parse(raw) as BlockExtensions) : null;
    if (v && v.day === today && v.until && typeof v.until === "object") return v;
  } catch {
    // stato rovinato: si riparte senza proroghe
  }
  return emptyExtensions(today);
}

/** Fine della proroga in corso del limite, o null (nessuna, o già finita). */
export function extensionEnd(ext: BlockExtensions, limitId: number, today: string, now: number): number | null {
  if (ext.day !== today) return null;
  const until = ext.until[limitId];
  return typeof until === "number" && until > now ? until : null;
}

/** Il limite blocca adesso: tempo finito e nessuna proroga in corso. */
export function isBlocking(limit: ScreenLimit, usedSeconds: number, ext: BlockExtensions, today: string, now: number): boolean {
  return limit.block && limit.minutes > 0 && usedSeconds >= limit.minutes * 60 && extensionEnd(ext, limit.id, today, now) === null;
}

/** Un'app da coprire, come la riceve il Rust (`screenblock_set`). */
export interface BlockTarget {
  /** app_key: nome dell'eseguibile senza .exe, minuscolo (`processKey`). */
  key: string;
  /** Nome dell'app per "Chiudi …". */
  app: string;
  limitId: number;
  /** Nome del limite: l'app o la categoria. */
  label: string;
  kind: LimitKind;
  usedSeconds: number;
  maxSeconds: number;
  /** "Altri 15 minuti" non ancora usato oggi per questo limite. */
  canExtend: boolean;
}

/**
 * Le app da coprire adesso. `appsOf(limit)` = le app del limite (per una categoria quelle che si conoscono). Se due
 * limiti prendono la stessa app vale quello superato di più.
 */
export function blockTargets(
  limits: { limit: ScreenLimit; usedSeconds: number }[],
  appsOf: (limit: ScreenLimit) => { key: string; label: string }[],
  ext: BlockExtensions,
  today: string,
  now: number
): BlockTarget[] {
  const byKey = new Map<string, BlockTarget & { ratio: number }>();
  for (const { limit, usedSeconds } of limits) {
    if (!isBlocking(limit, usedSeconds, ext, today, now)) continue;
    const ratio = usedSeconds / (limit.minutes * 60);
    const canExtend = ext.day !== today || ext.until[limit.id] === undefined;
    for (const app of appsOf(limit)) {
      const prev = byKey.get(app.key);
      if (prev && prev.ratio >= ratio) continue;
      byKey.set(app.key, {
        key: app.key,
        app: app.label,
        limitId: limit.id,
        label: limit.label,
        kind: limit.kind,
        usedSeconds,
        maxSeconds: limit.minutes * 60,
        canExtend,
        ratio,
      });
    }
  }
  return [...byKey.values()].map(({ ratio: _ratio, ...t }) => t);
}
