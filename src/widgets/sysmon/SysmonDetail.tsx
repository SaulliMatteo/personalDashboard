import { createElement, useState, type CSSProperties } from "react";
import { useNav } from "../../core/nav/useNav";
import { useLayout } from "../../core/layout/useLayout";
import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant } from "../../core/theme/variants";
import { sizeKey } from "../../core/widgets/sizes";
import BackButton from "../../ui/BackButton";
import { SYSMON_AVAILABLE, SYSMON_INTERVALS, type GpuInfo } from "./data/sysmonApi";
import { SYSMON_WIDGET_ID, useSysmonFeed } from "./useSysmon";
import { sysmonSize } from "./lib/metrics";
import { NA, bytes, celsius, ghz, percent, rate, ratio, uptime, usedOfTotal } from "./lib/format";
import { diskLabel, isHotTemp, mainGpu, sensorLabel } from "./lib/views";
import { SYSMON_CHARTS } from "./card/cards";
import Bar from "./components/Bar";
import MetricsDialog from "./components/MetricsDialog";
import ProcessTable from "./detail/ProcessTable";
import "./SysmonWidget.css";
import "./SysmonDetail.css";

/** Soglia del colore "caldo" delle barre per thread e dei dischi pieni. */
const HOT_THREAD = 90;
const HOT_DISK = 0.9;

function Value({ value, unit, hot = false, className = "" }: { value: string; unit?: string; hot?: boolean; className?: string }) {
  return (
    <span className={`smw-num${hot ? " smw-hot" : ""} ${className}`}>
      {value}
      {unit && value !== NA && <span className="smw-unit">{unit}</span>}
    </span>
  );
}

const roundOrNa = (v: number | null | undefined) => (v == null ? NA : String(Math.round(v)));
const gbOrNa = (v: number | null | undefined) =>
  v == null ? NA : (v / 1024 ** 3).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Le tessere di una scheda video: i campi che il driver non espone restano "—". */
function GpuTiles({ gpu }: { gpu: GpuInfo }) {
  const tiles: [string, string, string, boolean][] = [
    ["Utilizzo", roundOrNa(gpu.usage), "%", false],
    gpu.sharedMemory
      ? ["Memoria", "condivisa", "", false]
      : ["VRAM", gbOrNa(gpu.vramUsed), gpu.vramTotal != null ? `/ ${Math.round(gpu.vramTotal / 1024 ** 3)} GB` : "GB", false],
    ["Temperatura", roundOrNa(gpu.temperatureC), "°C", gpu.temperatureC != null && gpu.temperatureC >= 85],
    ["Consumo", roundOrNa(gpu.powerPercent), "%", false],
    ["Ventola", gpu.fanRpm == null ? NA : String(Math.round(gpu.fanRpm)), "RPM", false],
    ["Clock core", roundOrNa(gpu.clockMhz), "MHz", false],
    ["Clock memoria", roundOrNa(gpu.memoryClockMhz), "MHz", false],
  ];
  return (
    <div className="smp-tiles">
      {tiles.map(([label, value, unit, hot]) => (
        <div key={label} className="smw-tile">
          <span className="smw-tile-top">{label}</span>
          <Value value={value} unit={unit} hot={hot} />
        </div>
      ))}
    </div>
  );
}

/**
 * Pagina del Monitor di sistema (docs/mockup/temi/sysmon.html): riepilogo con i grafici degli ultimi 60 s, CPU con
 * barre per thread, schede video, memoria, dischi, sensori e la tabella dei processi. Mentre è aperta il campionatore
 * manda anche la lista completa dei processi e la CPU per thread.
 */
function SysmonDetail() {
  const { goToDashboard } = useNav();
  return (
    <div className="smp">
      {SYSMON_AVAILABLE ? (
        <LiveDetail onBack={goToDashboard} />
      ) : (
        <>
          <header className="dashboard-header smp-header">
            <div>
              <h1>Monitor di sistema</h1>
            </div>
            <BackButton onClick={goToDashboard} />
          </header>
          <section className="smp-card">
            <p className="smp-fine">Il monitor legge l'hardware di questo computer: è disponibile solo nell'app desktop.</p>
          </section>
        </>
      )}
    </div>
  );
}

function LiveDetail({ onBack }: { onBack: () => void }) {
  const { snapshot: snap, history, capabilities } = useSysmonFeed(true);
  const { settings, updateSetting } = useSettings();
  const { layout } = useLayout();
  const [dialogOpen, setDialogOpen] = useState(false);
  const Chart = useThemeVariant(SYSMON_CHARTS);

  const placed = layout.find((item) => item.i === SYSMON_WIDGET_ID);
  const widgetSize = placed ? sysmonSize(sizeKey(placed.w, placed.h)) : null;

  const cpu = snap?.cpu;
  const gpu = mainGpu(snap);
  const mem = snap?.memory;
  const net = snap?.network;
  const sys = snap?.system;
  const subtitle = [sys?.hostName, sys?.os, sys?.uptimeS != null ? `acceso da ${uptime(sys.uptimeS)}` : null].filter(Boolean).join(" · ");
  const memRatio = ratio(mem?.used, mem?.total);
  const swapRatio = ratio(mem?.swapUsed, mem?.swapTotal);

  const cpuSpecs = [
    cpu?.physicalCores != null ? `${cpu.physicalCores} core` : null,
    cpu?.threads != null ? `${cpu.threads} thread` : null,
    cpu?.frequencyMhz != null ? ghz(cpu.frequencyMhz) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header className="dashboard-header smp-header">
        <div>
          <h1>Monitor di sistema</h1>
          <p>{subtitle || "In attesa della prima misura…"}</p>
        </div>
        <div className="smp-actions">
          <label className="smp-interval">
            Aggiorna ogni
            <select value={settings.sysmonInterval} onChange={(e) => updateSetting("sysmonInterval", e.target.value as "1" | "2" | "5")}>
              {SYSMON_INTERVALS.map((s) => (
                <option key={s} value={String(s)}>
                  {s} s
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="smp-btn" onClick={() => setDialogOpen(true)}>
            Metriche del widget
          </button>
          <BackButton onClick={onBack} />
        </div>
      </header>

      {/* Riepilogo */}
      <div className="smp-grid smp-grid--sum">
        <section className="smp-card">
          <div className="smp-card-head">
            <h2>CPU</h2>
            <span>{cpu?.frequencyMhz != null ? ghz(cpu.frequencyMhz) : ""}</span>
          </div>
          <Value value={roundOrNa(cpu?.usage)} unit="%" className="smp-big" />
          {createElement(Chart, { points: history.cpu, className: "smp-spark" })}
        </section>
        <section className="smp-card">
          <div className="smp-card-head">
            <h2>GPU</h2>
            <span>{gpu?.temperatureC != null ? celsius(gpu.temperatureC) : ""}</span>
          </div>
          <Value value={roundOrNa(gpu?.usage)} unit="%" className="smp-big" />
          {createElement(Chart, { points: history.gpu, className: "smp-spark" })}
        </section>
        <section className="smp-card">
          <div className="smp-card-head">
            <h2>Memoria</h2>
            <span>{memRatio == null ? "" : percent(memRatio * 100)}</span>
          </div>
          <Value value={gbOrNa(mem?.used)} unit={mem?.total != null ? `/ ${Math.round(mem.total / 1024 ** 3)} GB` : "GB"} className="smp-big" />
          {createElement(Chart, { points: history.memory, className: "smp-spark" })}
        </section>
        <section className="smp-card">
          <div className="smp-card-head">
            <h2>Rete</h2>
            <span>{net?.interface ?? ""}</span>
          </div>
          <span className="smw-num smp-big smp-rate">↓ {rate(net?.rxBps)}</span>
          <span className="smw-mono smp-rate-up">↑ {rate(net?.txBps)}</span>
        </section>
      </div>

      <div className="smp-grid smp-grid--two">
        {/* Processore */}
        <section className="smp-card">
          <div className="smp-card-head">
            <h2>Processore{cpu?.model ? ` · ${cpu.model}` : ""}</h2>
            <span>{cpuSpecs}</span>
          </div>
          <div className="smp-chart-box">
            {createElement(Chart, { points: history.cpu, className: "smp-chart", label: "Utilizzo della CPU negli ultimi 60 secondi" })}
          </div>
          <span className="smp-fine">Per thread</span>
          {cpu?.perThread && cpu.perThread.length > 0 ? (
            <div className="smp-threads">
              {cpu.perThread.map((v, i) => (
                <div key={i} className="smp-thread" title={`Thread ${i + 1}: ${percent(v)}`}>
                  <div className={`smp-thread-bar${v >= HOT_THREAD ? " is-hot" : ""}`} style={{ "--v": `${Math.min(100, v)}%` } as CSSProperties}>
                    <i />
                  </div>
                  <span className="smw-mono">{Math.round(v)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="smp-fine">{NA}</p>
          )}
        </section>

        {/* Schede video */}
        <section className="smp-card">
          {(snap?.gpus ?? []).length === 0 ? (
            <>
              <div className="smp-card-head">
                <h2>Scheda video</h2>
              </div>
              <p className="smp-fine">{capabilities && !capabilities.gpu ? "Nessuna scheda video leggibile su questo computer." : NA}</p>
            </>
          ) : (
            snap!.gpus.map((g, i) => (
              <div key={`${g.name}-${i}`} className="smp-gpu">
                <div className="smp-card-head">
                  <h2>Scheda video{g.name ? ` · ${g.name}` : ""}</h2>
                  <span>{g.sharedMemory ? "memoria condivisa" : usedOfTotal(g.vramUsed, g.vramTotal)}</span>
                </div>
                <GpuTiles gpu={g} />
                {g === gpu && (
                  <div className="smp-chart-box">
                    {createElement(Chart, { points: history.gpu, className: "smp-chart smp-chart--short", label: "Utilizzo della GPU negli ultimi 60 secondi" })}
                  </div>
                )}
              </div>
            ))
          )}
          <p className="smp-fine">
            I valori vengono dal driver: quelli che il driver non espone appaiono come «—». Il consumo è in percentuale della potenza
            massima.
          </p>
        </section>
      </div>

      <div className="smp-grid smp-grid--three">
        {/* Memoria */}
        <section className="smp-card">
          <h2>Memoria</h2>
          <div className="smp-mem">
            <div className="smp-mem-row">
              <span>RAM</span>
              <span className="smw-mono">{usedOfTotal(mem?.used, mem?.total)}</span>
            </div>
            <Bar value={memRatio == null ? null : memRatio * 100} label="RAM usata" />
          </div>
          <div className="smp-mem">
            <div className="smp-mem-row">
              <span>Swap / file di paging</span>
              <span className="smw-mono">{usedOfTotal(mem?.swapUsed, mem?.swapTotal)}</span>
            </div>
            <Bar value={swapRatio == null ? null : swapRatio * 100} label="Swap usato" />
          </div>
          <div className="smp-mem-row dim">
            <span>Disponibile</span>
            <span className="smw-mono">{bytes(mem?.available)}</span>
          </div>
        </section>

        {/* Dischi */}
        <section className="smp-card">
          <h2>Dischi</h2>
          {(snap?.disks ?? []).length === 0 && <p className="smp-fine">{NA}</p>}
          {(snap?.disks ?? []).map((d) => {
            const r = ratio(d.used, d.total);
            return (
              <div key={d.mount} className="smp-mem">
                <div className="smp-mem-row">
                  <span>
                    {d.name ? `${d.name} (${diskLabel(d)})` : diskLabel(d)}
                    {d.removable ? " · rimovibile" : ""}
                  </span>
                  <span className="smw-mono">{usedOfTotal(d.used, d.total)}</span>
                </div>
                <Bar value={r == null ? null : r * 100} hot={r != null && r >= HOT_DISK} label={`Spazio usato su ${diskLabel(d)}`} />
                <span className="smp-io smw-mono">
                  lettura {rate(d.readBps)} · scrittura {rate(d.writeBps)} · {celsius(d.temperatureC)}
                </span>
              </div>
            );
          })}
        </section>

        {/* Sensori */}
        <section className="smp-card">
          <h2>Sensori</h2>
          <div className="smp-sensors">
            {(snap?.sensors ?? []).map((s, i) => (
              <div key={`${s.label}-${i}`} className="smp-sensor">
                <span>{sensorLabel(s)}</span>
                <span className={`smw-mono${isHotTemp(s) ? " smw-hot" : ""}`}>{celsius(s.temperatureC)}</span>
              </div>
            ))}
            {capabilities && !capabilities.cpuTemp && (
              <div className="smp-sensor">
                <span>CPU</span>
                <span className="smp-na">
                  {capabilities.cpuTempReason === "windows" ? "non disponibile su Windows" : "nessun sensore leggibile"}
                </span>
              </div>
            )}
            <div className="smp-sensor">
              <span>Batteria</span>
              {snap?.battery ? (
                <span className="smw-mono">
                  {percent(snap.battery.percent)}
                  {snap.battery.minutesLeft != null ? ` · ${Math.floor(snap.battery.minutesLeft / 60)} h ${snap.battery.minutesLeft % 60} min` : ""}
                </span>
              ) : (
                <span className="smp-na">{NA} (nessuna batteria)</span>
              )}
            </div>
            {snap && snap.sensors.length === 0 && (capabilities?.cpuTemp ?? true) && <p className="smp-fine">Nessun sensore di temperatura leggibile.</p>}
          </div>
        </section>
      </div>

      <ProcessTable processes={snap?.processes ?? null} count={snap?.processCount ?? null} />

      {dialogOpen && <MetricsDialog size={widgetSize} onClose={() => setDialogOpen(false)} />}
    </>
  );
}

export default SysmonDetail;
