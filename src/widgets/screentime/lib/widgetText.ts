/**
 * Quello che il widget dice a parole (docs/mockup/widget/tempo-allo-schermo.html, proposta A): la giornata in una
 * parola o in una frase, i 6 momenti del giorno e l'unico avviso da mostrare. Puro.
 */
import { NEAR_RATIO, type ScreenLimit } from "./limits";
import type { ClassSeconds } from "./summary";

const total = (c: ClassSeconds) => c.focus + c.fun + c.neutral;

/** Una parola per la Piccola: "concentrato", "tanto svago" o "misto". */
export function moodWord(byClass: ClassSeconds): string {
  const t = total(byClass);
  if (t <= 0) return "si comincia";
  if (byClass.focus / t >= 0.45) return "concentrato";
  if (byClass.fun / t >= 0.3) return "tanto svago";
  return "misto";
}

/** La giornata a parole al posto della legenda: "metà focus", "quasi niente svago". */
export function mixWords(byClass: ClassSeconds): { focus: string; fun: string } {
  const t = total(byClass);
  const f = t > 0 ? byClass.focus / t : 0;
  const s = t > 0 ? byClass.fun / t : 0;
  const focus = f >= 0.6 ? "quasi tutto focus" : f >= 0.4 ? "metà focus" : f >= 0.2 ? "un po' di focus" : "poco focus";
  const fun = s >= 0.3 ? "tanto svago" : s >= 0.1 ? "un po' di svago" : "quasi niente svago";
  return { focus, fun };
}

/** I 6 momenti del giorno, 4 ore l'uno. */
export const MOMENT_NAMES = ["notte", "alba", "mattina", "pranzo", "pomeriggio", "sera"] as const;
export const MOMENT_HOURS = 4;

/** 24 ore → 6 momenti (secondi per classe). */
export function dayMoments(hours: ClassSeconds[]): ClassSeconds[] {
  return MOMENT_NAMES.map((_, m) => {
    const out: ClassSeconds = { focus: 0, fun: 0, neutral: 0 };
    for (let h = m * MOMENT_HOURS; h < (m + 1) * MOMENT_HOURS; h++) {
      const hour = hours[h];
      if (!hour) continue;
      out.focus += hour.focus;
      out.fun += hour.fun;
      out.neutral += hour.neutral;
    }
    return out;
  });
}

export type WidgetAlert =
  | { kind: "limit"; label: string; leftSeconds: number }
  | { kind: "pause"; minutes: number }
  | { kind: "access" };

/**
 * L'unico avviso del widget, il più urgente: un limite all'80 % (quello più vicino a finire), poi la pausa (oltre i
 * minuti scelti nelle impostazioni), poi il telefono che non ha ancora il permesso.
 */
export function pickAlert(input: {
  limits: { limit: ScreenLimit; usedSeconds: number }[];
  continuousMinutes: number;
  breakMinutes: number;
  needsAccess: boolean;
}): WidgetAlert | null {
  let worst: { limit: ScreenLimit; usedSeconds: number; ratio: number } | null = null;
  for (const { limit, usedSeconds } of input.limits) {
    if (limit.minutes <= 0) continue;
    const ratio = usedSeconds / (limit.minutes * 60);
    if (ratio >= NEAR_RATIO && (!worst || ratio > worst.ratio)) worst = { limit, usedSeconds, ratio };
  }
  if (worst) return { kind: "limit", label: worst.limit.label, leftSeconds: Math.max(0, worst.limit.minutes * 60 - worst.usedSeconds) };
  if (input.breakMinutes > 0 && input.continuousMinutes >= input.breakMinutes) return { kind: "pause", minutes: input.continuousMinutes };
  if (input.needsAccess) return { kind: "access" };
  return null;
}

/** "40 min più di ieri", "1 h 5 min meno di ieri", "come ieri" (secondi di differenza). */
export function deltaWords(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (Math.abs(min) < 1) return "come ieri";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const amount = !h ? `${m} min` : m ? `${h} h ${m} min` : `${h} h`;
  return `${amount} ${min > 0 ? "più" : "meno"} di ieri`;
}
