/**
 * Limiti giornalieri di Tempo al PC: avviso all'80 % (se voluto) e allo scadere, una volta al giorno per limite.
 * Puro: il tempo usato e lo stato degli avvisi arrivano da fuori (lo stato si salva in core/db/meta.ts).
 */
export type LimitKind = "app" | "site" | "category";

export interface ScreenLimit {
  id: number;
  kind: LimitKind;
  /** app_key, nome del sito o categoria. */
  target: string;
  /** Nome da mostrare. */
  label: string;
  minutes: number;
  /** Avviso anche all'80 %. */
  warn: boolean;
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
