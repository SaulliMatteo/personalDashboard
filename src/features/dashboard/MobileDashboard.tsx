import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { MdCheck, MdEdit } from "react-icons/md";
import { useMobileLayout } from "../../core/layout/useMobileLayout";
import { useLandscape } from "../../core/layout/useCompact";
import { MAX_PAGES, PHONE_COLS, PHONE_ROWS, cellFromGrid, gridPlacement, type MobileItem } from "../../core/layout/mobileLayout";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { useBackHandler } from "../../core/nav/backHandlers";
import { useDrawer } from "../../core/nav/useDrawer";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import { getWidget, widgetPigment } from "../../widgets/registry";
import CompactBar from "../../ui/CompactBar";
import { fromInnerControl } from "./fromInnerControl";
import { useGreeting } from "./useGreeting";
import "./mobileDashboard.css";

/**
 * Grandezza di una cella 1×1 per cui sono disegnate le card (una cella del desktop a finestra piena, circa).
 * Ogni widget si scala con `zoom` di cella / base: su un telefono stretto è un po' più piccolo, su uno largo
 * un po' più grande, ma sempre nelle stesse proporzioni (le card hanno misure fisse in px).
 */
const BASE_CELL = { w: 172, h: 162 };
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.4;
/** Scorrimento oltre questa frazione della pagina = pagina successiva. */
const SWIPE_FRACTION = 0.18;
/** Movimento minimo prima di decidere se è uno scorrimento o un trascinamento. */
const MOVE_SLOP = 10;
/** In modifica, tenendo la cella sul bordo per questo tempo si passa alla pagina accanto. */
const EDGE_ZONE = 32;
const EDGE_DELAY_MS = 550;
/** Tenendo premuto un widget per questo tempo si entra nella modifica (e lo si può già trascinare). */
const LONG_PRESS_MS = 500;
/** Durante il trascinamento partito da una pressione lunga la pagina non deve scorrere (vedi onCellPointerDown). */
const blockScroll = (ev: TouchEvent) => ev.preventDefault();
/** Dopo uno scorrimento o un trascinamento i click si ignorano per un attimo. */
const CLICK_GUARD_MS = 350;

/** Da adesso, per un attimo, i click si ignorano (il rilascio di uno scorrimento o di un trascinamento ne genera uno). */
function guardClicks(until: { current: number }) {
  until.current = performance.now() + CLICK_GUARD_MS;
}

function clicksGuarded(until: { current: number }): boolean {
  return performance.now() < until.current;
}

interface Metrics {
  width: number;
  height: number;
  gap: number;
}

/** Misure della pagina (la griglia CSS) e dello spazio fra le celle; si rimisura a ogni ridimensionamento. */
function usePageMetrics(element: HTMLElement | null, landscape: boolean): Metrics {
  const [metrics, setMetrics] = useState<Metrics>({ width: 0, height: 0, gap: 10 });
  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const page = element.querySelector<HTMLElement>(".md-page");
      const gap = page ? parseFloat(getComputedStyle(page).columnGap) || 10 : 10;
      const width = element.clientWidth;
      const height = element.clientHeight;
      setMetrics((prev) => (prev.width === width && prev.height === height && prev.gap === gap ? prev : { width, height, gap }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, landscape]);
  return metrics;
}

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Offset del dito dentro la cella, per tenerla sotto il dito. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
  /** Nato da una pressione lunga fuori dalla modifica: al rilascio il click non deve arrivare al widget. */
  fromPress?: boolean;
}

interface Swipe {
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  active: boolean;
}

/** Dashboard del telefono: pagine 2×4 da scorrere (4×2 in orizzontale), con la modifica dalla matita. */
function MobileDashboard() {
  const { items, ready, pages: usedPages, sizesOf, removeWidget, moveWidget, resizeWidget, addPage, finishEditing } = useMobileLayout();
  const { openWidgetDetail, goToCatalog } = useNav();
  const { setOpen: setDrawerOpen } = useDrawer();
  const { settings } = useSettings();
  // senza intestazione (Impostazioni > Dashboard) la barra dice solo "Dashboard", senza data
  const greeting = useGreeting();
  const showHeader = settings.showDashboardHeader;
  const landscape = useLandscape();

  const pages = Math.max(1, usedPages);
  const [pageState, setPage] = useState(0);
  const page = Math.min(pageState, pages - 1);
  const [editing, setEditing] = useState(false);

  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const metrics = usePageMetrics(viewport, landscape);
  const cols = landscape ? PHONE_COLS * 2 : PHONE_COLS;
  const rows = landscape ? PHONE_ROWS / 2 : PHONE_ROWS;
  const unitW = metrics.width > 0 ? (metrics.width - metrics.gap * (cols - 1)) / cols : 0;
  const unitH = metrics.height > 0 ? (metrics.height - metrics.gap * (rows - 1)) / rows : 0;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(unitW / BASE_CELL.w, unitH / BASE_CELL.h)));

  const [swipeDx, setSwipeDx] = useState(0);
  const swipeRef = useRef<Swipe | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const edgeTimer = useRef<number | undefined>(undefined);
  const guardUntil = useRef(0);
  const pressRef = useRef<{ timer: number; pointerId: number; x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };
  // Dopo la pressione lunga il gesto è già iniziato con lo scorrimento permesso (touch-action si decide al tocco):
  // finché il dito resta giù i movimenti non devono far scorrere la pagina, o Android annulla il trascinamento.
  const releaseScroll = () => window.removeEventListener("touchmove", blockScroll);

  useEffect(
    () => () => {
      window.clearTimeout(edgeTimer.current);
      if (pressRef.current) window.clearTimeout(pressRef.current.timer);
      window.removeEventListener("touchmove", blockScroll);
    },
    []
  );

  const stopEditing = () => {
    setEditing(false);
    void finishEditing();
  };
  useBackHandler(editing, stopEditing);

  const sizeOf = (item: MobileItem) => ({
    width: unitW * item.w + metrics.gap * (item.w - 1),
    height: unitH * item.h + metrics.gap * (item.h - 1),
  });

  /** Cella della pagina corrente sotto un punto dello schermo (null fuori dalla griglia). */
  const cellAt = (clientX: number, clientY: number) => {
    if (!viewport || unitW <= 0 || unitH <= 0) return null;
    const rect = viewport.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left) / (unitW + metrics.gap));
    const row = Math.floor((clientY - rect.top) / (unitH + metrics.gap));
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return cellFromGrid(col, row, landscape);
  };

  // ---------- scorrimento fra le pagine ----------
  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current || !e.isPrimary) return;
    swipeRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, active: false };
  };

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== e.pointerId) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;
    if (!swipe.active) {
      if (Math.abs(dy) > MOVE_SLOP && Math.abs(dy) > Math.abs(dx)) {
        swipeRef.current = null; // è uno scorrimento verticale dentro un widget
        cancelPress();
        return;
      }
      if (Math.abs(dx) < MOVE_SLOP) return;
      swipe.active = true;
      cancelPress(); // scorrendo la pagina non parte la pressione lunga
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    // ai bordi (prima e ultima pagina) lo scorrimento oppone resistenza
    const atEdge = (page === 0 && dx > 0) || (page === pages - 1 && dx < 0);
    swipe.dx = atEdge ? dx / 3 : dx;
    setSwipeDx(swipe.dx);
  };

  const endSwipe = (e: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== e.pointerId) return;
    swipeRef.current = null;
    if (!swipe.active) return;
    guardClicks(guardUntil);
    const threshold = metrics.width * SWIPE_FRACTION;
    if (swipe.dx < -threshold && page < pages - 1) setPage(page + 1);
    else if (swipe.dx > threshold && page > 0) setPage(page - 1);
    setSwipeDx(0);
  };

  // ---------- trascinamento in modifica ----------
  const onCellPointerDown = (e: ReactPointerEvent<HTMLDivElement>, item: MobileItem) => {
    if (!e.isPrimary) return;
    if (!editing) {
      // pressione lunga: si entra nella modifica e, senza staccare il dito, si trascina già il widget
      const el = e.currentTarget;
      const { pointerId, clientX, clientY } = e;
      cancelPress();
      pressRef.current = {
        pointerId,
        x: clientX,
        y: clientY,
        timer: window.setTimeout(() => {
          pressRef.current = null;
          swipeRef.current = null;
          setSwipeDx(0);
          setEditing(true);
          window.addEventListener("touchmove", blockScroll, { passive: false });
          const rect = el.getBoundingClientRect();
          dragRef.current = {
            id: item.i,
            pointerId,
            startX: clientX,
            startY: clientY,
            x: clientX,
            y: clientY,
            offsetX: clientX - rect.left,
            offsetY: clientY - rect.top,
            width: rect.width,
            height: rect.height,
            active: false,
            fromPress: true,
          };
          try {
            el.setPointerCapture(pointerId);
          } catch {
            // il dito è già stato alzato
          }
        }, LONG_PRESS_MS),
      };
      return;
    }
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation(); // niente scorrimento della pagina
    const rect = e.currentTarget.getBoundingClientRect();
    const next: Drag = {
      id: item.i,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      active: false,
    };
    dragRef.current = next;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCellPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (press && press.pointerId === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_SLOP) cancelPress();
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - current.startX, e.clientY - current.startY);
    if (!current.active && moved < MOVE_SLOP) return;
    const next = { ...current, x: e.clientX, y: e.clientY, active: true };
    dragRef.current = next;
    setDrag(next);

    // sul bordo: dopo un attimo, pagina accanto (si continua a trascinare lì)
    const nearLeft = e.clientX < EDGE_ZONE;
    const nearRight = e.clientX > window.innerWidth - EDGE_ZONE;
    if (!nearLeft && !nearRight) {
      window.clearTimeout(edgeTimer.current);
      edgeTimer.current = undefined;
    } else if (edgeTimer.current === undefined) {
      edgeTimer.current = window.setTimeout(() => {
        edgeTimer.current = undefined;
        if (dragRef.current) flipPage.current(nearLeft ? -1 : 1);
      }, EDGE_DELAY_MS);
    }
  };

  // pagina accanto durante un trascinamento; oltre l'ultima, una pagina vuota nuova se c'è ancora posto
  const flipPage = useLatestRef((direction: -1 | 1) => {
    if (direction < 0) setPage(Math.max(0, page - 1));
    else if (page < pages - 1) setPage(page + 1);
    else {
      const index = addPage();
      if (index !== null) setPage(index);
    }
  });

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    if (pressRef.current?.pointerId === e.pointerId) cancelPress();
    releaseScroll();
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    window.clearTimeout(edgeTimer.current);
    edgeTimer.current = undefined;
    if (!current.active) {
      if (current.fromPress) guardClicks(guardUntil);
      return;
    }
    guardClicks(guardUntil);
    if (!commit) return;
    // la cella va dove sta il suo angolo in alto a sinistra (mezza cella di tolleranza)
    const target = cellAt(current.x - current.offsetX + unitW / 2, current.y - current.offsetY + unitH / 2);
    if (target) void moveWidget(current.id, { page, ...target });
  };

  const cycleSize = (item: MobileItem) => {
    const sizes = sizesOf(item.i) ?? [];
    if (sizes.length < 2) return;
    const index = sizes.findIndex((s) => s.w === item.w && s.h === item.h);
    void resizeWidget(item.i, sizes[(index + 1) % sizes.length]);
  };

  const onNewPage = () => {
    const index = addPage();
    if (index !== null) setPage(index);
  };

  // celle libere della pagina in modifica (tratteggiate, "posto libero")
  const freeCells: { x: number; y: number }[] = [];
  if (editing) {
    const taken = new Set<string>();
    for (const item of items) {
      if (item.page !== page) continue;
      for (let dx = 0; dx < item.w; dx++) for (let dy = 0; dy < item.h; dy++) taken.add(`${item.x + dx},${item.y + dy}`);
    }
    for (let y = 0; y < PHONE_ROWS; y++) for (let x = 0; x < PHONE_COLS; x++) if (!taken.has(`${x},${y}`)) freeCells.push({ x, y });
  }

  const renderWidget = (item: MobileItem, size: { width: number; height: number }) => {
    const WidgetComponent = getWidget(item.i)?.component;
    if (!WidgetComponent || size.width <= 0) return null;
    const style: CSSProperties = { zoom, width: size.width / zoom, height: size.height / zoom };
    return (
      <div className="md-zoom" style={style}>
        <WidgetComponent w={item.w} h={item.h} />
      </div>
    );
  };

  const draggedItem = drag?.active ? items.find((item) => item.i === drag.id) : undefined;

  const bar = editing ? (
    <CompactBar
      lead="back"
      onLead={stopEditing}
      title="Modifica"
      subtitle={`pagina ${page + 1} di ${pages}`}
      actions={
        <button type="button" className="cbar-btn" onClick={stopEditing} aria-label="Fine modifica">
          <MdCheck />
        </button>
      }
    />
  ) : (
    <CompactBar
      lead="menu"
      onLead={() => setDrawerOpen(true)}
      title={showHeader ? greeting : "Dashboard"}
      subtitle={showHeader ? new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) : undefined}
      actions={
        <button type="button" className="cbar-btn" onClick={() => setEditing(true)} aria-label="Modifica la dashboard">
          <MdEdit />
        </button>
      }
    />
  );

  const empty = ready && items.length === 0 && !editing;

  return (
    <div className={`md${editing ? " md--editing" : ""}${landscape ? " md--landscape" : ""}`}>
      {bar}

      {empty ? (
        <div className="md-empty">
          <p>La dashboard è vuota.</p>
          <button type="button" className="md-btn" onClick={goToCatalog}>
            Aggiungi un widget
          </button>
        </div>
      ) : (
        <div
          ref={setViewport}
          className="md-viewport"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
          onClickCapture={(e) => {
            if (clicksGuarded(guardUntil)) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          <div
            className={`md-track${swipeDx !== 0 ? " is-swiping" : ""}`}
            style={{ transform: `translateX(calc(${-page} * (100% + var(--md-gap)) + ${swipeDx}px))` }}
          >
            {Array.from({ length: pages }, (_, index) => (
              <div key={index} className="md-page" aria-hidden={index !== page} inert={index !== page}>
                {ready &&
                  items
                    .filter((item) => item.page === index)
                    .map((item) => {
                      const widget = getWidget(item.i);
                      if (!widget) return null;
                      const { col, row } = gridPlacement(item, landscape);
                      const sizes = sizesOf(item.i) ?? [];
                      const dragging = drag?.active && drag.id === item.i;
                      return (
                        <div
                          key={item.i}
                          className={`md-cell${dragging ? " is-dragging" : ""}`}
                          data-pigment={widgetPigment(item.i)}
                          style={{ gridColumn: `${col} / span ${item.w}`, gridRow: `${row} / span ${item.h}` }}
                          onPointerDown={(e) => onCellPointerDown(e, item)}
                          onPointerMove={onCellPointerMove}
                          onPointerUp={(e) => endDrag(e, true)}
                          onPointerCancel={(e) => endDrag(e, false)}
                          onDoubleClick={(e) => {
                            if (editing || clicksGuarded(guardUntil) || fromInnerControl(e)) return;
                            if (widget.detailComponent) openWidgetDetail(item.i);
                          }}
                        >
                          {renderWidget(item, sizeOf(item))}
                          {editing && (
                            <>
                              <button
                                type="button"
                                className="md-remove"
                                onClick={() => void removeWidget(item.i)}
                                aria-label={`Togli ${widget.name}`}
                              >
                                ×
                              </button>
                              {sizes.length > 1 && (
                                <button
                                  type="button"
                                  className="md-size"
                                  onClick={() => cycleSize(item)}
                                  aria-label={`Taglia di ${widget.name}: ${item.w}×${item.h}, cambia`}
                                >
                                  {item.w}×{item.h}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                {editing &&
                  index === page &&
                  freeCells.map((cell) => {
                    const { col, row } = gridPlacement(cell, landscape);
                    return (
                      <button
                        key={`${cell.x},${cell.y}`}
                        type="button"
                        className="md-slot"
                        style={{ gridColumn: col, gridRow: row }}
                        onClick={goToCatalog}
                      >
                        posto libero
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!empty && pages > 1 && (
        <div className="md-dots" role="tablist" aria-label="Pagine">
          {Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === page}
              aria-label={`Pagina ${index + 1}`}
              className={index === page ? "on" : undefined}
              onClick={() => setPage(index)}
            />
          ))}
        </div>
      )}

      {editing && (
        <div className="md-editbar">
          <button type="button" className="md-btn md-btn--ghost" onClick={onNewPage} disabled={pages >= MAX_PAGES}>
            + Pagina
          </button>
          <button type="button" className="md-btn" onClick={goToCatalog}>
            + Widget
          </button>
        </div>
      )}

      {/* la cella trascinata segue il dito, sopra tutto (anche passando alla pagina accanto) */}
      {drag?.active && draggedItem && (
        <div
          className="md-float"
          data-pigment={widgetPigment(draggedItem.i)}
          style={{ width: drag.width, height: drag.height, transform: `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)` }}
        >
          {renderWidget(draggedItem, { width: drag.width, height: drag.height })}
        </div>
      )}
    </div>
  );
}

export default MobileDashboard;
