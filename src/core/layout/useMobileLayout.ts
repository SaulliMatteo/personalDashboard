import { createContext, useContext } from "react";
import type { Cell, MobileItem, Size } from "./mobileLayout";

/* Contesto e hook separati dal provider (come useLayout.ts). */

export interface MobileLayoutContextValue {
  /** Layout del telefono. Vuoto finché `ready` non è true (e finché la finestra non è compatta). */
  items: MobileItem[];
  ready: boolean;
  /** Pagine da mostrare: quelle in uso, più quelle vuote aggiunte in modifica. */
  pages: number;
  /** Taglie del telefono per un widget (null se il widget non c'è più). */
  sizesOf: (id: string) => Size[] | null;
  /** True se `size` ha un posto libero in qualche pagina. */
  hasRoomFor: (size: Size) => boolean;
  /** Nel primo posto libero. False se c'è già o non c'è posto. */
  addWidget: (id: string, size: Size) => Promise<boolean>;
  removeWidget: (id: string) => Promise<void>;
  moveWidget: (id: string, target: Cell) => Promise<void>;
  resizeWidget: (id: string, size: Size) => Promise<void>;
  /** Una pagina vuota in fondo (in modifica), se non si è già al massimo. Torna il suo indice o null. */
  addPage: () => number | null;
  /** Fine della modifica: via le pagine vuote. */
  finishEditing: () => Promise<void>;
  /** Il layout di partenza del telefono (Impostazioni > Dashboard > Ripristina, sul telefono). */
  resetLayout: () => Promise<void>;
}

export const MobileLayoutContext = createContext<MobileLayoutContextValue | undefined>(undefined);

export function useMobileLayout() {
  const ctx = useContext(MobileLayoutContext);
  if (!ctx) throw new Error("useMobileLayout deve essere usato dentro <MobileLayoutProvider>");
  return ctx;
}
