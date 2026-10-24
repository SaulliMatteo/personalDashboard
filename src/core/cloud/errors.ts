import { isAuthApiError, isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { SecureStorageError } from "./secureStorage";

/**
 * Errori dei Gruppi con un codice nostro e una frase fissa da mostrare. Il testo che arriva dal server
 * o dal portachiavi non va mai in UI né nei log (potrebbe contenere dettagli della richiesta).
 */
export type CloudErrorCode =
  | "unconfigured"
  | "unavailable"
  | "unreachable"
  | "auth"
  | "cancelled"
  | "invalid_username"
  | "username_taken"
  | "profile_required"
  | "not_owner"
  | "not_member"
  | "invalid_group"
  | "unknown";

const MESSAGES: Record<CloudErrorCode, string> = {
  unconfigured: "Gruppi non configurati.",
  unavailable: "Il portachiavi del sistema non è disponibile: i Gruppi non si possono usare su questo computer.",
  unreachable: "Gruppi non raggiungibili. Controlla la connessione: riprovo da solo.",
  auth: "Accesso non riuscito. Riprova.",
  cancelled: "Accesso annullato.",
  invalid_username: "Nome utente non valido.",
  username_taken: "Questo nome utente è già preso.",
  profile_required: "Prima scegli un nome utente.",
  not_owner: "Solo il proprietario del gruppo può farlo.",
  not_member: "Non fai più parte di questo gruppo.",
  invalid_group: "Nome (da 1 a 40 caratteri) o descrizione (al massimo 200) non validi.",
  unknown: "Qualcosa è andato storto. Riprova.",
};

export class CloudError extends Error {
  readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode) {
    super(MESSAGES[code]);
    this.name = "CloudError";
    this.code = code;
  }
}

/** Codici-messaggio sollevati dalle funzioni del database (supabase/migrations). */
const SERVER_CODES: Partial<Record<string, CloudErrorCode>> = {
  invalid_username: "invalid_username",
  username_taken: "username_taken",
  profile_required: "profile_required",
  not_authenticated: "auth",
  not_owner: "not_owner",
  not_member: "not_member",
  cannot_remove_self: "not_owner",
};

/** Vincoli della tabella groups violati (nome o descrizione fuori misura). */
function isGroupConstraint(message: string): boolean {
  return /groups_name_length|groups_description_length/.test(message);
}

function isNetworkMessage(message: string): boolean {
  // "abort": la richiesta scaduta dopo il tempo massimo di client.ts
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|abort/i.test(message);
}

/** Risposta di PostgREST (select/rpc): `error` più lo stato HTTP. */
export interface QueryResult {
  error: { message: string } | null;
  status: number;
}

/** Lancia un CloudError se la query è fallita. */
export function throwIfFailed(result: QueryResult): void {
  if (!result.error) return;
  const { message } = result.error;
  if (result.status === 0 || result.status >= 500 || isNetworkMessage(message)) {
    // 0 = nessuna risposta; 5xx = servizio giù o progetto in pausa
    throw new CloudError("unreachable");
  }
  if (result.status === 401) throw new CloudError("auth");
  if (isGroupConstraint(message)) throw new CloudError("invalid_group");
  throw new CloudError(SERVER_CODES[message] ?? "unknown");
}

export function toCloudError(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  if (e instanceof SecureStorageError) return new CloudError("unavailable");
  if (isAuthRetryableFetchError(e)) return new CloudError("unreachable");
  if (isAuthApiError(e)) return new CloudError(e.status >= 500 ? "unreachable" : "auth");
  if (isAuthError(e)) return new CloudError("auth");
  if (e instanceof Error && isNetworkMessage(e.message)) return new CloudError("unreachable");
  return new CloudError("unknown");
}
