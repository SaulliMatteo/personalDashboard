import { createElement, type ComponentType, type MouseEvent } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useNav } from "../../core/nav/useNav";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import StrokeGlyph from "./components/StrokeGlyph";
import "./WhiteboardWidget.css";

const TAGLINE = "Disegna al volo. Uscendo si cancella.";

/** 2×1 (Notte, Opaco, Fosforo): il tratto (in un display, tranne in Opaco) accanto a nome e riga. */
function WideSplit() {
  return (
    <article className="widget wb-cell wbw-W">
      <div className="wbw-W-art">
        <StrokeGlyph />
      </div>
      <div className="wbw-W-text">
        <h2>Lavagna</h2>
        <p>{TAGLINE}</p>
      </div>
    </article>
  );
}

/** 2×1 Quaderno: titolo a mano sottolineato, sotto il tratto e la riga direttamente sul foglio. */
function WideSheet() {
  return (
    <article className="widget wb-cell wbw-W wbw-W--sheet">
      <div className="wbw-W-head">
        <h2>Lavagna</h2>
      </div>
      <div className="wbw-W-body">
        <div className="wbw-W-art">
          <StrokeGlyph />
        </div>
        <p>{TAGLINE}</p>
      </div>
    </article>
  );
}

const WIDE_LAYOUTS: ThemeVariants<ComponentType> = {
  notte: WideSplit,
  opaco: WideSplit,
  quaderno: WideSheet,
  fosforo: WideSplit,
};

/** 1×1 ultra minimal: tutta la cella è il pulsante che apre la lavagna. */
function Small() {
  const { openWidgetDetail } = useNav();
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    openWidgetDetail("whiteboard");
  };
  return (
    <article className="widget wb-cell wbw-S">
      <button type="button" className="wbw-S-btn" data-cell-action aria-label="Apri la lavagna" onClick={open}>
        <StrokeGlyph />
      </button>
      <span className="wbw-cap" aria-hidden="true">
        Lavagna
      </span>
    </article>
  );
}

/** Cella della Lavagna in dashboard: 1×1 e 2×1 (il doppio click sulla 2×1 apre il dettaglio). */
function WhiteboardWidget({ w, h }: WidgetProps) {
  const Wide = useThemeVariant(WIDE_LAYOUTS);
  return <WidgetFrame>{sizeKey(w, h) === "S" ? <Small /> : createElement(Wide)}</WidgetFrame>;
}

export default WhiteboardWidget;
