/** Colori della palette nel tema (4, dal mockup, che si ripetono): token --group-subject-N. */
const THEME_COLORS = 4;

/** Colore di una materia del gruppo (indice di palette salvato sul server). */
export function subjectColor(color: number): string {
  return `var(--group-subject-${((color % THEME_COLORS) + THEME_COLORS) % THEME_COLORS})`;
}
