import { createContext, useContext, useEffect } from "react";
import type { SysmonCapabilities, SysmonSnapshot } from "./data/sysmonApi";
import type { SysmonHistory } from "./lib/history";
import type { MetricId } from "./lib/metrics";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export const SYSMON_WIDGET_ID = "sysmon";

export interface SysmonContextValue {
  /** False sul telefono e nel browser: lì il widget mostra solo il messaggio e non si chiama nessun comando. */
  available: boolean;
  /** Cosa si legge su questa macchina; null finché non arriva la risposta. */
  capabilities: SysmonCapabilities | null;
  /** Ultima misura; null prima della prima (o se nessuno è iscritto da quando l'app è aperta). */
  snapshot: SysmonSnapshot | null;
  /** Ultimi 60 s, solo in memoria. */
  history: SysmonHistory;
  /** Se la metrica si legge qui (il dialog disattiva le altre). */
  isAvailable: (id: MetricId) => boolean;
  /** Usato da `useSysmonFeed`: iscrive un utilizzatore e restituisce la funzione per toglierlo. */
  acquire: (detail: boolean) => () => void;
}

export const SysmonContext = createContext<SysmonContextValue | undefined>(undefined);

export function useSysmon() {
  const ctx = useContext(SysmonContext);
  if (!ctx) throw new Error("useSysmon deve essere usato dentro <SysmonProvider>");
  return ctx;
}

/**
 * Il componente che lo chiama riceve le misure finché è montato: il widget in dashboard (`detail` falso) e la
 * pagina di dettaglio (`detail` vero, che aggiunge tutti i processi e la CPU per thread). Senza nessuno iscritto
 * il campionatore in Rust è fermo.
 */
export function useSysmonFeed(detail: boolean): SysmonContextValue {
  const ctx = useSysmon();
  const { acquire } = ctx;
  useEffect(() => acquire(detail), [acquire, detail]);
  return ctx;
}
