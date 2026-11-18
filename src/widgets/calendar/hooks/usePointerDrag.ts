import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";

/*
 * Trascinamento con il puntatore per gli elementi del Calendario. Col mouse parte dopo pochi px di movimento;
 * col dito solo dopo una pressione lunga (regola dell'app: un tocco apre, uno scorrimento scorre).
 * Dopo un trascinamento il clic che segue si ignora (il rilascio sul pulsante lo aprirebbe).
 */

const MOUSE_THRESHOLD = 4;
const LONG_PRESS_MS = 450;
const TOUCH_SLOP = 8;

export interface DragCallbacks<T> {
  onStart?: (item: T, x: number, y: number) => void;
  onMove: (item: T, x: number, y: number, dx: number, dy: number) => void;
  onEnd: (item: T, x: number, y: number, dx: number, dy: number) => void;
  onCancel?: (item: T) => void;
}

export function usePointerDrag<T>(callbacks: DragCallbacks<T>) {
  const cb = useLatestRef(callbacks);
  const state = useRef<{
    item: T;
    id: number;
    x0: number;
    y0: number;
    active: boolean;
    timer: number;
    el: Element;
  } | null>(null);
  const suppressClickUntil = useRef(0);

  const stop = useCallback(() => {
    const s = state.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    state.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (item: T, e: ReactPointerEvent<Element>) => {
      if (e.button !== 0) return;
      stop();
      const el = e.currentTarget;
      const s = { item, id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, timer: 0, el };
      state.current = s;
      const begin = () => {
        s.active = true;
        try {
          el.setPointerCapture(s.id);
        } catch {
          // il puntatore è già stato rilasciato
        }
        cb.current.onStart?.(s.item, s.x0, s.y0);
      };
      if (e.pointerType === "touch") s.timer = window.setTimeout(begin, LONG_PRESS_MS);

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== s.id || state.current !== s) return;
        const dx = ev.clientX - s.x0;
        const dy = ev.clientY - s.y0;
        if (!s.active) {
          if (e.pointerType === "touch") {
            if (Math.hypot(dx, dy) > TOUCH_SLOP) cleanup(); // scorrimento: niente trascinamento
            return;
          }
          if (Math.hypot(dx, dy) < MOUSE_THRESHOLD) return;
          begin();
        }
        ev.preventDefault();
        cb.current.onMove(s.item, ev.clientX, ev.clientY, dx, dy);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== s.id || state.current !== s) return;
        const wasActive = s.active;
        cleanup();
        if (wasActive) {
          suppressClickUntil.current = Date.now() + 300;
          cb.current.onEnd(s.item, ev.clientX, ev.clientY, ev.clientX - s.x0, ev.clientY - s.y0);
        }
      };
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId !== s.id || state.current !== s) return;
        const wasActive = s.active;
        cleanup();
        if (wasActive) cb.current.onCancel?.(s.item);
      };
      const key = (ev: KeyboardEvent) => {
        if (ev.key === "Escape" && s.active) {
          cleanup();
          suppressClickUntil.current = Date.now() + 300;
          cb.current.onCancel?.(s.item);
        }
      };
      function cleanup() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
        if (state.current === s) stop();
      }
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key, true);
    },
    [cb, stop]
  );

  /** Vero subito dopo un trascinamento: il clic che arriva va ignorato. */
  const shouldIgnoreClick = useCallback(() => Date.now() < suppressClickUntil.current, []);

  return { onPointerDown, shouldIgnoreClick };
}
