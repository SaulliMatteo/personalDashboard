import { useEffect, type ReactNode } from "react";
import { useLayout } from "../core/layout/useLayout";
import { hideSplash, setSplashStatus } from "./splash";

// Rete di sicurezza: se il layout non si carica mai (errore già loggato in
// LayoutContext) la splash non deve coprire per sempre l'app.
const FAILSAFE_MS = 10_000;

/**
 * Tiene la splash visibile finché il layout non è pronto: così non si vede
 * mai la dashboard vuota prima dei widget.
 */
function BootGate({ children }: { children: ReactNode }) {
  const { ready } = useLayout();

  useEffect(() => {
    setSplashStatus("Preparo i tuoi widget…");
    const timer = window.setTimeout(hideSplash, FAILSAFE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

  return <>{children}</>;
}

export default BootGate;
