import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { requireCloudClient } from "./client";
import { AUTH_REDIRECT_URL } from "./config";
import { CloudError, toCloudError } from "./errors";

/*
 * Login con Google (docs/GRUPPI.md, "Login"): l'URL di autorizzazione si apre nel browser di sistema,
 * mai nella webview; Supabase rimanda a personaldashboard://auth/callback?code=… e il codice si scambia
 * con la sessione (PKCE). La sessione la salva supabase-js nel portachiavi (secureStorage.ts).
 * Codici e token non vanno mai nei log.
 */

/** Apre il login Google nel browser di sistema. */
export async function startGoogleSignIn(): Promise<void> {
  const supabase = requireCloudClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // nessuno scope oltre ai base (openid, email, profile): vedi docs/GRUPPI.md › modalità Testing
    options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw toCloudError(error);
  try {
    await openUrl(data.url);
  } catch {
    throw new CloudError("unknown");
  }
}

export function isAuthCallback(url: string): boolean {
  return url.startsWith(AUTH_REDIRECT_URL);
}

/** Completa il login con l'URL arrivato dal deep link. */
export async function completeSignIn(url: string): Promise<void> {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    throw new CloudError("auth");
  }
  const providerError = params.get("error");
  if (providerError) throw new CloudError(providerError === "access_denied" ? "cancelled" : "auth");
  const code = params.get("code");
  if (!code) throw new CloudError("auth");

  // con più login aperti supabase-js può aggiungere al ritorno l'id del flusso PKCE
  const flowId = params.get("sb_flow_id");
  const { error } = await requireCloudClient().auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (error) throw toCloudError(error);
}

/**
 * Ascolta i deep link: quelli che arrivano con l'app aperta e quello con cui è stata avviata
 * (login completato ad app chiusa). Fuori da Tauri non fa nulla.
 */
export async function listenDeepLinks(handler: (url: string) => void): Promise<() => void> {
  try {
    const unlisten = await onOpenUrl((urls) => urls.forEach(handler));
    (await getCurrent())?.forEach(handler);
    return unlisten;
  } catch {
    return () => {};
  }
}

/** Esce da questo dispositivo: revoca la sessione sul server (se raggiungibile) e la toglie dal portachiavi. */
export async function signOutLocal(): Promise<void> {
  const supabase = requireCloudClient();
  await supabase.removeAllChannels();
  // supabase-js rimuove la sessione locale anche se il server non risponde
  await supabase.auth.signOut({ scope: "local" });
}
