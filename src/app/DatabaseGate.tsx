import { useEffect, useState, type ReactNode } from "react";
import { initializeDatabase } from "../core/db";

type GateState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

/**
 * Non monta NESSUN provider finché le migrazioni del DB non sono
 * terminate. Elimina alla radice le race tra "chi legge una tabella" e
 * "chi la crea" (gli effect dei figli girano prima di quelli del padre).
 */
function DatabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    initializeDatabase()
      .then(() => {
        if (!cancelled) setState({ status: "ready" });
      })
      .catch((error) => {
        console.error("Errore nell'inizializzazione del database:", error);
        if (!cancelled) setState({ status: "error", message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "ready") return <>{children}</>;
  if (state.status === "loading") return null;

  return (
    <div style={{ padding: 32, color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 18 }}>Impossibile aprire il database</h1>
      <p style={{ color: "var(--text-muted)" }}>{state.message}</p>
    </div>
  );
}

export default DatabaseGate;
