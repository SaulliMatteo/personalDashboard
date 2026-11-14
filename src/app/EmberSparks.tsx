import { useEffect, useRef } from "react";

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const MAX_SPARKS = 60;
/** Dopo quanto (ms) dall'ultimo movimento smettono di nascere scintille. */
const IDLE_MS = 1200;

/**
 * Ombra, variante Fiamma: scintille che salgono dal puntatore (Temi Vetro e Ombra.html, `sparkLoop`). Un canvas sopra
 * l'app che non prende i click; colori da `--spark-hot`/`--spark-glow`. Il ciclo gira solo finché ci sono scintille
 * o il puntatore si muove, così a mouse fermo non consuma nulla. AppShell lo monta solo con le animazioni accese.
 */
function EmberSparks() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sparks: Spark[] = [];
    let raf = 0;
    let px = -1;
    let py = -1;
    let lastMove = 0;
    let hot = "";
    let glow = "";

    const readColors = () => {
      const css = getComputedStyle(canvas);
      hot = css.getPropertyValue("--spark-hot").trim();
      glow = css.getPropertyValue("--spark-glow").trim();
    };

    const loop = (t: number) => {
      raf = 0;
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        readColors();
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, r.width, r.height);

      const active = t - lastMove < IDLE_MS;
      if (active && sparks.length < MAX_SPARKS && Math.random() < 0.5) {
        sparks.push({ x: px - r.left + (Math.random() - 0.5) * 30, y: py - r.top, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.9, life: 1 });
      }
      g.shadowColor = glow;
      g.shadowBlur = 6;
      g.fillStyle = hot;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.012;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        g.globalAlpha = p.life;
        g.beginPath();
        g.arc(p.x, p.y, 1.5 * p.life + 0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      if (active || sparks.length) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      lastMove = performance.now();
      if (!raf) raf = requestAnimationFrame(loop);
    };

    readColors();
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="app-sparks" aria-hidden="true" />;
}

export default EmberSparks;
