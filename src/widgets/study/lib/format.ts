import type { SubjectMode } from "../data/studyRepository";

/** Secondi -> "MM:SS", per il countdown. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Secondi -> "H:MM:SS" oppure "MM:SS", per il cronometro che può superare l'ora. */
export function formatStopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Secondi -> "1h 23m", "2h 05m" oppure "34m", per i totali studiati. */
export function formatHoursMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Secondi -> "3h" per le ore piene, altrimenti come formatHoursMinutes ("1h 30m"): per gli obiettivi. */
export function formatGoal(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  return totalMinutes > 0 && totalMinutes % 60 === 0 ? `${totalMinutes / 60}h` : formatHoursMinutes(totalSeconds);
}

/** Secondi -> "2h05" oppure "45m": la forma compatta dei numeri a puntini (Fosforo). */
export function formatHoursMinutesCompact(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export const MODE_LABEL: Record<SubjectMode, string> = { pomodoro: "Pomodoro", stopwatch: "Cronometro" };
