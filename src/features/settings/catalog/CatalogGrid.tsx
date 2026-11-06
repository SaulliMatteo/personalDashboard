import { useEffect, useRef, useState } from "react";
import "./catalogGrid.css";
import { WIDGET_REGISTRY } from "../../../widgets/registry";
import type { WidgetDefinition, WidgetSize } from "../../../core/widgets/types";
import { useCompact } from "../../../core/layout/useCompact";
import { widgetPigment } from "../../../widgets/registry";
import { useCatalogLayout } from "./useCatalogLayout";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import WidgetSettingsButton from "./WidgetSettingsButton";

/**
 * Le card del catalogo: aggiungere o togliere un widget e, con la rotellina,
 * le sue impostazioni (il `settingsGroup` dello schema) aperte dentro la card.
 * Usata dalla pagina catalogo e da Impostazioni > Widget.
 */
/** Anteprima della card 1×1 nel catalogo del telefono: il widget vero, rimpicciolito e non cliccabile. */
function CatalogPreview({ widget }: { widget: WidgetDefinition }) {
  const WidgetComponent = widget.component;
  return (
    <div className="widget-catalog-preview" data-pigment={widgetPigment(widget.id)} aria-hidden="true" inert>
      <div className="widget-catalog-preview-zoom">
        <WidgetComponent w={1} h={1} />
      </div>
    </div>
  );
}

/** `onAdded`: dopo "Aggiungi" (la pagina catalogo del telefono torna alla dashboard). */
function CatalogGrid({ initialOpenId = null, onAdded }: { initialOpenId?: string | null; onAdded?: () => void }) {
  const { currentSize, sizesOf, fits, add, remove } = useCatalogLayout();
  const compact = useCompact();

  // Taglia selezionata per ogni widget NON ancora presente (chiave = id widget).
  const [selectedSizeKey, setSelectedSizeKey] = useState<Record<string, string>>({});
  // Una sola card con le impostazioni aperte alla volta.
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const initialCardRef = useRef<HTMLElement | null>(null);

  // Arrivando da un "Imposta…" del widget, la sua card aperta va in vista (solo all'apertura).
  useEffect(() => {
    initialCardRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  function getSelectedSize(widget: WidgetDefinition): WidgetSize {
    const sizes = sizesOf(widget);
    const key = selectedSizeKey[widget.id];
    const found = key ? sizes.find((s) => s.key === key) : undefined;
    if (found) return found;
    // Di default proponiamo la prima taglia che ha davvero spazio libero,
    // così "Aggiungi" risulta già utilizzabile.
    return sizes.find(fits) ?? sizes[0];
  }

  async function handleAdd(widget: WidgetDefinition) {
    if (await add(widget.id, getSelectedSize(widget))) onAdded?.();
  }

  return (
    <div className="widget-catalog-grid">
      {WIDGET_REGISTRY.map((widget) => {
        const currentItem = currentSize(widget.id);
        const present = currentItem !== null;
        const sizes = sizesOf(widget);
        const selectedSize = getSelectedSize(widget);
        const hasAnyFreeSlot = sizes.some(fits);
        const selectedFits = fits(selectedSize);
        const open = openId === widget.id && Boolean(widget.settingsGroup);

        return (
          <article
            key={widget.id}
            className={`widget-catalog-card${open ? " is-open" : ""}`}
            ref={widget.id === initialOpenId ? initialCardRef : undefined}
          >
            {compact && <CatalogPreview widget={widget} />}
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
                <button className="widget-catalog-btn widget-catalog-btn--danger" onClick={() => remove(widget.id)}>
                  Rimuovi
                </button>
              </div>
            ) : (
              <>
                <div className="widget-catalog-sizes">
                  {sizes.map((size) => {
                    const sizeFits = fits(size);
                    const active = selectedSize.key === size.key;
                    return (
                      <button
                        key={size.key}
                        type="button"
                        disabled={!sizeFits}
                        className={`widget-catalog-size-btn${active ? " active" : ""}`}
                        onClick={() => setSelectedSizeKey((prev) => ({ ...prev, [widget.id]: size.key }))}
                        title={sizeFits ? undefined : "Non c'è spazio libero per questa taglia"}
                      >
                        {compact ? `${size.w}×${size.h}` : size.label}
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
