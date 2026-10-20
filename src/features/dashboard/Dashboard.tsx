import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { calcGridItemPosition } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css"; // CSS base della libreria: SEMPRE prima del nostro
import "./dashboard.css";
import { useSettings } from "../../core/settings/SettingsContext";
import { useTheme } from "../../core/theme/useTheme";
import { useLayout } from "../../core/layout/LayoutContext";
import { useNav } from "../../core/nav/NavContext";
import { createDragCompactor, finalizeLayout, clampToBounds } from "../../core/layout/compactor";
import { saveLayout, type LayoutItem } from "../../core/layout/layoutRepository";
import { GRID_COLS, MIN_ROW_HEIGHT } from "../../core/layout/gridConfig";
import { getWidget, widgetPigment } from "../../widgets/registry";
import { useGhostPreview, useForceEndDragOnBlur } from "./useGhostPreview";
import DashboardHeader from "./DashboardHeader";
import AddWidgetSlot from "./AddWidgetSlot";

// La griglia non ha margine esterno: riempie l'area di .main come nei mockup.
const NO_PADDING = [0, 0] as const;

/**
 * Altezza disponibile del contenitore e spazio fra i widget (token --grid-gap
 * del tema). Si rimisura al resize della finestra e quando cambia il tema.
 */
function useGridMetrics(element: HTMLElement | null, themeId: string) {
  const [metrics, setMetrics] = useState({ height: 0, gap: 14 });
  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(element).getPropertyValue("--grid-gap")) || 14;
      const height = element.clientHeight;
      setMetrics((prev) => (prev.height === height && prev.gap === gap ? prev : { height, gap }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, themeId]);
  return metrics;
}

/** True se il doppio click arriva da un controllo interno (non deve aprire il dettaglio). */
function fromInnerControl(e: MouseEvent<HTMLElement>): boolean {
  const control = (e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']");
  // data-cell-action: pulsante che occupa tutta la cella (1×1), il doppio click apre comunque il dettaglio.
  return control !== null && !control.hasAttribute("data-cell-action");
}

function Dashboard() {
  // width: larghezza del contenitore (px), ricalcolata al resize della finestra.
  // mounted: evita di renderizzare la griglia con width 0 al primo frame.
  const { width, containerRef, mounted } = useContainerWidth();
  const { settings } = useSettings();
  const theme = useTheme();
  const { layout, setLayout, rows, ready, findFreeSlot } = useLayout();
  const { openWidgetDetail, goToCatalog } = useNav();

  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const { height, gap } = useGridMetrics(gridElement, theme.id);
  const marginTuple = [gap, gap] as const;

  // La griglia riempie la finestra: le righe si dividono l'altezza disponibile.
  // Sotto MIN_ROW_HEIGHT si lascia scorrere .main invece di schiacciare i widget.
  const rowHeight = Math.max(MIN_ROW_HEIGHT, height > 0 ? (height - gap * (rows - 1)) / rows : MIN_ROW_HEIGHT);

  const positionParams = {
    margin: marginTuple,
    containerPadding: NO_PADDING,
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

  // Distingue un doppio click "secco" (apre il dettaglio) da quello che
  // chiude un drag (non deve navigare): un vero click non fa mai scattare onDrag.
  const wasDraggingRef = useRef(false);

  const GhostComponent = dragTarget && settings.showDragGhost ? getWidget(dragTarget.i)?.component : undefined;

  // Slot "Aggiungi widget": prima cella libera, nascosto durante un drag.
  const freeCell = ready && !dragTarget ? findFreeSlot({ w: 1, h: 1 }) : null;
  const slotPos =
    freeCell && width
      ? calcGridItemPosition({ ...positionParams, containerWidth: width }, freeCell.x, freeCell.y, 1, 1)
      : null;

  return (
    <>
      <DashboardHeader />

      {/* position: relative (vedi .grid-container): ghost e slot si posizionano rispetto a questo contenitore. */}
      <div
        ref={(el) => {
          containerRef.current = el;
          setGridElement(el);
        }}
        className="grid-container"
      >
        {mounted && ready && height > 0 && (
          <GridLayout
            className={`widget-grid${settings.lockLayout ? " is-locked" : ""}`}
            layout={layout}
            gridConfig={{ cols: GRID_COLS, rowHeight, margin: [gap, gap], containerPadding: [0, 0], maxRows: rows }}
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
                  data-pigment={widgetPigment(item.i)}
                  onDoubleClick={(e) => {
                    if (wasDraggingRef.current) {
                      wasDraggingRef.current = false;
                      return;
                    }
                    if (fromInnerControl(e)) return;
                    if (settings.openDetailOnClick && widget.detailComponent) openWidgetDetail(item.i);
                  }}
                >
                  <WidgetComponent w={item.w} h={item.h} />
                </div>
              );
            })}
          </GridLayout>
        )}

        {slotPos && (
          <AddWidgetSlot
            style={{ width: slotPos.width, height: slotPos.height, transform: `translate(${slotPos.left}px, ${slotPos.top}px)` }}
            onClick={goToCatalog}
          />
        )}

        {/* Overlay "ghost": solo durante un drag attivo. */}
        {dragTarget && ghostPos && GhostComponent && (
          <div
            className="widget-ghost"
            data-pigment={widgetPigment(dragTarget.i)}
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
