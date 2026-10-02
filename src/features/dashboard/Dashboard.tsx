import { useMemo, useRef } from "react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { calcGridColWidth } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css"; // CSS base della libreria: SEMPRE prima del nostro
import "./dashboard.css";
import { useSettings } from "../../core/settings/SettingsContext";
import { useLayout } from "../../core/layout/LayoutContext";
import { useNav } from "../../core/nav/NavContext";
import { createDragCompactor, finalizeLayout, clampToBounds } from "../../core/layout/compactor";
import { saveLayout, type LayoutItem } from "../../core/layout/layoutRepository";
import { GRID_COLS, MIN_ROW_HEIGHT } from "../../core/layout/gridConfig";
import { getWidget } from "../../widgets/registry";
import { useGhostPreview, useForceEndDragOnBlur } from "./useGhostPreview";
import DashboardHeader from "./DashboardHeader";

function Dashboard() {
  // width: larghezza del contenitore (px), ricalcolata al resize della finestra.
  // mounted: evita di renderizzare la griglia con width 0 al primo frame.
  const { width, containerRef, mounted } = useContainerWidth();
  const { settings } = useSettings();
  const { layout, setLayout, rows, ready } = useLayout();
  const { openWidgetDetail } = useNav();

  const margin = settings.gridMargin;
  const marginTuple = [margin, margin] as const;

  // Altezza di riga PROPORZIONALE alla larghezza di colonna, calcolata con
  // la stessa funzione della libreria per restare coerenti con lei.
  const colWidth = width
    ? calcGridColWidth({
        containerWidth: width,
        cols: GRID_COLS,
        margin: marginTuple,
        containerPadding: marginTuple,
        rowHeight: 1,
        maxRows: rows,
      })
    : 0;
  const rowHeight = Math.max(MIN_ROW_HEIGHT, colWidth * settings.gridRowHeightRatio);

  // containerPadding = margin è il default della libreria quando non viene passato.
  const positionParams = {
    margin: marginTuple,
    containerPadding: marginTuple,
    cols: GRID_COLS,
    rowHeight,
    maxRows: rows,
  };

  // Compactor con stato di drag PROPRIO di questa griglia. Creato UNA volta:
  // legge righe e ritardo da un oggetto aggiornato a ogni render, così un
  // cambio di impostazione non azzera mai una sessione di drag in corso.
  const compactorConfig = useRef({ maxRows: rows, pushDelayMs: settings.gridPushDelayMs });
  compactorConfig.current.maxRows = rows;
  compactorConfig.current.pushDelayMs = settings.gridPushDelayMs;
  const dragCompactor = useMemo(() => createDragCompactor(compactorConfig.current), []);

  const { dragTarget, ghostPos, captureGhost, clearGhost } = useGhostPreview(positionParams, width);
  useForceEndDragOnBlur(clearGhost);

  const dragOriginRef = useRef<{ id: string; layout: LayoutItem[] } | null>(null);
  const suppressLayoutChangeRef = useRef(false);

  // Distingue un click "secco" (apre il dettaglio) dal click che chiude un
  // drag (non deve navigare): un vero click non fa mai scattare onDrag.
  const wasDraggingRef = useRef(false);

  const GhostComponent = dragTarget && settings.showDragGhost ? getWidget(dragTarget.i)?.component : undefined;

  return (
    <>
      <DashboardHeader />

      {/* position: relative (vedi .grid-container): il ghost si posiziona rispetto a questo contenitore. */}
      <div ref={containerRef} className="grid-container">
        {mounted && ready && (
          <GridLayout
            className={`widget-grid${settings.lockLayout ? " is-locked" : ""}`}
            layout={layout}
            gridConfig={{ cols: GRID_COLS, rowHeight, margin: [margin, margin], maxRows: rows }}
            // Dimensioni fisse per taglia: si cambia taglia dal catalogo.
            resizeConfig={{ enabled: false }}
            // Lascia che la griglia occupi tutto lo spazio, così si può
            // rilasciare un widget anche nello spazio vuoto sotto gli altri.
            autoSize={false}
            dragConfig={{ enabled: !settings.lockLayout, bounded: true, threshold: settings.dragThreshold }}
            width={width}
            compactor={dragCompactor.compactor}
            onDragStart={(evLayout, oldItem, newItem, placeholder) => {
              wasDraggingRef.current = false;
              const id = newItem?.i ?? oldItem?.i ?? null;
              dragOriginRef.current = id ? { id, layout: layout.map((it) => ({ ...it })) } : null;
              if (id) {
                dragCompactor.startDrag(
                  id,
                  oldItem ? { x: oldItem.x, y: oldItem.y, w: oldItem.w, h: oldItem.h } : undefined
                );
              }
              captureGhost(evLayout, oldItem, newItem, placeholder);
            }}
            onDrag={(evLayout, oldItem, newItem, placeholder) => {
              wasDraggingRef.current = true;
              captureGhost(evLayout, oldItem, newItem, placeholder);
            }}
            onDragStop={async (newLayout) => {
              const dropped = newLayout as LayoutItem[];
              const origin = dragOriginRef.current;

              // Se il rilascio avviene con una sovrapposizione non ancora
              // "maturata", si torna al layout di partenza.
              const pending = origin ? dragCompactor.hasPendingCollision(dropped, origin.id) : false;
              const source = origin && pending ? origin.layout : dropped;
              const finalItems = finalizeLayout(source, GRID_COLS, rows) as LayoutItem[];

              suppressLayoutChangeRef.current = true;
              setLayout(finalItems);
              clearGhost();
              dragCompactor.endDrag();
              dragOriginRef.current = null;
              await saveLayout(finalItems);
              setTimeout(() => {
                suppressLayoutChangeRef.current = false;
              }, 150);
            }}
            // Scatta anche per cambi non causati dal drag (es. widget
            // rimosso dal catalogo): tiene lo stato React sincronizzato.
            onLayoutChange={(newLayout) => {
              if (suppressLayoutChangeRef.current) return;
              setLayout(clampToBounds(newLayout as LayoutItem[], GRID_COLS, rows) as LayoutItem[]);
            }}
          >
            {layout.map((item) => {
              const widget = getWidget(item.i);
              if (!widget) return null;
              const WidgetComponent = widget.component;
              return (
                <div
                  key={item.i}
                  onClick={() => {
                    if (wasDraggingRef.current) {
                      wasDraggingRef.current = false;
                      return;
                    }
                    if (settings.openDetailOnClick && widget.detailComponent) openWidgetDetail(item.i);
                  }}
                >
                  <WidgetComponent w={item.w} h={item.h} />
                </div>
              );
            })}
          </GridLayout>
        )}

        {/* Overlay "ghost": solo durante un drag attivo. */}
        {dragTarget && ghostPos && GhostComponent && (
          <div
            className="widget-ghost"
            style={{
              width: ghostPos.width,
              height: ghostPos.height,
              opacity: settings.ghostOpacity,
              filter: `blur(${settings.ghostBlur}px) saturate(0.8)`,
              transform: `translate3d(${ghostPos.left}px, ${ghostPos.top}px, 0)`,
            }}
          >
            <GhostComponent w={dragTarget.w} h={dragTarget.h} />
          </div>
        )}
      </div>
    </>
  );
}

export default Dashboard;
