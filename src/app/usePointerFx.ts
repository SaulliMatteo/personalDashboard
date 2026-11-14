import { useEffect } from "react";

/** Cosa segue il puntatore nel tema corrente. */
export interface PointerFx {
  /** `--lx`/`--ly` su ogni card: la posizione del puntatore dentro la card (Vetro: il riflesso). */
  local: boolean;
  /** `--sx`/`--sy` su ogni card: ombra proiettata lontano dal puntatore, lunga al massimo `--fx-len` (Ombra). */
  shadow: boolean;
  /** `--px`/`--py` su `.app-wall`: la luce sullo sfondo (Ombra). */
  wall: boolean;
}

const CARDS = ".border-glow-card";
/** Oltre questa distanza (px) l'ombra è lunga `--fx-len`. */
const SHADOW_REACH = 500;

/**
 * Un solo listener per tutta l'app (non uno per card): al movimento del puntatore, una volta per frame, scrive le
 * variabili CSS che il tema usa per riflessi, ombre e luce (Temi Vetro e Ombra.html, `updateFx`). `fx` null = spento
 * (altri temi, animazioni spente, movimento ridotto).
 */
export function usePointerFx(fx: PointerFx | null) {
  const local = fx?.local ?? false;
  const shadow = fx?.shadow ?? false;
  const wall = fx?.wall ?? false;

  useEffect(() => {
    if (!local && !shadow && !wall) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = window.innerWidth * 0.6;
    let y = window.innerHeight * 0.25;
    let frame = 0;

    const update = () => {
      frame = 0;
      if (wall) {
        const el = document.querySelector<HTMLElement>(".app-wall");
        if (el) {
          const r = el.getBoundingClientRect();
          el.style.setProperty("--px", `${x - r.left}px`);
          el.style.setProperty("--py", `${y - r.top}px`);
        }
      }
      const len = shadow ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fx-len")) || 0 : 0;
      document.querySelectorAll<HTMLElement>(CARDS).forEach((card) => {
        const b = card.getBoundingClientRect();
        if (local) {
          card.style.setProperty("--lx", `${x - b.left}px`);
          card.style.setProperty("--ly", `${y - b.top}px`);
        }
        if (len) {
          const dx = b.left + b.width / 2 - x;
          const dy = b.top + b.height / 2 - y;
          const dist = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, dist / SHADOW_REACH) * len;
          card.style.setProperty("--sx", `${((dx / dist) * k).toFixed(1)}px`);
          card.style.setProperty("--sy", `${((dy / dist) * k + 6).toFixed(1)}px`);
        }
      });
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    update();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
      // via le variabili: il CSS torna ai valori di riposo
      document.querySelectorAll<HTMLElement>(CARDS).forEach((card) => {
        for (const v of ["--lx", "--ly", "--sx", "--sy"]) card.style.removeProperty(v);
      });
      document.querySelector<HTMLElement>(".app-wall")?.style.removeProperty("--px");
      document.querySelector<HTMLElement>(".app-wall")?.style.removeProperty("--py");
    };
  }, [local, shadow, wall]);
}
