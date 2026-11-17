import type { FocusClass } from "../lib/focus";
import type { ClassSeconds } from "../lib/summary";

/** I pezzi dell'anello del widget (card/rings.tsx): una classe o "off", la parte spenta del giro. */
export type RingClass = FocusClass | "off";

export interface RingPart {
  cls: RingClass;
  value: number;
}

export const RING_ORDER: readonly FocusClass[] = ["focus", "fun", "neutral"];

/** Le classi della giornata, nell'ordine dell'anello. */
export function classParts(byClass: ClassSeconds): RingPart[] {
  return RING_ORDER.map((cls) => ({ cls, value: byClass[cls] }));
}

/** Una sola quantità su un totale: il resto del giro è spento. */
export function fillParts(cls: FocusClass, value: number, of: number): RingPart[] {
  const v = Math.max(0, Math.min(value, of));
  return [
    { cls, value: v },
    { cls: "off", value: Math.max(0, of - v) },
  ];
}
