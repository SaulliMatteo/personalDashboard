import { useState } from "react";
import "./widgetCatalog.css";
import { WIDGET_REGISTRY } from "../../widgets/registry";
import type { WidgetDefinition, WidgetSize } from "../../core/widgets/types";
import { useLayout } from "../../core/layout/LayoutContext";
import { useNav } from "../../core/nav/NavContext";
import BackButton from "../../ui/BackButton";

function WidgetCatalog() {
  const { layout, addWidget, removeWidget, findFreeSlot } = useLayout();
  const { goToDashboard } = useNav();

  // Taglia selezionata per ogni widget NON ancora presente (chiave = id widget).
  const [selectedSizeKey, setSelectedSizeKey] = useState<Record<string, string>>({});

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
    <div className="widget-catalog">
      <header className="dashboard-header widget-catalog-header">
        <div>
          <h1>Widget disponibili</h1>
          <p>Aggiungi o rimuovi i widget dalla tua dashboard.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      <div className="widget-catalog-grid">
        {WIDGET_REGISTRY.map((widget) => {
          const present = isPresent(widget.id);
          const currentItem = layout.find((item) => item.i === widget.id);
          const selectedSize = getSelectedSize(widget);
          const hasAnyFreeSlot = widget.sizes.some((s) => findFreeSlot(s) !== null);
          const selectedFits = findFreeSlot(selectedSize) !== null;

          return (
            <article key={widget.id} className="widget-catalog-card">
              <div className="widget-catalog-card-head">
                <h2>{widget.name}</h2>
                <span
                  className={`widget-catalog-status ${present ? "is-present" : hasAnyFreeSlot ? "is-available" : "is-full"}`}
                >
                  {present ? "Nella dashboard" : hasAnyFreeSlot ? "Disponibile" : "Spazio insufficiente"}
                </span>
              </div>

              <p className="widget-catalog-description">{widget.description}</p>

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
    </div>
  );
}

export default WidgetCatalog;
