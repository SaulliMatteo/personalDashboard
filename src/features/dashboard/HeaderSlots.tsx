import { createElement, useEffect, useRef, useState } from "react";
import { MdOutlineTune } from "react-icons/md";
import { useNav } from "../../core/nav/useNav";
import { HEADER_SLOT_AUTO } from "../../core/settings/schema";
import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant } from "../../core/theme/variants";
import { getWidget } from "../../widgets/registry";
import { fromInnerControl } from "./fromInnerControl";
import "./headerSlots.css";

/** Spazio che serve al pulsante tra il saluto e i mini: 28px + 10px dai mini + un margine dal saluto. */
const EDIT_BUTTON_SPACE = 46;

/** Gli spazi in alto a destra dell'intestazione: fino a due `mini` scelti in Impostazioni > Dashboard. */
function HeaderSlots() {
  const { settings } = useSettings();
  const { openSettings, openWidgetDetail } = useNav();
  const auto = useThemeVariant(HEADER_SLOT_AUTO);
  const slotsRef = useRef<HTMLDivElement | null>(null);
  const [editFits, setEditFits] = useState(true);

  // Il pulsante sta nello spazio libero tra saluto e mini: se non ci entra (saluto lungo,
  // mini larghi, finestra stretta) finirebbe sopra il nome, quindi non si mostra.
  // Gli spazi si scelgono comunque da Impostazioni > Dashboard.
  useEffect(() => {
    const slots = slotsRef.current;
    const header = slots?.parentElement;
    if (!slots || !header) return;
    const title = header.querySelector("h1");
    const observer = new ResizeObserver(() => {
      const start = title ? title.getBoundingClientRect().right : header.getBoundingClientRect().left;
      // Mini nascosti dall'intestazione stretta (display: none): niente pulsante.
      const visible = slots.offsetParent !== null;
      setEditFits(visible && slots.getBoundingClientRect().left - start >= EDIT_BUTTON_SPACE);
    });
    observer.observe(header);
    observer.observe(slots);
    if (title) observer.observe(title);
    return () => observer.disconnect();
  }, []);

  const ids = [settings.headerSlot1 === "auto" ? auto : settings.headerSlot1, settings.headerSlot2];
  // Id sconosciuti (widget rimossi) o ripetuti si saltano.
  const minis = [...new Set(ids)].flatMap((id) => {
    const widget = getWidget(id);
    return widget?.mini ? [{ id, mini: widget.mini, hasDetail: Boolean(widget.detailComponent) }] : [];
  });

  return (
    <div ref={slotsRef} className="dh-slots">
      {minis.map(({ id, mini, hasDetail }) => (
        <div
          key={id}
          className="dh-slot"
          // Come le celle della griglia: doppio click = pagina di dettaglio del widget.
          onDoubleClick={(e) => {
            if (hasDetail && settings.openDetailOnClick && !fromInnerControl(e)) openWidgetDetail(id);
          }}
        >
          {createElement(mini)}
        </div>
      ))}
      {editFits && (
        <button
          type="button"
          className="dh-slots-edit"
          onClick={() => openSettings("dashboard")}
          aria-label="Scegli cosa mostrare in alto a destra"
          title="Scegli cosa mostrare qui"
        >
          <MdOutlineTune aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default HeaderSlots;
