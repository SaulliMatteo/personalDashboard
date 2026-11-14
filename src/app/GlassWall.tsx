import { useEffect, useRef } from "react";
import { useTheme } from "../core/theme/useTheme";
import { useWallpaper } from "../core/theme/wallpaper";

/** La stanza si disegna una volta, a questa misura, e il CSS la allarga a tutta la finestra: è sfocata, non serve di più. */
const W = 1360;
const H = 800;

/** Legge un token del tema (`--room-*`, definiti solo nei blocchi di Vetro in tokens.css e tokens-varianti.css). */
function token(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(`--room-${name}`).trim() || "transparent";
}

/**
 * La stanza dietro il vetro (Temi Vetro e Ombra.html, `drawRooms`): trave in legno, finestra luminosa, mensola con
 * libri, pianta, divano, lampade. Disegnata su canvas con i colori dei token, poi sfocata dal CSS (`--photo-filter`).
 * Nessuna foto con licenza e nessuna rete.
 */
function drawRoom(canvas: HTMLCanvasElement) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const s = getComputedStyle(document.documentElement);
  const c = (name: string) => token(s, name);
  const lin = (y0: number, y1: number, a: string, b: string) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    return gr;
  };
  const glow = (x: number, y: number, r0: number, r1: number, color: string) => {
    const gr = g.createRadialGradient(x, y, r0, x, y, r1);
    gr.addColorStop(0, color);
    // stesso colore con alpha 0 ("transparent" è nero trasparente e lascerebbe un alone grigio)
    gr.addColorStop(1, color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, "rgba($1,$2,$3,0)"));
    return gr;
  };

  g.clearRect(0, 0, W, H);
  g.fillStyle = lin(0, H, c("wall-top"), c("wall-bottom"));
  g.fillRect(0, 0, W, H);

  // finestra con la luce che entra
  g.fillStyle = c("window");
  g.fillRect(W * 0.52, H * 0.12, W * 0.4, H * 0.62);
  g.fillStyle = glow(W * 0.72, H * 0.4, 20, W * 0.5, c("window-glow"));
  g.fillRect(0, 0, W, H);
  g.fillStyle = c("frame");
  for (const x of [0.52, 0.65, 0.78, 0.91]) g.fillRect(W * x - 8, H * 0.12, 16, H * 0.62);
  g.fillRect(W * 0.52, H * 0.42, W * 0.4, 12);

  // trave in legno e lampade a sospensione
  g.fillStyle = c("beam");
  g.fillRect(0, 0, W, H * 0.08);
  for (const x of [0.2, 0.36]) {
    g.fillStyle = c("cord");
    g.fillRect(W * x - 2, H * 0.08, 4, H * 0.12);
    g.fillStyle = glow(W * x, H * 0.23, 4, 160, c("lamp-glow"));
    g.fillRect(W * x - 170, H * 0.23 - 170, 340, 340);
    g.fillStyle = c("lamp");
    g.beginPath();
    g.ellipse(W * x, H * 0.22, 34, 22, 0, Math.PI, 0);
    g.fill();
  }

  // mensola con i libri
  g.fillStyle = c("shelf");
  g.fillRect(W * 0.04, H * 0.34, W * 0.3, 14);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = c(`book-${i + 1}`);
    g.fillRect(W * 0.06 + i * 34, H * 0.34 - 70 - (i % 3) * 10, 26, 70 + (i % 3) * 10);
  }

  // pianta nel vaso
  g.fillStyle = c("plant");
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    g.ellipse(W * 0.1 + Math.cos(k) * 60, H * 0.62 + Math.sin(k * 1.7) * 70, 34, 70, k * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = c("pot");
  g.fillRect(W * 0.07, H * 0.74, 110, 120);

  // pavimento e divano
  g.fillStyle = lin(H * 0.8, H, c("floor-top"), c("floor-bottom"));
  g.fillRect(0, H * 0.82, W, H * 0.18);
  g.fillStyle = c("sofa");
  g.beginPath();
  g.roundRect(W * 0.3, H * 0.66, W * 0.44, H * 0.2, 40);
  g.fill();
  g.fillStyle = c("cushion");
  g.beginPath();
  g.roundRect(W * 0.32, H * 0.6, W * 0.4, H * 0.12, 36);
  g.fill();

  // lampada da terra (accesa di sera)
  g.fillStyle = glow(W * 0.88, H * 0.55, 6, 300, c("floor-lamp"));
  g.fillRect(0, 0, W, H);
}

/**
 * Sfondo del tema Vetro, dentro `.app-wall` (AppShell): l'immagine scelta in Impostazioni > Aspetto oppure la stanza
 * disegnata. La sfocatura e il movimento lento li dà il CSS (shell.css).
 */
function GlassWall() {
  const wallpaper = useWallpaper();
  const { mode } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // La stanza cambia con la variante (di sera è più scura e c'è la lampada accesa): i token vanno riletti.
  useEffect(() => {
    if (wallpaper || !canvasRef.current) return;
    // un frame dopo: data-mode su <html> è già quello nuovo
    const id = requestAnimationFrame(() => canvasRef.current && drawRoom(canvasRef.current));
    return () => cancelAnimationFrame(id);
  }, [wallpaper, mode]);

  if (wallpaper) return <div className="app-wall-photo" style={{ backgroundImage: `url("${wallpaper}")` }} />;
  return <canvas ref={canvasRef} className="app-wall-photo" width={W} height={H} />;
}

export default GlassWall;
