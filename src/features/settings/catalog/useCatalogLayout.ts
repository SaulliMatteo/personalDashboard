import type { WidgetDefinition, WidgetSize } from "../../../core/widgets/types";
import { useLayout } from "../../../core/layout/useLayout";
import { useMobileLayout } from "../../../core/layout/useMobileLayout";
import { useCompact } from "../../../core/layout/useCompact";
import { phoneSizes } from "../../../core/layout/mobileLayout";
import { SIZE_S } from "../../../core/widgets/sizes";

/** Quello che il catalogo chiede al layout, uguale per il desktop e per il telefono. */
export interface CatalogLayout {
  /** Taglia attuale del widget nella dashboard, null se non c'è. */
  currentSize: (id: string) => { w: number; h: number } | null;
  /** Taglie proponibili: tutte sul desktop, solo quelle fino a 2×2 sul telefono. */
  sizesOf: (widget: WidgetDefinition) => WidgetSize[];
  fits: (size: WidgetSize) => boolean;
  add: (id: string, size: WidgetSize) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

/**
 * Il catalogo lavora sul layout della finestra in cui si trova: quello del desktop (`dashboard_layout`) o,
 * sul telefono, quello separato (`dashboard_layout_mobile`). Così aggiungere un widget dal telefono non
 * tocca mai il layout del desktop.
 */
export function useCatalogLayout(): CatalogLayout {
  const compact = useCompact();
  const desktop = useLayout();
  const mobile = useMobileLayout();

  if (compact) {
    return {
      currentSize: (id) => mobile.items.find((item) => item.i === id) ?? null,
      sizesOf: (widget) => {
        const allowed = phoneSizes(widget.sizes);
        const sizes = widget.sizes.filter((s) => allowed.some((a) => a.w === s.w && a.h === s.h));
        return sizes.length > 0 ? sizes : [SIZE_S];
      },
      fits: (size) => mobile.hasRoomFor(size),
      add: (id, size) => mobile.addWidget(id, { w: size.w, h: size.h }),
      remove: mobile.removeWidget,
    };
  }

  return {
    currentSize: (id) => desktop.layout.find((item) => item.i === id) ?? null,
    sizesOf: (widget) => widget.sizes,
    fits: (size) => desktop.findFreeSlot(size) !== null,
    add: (id, size) => desktop.addWidget(id, { w: size.w, h: size.h }),
    remove: desktop.removeWidget,
  };
}
