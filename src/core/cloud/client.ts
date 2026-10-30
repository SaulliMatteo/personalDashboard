import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY, readCloudConfig } from "./config";
import { CloudError } from "./errors";
import { secureStorage } from "./secureStorage";

/*
 * L'unico punto dell'app che crea il client Supabase. Il resto dell'app non importa
 * @supabase/supabase-js: passa da core/cloud (così il backend si può cambiare).
 */

let client: SupabaseClient | null | undefined;

/** Oltre questo tempo senza risposta la richiesta fallisce e i Gruppi risultano "non raggiungibili". */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * fetch con un tempo massimo: una rete che accetta la connessione ma non risponde lascerebbe l'app
 * per sempre in attesa. (AbortController a mano: AbortSignal.any/timeout mancano nelle WebKit vecchie.)
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timer));
};

/** null se i Gruppi non sono configurati (mancano le variabili d'ambiente). */
export function getCloudClient(): SupabaseClient | null {
  if (client === undefined) {
    const config = readCloudConfig();
    client = config
      ? createClient(config.url, config.publishableKey, {
          global: { fetch: fetchWithTimeout },
          auth: {
            // PKCE: il codice che torna dal deep link vale solo con il verificatore salvato qui
            flowType: "pkce",
            storage: secureStorage,
            storageKey: AUTH_STORAGE_KEY,
            persistSession: true,
            autoRefreshToken: true,
            // il login non torna in questa pagina ma dal deep link
            detectSessionInUrl: false,
          },
        })
      : null;
  }
  return client;
}

export function requireCloudClient(): SupabaseClient {
  const supabase = getCloudClient();
  if (!supabase) throw new CloudError("unconfigured");
  return supabase;
}
