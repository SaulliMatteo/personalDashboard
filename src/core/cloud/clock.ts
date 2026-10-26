import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";

/**
 * Scarto tra l'orologio del server e quello locale (ms): ora del server ≈ Date.now() + scarto.
 * Serve perché i timer degli altri si ricostruiscono da un istante d'inizio: con orologi diversi di qualche
 * minuto sembrerebbero sbagliati. Mezzo tempo di andata e ritorno come stima del ritardo.
 */
export async function measureClockOffset(): Promise<number> {
  const t0 = Date.now();
  const result = await requireCloudClient().rpc("server_now");
  const t1 = Date.now();
  throwIfFailed(result);
  const server = Date.parse(result.data as string);
  if (!Number.isFinite(server)) return 0;
  return Math.round(server - (t0 + t1) / 2);
}
