import type { LocalDay } from "../sync/plan";

/*
 * Cosa mandare del report per materie. Puro: niente DB, niente rete (lo prova scripts/gruppi/subjects.test.mts).
 * Al server arriva solo "materia del gruppo, giorno, secondi": nomi e id delle materie locali restano qui.
 */

/** Il server rifiuta più di un giorno intero per riga (e la somma di un giorno oltre il totale giornaliero). */
const MAX_DAY_SECONDS = 86_400;

/** Una sessione di studio locale con la sua materia (conta nel giorno in cui finisce, come nel widget Studio). */
export interface SubjectSessionSpan {
  endedAt: number;
  durationSeconds: number;
  subjectId: number;
}

/** Abbinamento confermato in un gruppo: materia locale → materia del gruppo (null = "Non condividere"). */
export interface SubjectLink {
  groupId: string;
  localSubjectId: number;
  groupSubjectId: string | null;
}

/** Riga per il server: secondi di una materia del gruppo in un giorno locale ("AAAA-MM-GG"). */
export interface GroupSubjectDayRow {
  subjectId: string;
  day: string;
  seconds: number;
}

/** Materia del gruppo come la vede l'app: `mergedInto` se il proprietario l'ha unita a un'altra. */
export interface GroupSubjectRef {
  id: string;
  mergedInto: string | null;
}

/**
 * La materia del gruppo a cui punta davvero un abbinamento: segue le unioni (l'abbinamento va con la materia
 * unita, senza riconferma). null se la materia non esiste più (eliminata) o se le unioni girano in tondo.
 */
export function resolveGroupSubject(id: string, subjects: ReadonlyMap<string, GroupSubjectRef>): string | null {
  let current = subjects.get(id);
  for (let steps = 0; current && steps < 20; steps++) {
    if (current.mergedInto === null) return current.id;
    current = subjects.get(current.mergedInto);
  }
  return null;
}

/**
 * Le righe di un gruppo per i giorni indicati: per ogni giorno, i secondi delle sessioni delle materie locali
 * abbinate, sommati per materia del gruppo (più materie locali possono andare nella stessa). Le materie non
 * abbinate o "Non condividere" restano fuori: per gli altri sono "Altre materie". Le righe a 0 non servono (il
 * server sostituisce i giorni mandati). Se un giorno supera 86400 s (come il totale giornaliero, che si ferma lì)
 * le righe si riducono in proporzione, così la somma resta sotto il totale.
 */
export function groupSubjectRows(
  days: LocalDay[],
  sessions: SubjectSessionSpan[],
  links: ReadonlyMap<number, string>
): GroupSubjectDayRow[] {
  const byDay = days.map(() => new Map<string, number>());
  for (const session of sessions) {
    const target = links.get(session.subjectId);
    if (!target) continue;
    const index = days.findIndex((day) => session.endedAt >= day.start && session.endedAt < day.end);
    if (index < 0) continue;
    const seconds = Math.max(0, Math.round(session.durationSeconds));
    byDay[index].set(target, (byDay[index].get(target) ?? 0) + seconds);
  }

  const rows: GroupSubjectDayRow[] = [];
  days.forEach((day, i) => {
    const entries = [...byDay[i].entries()].filter(([, s]) => s > 0);
    const total = entries.reduce((sum, [, s]) => sum + s, 0);
    const scale = total > MAX_DAY_SECONDS ? MAX_DAY_SECONDS / total : 1;
    for (const [subjectId, seconds] of entries) {
      const value = Math.floor(seconds * scale);
      if (value > 0) rows.push({ subjectId, day: day.key, seconds: value });
    }
  });
  return rows;
}
