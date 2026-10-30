import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { retryDelayMs } from "./backoff";
import { deleteAccountOnServer, fetchUsername, markSeen, saveUsername } from "./accountApi";
import { completeSignIn, isAuthCallback, listenDeepLinks, signOutLocal, startGoogleSignIn } from "./auth";
import { getCloudClient } from "./client";
import { AUTH_STORAGE_KEY } from "./config";
import { toCloudError } from "./errors";
import { secureStorage } from "./secureStorage";
import { CloudContext, type CloudContextValue, type CloudStatus } from "./useCloud";

/** Ogni quanto si dice al server "sono connesso" (il "visto 5 min fa" dei compagni ha questa precisione). */
const SEEN_INTERVAL_MS = 5 * 60_000;

/**
 * Stato dell'account dei Gruppi: sessione, profilo, login col deep link, nuovi tentativi quando il
 * servizio non è raggiungibile. Senza configurazione resta "unconfigured" e non fa nulla.
 */
export function CloudProvider({ children }: { children: ReactNode }) {
  const supabase = getCloudClient();
  const [status, setStatus] = useState<CloudStatus>(supabase ? { kind: "loading" } : { kind: "unconfigured" });
  const [userId, setUserId] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const signingInRef = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const setSigning = useCallback((value: boolean) => {
    signingInRef.current = value;
    setSigningIn(value);
  }, []);

  /** Rilegge sessione e profilo e decide lo stato. */
  const refresh = useCallback(async () => {
    if (!supabase) return;
    window.clearTimeout(retryTimer.current);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!session) {
        failures.current = 0;
        setUserId(null);
        setStatus({ kind: "signedOut" });
        return;
      }
      setUserId(session.user.id);
      const username = await fetchUsername(session.user.id);
      failures.current = 0;
      setStatus(username ? { kind: "ready", username } : { kind: "needsUsername" });
    } catch (e) {
      const err = toCloudError(e);
      if (err.code === "unavailable") {
        setStatus({ kind: "unavailable" });
      } else if (err.code === "auth") {
        // sessione non più valida (revocata, account eliminato altrove): via quella locale
        await signOutLocal().catch(() => {});
        setUserId(null);
        setStatus({ kind: "signedOut" });
      } else {
        setStatus({ kind: "unreachable" });
        retryTimer.current = window.setTimeout(() => void refreshRef.current(), retryDelayMs(failures.current));
        failures.current += 1;
      }
    }
  }, [supabase]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Avvio: prima si verifica che il portachiavi ci sia, poi sessione e profilo.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        await secureStorage.getItem(AUTH_STORAGE_KEY);
      } catch {
        if (!cancelled) setStatus({ kind: "unavailable" });
        return;
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer.current);
    };
  }, [supabase, refresh]);

  // Login, logout e cambi di sessione fatti da supabase-js (es. rinnovo fallito).
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // fuori dalla callback: supabase-js consiglia di non chiamarlo dentro
        window.setTimeout(() => void refreshRef.current(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // Ritorno dal browser con personaldashboard://auth/callback.
  useEffect(() => {
    if (!supabase) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void listenDeepLinks((url) => {
      if (!isAuthCallback(url)) return;
      completeSignIn(url)
        .then(() => {
          setSigning(false);
          setSignInError(null);
          return refreshRef.current();
        })
        .catch((e: unknown) => {
          // un link arrivato senza un login in corso (es. vecchio) si ignora in silenzio
          if (signingInRef.current) setSignInError(toCloudError(e).message);
          setSigning(false);
        });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [supabase, setSigning]);

  // Connesso con il nome scelto: "visto adesso", poi ogni 5 minuti. Un errore qui non cambia lo stato:
  // se il servizio non risponde se ne accorgono l'account e i moduli.
  const ready = status.kind === "ready";
  useEffect(() => {
    if (!ready) return;
    const mark = () => void markSeen().catch(() => {});
    mark();
    const interval = window.setInterval(mark, SEEN_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ready]);

  // Torna la rete: si riprova subito invece di aspettare il prossimo tentativo.
  useEffect(() => {
    if (!supabase) return;
    const onOnline = () => {
      failures.current = 0;
      void refreshRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [supabase]);

  const signIn = useCallback(async () => {
    setSignInError(null);
    setSigning(true);
    try {
      await startGoogleSignIn();
    } catch (e) {
      setSigning(false);
      setSignInError(toCloudError(e).message);
    }
  }, [setSigning]);

  const cancelSignIn = useCallback(() => {
    setSigning(false);
    setSignInError(null);
  }, [setSigning]);

  const setUsername = useCallback(async (name: string) => {
    try {
      const saved = await saveUsername(name);
      setStatus({ kind: "ready", username: saved });
    } catch (e) {
      throw toCloudError(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutLocal();
    } catch (e) {
      throw toCloudError(e);
    }
    failures.current = 0;
    window.clearTimeout(retryTimer.current);
    setUserId(null);
    setStatus({ kind: "signedOut" });
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      await deleteAccountOnServer();
      await signOutLocal();
    } catch (e) {
      throw toCloudError(e);
    }
    setUserId(null);
    setStatus({ kind: "signedOut" });
  }, []);

  const retry = useCallback(() => {
    failures.current = 0;
    void refreshRef.current();
  }, []);

  const value = useMemo<CloudContextValue>(
    () => ({ status, userId, signingIn, signInError, signIn, cancelSignIn, setUsername, signOut, deleteAccount, retry }),
    [status, userId, signingIn, signInError, signIn, cancelSignIn, setUsername, signOut, deleteAccount, retry]
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

