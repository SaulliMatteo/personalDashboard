import { useState, useEffect, type ReactNode } from "react";
import { collides } from "react-grid-layout/core";
import { loadLayout, saveLayout, deleteWidget, type LayoutItem } from "./layoutRepository";
import { finalizeLayout } from "./compactor";
import { GRID_COLS } from "./gridConfig";
import { useSettings } from "../settings/useSettings";
import { useLatestRef } from "../hooks/useLatestRef";
import { getMeta, setMeta } from "../db";
import { DEFAULT_LAYOUT, getWidget } from "../../widgets/registry";
import { LayoutContext } from "./useLayout";

const LAYOUT_INITIALIZED_KEY = "layout_initialized";

function layoutExtent(items: readonly LayoutItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [ready, setReady] = useState(false);

  const rows = Math.max(settings.gridRows, layoutExtent(layout));
  // Ref per l'effect di init (gira una volta sola): legge sempre il valore corrente.
  const configuredRowsRef = useLatestRef(settings.gridRows);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Ignora righe di widget non più presenti nel registry: restarebbero
        // invisibili ma occuperebbero spazio nella griglia.
        const saved = (await loadLayout()).filter((item) => getWidget(item.i) !== undefined);

        // "Layout vuoto" è uno stato valido (l'utente ha tolto tutti i
        // widget): il default si usa solo al PRIMO avvio, tracciato da un flag.
        const initialized = (await getMeta(LAYOUT_INITIALIZED_KEY)) === "1";
        const source = saved.length > 0 || initialized ? saved : DEFAULT_LAYOUT;

        // Il layout passa SEMPRE da finalizeLayout: se fosse rimasto salvato
        // uno stato con overlap, si autocorregge qui.
        const initRows = Math.max(configuredRowsRef.current, layoutExtent(source));
        const healed = finalizeLayout(source, GRID_COLS, initRows) as LayoutItem[];

        if (!initialized) {
          await saveLayout(healed);
          await setMeta(LAYOUT_INITIALIZED_KEY, "1");
        }

        if (!cancelled) {
          setLayout(healed);
          setReady(true);
        }
      } catch (error) {
        console.error("Errore nel caricamento del layout:", error);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  function findFreeSlot(
    size: { w: number; h: number },
    currentLayout: LayoutItem[] = layout
  ): { x: number; y: number } | null {
    for (let y = 0; y + size.h <= rows; y++) {
      for (let x = 0; x + size.w <= GRID_COLS; x++) {
        const candidate: LayoutItem = { i: "__candidate__", x, y, w: size.w, h: size.h };
        if (!currentLayout.some((item) => collides(candidate, item))) return { x, y };
      }
    }
    return null;
  }

  async function addWidget(id: string, size: { w: number; h: number }): Promise<boolean> {
    if (layout.some((item) => item.i === id)) return false;
    const slot = findFreeSlot(size);
    if (!slot) return false;

    const next = [...layout, { i: id, x: slot.x, y: slot.y, w: size.w, h: size.h }];
    setLayout(next);
    await saveLayout(next);
    return true;
  }

  async function removeWidget(id: string) {
    setLayout((prev) => prev.filter((item) => item.i !== id));
    await deleteWidget(id);
  }

  async function resetLayout() {
    const healed = finalizeLayout(DEFAULT_LAYOUT, GRID_COLS, Math.max(settings.gridRows, layoutExtent(DEFAULT_LAYOUT))) as LayoutItem[];
    setLayout(healed);
    await saveLayout(healed);
  }

  return (
    <LayoutContext.Provider
      value={{ layout, setLayout, rows, ready, findFreeSlot, addWidget, removeWidget, resetLayout }}
    >
      {children}
    </LayoutContext.Provider>
  );
}
