/**
 * Palette proposta per le materie. L'utente può sempre scegliere un colore
 * libero: la palette serve solo come scorciatoia e per assegnare un colore
 * iniziale diverso a ogni nuova materia.
 */
export const SUBJECT_COLORS = ["#6c8dff", "#f472b6", "#38bdf8", "#f5a35c", "#34d399", "#c084fc"] as const;

/** Colore effettivo di una materia: quello scelto, altrimenti uno di palette in base alla posizione. */
export function colorForSubject(subject: { color: string | null } | null | undefined, index: number): string {
  return subject?.color || SUBJECT_COLORS[Math.max(0, index) % SUBJECT_COLORS.length];
}

/**
 * Colore di palette per una nuova materia: il primo non ancora usato; se
 * sono tutti in uso, il meno usato (a parità, il primo). Dopo sei materie
 * i colori si ripetono: l'utente può sempre sceglierne uno libero.
 */
export function pickUnusedColor(subjects: readonly { color: string | null }[]): string {
  const counts = new Map<string, number>(SUBJECT_COLORS.map((c) => [c, 0]));
  subjects.forEach((s, i) => {
    const c = colorForSubject(s, i);
    if (counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  return SUBJECT_COLORS.reduce((best, c) => ((counts.get(c) ?? 0) < (counts.get(best) ?? 0) ? c : best), SUBJECT_COLORS[0]);
}
