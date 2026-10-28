import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";

/* Modulo Studio dei Gruppi: totali giornalieri (supabase/migrations/…_studio.sql). */

/** Secondi studiati in un giorno locale (`day` = "AAAA-MM-GG") su questo computer. */
export interface StudyDayTotal {
  day: string;
  seconds: number;
}

/** Totale di un utente in un giorno, sommato dal server su tutti i suoi dispositivi. */
export interface MemberDayTotal {
  userId: string;
  day: string;
  seconds: number;
}

/**
 * Scrive i totali di questo computer. Sostituisce il valore del giorno: rimandare le stesse righe
 * non cambia nulla.
 */
export async function upsertStudyTotals(userId: string, deviceId: string, totals: StudyDayTotal[]): Promise<void> {
  if (totals.length === 0) return;
  const rows = totals.map((t) => ({ user_id: userId, device_id: deviceId, day: t.day, seconds: t.seconds }));
  throwIfFailed(
    await requireCloudClient()
      .from("study_daily_totals")
      .upsert(rows, { onConflict: "user_id,device_id,day" })
  );
}

/** Totali degli utenti indicati tra due giorni compresi. Le RLS lasciano vedere solo chi è in un gruppo con te. */
export async function fetchStudyTotals(userIds: string[], fromDay: string, toDay: string): Promise<MemberDayTotal[]> {
  if (userIds.length === 0) return [];
  const result = await requireCloudClient()
    .from("study_totals_by_user")
    .select("user_id, day, seconds")
    .in("user_id", userIds)
    .gte("day", fromDay)
    .lte("day", toDay);
  throwIfFailed(result);
  return (result.data ?? []).map((r) => ({
    userId: r.user_id as string,
    day: r.day as string,
    seconds: r.seconds as number,
  }));
}

/**
 * I giorni dal `fromDay` in poi per cui questo computer ha già un totale sul server: lo storico per materia si può
 * mandare solo lì (il server controlla che la somma per materia non superi il totale del giorno).
 */
export async function fetchDeviceStudyDays(userId: string, deviceId: string, fromDay: string): Promise<string[]> {
  const result = await requireCloudClient()
    .from("study_daily_totals")
    .select("day")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .gte("day", fromDay);
  throwIfFailed(result);
  return (result.data ?? []).map((r) => r.day as string);
}
