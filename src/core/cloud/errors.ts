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
  | "invalid_subject_name"
  | "subject_exists"
  | "subject_limit"
  | "rate_limited"
  | "invalid_subject"
  | "not_friend"
  | "no_request"
  | "not_author"
  | "invalid_message"
  | "message_too_long"
  | "payload_too_large"
  | "dm_rate_limited"
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
  invalid_subject_name: "Nome della materia non valido (da 1 a 40 caratteri, con almeno una lettera o una cifra).",
  subject_exists: "Nel gruppo c'è già una materia con questo nome.",
  subject_limit: "Il gruppo ha già 50 materie: il proprietario può unirle o eliminarne qualcuna.",
  rate_limited: "Troppe materie create di seguito. Riprova tra un po'.",
  invalid_subject: "Questa materia del gruppo non esiste più.",
  not_friend: "Non siete più amici.",
  no_request: "Questa richiesta di amicizia non c'è più.",
  not_author: "Puoi eliminare solo i tuoi messaggi.",
  invalid_message: "Messaggio vuoto o non valido.",
  message_too_long: "Messaggio troppo lungo (al massimo 500 caratteri).",
  payload_too_large: "Contenuto troppo grande da inviare (al massimo 512 KB).",
  dm_rate_limited: "Troppi messaggi di seguito: aspetta un minuto.",
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
  subject_exists: "subject_exists",
  subject_limit: "subject_limit",
  rate_limited: "rate_limited",
  invalid_subject: "invalid_subject",
  not_friend: "not_friend",
  no_request: "no_request",
  not_author: "not_author",
  invalid_message: "invalid_message",
  message_too_long: "message_too_long",
  payload_too_large: "payload_too_large",
};

/** Vincoli della tabella groups violati (nome o descrizione fuori misura). */
function isGroupConstraint(message: string): boolean {
  return /groups_name_length|groups_description_length/.test(message);
}

/** Vincoli della tabella group_subjects violati (nome fuori misura o senza lettere né cifre). */
function isSubjectNameConstraint(message: string): boolean {
  return /group_subjects_name_length|group_subjects_name_key/.test(message);
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
  if (isSubjectNameConstraint(message)) throw new CloudError("invalid_subject_name");
  // vincoli di direct_messages (tipo della scheda non valido…)
  if (/direct_messages_/.test(message)) throw new CloudError("invalid_message");
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
