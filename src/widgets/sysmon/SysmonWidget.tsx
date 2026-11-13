import { createElement, useEffect, useMemo, useState, type MouseEvent } from "react";
import { MdOutlineDesktopWindows, MdTune } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { useSettings } from "../../core/settings/useSettings";
import { SYSMON_AVAILABLE } from "./data/sysmonApi";
import { useSysmonFeed } from "./useSysmon";
import { useMetricChoice } from "./useMetricChoice";
import { MAX_METRICS, sysmonSize, trimToSize, type MetricId, type SysmonSize } from "./lib/metrics";
import { buildView, type MetricView } from "./lib/views";
import { SYSMON_CHARTS, SYSMON_GAUGES } from "./card/cards";
import Bar from "./components/Bar";
import MetricsDialog from "./components/MetricsDialog";
import "./SysmonWidget.css";

/** Come si disegna una metrica in Larga e Media: grafico, barra, righe di testo o solo il numero. */
type Kind = "chart" | "bar" | "lines" | "value";
const KIND: Record<MetricId, Kind> = {
  cpu: "chart",
  gpu: "chart",
  cpuTemp: "value",
  memory: "bar",
  disk: "bar",
  battery: "bar",
  network: "lines",
  temps: "lines",
  processes: "lines",
};
/** Le metriche che nella Piccola possono stare nell'anello (hanno una percentuale). */
const GAUGEABLE = new Set<MetricId>(["cpu", "gpu", "memory", "disk", "battery"]);

/** Il messaggio del telefono e del browser: nessun comando chiamato, nessuna misura. */
function UnavailableCell() {
  return (
    <WidgetFrame>
      <article className="widget smw smw--na">
        <header className="smw-head">
          <h2 className="smw-title">Sistema</h2>
        </header>
        <div className="smw-na">
          <MdOutlineDesktopWindows size={26} aria-hidden="true" />
          <p>Il monitor legge l'hardware di questo computer: è disponibile solo nell'app desktop.</p>
        </div>
      </article>
    </WidgetFrame>
  );
}

function Num({ view, className = "" }: { view: Pick<MetricView, "value" | "unit" | "hot">; className?: string }) {
  return (
    <span className={`smw-num${view.hot ? " smw-hot" : ""} ${className}`}>
      {view.value}
      {view.unit && view.value !== "—" && <span className="smw-unit">{view.unit}</span>}
    </span>
  );
}

/**
 * Monitor di sistema in dashboard (docs/design/temi/sysmon.html): Piccola 1×1 fino a 3 metriche (anello, numero,
 * riga con barra), Larga 2×1 fino a 4 tessere, Media 2×2 fino a 8. Le metriche le sceglie il dialog della rotellina;
 * anelli e grafici hanno una forma per tema (card/cards.ts), barre e tessere la prendono dal CSS.
 */
function SysmonWidget({ w, h }: WidgetProps) {
  if (!SYSMON_AVAILABLE) return <UnavailableCell />;
  return <LiveWidget size={sysmonSize(sizeKey(w, h))} />;
}

function LiveWidget({ size }: { size: SysmonSize }) {
  const { snapshot, history } = useSysmonFeed(false);
  const { settings } = useSettings();
  const { saved, shown, save } = useMetricChoice(size);
  const [dialogOpen, setDialogOpen] = useState(false);
  const Gauge = useThemeVariant(SYSMON_GAUGES);
  const Chart = useThemeVariant(SYSMON_CHARTS);

  // La taglia è scesa sotto la scelta salvata: si tolgono le ultime della lista (una volta, poi resta così).
  useEffect(() => {
    if (saved && saved.length > MAX_METRICS[size]) save(trimToSize(saved, size));
  }, [saved, size, save]);

  const views = useMemo(() => shown.map((id) => buildView(id, snapshot, history)), [shown, snapshot, history]);

  function openDialog(e: MouseEvent) {
    e.stopPropagation();
    setDialogOpen(true);
  }

  const chart = (view: MetricView, className = "smw-spark") =>
    view.series ? createElement(Chart, { points: view.series, className, label: `${view.label}, ultimi 60 secondi` }) : null;

  let body;
  if (views.length === 0) {
    body = <p className="smw-empty">Nessuna metrica scelta: usa la rotellina per sceglierle.</p>;
  } else if (size === "S") {
    const [hero, side, foot] = views;
    body = (
      <>
        <div className="smw-hero">
          {GAUGEABLE.has(hero.id) ? (
            createElement(
              Gauge,
              { value: hero.percent, hot: hero.hot, label: hero.label },
              <Num view={{ value: hero.percent == null ? "—" : String(Math.round(hero.percent)), unit: "%", hot: hero.hot }} />,
              <small>{hero.label}</small>
            )
          ) : (
            <div className="smw-side">
              <span className="smw-label">{hero.label}</span>
              <Num view={hero} className="smw-num--hero" />
              {hero.detail && <span className="smw-label smw-mono">{hero.detail}</span>}
            </div>
          )}
          {side && (
            <div className="smw-side">
              <span className="smw-label">{side.label}</span>
              {KIND[side.id] === "lines" ? (
                <span className="smw-mono smw-side-text">{side.summary}</span>
              ) : (
                <Num view={side} />
              )}
              {side.detail && KIND[side.id] !== "lines" && <span className="smw-label smw-mono">{side.detail}</span>}
            </div>
          )}
        </div>
        {foot && (
          <div className="smw-foot">
            <div className="smw-foot-row">
              <span>{foot.label}</span>
              <span className={`smw-mono${foot.hot ? " smw-hot" : ""}`}>{foot.summary}</span>
            </div>
            {foot.percent != null && <Bar value={foot.percent} hot={foot.hot} />}
          </div>
        )}
      </>
    );
  } else if (size === "W") {
    body = (
      <div className="smw-grid">
        {views.map((view) => {
          const kind = KIND[view.id];
          return (
            <div key={view.id} className="smw-tile">
              <div className="smw-tile-main">
                <span className="smw-tile-top">
                  <b>{view.label}</b>
                  {view.detail && kind !== "bar" && <span>{view.detail}</span>}
                  {kind === "bar" && view.percent != null && view.id !== "disk" && <span>{Math.round(view.percent)}%</span>}
                </span>
                {kind !== "lines" && <Num view={view} />}
              </div>
              {kind === "chart" && chart(view)}
              {kind === "bar" && <Bar value={view.percent} hot={view.hot} />}
              {kind === "lines" && (
                <div className="smw-lines smw-mono">
                  {(view.lines ?? []).slice(0, 2).map((line, i) => (
                    <span key={i} className={line.hot ? "smw-hot" : undefined}>
                      {view.id === "processes" ? line.label : `${line.label} ${line.value}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div className="smw-grid">
        {views.map((view) => {
          const kind = KIND[view.id];
          const wide = view.id === "processes";
          return (
            <div key={view.id} className={`smw-tile${wide ? " smw-wide" : ""}`}>
              <span className="smw-tile-top">
                <b>{view.label}</b>
                {kind === "bar" ? (
                  <span className={`smw-mono${view.hot ? " smw-hot" : ""}`}>{view.summary}</span>
                ) : (
                  view.detail && <span>{view.detail}</span>
                )}
              </span>
              {kind === "chart" && (
                <>
                  <Num view={view} />
                  {chart(view)}
                </>
              )}
              {kind === "value" && <Num view={view} />}
              {kind === "bar" && <Bar value={view.percent} hot={view.hot} label={view.label} />}
              {kind === "lines" && view.id === "network" && (
                <div className="smw-net smw-mono">
                  {(view.lines ?? []).map((line) => (
                    <span key={line.label}>
                      {line.label} {line.value}
                    </span>
                  ))}
                </div>
              )}
              {kind === "lines" && view.id === "temps" && (
                <div className="smw-chips">
                  {(view.lines ?? []).length === 0 && <span className="smw-label">—</span>}
                  {(view.lines ?? []).map((line, i) => (
                    <div key={i} className="smw-chip">
                      <span className="smw-label">{line.label}</span>
                      <span className={`smw-num${line.hot ? " smw-hot" : ""}`}>
                        {line.value.replace(" °C", "")}
                        {line.value !== "—" && <span className="smw-unit">°C</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {kind === "lines" && view.id === "processes" && (
                <div className="smw-procs">
                  {(view.lines ?? []).map((line, i) => (
                    <div key={i} className="smw-proc">
                      <span>{line.label}</span>
                      <span className="smw-mono">{line.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <WidgetFrame>
      <article className={`widget smw smw--${size}`} aria-label="Monitor di sistema">
        <header className="smw-head">
          <h2 className="smw-title">Sistema</h2>
          {size !== "S" && <span className="smw-sub">ogni {settings.sysmonInterval} s</span>}
          <button type="button" className="smw-gear" onClick={openDialog} aria-label="Metriche del widget" title="Metriche del widget">
            <MdTune size={15} />
          </button>
        </header>
        {body}
      </article>
      {dialogOpen && <MetricsDialog size={size} onClose={() => setDialogOpen(false)} />}
    </WidgetFrame>
  );
}

export default SysmonWidget;
