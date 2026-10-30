/**
 * Configurazione dei Gruppi (docs/GRUPPI.md). URL del progetto e chiave publishable arrivano dalle
 * variabili d'ambiente di Vite: `.env.local` in sviluppo, i Secrets di GitHub nella release. Non sono
 * segrete (le protegge la RLS) ma non stanno nel repo. Se mancano l'app resta in solo locale.
 */

export interface CloudConfig {
  url: string;
  publishableKey: string;
}

/** Dove Supabase rimanda dopo il login Google: deep link registrato da tauri-plugin-deep-link. */
export const AUTH_REDIRECT_URL = "personaldashboard://auth/callback";

/** Nome delle voci nel portachiavi (src-tauri/src/secure_store.rs accetta solo [a-z0-9-]). */
export const AUTH_STORAGE_KEY = "gruppi-auth";

function isValidUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    // http solo per lo stack locale di `supabase start`
    return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function readCloudConfig(): CloudConfig | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
  const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";
  // i segnaposto di .env.example contano come "non configurato"
  if (!isValidUrl(url) || url.includes("your-project-ref") || publishableKey === "" || publishableKey === "your-publishable-key") {
    return null;
  }
  return { url, publishableKey };
}
