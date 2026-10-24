import type { ReactNode } from "react";

/** Una voce del menu "/" (components/InsertMenu.tsx). */
export interface InsertItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** A destra: scorciatoia o suggerimento. */
  hint?: string;
  /** Altre parole con cui trovarla scrivendo dopo "/". */
  keywords?: string;
}

/** Voci che corrispondono a quello che si è scritto dopo "/". */
export function filterInsertItems(items: InsertItem[], query: string): InsertItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(q));
}
