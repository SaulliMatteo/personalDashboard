/**
 * Storico dei grafici del Monitor di sistema: SOLO in memoria (niente nel database), gli ultimi 60 secondi.
 * Il buffer si misura in tempo, non in campioni: a 1, 2 o 5 s tiene 60, 30 o 12 punti e il grafico copre sempre
 * gli stessi 60 s. Puro (prova in `scripts/sysmon/metrics.test.mts`).
 */

export const HISTORY_WINDOW_MS = 60_000;

export interface HistoryPoint {
  atMs: number;
  /** null = quel giro il dato non c'era (il grafico lascia un buco, non disegna uno 0). */
  value: number | null;
}

/** Aggiunge un punto e toglie quelli usciti dalla finestra (e quelli "dal futuro", se l'orologio torna indietro). */
export function pushPoint(points: readonly HistoryPoint[], point: HistoryPoint, windowMs = HISTORY_WINDOW_MS): HistoryPoint[] {
  const from = point.atMs - windowMs;
  return [...points.filter((p) => p.atMs > from && p.atMs < point.atMs), point];
}

/** Le serie che i grafici disegnano. */
export interface SysmonHistory {
  cpu: HistoryPoint[];
  gpu: HistoryPoint[];
  memory: HistoryPoint[];
  rx: HistoryPoint[];
  tx: HistoryPoint[];
}

export const EMPTY_HISTORY: SysmonHistory = { cpu: [], gpu: [], memory: [], rx: [], tx: [] };

export function pushAll(history: SysmonHistory, atMs: number, values: { [K in keyof SysmonHistory]: number | null }): SysmonHistory {
  const next = { ...history };
  for (const key of Object.keys(values) as (keyof SysmonHistory)[]) {
    next[key] = pushPoint(history[key], { atMs, value: values[key] });
  }
  return next;
}
