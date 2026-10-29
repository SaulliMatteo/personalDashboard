import { useLayoutEffect, type RefObject } from "react";
import { useTheme } from "../../../core/theme/useTheme";
import { parseCssColor, readableTitleColor, type Rgb } from "./titleColor";

/**
 * Sfondo su cui si vede l'elemento: il primo antenato con un colore di fondo pieno
 * (pagina, card, post-it, pigmento di Opaco). Le semitrasparenze si mescolano con quello sotto.
 */
export function backgroundBehind(el: Element): Rgb | null {
  const layers: { rgb: Rgb; alpha: number }[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const parsed = parseCssColor(getComputedStyle(node).backgroundColor);
    if (!parsed || parsed.alpha === 0) continue;
    layers.push(parsed);
    if (parsed.alpha >= 0.99) break;
  }
  if (layers.length === 0) return null;
  // Dal fondo verso l'alto.
  let rgb: Rgb = layers[layers.length - 1].alpha >= 0.99 ? layers[layers.length - 1].rgb : [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) {
    const { rgb: top, alpha } = layers[i];
    rgb = [0, 1, 2].map((k) => top[k] * alpha + rgb[k] * (1 - alpha)) as Rgb;
  }
  return rgb;
}

/**
 * Colore leggibile da mostrare su `el`; null = nessun colore scelto o sfondo illeggibile.
 * `adjusted` = è stato corretto per il contrasto.
 */
export function readableOn(el: Element, color: string | null, min: number): { color: string; adjusted: boolean } | null {
  if (!color) return null;
  const bg = backgroundBehind(el);
  return bg ? readableTitleColor(color, bg, min) : { color, adjusted: false };
}

/**
 * Applica il colore del titolo all'elemento (stile in linea, sopra quello del tema), corretto
 * per il contrasto sullo sfondo vero. Si ricalcola quando cambiano tema, variante o `deps`
 * (es. il colore della pagina). Con null torna il colore del tema.
 */
export function useTitleColor(
  ref: RefObject<HTMLElement | null>,
  color: string | null,
  min: number,
  deps: readonly unknown[] = [],
  onAdjusted?: (adjusted: boolean) => void
) {
  const theme = useTheme();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("color");
    const result = readableOn(el, color, min);
    if (result) el.style.color = result.color;
    onAdjusted?.(result?.adjusted ?? false);
    // deps sono scelte da chi chiama; onAdjusted può cambiare a ogni render senza contare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, color, min, theme.id, theme.mode, ...deps]);
}
