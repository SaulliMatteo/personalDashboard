import {
  createContext,
  useContext,
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { collides } from "react-grid-layout/core";
import {
  loadLayout,
  saveLayout,
  deleteWidget,
  type LayoutItem,
} from "../database/layoutRepository";
import { finalizeLayout, setGridBounds } from "../compactors/freeMovePushCompactor";
import { DEFAULT_LAYOUT } from "../components/setting/widgets/registry";
import { GRID_COLS, GRID_MAX_ROWS } from "../config/gridConfig";
import { initializeDatabase } from "../database/db";

interface LayoutContextValue {
  /** Layout corrente. Vuoto finché `ready` non è true. */
  layout: LayoutItem[];
  /**
   * Setter "grezzo", usato dagli handler di drag della Dashboard (che
   * durante l'interazione aggiornano lo stato ad ogni frame prima di
   * salvare). Il catalogo widget non dovrebbe usarlo direttamente: usa
   * addWidget/removeWidget, che tengono anche il DB allineato.
   */
  setLayout: Dispatch<SetStateAction<LayoutItem[]>>;
  /** True quando il layout iniziale è stato caricato dal DB (dopo l'eventuale migrazione). */
  ready: boolean;
  /**
   * Cerca la prima cella libera per una taglia data, scandendo la griglia
   * riga per riga. Ritorna null se non c'è spazio. Usata sia da addWidget
   * sia dal catalogo per mostrare se un widget è aggiungibile o no.
   */
  findFreeSlot: (size: { w: number; h: number }) => { x: number; y: number } | null;
  /**
   * Aggiunge un widget nella prima posizione libera per la taglia scelta.
   * Ritorna false (senza modificare nulla) se il widget è già presente o
   * se non c'è spazio: il chiamante (il catalogo) decide cosa mostrare
   * in quel caso.
   */
  addWidget: (id: string, size: { w: number; h: number }) => Promise<boolean>;
  /** Rimuove un widget dalla dashboard (e dal DB). */
  removeWidget: (id: string) => Promise<void>;
  /** Riporta il layout alla disposizione di default. */
  resetLayout: () => Promise<void>;
}

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [ready, setReady] = useState(false);

  // Righe massime fisse per ora (vedi gridConfig.ts): comunicate una sola
  // volta al compactor, che le usa per bloccare drag e push entro il
  // limite invece di lasciar crescere la griglia all'infinito.
  useEffect(() => {
    setGridBounds(GRID_MAX_ROWS);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Attendiamo ESPLICITAMENTE che il DB sia pronto (tabella creata
        // + eventuale migrazione/azzeramento completati) prima di
        // leggere il layout salvato. Le due cose partono da effect React
        // diversi (questo e quello di App.tsx): senza questo await, in
        // caso di ordine sfavorevole potremmo leggere la tabella prima
        // che l'azzeramento una tantum sia avvenuto.
        await initializeDatabase();

        const savedLayout = await loadLayout();
        const source = savedLayout.length > 0 ? savedLayout : DEFAULT_LAYOUT;
        // Passa SEMPRE il layout attraverso finalizeLayout prima di
        // metterlo in stato: se per qualunque motivo fosse rimasto
        // salvato uno stato con overlap, si autocorregge qui una volta
        // sola, invece di aspettare che l'utente trascini qualcosa.
        const healed = finalizeLayout(source, GRID_COLS) as LayoutItem[];
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
    for (let y = 0; y + size.h <= GRID_MAX_ROWS; y++) {
      for (let x = 0; x + size.w <= GRID_COLS; x++) {
        const candidate: LayoutItem = { i: "__candidate__", x, y, w: size.w, h: size.h };
        const blocked = currentLayout.some((item) => collides(candidate, item));
        if (!blocked) return { x, y };
      }
    }
    return null;
  }

  async function addWidget(id: string, size: { w: number; h: number }): Promise<boolean> {
    if (layout.some((item) => item.i === id)) return false; // già presente
    const slot = findFreeSlot(size);
    if (!slot) return false; // nessuno spazio libero per questa taglia

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
    const healed = finalizeLayout(DEFAULT_LAYOUT, GRID_COLS) as LayoutItem[];
    setLayout(healed);
    await saveLayout(healed);
  }

  return (
    <LayoutContext.Provider
      value={{ layout, setLayout, ready, findFreeSlot, addWidget, removeWidget, resetLayout }}
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
