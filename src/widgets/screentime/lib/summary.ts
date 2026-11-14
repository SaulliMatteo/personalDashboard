import type { AppCategory } from "../../../core/system/appCategory";
import { effectiveCategory } from "./classify";
import type { FocusClass } from "./focus";
import type { ScreenLimit } from "./limits";

/** Riga salvata (screentime_usage). */
export interface UsageRow {
  day: string;
  hour: number;
  appKey: string;
  appLabel: string;
  category: string;
  seconds: number;
  firstAt: number;
  lastAt: number;
}

export type ClassSeconds = Record<FocusClass, number>;

export interface RankItem {
  /** Chiave stabile: app_key. */
  key: string;
  label: string;
  seconds: number;
  category: AppCategory;
  cls: FocusClass;
}

export interface Summary {
  total: number;
  byClass: ClassSeconds;
  /** 24 ore, ognuna con i secondi per classe. */
  hours: ClassSeconds[];
  /** App, dalla più usata. */
  apps: RankItem[];
  firstAt: number | null;
  lastAt: number | null;
}

export interface ClassifyContext {
  manual: ReadonlyMap<string, AppCategory>;
  classes: Record<AppCategory, FocusClass>;
}

const zero = (): ClassSeconds => ({ focus: 0, fun: 0, neutral: 0 });

function rank(map: Map<string, RankItem>): RankItem[] {
  return [...map.values()].sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

function add(map: Map<string, RankItem>, base: Omit<RankItem, "seconds">, seconds: number) {
  let item = map.get(base.key);
  if (!item) {
    item = { ...base, seconds: 0 };
    map.set(base.key, item);
  }
  item.seconds += seconds;
}

export function summarize(rows: UsageRow[], ctx: ClassifyContext): Summary {
  const byClass = zero();
  const hours = Array.from({ length: 24 }, zero);
  const apps = new Map<string, RankItem>();
  let total = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;

  for (const row of rows) {
    const category = effectiveCategory(row, ctx.manual);
    const cls = ctx.classes[category] ?? "neutral";
    total += row.seconds;
    byClass[cls] += row.seconds;
    if (row.hour >= 0 && row.hour < 24) hours[row.hour][cls] += row.seconds;
    firstAt = firstAt === null ? row.firstAt : Math.min(firstAt, row.firstAt);
    lastAt = lastAt === null ? row.lastAt : Math.max(lastAt, row.lastAt);

    add(apps, { key: row.appKey, label: row.appLabel, category, cls }, row.seconds);
  }
  return { total, byClass, hours, apps: rank(apps), firstAt, lastAt };
}

/** Totale e classi per giorno (settimana, confronti, serie). */
export function dailyTotals(rows: UsageRow[], ctx: ClassifyContext): Map<string, { total: number; byClass: ClassSeconds }> {
  const out = new Map<string, { total: number; byClass: ClassSeconds }>();
  for (const row of rows) {
    let day = out.get(row.day);
    if (!day) {
      day = { total: 0, byClass: zero() };
      out.set(row.day, day);
    }
    const cls = ctx.classes[effectiveCategory(row, ctx.manual)] ?? "neutral";
    day.total += row.seconds;
    day.byClass[cls] += row.seconds;
  }
  return out;
}

/** Tempo di oggi che conta per un limite. */
export function limitUsage(rows: UsageRow[], limit: ScreenLimit, manual: ReadonlyMap<string, AppCategory>): number {
  let sum = 0;
  for (const row of rows) {
    if (limit.kind === "app" ? row.appKey === limit.target : effectiveCategory(row, manual) === limit.target) {
      sum += row.seconds;
    }
  }
  return sum;
}
