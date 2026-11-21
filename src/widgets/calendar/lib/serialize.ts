import type { PropType, PropValue, Reminder, RepeatRule, Todo } from "./types";

/*
 * Lettura dei campi JSON del Calendario (repeat, reminders, props, todos, options), pura e tollerante: un valore
 * rovinato (o arrivato da una versione futura) diventa il default invece di rompere la pagina.
 */

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const FREQS = ["day", "week", "month", "year"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function parseRepeat(raw: string | null | undefined): RepeatRule | null {
  const v = parseJson(raw) as Partial<Record<keyof RepeatRule, unknown>> | null;
  if (!v || typeof v !== "object" || !FREQS.includes(v.freq as RepeatRule["freq"])) return null;
  return {
    freq: v.freq as RepeatRule["freq"],
    interval: isFiniteNumber(v.interval) && v.interval >= 1 ? Math.floor(v.interval) : 1,
    weekdays: isFiniteNumber(v.weekdays) ? Math.floor(v.weekdays) & 0x7f : 0,
    until: isFiniteNumber(v.until) ? v.until : null,
    count: isFiniteNumber(v.count) && v.count >= 1 ? Math.floor(v.count) : null,
    exdates: Array.isArray(v.exdates) ? v.exdates.filter(isFiniteNumber) : [],
  };
}

export function parseReminders(raw: string | null | undefined): Reminder[] {
  const v = parseJson(raw);
  if (!Array.isArray(v)) return [];
  return v.flatMap((r): Reminder[] => {
    if (r?.type === "offset" && isFiniteNumber(r.minutes) && r.minutes >= 0) return [{ type: "offset", minutes: Math.floor(r.minutes) }];
    if (r?.type === "at" && isFiniteNumber(r.days) && r.days >= 0 && typeof r.time === "string" && TIME_RE.test(r.time)) {
      return [{ type: "at", days: Math.floor(r.days), time: r.time }];
    }
    return [];
  });
}

/** Inizi delle occorrenze fatte (promemoria). */
export function parseDone(raw: string | null | undefined): number[] {
  const v = parseJson(raw);
  return Array.isArray(v) ? v.filter(isFiniteNumber) : [];
}

export function parseTodos(raw: string | null | undefined): Todo[] {
  const v = parseJson(raw);
  if (!Array.isArray(v)) return [];
  return v.flatMap((t): Todo[] => (typeof t?.text === "string" ? [{ text: t.text, done: t.done === true }] : []));
}

export function parseProps(raw: string | null | undefined): Record<string, PropValue> {
  const v = parseJson(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, PropValue> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (x === null || typeof x === "string" || typeof x === "boolean" || isFiniteNumber(x)) out[k] = x;
  }
  return out;
}

export function parseOptions(raw: string | null | undefined): string[] {
  const v = parseJson(raw);
  return Array.isArray(v) ? v.filter((o): o is string => typeof o === "string") : [];
}

export const PROP_TYPES: readonly PropType[] = ["text", "number", "select", "checkbox", "date", "link"];

export function parsePropType(raw: string): PropType {
  return (PROP_TYPES as readonly string[]).includes(raw) ? (raw as PropType) : "text";
}

export const PROP_TYPE_LABEL: Record<PropType, string> = {
  text: "Testo",
  number: "Numero",
  select: "Selezione",
  checkbox: "Casella",
  date: "Data",
  link: "Link",
};
