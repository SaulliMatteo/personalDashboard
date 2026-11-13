import { APP_CATEGORIES, type AppCategory } from "../../../core/system/appCategory";

/** Classe del tempo: si colora così in tutto il widget (docs/design/temi/tempo-pc.html). */
export type FocusClass = "focus" | "fun" | "neutral";
export const FOCUS_CLASSES: FocusClass[] = ["focus", "fun", "neutral"];
export const CLASS_LABEL: Record<FocusClass, string> = { focus: "focus", fun: "svago", neutral: "neutro" };

export const DEFAULT_CLASSES: Record<AppCategory, FocusClass> = {
  coding: "focus",
  office: "focus",
  design: "focus",
  chat: "neutral",
  social: "fun",
  video: "fun",
  music: "fun",
  game: "fun",
  browser: "neutral",
  other: "neutral",
};

const CLASS_SET = new Set<string>(FOCUS_CLASSES);
const CATEGORY_SET = new Set<string>(APP_CATEGORIES);

/** Impostazione `screentimeFocusClasses` ("categoria=classe;…") → classe per ogni categoria (default dove manca). */
export function parseFocusClasses(raw: string): Record<AppCategory, FocusClass> {
  const out = { ...DEFAULT_CLASSES };
  for (const part of raw.split(";")) {
    const [category, cls] = part.split("=").map((s) => s.trim());
    if (CATEGORY_SET.has(category) && CLASS_SET.has(cls)) out[category as AppCategory] = cls as FocusClass;
  }
  return out;
}

/** Solo le differenze dai default: l'impostazione resta corta. */
export function serializeFocusClasses(classes: Record<AppCategory, FocusClass>): string {
  return APP_CATEGORIES.filter((c) => classes[c] !== DEFAULT_CLASSES[c])
    .map((c) => `${c}=${classes[c]}`)
    .join(";");
}

/**
 * Serie di giorni con l'obiettivo di focus raggiunto, contando all'indietro da ieri (e oggi, se già raggiunto).
 * I giorni senza nessun tempo al PC (es. fuori casa) non la rompono. `days` = giorni in ordine, il primo è oggi.
 */
export function focusStreak(days: Array<{ total: number; focus: number }>, goalSeconds: number): number {
  if (goalSeconds <= 0) return 0;
  let streak = 0;
  const [today, ...past] = days;
  for (const d of past) {
    if (d.total === 0) continue;
    if (d.focus >= goalSeconds) streak++;
    else break;
  }
  if (today && today.focus >= goalSeconds) streak++;
  return streak;
}
