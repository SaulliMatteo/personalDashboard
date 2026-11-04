import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Sidebar from "../features/sidebar/Sidebar";
import RoomNavItem from "../social/room/RoomNavItem";
import CompactBar from "../ui/CompactBar";
import { useCompact } from "../core/layout/useCompact";
import { runBackHandler, useBackHandler } from "../core/nav/backHandlers";
import { DrawerContext } from "../core/nav/useDrawer";
import { useNav } from "../core/nav/useNav";
import "./shell.css";

/** Barra in alto di una vista sul telefono (la dashboard ha la sua, con la matita). */
export interface CompactBarSpec {
  title: string;
  subtitle?: string;
  /** "menu": ☰ apre il menu; "back": ← torna alla dashboard. */
  lead: "menu" | "back";
}

/** La voce "Widget" (il catalogo) del menu del telefono: sul desktop il catalogo si apre dalla griglia. */
function CatalogNavItem() {
  const { view, goToCatalog } = useNav();
  const active = view.type === "catalog";
  return (
    <button
      type="button"
      className={`nav-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={goToCatalog}
    >
      <span className="nav-item-dot" aria-hidden="true" />
      Widget
    </button>
  );
}

/**
 * Guscio comune a tutte le viste: la sidebar (con il modale Settings)
 * resta sempre montata, cambia solo il contenuto di .main.
 * Tema, accent e animazioni sono gestiti su <html> da SettingsProvider.
 * `scroll={false}`: .main non scorre (la vista sta tutta nella finestra, es. la Stanza comune).
 * Sul telefono (useCompact) la sidebar diventa un menu a scomparsa e in alto c'è la barra `compactBar`
 * (docs/design/mobile/viste.html).
 */
function AppShell({ children, scroll = true, compactBar }: { children: ReactNode; scroll?: boolean; compactBar?: CompactBarSpec }) {
  const compact = useCompact();
  const { goToDashboard } = useNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useMemo(() => ({ open: drawerOpen && compact, setOpen: setDrawerOpen }), [drawerOpen, compact]);

  // data-compact su <html>: i CSS dei componenti cambiano forma sul telefono con :root[data-compact].
  useEffect(() => {
    const root = document.documentElement;
    if (compact) root.dataset.compact = "";
    else delete root.dataset.compact;
  }, [compact]);

  useBackHandler(drawer.open, () => setDrawerOpen(false));

  const deco = (
    /* Decorazione di sfondo del tema (oggi solo Fosforo: due cerchi). */
    <div className="app-deco" aria-hidden="true">
      <span className="app-deco-fill" />
      <span className="app-deco-ring" />
    </div>
  );
  const mainClass = scroll ? "main" : "main main--fixed";

  if (!compact) {
    return (
      <div className="app">
        {deco}
        <Sidebar extraNav={<RoomNavItem />} />
        <main className={mainClass}>{children}</main>
      </div>
    );
  }

  // Una voce del menu chiude il menu (la vista cambia da sé).
  const closeOnNav = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) setDrawerOpen(false);
  };

  return (
    <DrawerContext.Provider value={drawer}>
      <div className="app app--compact">
        {deco}
        <main className={mainClass}>
          {compactBar && (
            <CompactBar
              lead={compactBar.lead}
              // ← fa come l'indietro di Android: prima chiude ciò che la pagina ha aperto (backHandlers.ts)
              onLead={compactBar.lead === "menu" ? () => setDrawerOpen(true) : () => runBackHandler() || goToDashboard()}
              title={compactBar.title}
              subtitle={compactBar.subtitle}
            />
          )}
          {children}
        </main>
        <div className={`app-drawer-scrim${drawer.open ? " open" : ""}`} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        {/* inert da chiuso: niente focus né lettori di schermo su un menu fuori dallo schermo */}
        <div className={`app-drawer${drawer.open ? " open" : ""}`} inert={!drawer.open} onClick={closeOnNav}>
          <Sidebar
            extraNav={
              <>
                <RoomNavItem />
                <CatalogNavItem />
              </>
            }
          />
        </div>
      </div>
    </DrawerContext.Provider>
  );
}

export default AppShell;
