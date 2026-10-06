/** Secondi -> "MM:SS", per il countdown. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Secondi -> "1h 23m" oppure "34m", per i totali studiati. */
export function formatHoursMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Palette fissa per distinguere le materie a colpo d'occhio nelle liste
 * (widget, dettaglio, report) senza che l'utente debba assegnarli a mano.
 * L'indice è quello della materia nell'elenco ordinato per nome, quindi
 * lo stesso colore resta stabile tra una lista e l'altra finché non si
 * aggiungono/rimuovono materie.
 */
const SUBJECT_COLORS = ["#6c8dff", "#f472b6", "#38bdf8", "#f5a35c", "#34d399", "#c084fc"];

export function colorForSubjectIndex(index: number): string {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}
