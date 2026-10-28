import type { StudyDayTotal } from "../../../../core/cloud/studyTotalsApi";
import type { SubjectPending } from "../data/subjectLinksRepository";
import { dailyTotals, syncDays, type LocalDay } from "../sync/plan";
import { groupSubjectRows, resolveGroupSubject, type GroupSubjectRef, type SubjectLink, type SubjectSessionSpan } from "./subjectPlan";

/** Storico rimandato quando cambia un abbinamento: il server accetta giorni fino a 60 giorni fa. */
export const BACKFILL_DAYS = 60;

/** Materia del gruppo come arriva dal server (con il gruppo, per sapere di chi è). */
export interface GroupSubjectInfo extends GroupSubjectRef {
  groupId: string;
}

/** Tutto ciò che tocca DB, rete e impostazioni arriva da fuori: così si prova senza app (scripts/gruppi). */
export interface SubjectSyncDeps {
  now: () => number;
  /** L'interruttore "Includi le mie materie nei report dei gruppi" (copia locale del consenso dell'account). */
  consentEnabled: () => boolean;
  /** I gruppi attuali con il modulo Studio; null finché non sono stati letti (allora non si tocca niente). */
  groupIds: () => string[] | null;
  updatePending: (change: (pending: SubjectPending) => SubjectPending) => Promise<SubjectPending>;
  pushConsent: (enabled: boolean) => Promise<void>;
  revoke: (groupId: string, subjectId: string | null) => Promise<void>;
  fetchSubjects: (groupIds: string[]) => Promise<GroupSubjectInfo[]>;
  loadLinks: () => Promise<SubjectLink[]>;
  retargetLinks: (groupId: string, fromId: string, toId: string) => Promise<void>;
  dropLinksTo: (groupId: string, subjectId: string) => Promise<void>;
  dropGroupLinks: (groupId: string) => Promise<void>;
  /** Giorni dal `fromDay` con un totale di questo computer già sul server. */
  fetchDeviceDays: (fromDay: string) => Promise<string[]>;
  loadSessions: (start: number, end: number) => Promise<SubjectSessionSpan[]>;
  uploadDaily: (totals: StudyDayTotal[]) => Promise<void>;
  upload: (groupId: string, days: string[], rows: { subjectId: string; day: string; seconds: number }[]) => Promise<"ok" | "disabled">;
  /** Il server dice che il consenso dell'account è spento (spento da un altro dispositivo). */
  onDisabledByServer: () => void;
}

const sameRevoke = (a: SubjectPending["revoke"][number], b: SubjectPending["revoke"][number]) =>
  a.groupId === b.groupId && a.subjectId === b.subjectId;

/**
 * Il giro del report per materie, dopo l'invio dei totali giornalieri degli stessi `days`:
 *  1. consenso e revoche in sospeso (prima di tutto: un "no" passa anche se il resto fallisce);
 *  2. abbinamenti allineati alle materie del gruppo: seguono le unioni, cadono con le materie eliminate e con i
 *     gruppi lasciati;
 *  3. con il consenso, per ogni gruppo con abbinamenti, le righe dei giorni (più lo storico se un abbinamento è
 *     cambiato). Un errore interrompe il giro: lo ritenta StudySync, e ogni passo si può ripetere.
 */
export async function syncGroupSubjects(deps: SubjectSyncDeps, days: LocalDay[]): Promise<void> {
  const pending = await deps.updatePending((p) => p);

  if (pending.consent !== undefined) {
    const sent = pending.consent;
    await deps.pushConsent(sent);
    await deps.updatePending((p) => (p.consent === sent ? { ...p, consent: undefined } : p));
  }
  for (const item of pending.revoke) {
    await deps.revoke(item.groupId, item.subjectId);
    await deps.updatePending((p) => ({ ...p, revoke: p.revoke.filter((r) => !sameRevoke(r, item)) }));
  }

  if (!deps.consentEnabled()) return;
  const groupIds = deps.groupIds();
  if (groupIds === null) return;

  // abbinamenti allineati alle materie del gruppo
  let links = await deps.loadLinks();
  const subjects = await deps.fetchSubjects([...new Set(links.map((l) => l.groupId))].filter((id) => groupIds.includes(id)));
  const byId = new Map(subjects.map((s) => [s.id, s] as const));
  for (const groupId of new Set(links.map((l) => l.groupId))) {
    if (!groupIds.includes(groupId)) await deps.dropGroupLinks(groupId);
  }
  for (const link of links) {
    if (!groupIds.includes(link.groupId) || link.groupSubjectId === null) continue;
    const target = resolveGroupSubject(link.groupSubjectId, byId);
    if (target === null) await deps.dropLinksTo(link.groupId, link.groupSubjectId);
    else if (target !== link.groupSubjectId) await deps.retargetLinks(link.groupId, link.groupSubjectId, target);
  }
  links = await deps.loadLinks();

  const perGroup = new Map<string, Map<number, string>>();
  for (const link of links) {
    if (link.groupSubjectId === null || !groupIds.includes(link.groupId)) continue;
    const map = perGroup.get(link.groupId) ?? new Map<number, string>();
    map.set(link.localSubjectId, link.groupSubjectId);
    perGroup.set(link.groupId, map);
  }
  if (perGroup.size === 0) {
    if (pending.backfillAt !== null) await clearBackfill(deps, pending.backfillAt);
    return;
  }

  // storico: solo i giorni che il server conosce già per questo computer, con il totale ricalcolato
  let sendDays = days;
  if (pending.backfillAt !== null) {
    const history = syncDays(new Date(deps.now()), null, BACKFILL_DAYS);
    const known = new Set(await deps.fetchDeviceDays(history[0].key));
    const current = new Set(days.map((d) => d.key));
    const extra = history.filter((d) => known.has(d.key) && !current.has(d.key));
    if (extra.length > 0) {
      const extraSessions = await deps.loadSessions(extra[0].start, extra[extra.length - 1].end);
      await deps.uploadDaily(dailyTotals(extra, extraSessions));
    }
    sendDays = [...extra, ...days];
  }

  const sessions = await deps.loadSessions(sendDays[0].start, sendDays[sendDays.length - 1].end);
  for (const [groupId, map] of perGroup) {
    const rows = groupSubjectRows(sendDays, sessions, map);
    const result = await deps.upload(groupId, sendDays.map((d) => d.key), rows);
    if (result === "disabled") {
      deps.onDisabledByServer();
      return;
    }
  }
  if (pending.backfillAt !== null) await clearBackfill(deps, pending.backfillAt);
}

/** Toglie lo storico da rimandare, a meno che nel frattempo non sia cambiato un altro abbinamento. */
async function clearBackfill(deps: SubjectSyncDeps, seen: number): Promise<void> {
  await deps.updatePending((p) => (p.backfillAt === seen ? { ...p, backfillAt: null } : p));
}
