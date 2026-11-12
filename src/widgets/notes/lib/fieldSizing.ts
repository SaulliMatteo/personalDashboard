import { useLayoutEffect, type RefObject } from "react";

/** `field-sizing: content` (CSS): Chromium sì, Safari solo dalla 26. Su macOS più vecchi lo si fa a mano. */
const SUPPORTED = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

/**
 * Ripiego di `field-sizing: content` per i campi che crescono col testo: l'altezza di un textarea (il titolo della
 * nota, che va a capo) o la larghezza di un input (il nome della raccolta). Dove il CSS basta non fa nulla.
 */
export function useFieldSizing(
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  value: string,
  axis: "height" | "width"
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (SUPPORTED || !el) return;
    const fit = () => {
      if (axis === "height") {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      } else {
        el.style.width = "0";
        el.style.width = `${el.scrollWidth + 2}px`;
      }
    };
    fit();
    // la larghezza del contenitore cambia gli a capo del titolo
    const observer = axis === "height" && el.parentElement ? new ResizeObserver(fit) : null;
    if (observer && el.parentElement) observer.observe(el.parentElement);
    return () => observer?.disconnect();
  }, [ref, value, axis]);
}
