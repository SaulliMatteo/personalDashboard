export type ReportPeriod = "week" | "month" | "year";

/** Un intervallo di tempo registrato (una sessione di studio, una sessione di visione…), assegnato a un gruppo. */
export interface TimedItem {
  endedAt: number;
  durationSeconds: number;
  /** Chi lo ha prodotto (materia, cartella…): il grafico divide le barre per gruppo. */
  groupId: number;
}

export interface Bucket {
  /** Etichetta sotto la barra (può essere vuota nei grafici fitti). */
  label: string;
  /** Descrizione completa per il tooltip, es. "lunedì 12 ottobre". */
  title: string;
  start: number;
  end: number;
  seconds: number;
  /** groupId -> secondi in questa barra. */
  byGroup: Record<number, number>;
  /** True per il giorno/mese che contiene "adesso": viene evidenziato nel grafico. */
  isCurrent: boolean;
}

/** Un periodo di calendario: [start, end) in ms, con le informazioni per titolo e medie. */
export interface PeriodRange {
  start: number;
  end: number;
  /** Titolo da mostrare, es. "12 ott – 18 ott 2026", "ottobre 2026", "2026". */
  title: string;
  /** Giorni totali del periodo (7, 28-31, 365-366). */
  days: number;
  /** Giorni da contare per la media: quelli trascorsi (oggi incluso) se il periodo è in corso, altrimenti tutti. */
  elapsedDays: number;
}

const MS_PER_DAY = 86_400_000;

/** Giorni tra due mezzanotti locali. Arrotondato: un cambio ora legale fa durare un giorno 23 o 25 ore. */
function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("it-IT", options);
}

/**
 * Il periodo di calendario `offset` periodi fa (0 = quello in corso, -1 = il precedente…).
 * Settimana = lunedì-domenica, mese = mese di calendario, anno = anno solare.
 * Tutte le date passano da `new Date(anno, mese, giorno)`: restano corrette
 * anche attraverso i cambi di ora legale. Un offset positivo vale 0: il futuro non si mostra.
 */
export function periodRange(period: ReportPeriod, offset: number, now: Date = new Date()): PeriodRange {
  const o = Math.min(0, Math.trunc(offset));
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const todayStart = new Date(y, m, d).getTime();

  let startDate: Date;
  let endDate: Date;
  let title: string;

  if (period === "week") {
    const dayOfWeek = (now.getDay() + 6) % 7; // lunedì = 0
    startDate = new Date(y, m, d - dayOfWeek + o * 7);
    endDate = new Date(y, m, d - dayOfWeek + o * 7 + 7);
    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1);
    title = `${format(startDate, { day: "numeric", month: "short" })} – ${format(lastDay, { day: "numeric", month: "short", year: "numeric" })}`;
  } else if (period === "month") {
    startDate = new Date(y, m + o, 1);
    endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
    title = format(startDate, { month: "long", year: "numeric" });
  } else {
    startDate = new Date(y + o, 0, 1);
    endDate = new Date(y + o + 1, 0, 1);
    title = String(startDate.getFullYear());
  }

  const start = startDate.getTime();
  const end = endDate.getTime();
  const days = daysBetween(start, end);
  const elapsedDays = o === 0 ? Math.min(days, Math.max(1, daysBetween(start, todayStart) + 1)) : days;
  return { start, end, title, days, elapsedDays };
}

/**
 * Le barre del grafico per un periodo: 7 giorni (settimana), le settimane
 * del mese (mese), 12 mesi (anno). Gli intervalli si assegnano per istante di fine
 * (uno a cavallo della mezzanotte conta nel giorno in cui finisce).
 */
export function buildBuckets(
  period: ReportPeriod,
  range: PeriodRange,
  items: TimedItem[],
  now: Date = new Date()
): Bucket[] {
  const nowMs = now.getTime();
  const buckets: Bucket[] = [];
  const add = (start: Date, end: Date, label: string, title: string) => {
    const s = start.getTime();
    const e = end.getTime();
    buckets.push({ label, title, start: s, end: e, seconds: 0, byGroup: {}, isCurrent: nowMs >= s && nowMs < e });
  };

  const first = new Date(range.start);
  const year = first.getFullYear();

  if (period === "year") {
    for (let i = 0; i < 12; i++) {
      const start = new Date(year, i, 1);
      add(
        start,
        new Date(year, i + 1, 1),
        format(start, { month: "short" }).replace(".", ""),
        format(start, { month: "long", year: "numeric" })
      );
    }
  } else if (period === "month") {
    // Una barra per settimana (lun-dom), ritagliata sul mese: la prima e l'ultima
    // possono avere meno di 7 giorni. Es. ottobre 2026: 1-4, 5-11, 12-18, 19-25, 26-31.
    let cursor = first;
    while (cursor.getTime() < range.end) {
      const dayOfWeek = (cursor.getDay() + 6) % 7; // lunedì = 0
      const nextMonday = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + (7 - dayOfWeek));
      const end = nextMonday.getTime() > range.end ? new Date(range.end) : nextMonday;
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      const sameDay = last.getDate() === cursor.getDate();
      add(
        cursor,
        end,
        sameDay ? String(cursor.getDate()) : `${cursor.getDate()}–${last.getDate()}`,
        sameDay
          ? format(cursor, { weekday: "long", day: "numeric", month: "long" })
          : `${cursor.getDate()}–${format(last, { day: "numeric", month: "long" })}`
      );
      cursor = end;
    }
  } else {
    const month = first.getMonth();
    const day = first.getDate();
    for (let i = 0; i < range.days; i++) {
      const start = new Date(year, month, day + i);
      const end = new Date(year, month, day + i + 1);
      add(
        start,
        end,
        format(start, { weekday: "short" }).replace(".", ""),
        format(start, { weekday: "long", day: "numeric", month: "long" })
      );
    }
  }

  for (const item of items) {
    const bucket = buckets.find((b) => item.endedAt >= b.start && item.endedAt < b.end);
    if (!bucket) continue;
    bucket.seconds += item.durationSeconds;
    bucket.byGroup[item.groupId] = (bucket.byGroup[item.groupId] ?? 0) + item.durationSeconds;
  }
  return buckets;
}
