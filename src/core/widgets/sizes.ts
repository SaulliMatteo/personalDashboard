import type { WidgetSize } from "./types";

/**
 * Catalogo delle taglie (griglia 6×4). Le chiavi sono quelle dei mockup e del
 * prompt dei temi: S 1×1, W 2×1, T 1×2, M 2×2, STRIP 3×1, L 3×2, XL 3×3.
 */
export const SIZE_S: WidgetSize = { key: "S", w: 1, h: 1, label: "Piccola (1×1)" };
export const SIZE_W: WidgetSize = { key: "W", w: 2, h: 1, label: "Larga (2×1)" };
export const SIZE_T: WidgetSize = { key: "T", w: 1, h: 2, label: "Alta (1×2)" };
export const SIZE_M: WidgetSize = { key: "M", w: 2, h: 2, label: "Media (2×2)" };
export const SIZE_STRIP: WidgetSize = { key: "STRIP", w: 3, h: 1, label: "Striscia (3×1)" };
export const SIZE_L: WidgetSize = { key: "L", w: 3, h: 2, label: "Grande (3×2)" };
export const SIZE_XL: WidgetSize = { key: "XL", w: 3, h: 3, label: "Molto grande (3×3)" };

const ALL_SIZES = [SIZE_S, SIZE_W, SIZE_T, SIZE_M, SIZE_STRIP, SIZE_L, SIZE_XL];

export type SizeKey = "S" | "W" | "T" | "M" | "STRIP" | "L" | "XL";

/**
 * Chiave della taglia con cui un widget è disegnato. Le dimensioni fuori
 * catalogo (es. layout vecchi) ricadono sulla taglia più grande che ci sta.
 */
export function sizeKey(w: number, h: number): SizeKey {
  const exact = ALL_SIZES.find((s) => s.w === w && s.h === h);
  if (exact) return exact.key as SizeKey;
  const fitting = ALL_SIZES.filter((s) => s.w <= w && s.h <= h).sort((a, b) => b.w * b.h - a.w * a.h);
  return (fitting[0]?.key ?? "S") as SizeKey;
}
