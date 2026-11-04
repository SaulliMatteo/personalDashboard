import { useEffect, useState, type ReactNode } from "react";
import { getMeta, setMeta } from "../db";
import { DEFAULT_LAYOUT, getWidget } from "../../widgets/registry";
import {
  MAX_PAGES,
  addItem,
  firstFree,
  moveItem,
  packLayout,
  pageCount,
  phoneSizeFor,
  phoneSizes,
  removeItem,
  resizeItem,
  sanitizeLayout,
  trimEmptyPages,
  type Cell,
  type MobileItem,
  type Size,
} from "./mobileLayout";
import { loadMobileLayout, saveMobileLayout } from "./mobileLayoutRepository";
import { useCompact } from "./useCompact";
import { MobileLayoutContext } from "./useMobileLayout";

const MOBILE_LAYOUT_INITIALIZED_KEY = "mobile_layout_initialized";

function sizesOf(id: string): Size[] | null {
  const widget = getWidget(id);
  return widget ? phoneSizes(widget.sizes) : null;
}

/** Layout di partenza del telefono: quello di default del desktop, in ordine di lettura, con le taglie tradotte. */
function defaultMobileLayout(): MobileItem[] {
  const ordered = [...DEFAULT_LAYOUT].sort((a, b) => a.y - b.y || a.x - b.x);
  return packLayout(ordered.flatMap((item) => {
    const allowed = sizesOf(item.i);
    return allowed ? [{ id: item.i, size: phoneSizeFor(item, allowed) }] : [];
  }));
}

/**
 * Layout della dashboard sul telefono (core/layout/mobileLayout.ts), separato da quello del desktop.
 * Si carica solo quando la finestra è compatta: sul desktop non legge né scrive niente.
 */
export function MobileLayoutProvider({ children }: { children: ReactNode }) {
  const compact = useCompact();
  const [items, setItems] = useState<MobileItem[]>([]);
  const [ready, setReady] = useState(false);
  // pagine vuote aggiunte in modifica: si mostrano finché la modifica non finisce
  const [minPages, setMinPages] = useState(0);

  useEffect(() => {
    if (!compact || ready) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = sanitizeLayout(await loadMobileLayout(), sizesOf);
        // Layout vuoto = l'utente ha tolto tutto: il default solo al primo avvio sul telefono.
        const initialized = (await getMeta(MOBILE_LAYOUT_INITIALIZED_KEY)) === "1";
        const next = saved.length > 0 || initialized ? saved : defaultMobileLayout();
        await saveMobileLayout(next);
        if (!initialized) await setMeta(MOBILE_LAYOUT_INITIALIZED_KEY, "1");
        if (!cancelled) {
          setItems(next);
          setReady(true);
        }
      } catch (error) {
        console.error("Errore nel caricamento del layout del telefono:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compact, ready]);

  function commit(next: MobileItem[]) {
    setItems(next);
    saveMobileLayout(next).catch((error) => console.error("Errore nel salvataggio del layout del telefono:", error));
  }

  const pages = Math.min(MAX_PAGES, Math.max(pageCount(items), minPages));

  const value = {
    items,
    ready,
    pages,
    sizesOf,
    hasRoomFor: (size: Size) => firstFree(size, items) !== null,
    addWidget: async (id: string, size: Size) => {
      const next = addItem(items, id, size);
      if (!next) return false;
      commit(next);
      return true;
    },
    removeWidget: async (id: string) => commit(removeItem(items, id)),
    moveWidget: async (id: string, target: Cell) => commit(moveItem(items, id, target)),
    resizeWidget: async (id: string, size: Size) => commit(resizeItem(items, id, size)),
    addPage: () => {
      if (pages >= MAX_PAGES) return null;
      setMinPages(pages + 1);
      return pages;
    },
    finishEditing: async () => {
      setMinPages(0);
      commit(trimEmptyPages(items));
    },
    resetLayout: async () => {
      setMinPages(0);
      commit(defaultMobileLayout());
    },
  };

  return <MobileLayoutContext.Provider value={value}>{children}</MobileLayoutContext.Provider>;
}
