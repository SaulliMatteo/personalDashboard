import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";

/*
 * Report per materie dei Gruppi (supabase/migrations/…_materie_gruppo.sql). Al server arrivano solo le materie
 * del gruppo (nomi scelti apposta per il gruppo) e "materia del gruppo, giorno, secondi": le materie locali e i loro
 * abbinamenti restano sul computer.
 */

export const GROUP_SUBJECT_NAME_MAX = 40;

/** Colori della palette delle materie del gruppo nell'app (token --group-subject-N, che si ripetono). */
export const GROUP_SUBJECT_COLORS = 12;

export interface GroupSubject {
  id: string;
  groupId: string;
  name: string;
  /** indice della palette, 0..GROUP_SUBJECT_COLORS-1 */
  color: number;
  /** unita in un'altra materia dal proprietario: gli abbinamenti la seguono */
  mergedInto: string | null;
}

/** Riga da mandare: secondi di questo computer per una materia del gruppo in un giorno locale. */
export interface GroupSubjectTotal {
  subjectId: string;
  day: string;
  seconds: number;
}

interface SubjectRow {
  id: string;
  group_id: string;
  name: string;
  color: number;
  merged_into: string | null;
}

/** Le materie dei gruppi indicati, comprese quelle unite (servono a far seguire gli abbinamenti). */
export async function fetchGroupSubjects(groupIds: string[]): Promise<GroupSubject[]> {
  if (groupIds.length === 0) return [];
  const result = await requireCloudClient()
    .from("group_subjects")
    .select("id, group_id, name, color, merged_into")
    .in("group_id", groupIds)
    .order("name");
  throwIfFailed(result);
  return ((result.data ?? []) as SubjectRow[]).map((r) => ({
    id: r.id,
    groupId: r.group_id,
    name: r.name,
    color: r.color,
    mergedInto: r.merged_into,
  }));
}

/** Crea una materia del gruppo (ogni membro); se il nome c'è già restituisce quella esistente. */
export async function createGroupSubject(groupId: string, name: string): Promise<string> {
  const result = await requireCloudClient().rpc("create_group_subject", { p_group_id: groupId, p_name: name });
  throwIfFailed(result);
  return result.data as string;
}

/** Rinomina (solo il proprietario). */
export async function renameGroupSubject(subjectId: string, name: string): Promise<void> {
  throwIfFailed(
    await requireCloudClient().rpc("update_group_subject", { p_subject_id: subjectId, p_name: name, p_color: null })
  );
}

/** Unisce `fromId` in `intoId` (solo il proprietario): i totali si sommano. */
export async function mergeGroupSubjects(fromId: string, intoId: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("merge_group_subjects", { p_from: fromId, p_into: intoId }));
}

/** Elimina una materia del gruppo e i suoi totali (solo il proprietario). */
export async function deleteGroupSubject(subjectId: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("delete_group_subject", { p_subject_id: subjectId }));
}

/** Consenso dell'account al report per materie (false se non è mai stato dato). */
export async function fetchSubjectReportConsent(userId: string): Promise<boolean> {
  const result = await requireCloudClient()
    .from("subject_report_consent")
    .select("enabled")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfFailed(result);
  return (result.data as { enabled: boolean } | null)?.enabled ?? false;
}

/** Spento: il server cancella subito tutte le righe per materia dell'account, in tutti i gruppi. */
export async function setSubjectReportConsent(enabled: boolean): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("set_subject_report_consent", { p_enabled: enabled }));
}

/**
 * Sostituisce le righe di questo computer in un gruppo per i giorni indicati (tutti, anche quelli senza righe).
 * "disabled": il consenso dell'account è spento (il server non tiene niente).
 */
export async function syncGroupSubjectTotals(
  deviceId: string,
  groupId: string,
  days: string[],
  rows: GroupSubjectTotal[]
): Promise<"ok" | "disabled"> {
  const result = await requireCloudClient().rpc("sync_group_subject_totals", {
    p_device_id: deviceId,
    p_group_id: groupId,
    p_days: days,
    p_rows: rows.map((r) => ({ subject_id: r.subjectId, day: r.day, seconds: r.seconds })),
  });
  throwIfFailed(result);
  return result.data === "disabled" ? "disabled" : "ok";
}

/** Cancella le proprie righe di un gruppo, o di una sola materia del gruppo (tutti i dispositivi, tutti i giorni). */
export async function revokeGroupSubjectTotals(groupId: string, subjectId: string | null = null): Promise<void> {
  throwIfFailed(
    await requireCloudClient().rpc("revoke_group_subject_totals", { p_group_id: groupId, p_subject_id: subjectId })
  );
}

/** Il report di un gruppo tra due giorni compresi, sommato dal server sui membri attuali. */
export interface GroupSubjectReport {
  /** secondi per materia del gruppo e giorno */
  subjects: GroupSubjectTotal[];
  /** "Altre materie" per giorno: tempo condiviso non abbinato (o di chi non ha dato il consenso) */
  other: { day: string; seconds: number }[];
  /** chi ha tempo su ciascuna materia nel periodo */
  contributors: Map<string, string[]>;
  /** primo giorno con un totale di un membro ("AAAA-MM-GG"), null se nessuno */
  firstDay: string | null;
}

interface ReportJson {
  subjects: { subject_id: string; day: string; seconds: number }[];
  other: { day: string; seconds: number }[];
  contributors: { subject_id: string; user_ids: string[] }[];
  first_day: string | null;
}

export async function fetchGroupSubjectReport(groupId: string, fromDay: string, toDay: string): Promise<GroupSubjectReport> {
  const result = await requireCloudClient().rpc("group_subject_report", {
    p_group_id: groupId,
    p_from: fromDay,
    p_to: toDay,
  });
  throwIfFailed(result);
  const data = result.data as ReportJson;
  return {
    subjects: data.subjects.map((r) => ({ subjectId: r.subject_id, day: r.day, seconds: r.seconds })),
    other: data.other,
    contributors: new Map(data.contributors.map((c) => [c.subject_id, c.user_ids])),
    firstDay: data.first_day,
  };
}
