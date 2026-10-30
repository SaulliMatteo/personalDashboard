/**
 * Modifiche NON distruttive di un'immagine nella pagina: il file su disco resta quello
 * originale, le modifiche stanno in data-edit (JSON) sul <figure data-block="image">.
 * Logica pura (nessun DOM): validazione, valori di default e geometria per il CSS.
 */

export interface ImageCrop {
  /** Frazioni dell'immagine originale (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ImageRotation = 0 | 90 | 180 | 270;

export interface ImageEdit {
  /** Dimensioni originali in px (servono a calcolare le proporzioni senza caricare il file). */
  nw: number;
  nh: number;
  crop: ImageCrop | null;
  rotate: ImageRotation;
  flip: boolean;
  /** Percentuali, 100 = invariato. */
  brightness: number;
  contrast: number;
}

export type ImageAlign = "left" | "center" | "right" | "full";

export const IMAGE_ALIGNS: readonly ImageAlign[] = ["left", "center", "right", "full"];
export const FILTER_MIN = 50;
export const FILTER_MAX = 150;
export const WIDTH_MIN = 10;
export const WIDTH_MAX = 100;
/** Larghezza del testo della pagina a zoom 100% (58em − margini): serve alla larghezza iniziale. */
export const PAGE_TEXT_WIDTH = 768;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function defaultEdit(nw = 0, nh = 0): ImageEdit {
  return { nw, nh, crop: null, rotate: 0, flip: false, brightness: 100, contrast: 100 };
}

function parseCrop(v: unknown): ImageCrop | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const x = clamp(num(c.x, 0), 0, 0.95);
  const y = clamp(num(c.y, 0), 0, 0.95);
  const w = clamp(num(c.w, 1), 0.05, 1 - x);
  const h = clamp(num(c.h, 1), 0.05, 1 - y);
  if (x === 0 && y === 0 && w === 1 && h === 1) return null;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Legge data-edit: valori sconosciuti o fuori misura tornano ai default. */
export function parseImageEdit(raw: string | null | undefined): ImageEdit {
  if (!raw) return defaultEdit();
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return defaultEdit();
  }
  if (!v || typeof v !== "object") return defaultEdit();
  const o = v as Record<string, unknown>;
  const rotate = num(o.rotate, 0);
  return {
    nw: Math.max(0, Math.round(num(o.nw, 0))),
    nh: Math.max(0, Math.round(num(o.nh, 0))),
    crop: parseCrop(o.crop),
    rotate: rotate === 90 || rotate === 180 || rotate === 270 ? rotate : 0,
    flip: o.flip === true,
    brightness: Math.round(clamp(num(o.brightness, 100), FILTER_MIN, FILTER_MAX)),
    contrast: Math.round(clamp(num(o.contrast, 100), FILTER_MIN, FILTER_MAX)),
  };
}

/** JSON compatto per data-edit (solo quello che differisce dai default). */
export function serializeImageEdit(e: ImageEdit): string {
  const out: Record<string, unknown> = { nw: e.nw, nh: e.nh };
  if (e.crop) out.crop = e.crop;
  if (e.rotate) out.rotate = e.rotate;
  if (e.flip) out.flip = true;
  if (e.brightness !== 100) out.brightness = e.brightness;
  if (e.contrast !== 100) out.contrast = e.contrast;
  return JSON.stringify(out);
}

/** C'è qualcosa da ripristinare? */
export function isEdited(e: ImageEdit): boolean {
  return e.crop !== null || e.rotate !== 0 || e.flip || e.brightness !== 100 || e.contrast !== 100;
}

/** Riporta l'immagine all'originale tenendo le dimensioni lette dal file. */
export function resetEdit(e: ImageEdit): ImageEdit {
  return defaultEdit(e.nw, e.nh);
}

export function rotateRight(e: ImageEdit): ImageEdit {
  return { ...e, rotate: ((e.rotate + 90) % 360) as ImageRotation };
}

export function parseAlign(raw: string | null | undefined): ImageAlign {
  return IMAGE_ALIGNS.includes(raw as ImageAlign) ? (raw as ImageAlign) : "center";
}

/** Larghezza in % della pagina (10–100); null se l'attributo manca o non è valido. */
export function parseWidth(raw: string | null | undefined): number | null {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? Math.round(clamp(n, WIDTH_MIN, WIDTH_MAX)) : null;
}

/** Larghezza iniziale: l'immagine a grandezza naturale, ma mai più larga della pagina. */
export function initialWidth(nw: number): number {
  if (nw <= 0) return WIDTH_MAX;
  return Math.round(clamp((nw / PAGE_TEXT_WIDTH) * 100, WIDTH_MIN, WIDTH_MAX));
}

/** Proporzioni (larghezza/altezza) dell'immagine come si vede: dopo ritaglio e rotazione. */
export function outputAspect(e: ImageEdit): number {
  const crop = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const w = (e.nw || 4) * crop.w;
  const h = (e.nh || 3) * crop.h;
  const sideways = e.rotate === 90 || e.rotate === 270;
  return sideways ? h / w : w / h;
}

export interface ImageLayout {
  /** aspect-ratio del riquadro esterno. */
  aspect: number;
  /** Riquadro ritagliato, centrato e ruotato dentro quello esterno (percentuali del riquadro). */
  inner: { width: number; height: number; transform: string };
  /** L'immagine intera dentro il riquadro ritagliato (percentuali del riquadro ritagliato). */
  image: { width: number; height: number; left: number; top: number; filter: string };
}

/**
 * Geometria per il CSS: il riquadro esterno ha le proporzioni finali; dentro c'è il riquadro
 * ritagliato (con overflow nascosto) ruotato e specchiato; dentro ancora l'immagine intera,
 * spostata così che si veda solo la parte ritagliata.
 */
export function imageLayout(e: ImageEdit): ImageLayout {
  const crop = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const aspect = outputAspect(e);
  const sideways = e.rotate === 90 || e.rotate === 270;
  const filters: string[] = [];
  if (e.brightness !== 100) filters.push(`brightness(${e.brightness}%)`);
  if (e.contrast !== 100) filters.push(`contrast(${e.contrast}%)`);
  return {
    aspect,
    inner: {
      // Girato di lato, il riquadro ritagliato è largo quanto il riquadro esterno è alto, e viceversa.
      width: sideways ? 100 / aspect : 100,
      height: sideways ? 100 * aspect : 100,
      transform: `translate(-50%, -50%) rotate(${e.rotate}deg)${e.flip ? " scaleX(-1)" : ""}`,
    },
    image: {
      width: 100 / crop.w,
      height: 100 / crop.h,
      left: -(crop.x / crop.w) * 100,
      top: -(crop.y / crop.h) * 100,
      filter: filters.join(" ") || "none",
    },
  };
}

/** Nome sicuro per data-attachment: solo il nome del file, niente percorsi. */
export function asAttachmentName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw.trim();
  if (!name || name.length > 200 || /[\\/:*?"<>|]/.test(name) || name === "." || name === "..") return null;
  return name;
}
