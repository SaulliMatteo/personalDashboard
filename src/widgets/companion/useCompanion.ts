import { createContext, useContext } from "react";
import type { BrainSnapshot } from "./engine/brain";
import type { FaceFrame } from "./engine/animator";
import type { ForegroundApp } from "./engine/appCategory";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export const COMPANION_WIDGET_ID = "companion";

export interface CompanionContextValue {
  snapshot: BrainSnapshot;
  /** App in primo piano riconosciuta (solo Windows, se permesso). */
  foreground: ForegroundApp | null;
  idleSeconds: number;
  /** True se i segnali di sistema (Windows) arrivano davvero. */
  systemSupported: boolean;
  disabled: Set<string>;
  /** Fotogramma all'istante `t` (performance.now). `rect` = dove è disegnato, per guardare il mouse. */
  sampleFrame: (t: number, rect: DOMRect | null) => FaceFrame;
  poke: () => void;
  chatter: () => void;
  previewAnimation: (id: string) => void;
  setAnimationEnabled: (id: string, enabled: boolean) => void;
  /** La pagina di dettaglio lo chiama finché è aperta: tiene vivo il polling anche senza widget in dashboard. */
  retain: () => () => void;
}

export const CompanionContext = createContext<CompanionContextValue | undefined>(undefined);

export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion deve essere usato dentro <CompanionProvider>");
  return ctx;
}
