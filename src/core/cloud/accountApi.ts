import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";

/* Profilo e account: tabelle e RPC del nucleo (supabase/migrations/…_nucleo.sql). */

/** Nome utente salvato, oppure null se l'account non l'ha ancora scelto (primo accesso). */
export async function fetchUsername(userId: string): Promise<string | null> {
  const result = await requireCloudClient().from("profiles").select("username").eq("id", userId).maybeSingle();
  throwIfFailed(result);
  return (result.data?.username as string | undefined) ?? null;
}

/** Crea il profilo o cambia il nome; restituisce il nome come l'ha salvato il server. */
export async function saveUsername(name: string): Promise<string> {
  const result = await requireCloudClient().rpc("set_username", { p_username: name });
  throwIfFailed(result);
  return result.data as string;
}

/** Cancella l'account sul server (profilo, dispositivi, iscrizioni, totali). I dati locali restano. */
export async function deleteAccountOnServer(): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("delete_account"));
}

export type DevicePlatform = "windows" | "macos" | "linux";

/** Sistema di questo computer, come lo vuole la tabella `devices`. */
function devicePlatform(): DevicePlatform {
  const agent = navigator.userAgent;
  if (/windows/i.test(agent)) return "windows";
  if (/mac os|macintosh/i.test(agent)) return "macos";
  return "linux";
}

/** Registra (o aggiorna) questo computer tra i dispositivi dell'account: serve prima di inviare dati. */
export async function touchDevice(deviceId: string): Promise<void> {
  throwIfFailed(
    await requireCloudClient().rpc("touch_device", { p_device_id: deviceId, p_platform: devicePlatform() })
  );
}

/** "Sono connesso adesso": l'ora la mette il server. Su questa si basa il "visto 5 min fa" dei compagni. */
export async function markSeen(): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("mark_seen"));
}

/** Ultima volta che gli utenti indicati sono stati connessi (ms, ora del server). Solo compagni di gruppo. */
export async function fetchLastSeen(userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const result = await requireCloudClient().from("last_seen").select("user_id, seen_at").in("user_id", userIds);
  throwIfFailed(result);
  const seen: Record<string, number> = {};
  for (const r of result.data ?? []) seen[r.user_id as string] = Date.parse(r.seen_at as string);
  return seen;
}
