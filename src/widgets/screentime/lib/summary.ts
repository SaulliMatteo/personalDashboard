import type { AppCategory } from "../../../core/system/appCategory";
import { effectiveCategory, siteChoiceKey } from "./classify";
import type { FocusClass } from "./focus";
import type { ScreenLimit } from "./limits";

/** Riga salvata (screentime_usage). */
export interface UsageRow {
  day: string;
  hour: number;
  appKey: string;
  site: string;
  appLabel: string;
  category: string;
  seconds: number;
  firstAt: number;
  lastAt: number;
}

export type ClassSeconds = Record<FocusClass, number>;

export interface RankItem {
  /** Chiave stabile: app_key, oppure "web:<sito>". */
  key: string;
  label: string;
  seconds: number;
  category: AppCategory;
  cls: FocusClass;
  /** Per un browser: quanto tempo in ciascuna classe (i suoi siti possono essere di classi diverse). */
  byClass: ClassSeconds;
  isSite: boolean;
  /** Per i siti: l'app_key del browser più usato. */
  appKey: string;
}

export interface Summary {
  total: number;
  byClass: ClassSeconds;
  /** 24 ore, ognuna con i secondi per classe. */
  hours: ClassSeconds[];
  /** App (i browser con tutti i loro siti dentro). */
  apps: RankItem[];
  /** Solo i siti. */
  sites: RankItem[];
  /** App e siti insieme: un browser diviso nei suoi siti (il widget). */
  top: RankItem[];
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

function add(map: Map<string, RankItem>, key: string, base: Omit<RankItem, "seconds" | "byClass">, seconds: number, cls: FocusClass) {
  let item = map.get(key);
  if (!item) {
    item = { ...base, seconds: 0, byClass: zero() };
    map.set(key, item);
  }
  item.seconds += seconds;
  item.byClass[cls] += seconds;
}

export function summarize(rows: UsageRow[], ctx: ClassifyContext): Summary {
  const byClass = zero();
  const hours = Array.from({ length: 24 }, zero);
  const apps = new Map<string, RankItem>();
  const sites = new Map<string, RankItem>();
  const top = new Map<string, RankItem>();
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

    // L'app: per i browser la categoria dell'app intera è quella del browser, non dei singoli siti.
    const appCategory = row.site ? ((ctx.manual.get(row.appKey) ?? "browser") as AppCategory) : category;
    add(apps, row.appKey, { key: row.appKey, label: row.appLabel, category: appCategory, cls: ctx.classes[appCategory] ?? "neutral", isSite: false, appKey: row.appKey }, row.seconds, cls);
    if (row.site) {
      const key = siteChoiceKey(row.site);
      const base = { key, label: row.site, category, cls, isSite: true, appKey: row.appKey };
      add(sites, key, base, row.seconds, cls);
      add(top, key, base, row.seconds, cls);
    } else {
      add(top, row.appKey, { key: row.appKey, label: row.appLabel, category, cls, isSite: false, appKey: row.appKey }, row.seconds, cls);
    }
  }
  // Un browser ha la classe del tempo che ci passi di più.
  for (const item of apps.values()) {
    const bc = item.byClass;
    if (bc.focus + bc.fun + bc.neutral > 0 && (bc.focus > 0 ? 1 : 0) + (bc.fun > 0 ? 1 : 0) + (bc.neutral > 0 ? 1 : 0) > 1) {
      item.cls = (["focus", "fun", "neutral"] as FocusClass[]).reduce((a, b) => (bc[b] > bc[a] ? b : a));
    }
  }
  return { total, byClass, hours, apps: rank(apps), sites: rank(sites), top: rank(top), firstAt, lastAt };
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
    if (limit.kind === "app" ? row.appKey === limit.target : limit.kind === "site" ? row.site === limit.target : effectiveCategory(row, manual) === limit.target) {
      sum += row.seconds;
    }
  }
  return sum;
}
