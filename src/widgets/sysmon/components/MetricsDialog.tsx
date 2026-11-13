import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSysmon } from "../useSysmon";
import { useMetricChoice } from "../useMetricChoice";
import { MAX_METRICS, METRICS, isMetricDisabled, toggleMetric, type MetricId, type SysmonSize } from "../lib/metrics";
import "./MetricsDialog.css";

const SIZE_NAMES: Record<SysmonSize, string> = { S: "Piccola (1×1)", W: "Larga (2×1)", T: "Alta (1×2)", M: "Media (2×2)" };

interface MetricsDialogProps {
  /** Taglia del widget in dashboard; null se il widget non c'è (si sceglie per la più grande). */
  size: SysmonSize | null;
  onClose: () => void;
}

/**
 * "Cosa mostrare su questo computer": le caselle delle metriche, al massimo quante ne entrano nella taglia (le altre
 * si disattivano), e quelle che questa macchina non sa leggere sempre disattivate con il motivo. La taglia si cambia
 * nel catalogo, qui è solo indicata.
 */
function MetricsDialog({ size, onClose }: MetricsDialogProps) {
  const effectiveSize = size ?? "M";
  const { capabilities, isAvailable } = useSysmon();
  const { shown, save } = useMetricChoice(effectiveSize);
  const [ids, setIds] = useState<MetricId[]>(shown);
  const max = MAX_METRICS[effectiveSize];
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:not(:disabled)")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function unavailableHint(id: MetricId): string | null {
    if (isAvailable(id)) return null;
    if (!capabilities) return "In attesa del computer…";
    if (id === "cpuTemp") return capabilities.cpuTempReason === "windows" ? "Non disponibile su Windows" : "Nessun sensore leggibile su questo computer";
    if (id === "battery") return "Nessuna batteria su questo computer";
    if (id === "gpu") return "Nessuna scheda video leggibile";
    return "Nessun sensore leggibile su questo computer";
  }

  function handleSave() {
    save(ids);
    onClose();
  }

  return createPortal(
    <div
      className="smd-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Il dialog sta nel <body> ma per React è dentro la cella: il doppio click non deve aprire la pagina.
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div ref={ref} className="smd" role="dialog" aria-modal="true" aria-labelledby="smd-title">
        <header className="smd-head">
          <h2 id="smd-title">Cosa mostrare su questo computer</h2>
          <p className="smd-size">
            {size ? (
              <>
                Taglia attuale: <b>{SIZE_NAMES[size]} · massimo {max}</b>. La taglia si cambia nel catalogo.
              </>
            ) : (
              <>
                Il widget non è in dashboard: si sceglie per la taglia più grande (<b>massimo {max}</b>).
              </>
            )}
          </p>
        </header>
        <p className="smd-count" aria-live="polite">
          Selezionate <b>{ids.length}</b> di massimo {max}
        </p>
        <ul className="smd-list">
          {METRICS.map((metric) => {
            const checked = ids.includes(metric.id);
            const disabled = isMetricDisabled(ids, metric.id, effectiveSize, isAvailable);
            const hint = unavailableHint(metric.id) ?? metric.hint;
            return (
              <li key={metric.id}>
                <label className={`smd-item${checked ? " is-on" : ""}${disabled ? " is-off" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => setIds((current) => toggleMetric(current, metric.id, effectiveSize, isAvailable))}
                  />
                  <span className="smd-text">
                    <span>{metric.label}</span>
                    <span>{hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <footer className="smd-actions">
          <button type="button" className="smd-btn smd-btn--ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className="smd-btn smd-btn--primary" onClick={handleSave}>
            Salva
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export default MetricsDialog;
