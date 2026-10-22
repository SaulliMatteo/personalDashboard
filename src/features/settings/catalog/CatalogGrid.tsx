import { useEffect, useRef, useState } from "react";
import "./catalogGrid.css";
import { WIDGET_REGISTRY } from "../../../widgets/registry";
import type { WidgetDefinition, WidgetSize } from "../../../core/widgets/types";
import { useLayout } from "../../../core/layout/useLayout";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import WidgetSettingsButton from "./WidgetSettingsButton";

/**
 * Le card del catalogo: aggiungere o togliere un widget e, con la rotellina,
 * le sue impostazioni (il `settingsGroup` dello schema) aperte dentro la card.
 * Usata dalla pagina catalogo e da Impostazioni > Widget.
 */
function CatalogGrid({ initialOpenId = null }: { initialOpenId?: string | null }) {
  const { layout, addWidget, removeWidget, findFreeSlot } = useLayout();

  // Taglia selezionata per ogni widget NON ancora presente (chiave = id widget).
  const [selectedSizeKey, setSelectedSizeKey] = useState<Record<string, string>>({});
  // Una sola card con le impostazioni aperte alla volta.
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const initialCardRef = useRef<HTMLElement | null>(null);

  // Arrivando da un "Imposta…" del widget, la sua card aperta va in vista (solo all'apertura).
  useEffect(() => {
    initialCardRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const isPresent = (id: string) => layout.some((item) => item.i === id);

  function getSelectedSize(widget: WidgetDefinition): WidgetSize {
    const key = selectedSizeKey[widget.id];
    const found = key ? widget.sizes.find((s) => s.key === key) : undefined;
    if (found) return found;
    // Di default proponiamo la prima taglia che ha davvero spazio libero,
    // così "Aggiungi" risulta già utilizzabile.
    return widget.sizes.find((s) => findFreeSlot(s) !== null) ?? widget.sizes[0];
  }

  async function handleAdd(widget: WidgetDefinition) {
    const size = getSelectedSize(widget);
    await addWidget(widget.id, { w: size.w, h: size.h });
  }

  return (
    <div className="widget-catalog-grid">
      {WIDGET_REGISTRY.map((widget) => {
        const present = isPresent(widget.id);
        const currentItem = layout.find((item) => item.i === widget.id);
        const selectedSize = getSelectedSize(widget);
        const hasAnyFreeSlot = widget.sizes.some((s) => findFreeSlot(s) !== null);
        const selectedFits = findFreeSlot(selectedSize) !== null;
        const open = openId === widget.id && Boolean(widget.settingsGroup);

        return (
          <article
            key={widget.id}
            className={`widget-catalog-card${open ? " is-open" : ""}`}
            ref={widget.id === initialOpenId ? initialCardRef : undefined}
          >
            <div className="widget-catalog-card-head">
              <h2>{widget.name}</h2>
              <div className="widget-catalog-card-tools">
                <span
                  className={`widget-catalog-status ${present ? "is-present" : hasAnyFreeSlot ? "is-available" : "is-full"}`}
                >
                  {present ? "Nella dashboard" : hasAnyFreeSlot ? "Disponibile" : "Spazio insufficiente"}
                </span>
                <WidgetSettingsButton
                  widget={widget}
                  open={open}
                  onToggle={() => setOpenId(open ? null : widget.id)}
                />
              </div>
            </div>

            <p className="widget-catalog-description">{widget.description}</p>

            {open && widget.settingsGroup && (
              <SettingsSection group={widget.settingsGroup} className="widget-catalog-settings" />
            )}

            {present ? (
              <div className="widget-catalog-actions">
                {currentItem && (
                  <span className="widget-catalog-current-size">
                    Taglia attuale: {currentItem.w}×{currentItem.h}
                  </span>
                )}
                <button className="widget-catalog-btn widget-catalog-btn--danger" onClick={() => removeWidget(widget.id)}>
                  Rimuovi
                </button>
              </div>
            ) : (
              <>
                <div className="widget-catalog-sizes">
                  {widget.sizes.map((size) => {
                    const fits = findFreeSlot(size) !== null;
                    const active = selectedSize.key === size.key;
                    return (
                      <button
                        key={size.key}
                        type="button"
                        disabled={!fits}
                        className={`widget-catalog-size-btn${active ? " active" : ""}`}
                        onClick={() => setSelectedSizeKey((prev) => ({ ...prev, [widget.id]: size.key }))}
                        title={fits ? undefined : "Non c'è spazio libero per questa taglia"}
                      >
                        {size.label}
                      </button>
                    );
                  })}
                </div>

                <div className="widget-catalog-actions">
                  <button className="widget-catalog-btn" disabled={!selectedFits} onClick={() => handleAdd(widget)}>
                    Aggiungi
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

export default CatalogGrid;
