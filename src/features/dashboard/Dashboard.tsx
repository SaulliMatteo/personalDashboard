import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { calcGridItemPosition } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css"; // CSS base della libreria: SEMPRE prima del nostro
import "./dashboard.css";
import { useSettings } from "../../core/settings/useSettings";
import { useTheme } from "../../core/theme/useTheme";
import { useLayout } from "../../core/layout/useLayout";
import { useNav } from "../../core/nav/useNav";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { createDragCompactor, finalizeLayout, sameLayout } from "../../core/layout/compactor";
import { saveLayout, type LayoutItem } from "../../core/layout/layoutRepository";
import { GRID_COLS } from "../../core/layout/gridConfig";
import { getWidget, widgetPigment } from "../../widgets/registry";
import { useGhostPreview, useForceEndDragOnBlur } from "./useGhostPreview";
import DashboardHeader from "./DashboardHeader";
import AddWidgetSlot from "./AddWidgetSlot";
import { fromInnerControl } from "./fromInnerControl";

// La griglia non ha margine esterno: riempie l'area di .main come nei mockup.
const NO_PADDING = [0, 0] as const;

/** Dopo un rilascio i click (e i doppi click) sulla cella si ignorano per questo tempo. */
const DRAG_CLICK_GUARD_MS = 400;
/** Se dopo il mouseup il drag risulta ancora aperto, la libreria ha perso il rilascio. */
const STUCK_DRAG_CHECK_MS = 50;
/** Margine oltre il ritardo di spinta prima di ricalcolare col mouse fermo. */
const PUSH_RETRY_EXTRA_MS = 30;

function justDragged(dragEndedAt: number): boolean {
  return performance.now() - dragEndedAt < DRAG_CLICK_GUARD_MS;
}

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

  // La griglia sta sempre nello spazio sotto l'intestazione: le righe si dividono l'altezza
  // disponibile, quindi la dashboard non scorre mai (con più righe o la finestra bassa i widget
  // si abbassano). Per difetto: gli arrotondamenti della libreria non devono sforare di 1px.
  const rowHeight = Math.max(1, Math.floor((height - gap * (rows - 1)) / rows));

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

  // Il rilascio di un drag genera un click sul pulsante che si è trascinato con il widget
  // (un video di YouTube, una nota...): per un attimo dopo il rilascio i click non passano.
  const dragEndedAtRef = useRef(0);

  // Ultimo layout e posizione del mouse visti durante il drag (spinta col mouse fermo, rete di sicurezza).
  const lastDragRef = useRef<{ layout: LayoutItem[]; x: number; y: number } | null>(null);
  const pushTimerRef = useRef<number | undefined>(undefined);
  // Cambiarla rimonta la griglia: solo per sbloccarla se la libreria perde un rilascio.
  const [gridKey, setGridKey] = useState(0);

  const finishDrag = (finalItems: LayoutItem[]) => {
    window.clearTimeout(pushTimerRef.current);
    dragEndedAtRef.current = performance.now();
    lastDragRef.current = null;
    dragCompactor.endDrag();
    clearGhost();
    setLayout(finalItems);
    saveLayout(finalItems).catch((error) => console.error("Errore nel salvataggio del layout:", error));
  };

  const recoverStuckDrag = useLatestRef(() => {
    const base = lastDragRef.current?.layout ?? layout;
    finishDrag(finalizeLayout(dragCompactor.dropResult(base, GRID_COLS), GRID_COLS, rows) as LayoutItem[]);
    setGridKey((key) => key + 1);
  });

  // Il mouseup passa da window (capture) PRIMA che lo veda la libreria: così il calcolo
  // finale del rilascio, che la libreria fa con il nostro compactor, sa già che è un rilascio.
  useEffect(() => {
    let timer: number | undefined;
    const onMouseUp = () => {
      if (!dragCompactor.isActive()) return;
      dragCompactor.beginDrop();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (dragCompactor.isActive()) recoverStuckDrag.current();
      }, STUCK_DRAG_CHECK_MS);
    };
    window.addEventListener("mouseup", onMouseUp, true);
    return () => {
      window.removeEventListener("mouseup", onMouseUp, true);
      window.clearTimeout(timer);
    };
  }, [dragCompactor, recoverStuckDrag]);

  useEffect(() => () => window.clearTimeout(pushTimerRef.current), []);

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
        // Un drag nativo del browser (testo selezionato, un'immagine) si mangerebbe il mouseup
        // e il widget resterebbe attaccato al mouse: nella griglia non serve a nessuno.
        onDragStartCapture={(e) => e.preventDefault()}
      >
        {mounted && ready && height > 0 && (
          <GridLayout
            key={gridKey}
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
              const id = newItem?.i ?? oldItem?.i ?? null;
              if (id) dragCompactor.startDrag(id, evLayout);
              captureGhost(evLayout, oldItem, newItem, placeholder);
            }}
            onDrag={(evLayout, oldItem, newItem, placeholder, event) => {
              captureGhost(evLayout, oldItem, newItem, placeholder);
              const mouse = event as MouseEvent;
              lastDragRef.current = { layout: evLayout as LayoutItem[], x: mouse.clientX, y: mouse.clientY };
              // La spinta "matura" solo quando la libreria ricalcola, cioè a ogni movimento:
              // col mouse fermo sopra un widget si rimanda lo stesso movimento dopo il ritardo.
              // Solo per i movimenti veri, così il movimento rimandato non si ripete all'infinito.
              window.clearTimeout(pushTimerRef.current);
              if (!mouse.isTrusted) return;
              pushTimerRef.current = window.setTimeout(() => {
                const last = lastDragRef.current;
                if (!last || !dragCompactor.isActive()) return;
                document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: last.x, clientY: last.y }));
              }, settings.gridPushDelayMs + PUSH_RETRY_EXTRA_MS);
            }}
            // Il layout ricevuto è già quello finale: la libreria l'ha calcolato con il nostro
            // compactor in modalità rilascio (vedi beginDrop) e lo tiene uguale come stato suo.
            onDragStop={(newLayout) => finishDrag(finalizeLayout(newLayout, GRID_COLS, rows) as LayoutItem[])}
            // Scatta anche per cambi non causati dal drag (es. widget
            // rimosso dal catalogo): tiene lo stato React sincronizzato.
            onLayoutChange={(newLayout) => {
              const next = finalizeLayout(newLayout, GRID_COLS, rows) as LayoutItem[];
              if (!sameLayout(next, layout)) setLayout(next);
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
                  onClickCapture={(e) => {
                    if (!justDragged(dragEndedAtRef.current)) return;
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onDoubleClick={(e) => {
                    if (justDragged(dragEndedAtRef.current) || fromInnerControl(e)) return;
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
