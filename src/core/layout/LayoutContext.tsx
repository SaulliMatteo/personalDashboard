import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { collides } from "react-grid-layout/core";
import { loadLayout, saveLayout, deleteWidget, type LayoutItem } from "./layoutRepository";
import { finalizeLayout } from "./compactor";
import { GRID_COLS } from "./gridConfig";
import { useSettings } from "../settings/SettingsContext";
import { getMeta, setMeta } from "../db";
import { DEFAULT_LAYOUT, getWidget } from "../../widgets/registry";

const LAYOUT_INITIALIZED_KEY = "layout_initialized";

interface LayoutContextValue {
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

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

function layoutExtent(items: readonly LayoutItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [ready, setReady] = useState(false);

  const rows = Math.max(settings.gridRows, layoutExtent(layout));
  // Ref per l'effect di init (gira una volta sola): legge sempre il valore corrente.
  const configuredRowsRef = useRef(settings.gridRows);
  configuredRowsRef.current = settings.gridRows;

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

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout deve essere usato dentro <LayoutProvider>");
  return ctx;
}
