import { useCallback, useEffect, useState } from "react";
import { calcGridItemPosition } from "react-grid-layout/core";
import type { LayoutItem } from "../../core/layout/layoutRepository";

type PositionParams = Omit<Parameters<typeof calcGridItemPosition>[0], "containerWidth">;

/**
 * Preview "fantasma" durante il drag: una copia sfocata del widget nella
 * cella in cui atterrerà. react-grid-layout mostra di suo un placeholder
 * vuoto (nascosto via CSS); noi disegniamo il ghost sopra la griglia.
 *
 * Usiamo `placeholder` (4° parametro della callback) e non `newItem`: è la
 * posizione REALE calcolata dalla libreria dopo la risoluzione delle
 * collisioni, cioè dove il widget atterrerà se rilasci adesso.
 *
 * calcGridItemPosition è la stessa funzione usata internamente dalla
 * libreria: il ghost resta pixel-perfect allineato alla griglia vera.
 */
export function useGhostPreview(positionParams: PositionParams, width: number) {
  const [dragTarget, setDragTarget] = useState<LayoutItem | null>(null);

  const captureGhost = useCallback(
    (
      _layout: readonly LayoutItem[],
      _oldItem: LayoutItem | null,
      newItem: LayoutItem | null,
      placeholder: LayoutItem | null
    ) => {
      const target = placeholder ?? newItem;
      if (!target) return;
      setDragTarget((prev) => {
        if (
          prev &&
          prev.i === target.i &&
          prev.x === target.x &&
          prev.y === target.y &&
          prev.w === target.w &&
          prev.h === target.h
        ) {
          return prev;
        }
        return { i: target.i, x: target.x, y: target.y, w: target.w, h: target.h };
      });
    },
    []
  );

  const clearGhost = useCallback(() => setDragTarget(null), []);

  const ghostPos =
    dragTarget && width
      ? calcGridItemPosition({ ...positionParams, containerWidth: width }, dragTarget.x, dragTarget.y, dragTarget.w, dragTarget.h)
      : null;

  return { dragTarget, ghostPos, captureGhost, clearGhost };
}

/**
 * Bugfix: se la finestra perde il focus (alt-tab) durante un drag e il
 * mouse viene rilasciato FUORI dalla pagina, il browser non consegna mai
 * il "mouseup": la libreria resterebbe in stato "drag attivo" per sempre.
 * Al blur simuliamo noi il mouseup, così chiude tutto normalmente
 * (chiamando anche onDragStop, quindi il layout viene comunque salvato).
 */
export function useForceEndDragOnBlur(onForceEnd: () => void) {
  useEffect(() => {
    const forceEndDrag = () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      onForceEnd();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) forceEndDrag();
    };

    window.addEventListener("blur", forceEndDrag);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", forceEndDrag);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onForceEnd]);
}
