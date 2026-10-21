import { createContext, useContext } from "react";
import type { BrainSnapshot } from "./engine/brain";
import type { FaceFrame } from "./engine/animator";
import type { AppCategory, ForegroundApp } from "./engine/appCategory";
import type { PoseId } from "./engine/poses";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export const COMPANION_WIDGET_ID = "companion";

/** Un'app vista di recente in primo piano (solo in memoria, mai salvata). */
export interface SeenApp {
  processKey: string;
  label: string;
  /** Cosa ha capito da solo; la scelta dell'utente, se c'è, sta in `appChoices`. */
  autoCategory: AppCategory;
}

export interface CompanionContextValue {
  snapshot: BrainSnapshot;
  /** App in primo piano riconosciuta (solo Windows, se permesso). */
  foreground: ForegroundApp | null;
  idleSeconds: number;
  /** True se i segnali di sistema (Windows) arrivano davvero. */
  systemSupported: boolean;
  /** Ultime app viste in primo piano, la più recente prima. */
  seenApps: SeenApp[];
  /** Categorie scelte a mano, per processo. */
  appChoices: ReadonlyMap<string, AppCategory>;
  /** Sceglie la categoria di un'app (null = torna a quella automatica). */
  setAppCategory: (processKey: string, category: AppCategory | null) => void;
  disabled: Set<string>;
  /** Fotogramma all'istante `t` (performance.now). `rect` = dove è disegnato, per guardare il mouse. */
  sampleFrame: (t: number, rect: DOMRect | null) => FaceFrame;
  poke: () => void;
  chatter: () => void;
  previewAnimation: (id: string) => void;
  /** Mostra una posa per qualche secondo (galleria della pagina di dettaglio). */
  previewPose: (pose: PoseId, durationMs?: number) => void;
  /** Accende o spegne una o più animazioni in un colpo solo. */
  setAnimationEnabled: (id: string | string[], enabled: boolean) => void;
  /** La pagina di dettaglio lo chiama finché è aperta: tiene vivo il polling anche senza widget in dashboard. */
  retain: () => () => void;
}

export const CompanionContext = createContext<CompanionContextValue | undefined>(undefined);

export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion deve essere usato dentro <CompanionProvider>");
  return ctx;
}
