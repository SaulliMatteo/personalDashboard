import { addDays, minutesOfDay, snapMinutes, startOfDay } from "./dates";

/*
 * Geometria delle viste a ore (settimana e giorno): pure. Le posizioni sono in px dall'inizio della griglia
 * (`fromMin` = minuti dalla mezzanotte della prima riga). Nel mockup: settimana 46 px per ora, giorno 64;
 * i blocchi lasciano 2 px sotto di sé (gap) e non sono mai più bassi di MIN_BLOCK px.
 */

export const WEEK_HOUR_PX = 46;
export const DAY_HOUR_PX = 64;
export const BLOCK_GAP = 2;
export const MIN_BLOCK = 22;
export const SNAP_MIN = 15;

export interface HourScale {
  fromMin: number;
  pxPerHour: number;
}

/** La parte di [start, end) che cade nel giorno `day`, in minuti dalla sua mezzanotte (null = fuori dal giorno). */
export function segmentInDay(start: number, end: number, day: number | Date): { startMin: number; endMin: number } | null {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(dayStart, 1).getTime();
  if (end <= dayStart || start >= dayEnd) {
    if (!(start === end && start >= dayStart && start < dayEnd)) return null;
  }
  const startMin = start <= dayStart ? 0 : minutesOfDay(start);
  const endMin = end >= dayEnd ? 1440 : minutesOfDay(end);
  return { startMin, endMin: Math.max(startMin, endMin) };
}

export function minutesToPx(min: number, scale: HourScale): number {
  return ((min - scale.fromMin) / 60) * scale.pxPerHour;
}

export function pxToMinutes(px: number, scale: HourScale): number {
  return scale.fromMin + (px / scale.pxPerHour) * 60;
}

/** Riquadro di un blocco: arrotondato al px come il mockup (08:10 → 8 px). */
export function blockBox(startMin: number, endMin: number, scale: HourScale): { top: number; height: number } {
  const top = Math.round(minutesToPx(startMin, scale));
  const bottom = Math.round(minutesToPx(endMin, scale));
  return { top, height: Math.max(MIN_BLOCK, bottom - top - BLOCK_GAP) };
}

/** Linea dell'ora corrente: alta 2 px, centrata sull'istante. */
export function nowLineTop(now: number | Date, scale: HourScale): number {
  return Math.round(minutesToPx(minutesOfDay(now), scale)) - 1;
}

/**
 * Colonne per i blocchi che si sovrappongono: in ogni gruppo di blocchi collegati da sovrapposizioni, ognuno
 * prende la prima colonna libera e tutti hanno lo stesso numero di colonne (`cols`).
 */
export interface ColumnSlot {
  col: number;
  cols: number;
  /** Il gruppo di blocchi collegati da sovrapposizioni (0, 1, 2… dall'alto). */
  group: number;
}

export function layoutColumns(items: readonly { key: string; startMin: number; endMin: number }[]): Map<string, ColumnSlot> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.key.localeCompare(b.key));
  const result = new Map<string, ColumnSlot>();
  let groupIndex = 0;
  let group: { key: string; col: number }[] = [];
  let colEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const g of group) result.set(g.key, { col: g.col, cols: colEnds.length, group: groupIndex });
    if (group.length > 0) groupIndex++;
    group = [];
    colEnds = [];
  };
  for (const it of sorted) {
    // un blocco di 0 minuti occupa comunque il suo posto (è alto MIN_BLOCK)
    const end = Math.max(it.endMin, it.startMin + 1);
    if (it.startMin >= groupEnd) {
      close();
      groupEnd = -Infinity;
    }
    let col = colEnds.findIndex((e) => e <= it.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else {
      colEnds[col] = end;
    }
    group.push({ key: it.key, col });
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return result;
}

/**
 * Trascinamento su uno spazio vuoto: da y0 a y1 (px) → intervallo in minuti, a scatti di SNAP_MIN, almeno uno
 * scatto, dentro il giorno. Un clic senza trascinare dà un'ora dallo scatto sotto il puntatore.
 */
export function rangeFromDrag(y0: number, y1: number, scale: HourScale, snap = SNAP_MIN): { startMin: number; endMin: number } {
  const a = pxToMinutes(Math.min(y0, y1), scale);
  const b = pxToMinutes(Math.max(y0, y1), scale);
  let startMin = Math.floor(a / snap) * snap;
  let endMin = Math.ceil(b / snap) * snap;
  if (endMin - startMin <= snap && Math.abs(y1 - y0) < 4) endMin = startMin + 60;
  if (endMin <= startMin) endMin = startMin + snap;
  startMin = Math.max(0, Math.min(startMin, 1440 - snap));
  endMin = Math.max(startMin + snap, Math.min(endMin, 1440));
  return { startMin, endMin };
}

/** Sposta un intervallo di `deltaMin` (a scatti), tenendone la durata e restando nel giorno. */
export function moveRange(startMin: number, endMin: number, deltaMin: number, snap = SNAP_MIN): { startMin: number; endMin: number } {
  const duration = endMin - startMin;
  const s = Math.max(0, Math.min(snapMinutes(startMin + deltaMin, snap), 1440 - duration));
  return { startMin: s, endMin: s + duration };
}

/** Allunga o accorcia dal bordo basso (a scatti, almeno uno scatto, non oltre mezzanotte). */
export function resizeRange(startMin: number, endMin: number, deltaMin: number, snap = SNAP_MIN): { startMin: number; endMin: number } {
  const e = Math.max(startMin + snap, Math.min(snapMinutes(endMin + deltaMin, snap), 1440));
  return { startMin, endMin: e };
}

/**
 * Come layoutColumns, ma con al massimo `max` blocchi affiancati (vista Settimana: 2). I blocchi delle colonne in più
 * non si disegnano: per ogni gruppo che ne ha, `overflow` dice quanti sono e da che minuto partono ("+N").
 */
export function limitColumns(
  items: readonly { key: string; startMin: number; endMin: number }[],
  max: number
): { placed: Map<string, ColumnSlot>; overflow: { group: number; startMin: number; count: number }[] } {
  const layout = layoutColumns(items);
  const placed = new Map<string, ColumnSlot>();
  const hidden = new Map<number, { group: number; startMin: number; count: number }>();
  for (const it of items) {
    const slot = layout.get(it.key);
    if (!slot) continue;
    if (slot.cols <= max) placed.set(it.key, slot);
    else if (slot.col < max) placed.set(it.key, { ...slot, cols: max });
    else {
      const h = hidden.get(slot.group) ?? { group: slot.group, startMin: it.startMin, count: 0 };
      h.count++;
      h.startMin = Math.min(h.startMin, it.startMin);
      hidden.set(slot.group, h);
    }
  }
  return { placed, overflow: [...hidden.values()].sort((a, b) => a.startMin - b.startMin) };
}
