import { createContext, useContext } from "react";

/* Menu a scomparsa del telefono (la barra laterale del desktop), aperto dal ☰ delle barre in alto. */

export interface DrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const DrawerContext = createContext<DrawerContextValue>({ open: false, setOpen: () => {} });

export function useDrawer() {
  return useContext(DrawerContext);
}
