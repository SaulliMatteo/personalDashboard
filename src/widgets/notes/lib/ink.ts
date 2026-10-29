import type { InkStroke } from "../data/notesRepository";

/**
 * Colore salvato per "inchiostro del tema" (era il bianco della penna): sulla
 * pagina si disegna con --text-primary della variante attiva, così resta
 * leggibile su fondo chiaro e scuro. Il valore salvato non cambia, quindi le
 * note vecchie e l'esportazione (che scurisce i colori chiari) funzionano uguali.
 */
export const THEME_INK = "#f2f2f4";

/** Larghezza di riferimento: gli spessori salvati valgono per una pagina larga 900px. */
export const REF_WIDTH = 900;

/**
 * Disegna i tratti su un contesto già scalato in px CSS, dove `width` è la
 * larghezza della pagina. Condivisa da canvas dell'editor ed esportazione.
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  width: number,
  strokes: readonly InkStroke[],
  mapColor: (color: string) => string = (c) => c
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : 1;
    ctx.strokeStyle = mapColor(s.color);
    ctx.lineWidth = s.size * (s.tool === "highlighter" ? 5 : 1) * (width / REF_WIDTH);
    ctx.beginPath();
    const [x0, y0] = s.points[0];
    ctx.moveTo(x0 * width, y0 * width);
    if (s.points.length === 1) ctx.lineTo(x0 * width + 0.01, y0 * width);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * width, s.points[i][1] * width);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Tratti validi da un valore qualunque (JSON letto da un attributo o da un file). */
export function asStrokes(value: unknown): InkStroke[] {
  if (!Array.isArray(value)) return [];
  const out: InkStroke[] = [];
  for (const s of value) {
    if (!s || typeof s !== "object") continue;
    const { tool, color, size, points } = s as Record<string, unknown>;
    if ((tool !== "pen" && tool !== "highlighter") || typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) continue;
    if (typeof size !== "number" || !Number.isFinite(size) || !Array.isArray(points)) continue;
    const pts = points.filter(
      (p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n))
    );
    if (pts.length > 0) out.push({ tool, color, size: Math.min(40, Math.max(0.5, size)), points: pts });
  }
  return out;
}
