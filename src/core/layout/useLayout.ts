import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LayoutItem } from "./layoutRepository";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export interface LayoutContextValue {
  /** Layout corrente. Vuoto finché `ready` non è true. */
  layout: LayoutItem[];
  /**
   * Setter "grezzo", usato dagli handler di drag della Dashboard. Il
   * catalogo widget non dovrebbe usarlo: usa addWidget/removeWidget,
   * che tengono anche il DB allineato.
   */
  setLayout: Dispatch<SetStateAction<LayoutItem[]>>;
  /**
   * Righe effettive della griglia: quelle impostate, ma mai meno di quelle
   * già occupate (abbassare l'impostazione non deve far sovrapporre i widget).
   */
  rows: number;
  /** True quando il layout iniziale è stato caricato dal DB. */
  ready: boolean;
  /** Prima cella libera per una taglia data (riga per riga), o null se non c'è spazio. */
  findFreeSlot: (size: { w: number; h: number }) => { x: number; y: number } | null;
  /** Aggiunge un widget nella prima posizione libera. False se già presente o senza spazio. */
  addWidget: (id: string, size: { w: number; h: number }) => Promise<boolean>;
  removeWidget: (id: string) => Promise<void>;
  /** Riporta il layout alla disposizione di default. */
  resetLayout: () => Promise<void>;
}

export const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout deve essere usato dentro <LayoutProvider>");
  return ctx;
}
