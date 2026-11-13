/**
 * Da una misura (snapshot) a ciò che il widget disegna per ogni metrica: etichetta, numero, unità, quota per
 * anelli e barre, serie del grafico, righe di testo. Le tre taglie del widget leggono solo queste viste, così una
 * metrica si descrive in un posto. Puro: nessun React.
 */
import type { DiskInfo, GpuInfo, Sensor, SysmonSnapshot } from "../data/sysmonApi";
import type { HistoryPoint, SysmonHistory } from "./history";
import type { MetricId } from "./metrics";
import { NA, bytes, celsius, ghz, percent, rate, usedOfTotal } from "./format";

const GB = 1024 ** 3;

export interface MetricLine {
  label: string;
  value: string;
  hot?: boolean;
}

export interface MetricView {
  id: MetricId;
  /** Nome breve ("CPU", "Disco C:"). */
  label: string;
  /** Il numero grande, senza unità; "—" se manca. */
  value: string;
  unit: string;
  /** Dato accanto all'etichetta ("4,5 GHz", "57 °C"); null se non c'è niente da dire. */
  detail: string | null;
  /** Una riga sola, per la riga in fondo della taglia Piccola. */
  summary: string;
  /** 0-100 per anelli e barre; null = la metrica non ne ha (o il dato manca). */
  percent: number | null;
  /** Ultimi 60 s, se la metrica ha un grafico. */
  series: HistoryPoint[] | null;
  /** Righe (rete, temperature, processi) al posto di numero e grafico. */
  lines: MetricLine[] | null;
  /** Valore da tenere d'occhio (disco pieno, temperatura alta, batteria scarica). */
  hot: boolean;
}

/** Soglie del colore "caldo". */
const HOT = { usage: 90, disk: 90, memory: 90, battery: 15 };
const HOT_TEMP: Record<Sensor["kind"], number> = { cpu: 90, gpu: 85, disk: 65, battery: 45, other: 90 };

const round = (value: number | null | undefined) => (value == null ? NA : String(Math.round(value)));
const oneDecimal = (value: number) => value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const quota = (used: number | null | undefined, total: number | null | undefined) =>
  used == null || total == null || total <= 0 ? null : Math.min(100, Math.max(0, (used / total) * 100));

/** La GPU da mostrare nel widget: la prima con qualche dato (le schede integrate spente non ne hanno). */
export function mainGpu(snapshot: SysmonSnapshot | null): GpuInfo | null {
  if (!snapshot) return null;
  return snapshot.gpus.find((g) => g.usage != null) ?? snapshot.gpus[0] ?? null;
}

/** Il disco del sistema (C: su Windows, / su Mac), altrimenti il primo. */
export function mainDisk(snapshot: SysmonSnapshot | null): DiskInfo | null {
  if (!snapshot) return null;
  return snapshot.disks.find((d) => d.system) ?? snapshot.disks[0] ?? null;
}

/** "C:" da "C:\", "/" resta "/"; i volumi del Mac col loro nome. */
export function diskLabel(disk: DiskInfo): string {
  const mount = disk.mount.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(mount)) return mount.toUpperCase();
  if (mount === "") return "/";
  return disk.name || mount;
}

export function isHotTemp(sensor: Sensor): boolean {
  return sensor.temperatureC != null && sensor.temperatureC >= HOT_TEMP[sensor.kind];
}

/** Etichetta di un sensore: su Windows i dischi arrivano come "C:" e diventano "Disco C:". */
export function sensorLabel(sensor: Sensor): string {
  if (sensor.kind === "disk" && /^[A-Za-z]:$/.test(sensor.label)) return `Disco ${sensor.label.toUpperCase()}`;
  return sensor.label;
}

/** Etichetta breve di un sensore per le righe del widget ("GPU", "Disco C:"). */
function shortSensor(sensor: Sensor): string {
  if (sensor.kind === "gpu") return "GPU";
  if (sensor.kind === "cpu") return "CPU";
  return sensorLabel(sensor);
}

function gbPair(used: number | null, total: number | null): { value: string; unit: string } {
  if (used == null || total == null) return { value: NA, unit: "" };
  return { value: oneDecimal(used / GB), unit: `/ ${Math.round(total / GB)} GB` };
}

const BATTERY_STATE: Record<string, string> = {
  charging: "in carica",
  discharging: "a batteria",
  full: "carica",
  empty: "scarica",
};

export function buildView(id: MetricId, snap: SysmonSnapshot | null, history: SysmonHistory): MetricView {
  const base = { id, unit: "", detail: null, percent: null, series: null, lines: null, hot: false };
  switch (id) {
    case "cpu": {
      const usage = snap?.cpu.usage ?? null;
      return {
        ...base,
        label: "CPU",
        value: round(usage),
        unit: "%",
        detail: snap?.cpu.frequencyMhz != null ? ghz(snap.cpu.frequencyMhz) : null,
        summary: percent(usage),
        percent: usage,
        series: history.cpu,
        hot: usage != null && usage >= HOT.usage,
      };
    }
    case "cpuTemp": {
      const t = snap?.cpu.temperatureC ?? null;
      return {
        ...base,
        label: "Temp. CPU",
        value: round(t),
        unit: "°C",
        summary: celsius(t),
        hot: t != null && t >= HOT_TEMP.cpu,
      };
    }
    case "gpu": {
      const gpu = mainGpu(snap);
      const usage = gpu?.usage ?? null;
      return {
        ...base,
        label: "GPU",
        value: round(usage),
        unit: "%",
        detail: gpu?.temperatureC != null ? celsius(gpu.temperatureC) : null,
        summary: percent(usage),
        percent: usage,
        series: history.gpu,
        hot: (usage != null && usage >= HOT.usage) || (gpu?.temperatureC != null && gpu.temperatureC >= HOT_TEMP.gpu),
      };
    }
    case "memory": {
      const used = snap?.memory.used ?? null;
      const total = snap?.memory.total ?? null;
      const p = quota(used, total);
      return {
        ...base,
        label: "Memoria",
        ...gbPair(used, total),
        detail: p == null ? null : percent(p),
        summary: usedOfTotal(used, total),
        percent: p,
        series: history.memory,
        hot: p != null && p >= HOT.memory,
      };
    }
    case "disk": {
      const disk = mainDisk(snap);
      const p = quota(disk?.used, disk?.total);
      return {
        ...base,
        label: disk ? `Disco ${diskLabel(disk)}` : "Disco",
        value: p == null ? NA : String(Math.round(p)),
        unit: "%",
        detail: disk ? usedOfTotal(disk.used, disk.total) : null,
        summary: disk ? usedOfTotal(disk.used, disk.total) : NA,
        percent: p,
        lines: disk ? [{ label: "↓ lettura", value: rate(disk.readBps) }, { label: "↑ scrittura", value: rate(disk.writeBps) }] : null,
        hot: p != null && p >= HOT.disk,
      };
    }
    case "network": {
      const net = snap?.network;
      const down = rate(net?.rxBps);
      const up = rate(net?.txBps);
      return {
        ...base,
        label: "Rete",
        value: down,
        detail: net?.interface ?? null,
        summary: `↓ ${down} ↑ ${up}`,
        lines: [
          { label: "↓", value: down },
          { label: "↑", value: up },
        ],
      };
    }
    case "temps": {
      const sensors = (snap?.sensors ?? []).filter((s) => s.temperatureC != null && s.kind !== "battery").slice(0, 3);
      const lines = sensors.map((s) => ({ label: shortSensor(s), value: celsius(s.temperatureC), hot: isHotTemp(s) }));
      return {
        ...base,
        label: "Temperature",
        value: sensors[0] ? round(sensors[0].temperatureC) : NA,
        unit: sensors[0] ? "°C" : "",
        summary: lines.length ? lines.map((l) => `${l.label} ${l.value}`).join(" · ") : NA,
        lines,
        hot: lines.some((l) => l.hot),
      };
    }
    case "processes": {
      const top = snap?.topProcesses ?? [];
      const lines = top.map((p) => ({ label: p.name, value: `${percent(p.cpu, 1)} · ${bytes(p.memory)}` }));
      return {
        ...base,
        label: "Processi",
        value: top[0] ? percent(top[0].cpu, 1) : NA,
        detail: "CPU · memoria",
        summary: top[0] ? `${top[0].name} ${percent(top[0].cpu, 1)}` : NA,
        lines,
      };
    }
    case "battery": {
      const b = snap?.battery ?? null;
      const p = b?.percent ?? null;
      const state = b?.state ? BATTERY_STATE[b.state] : null;
      const left = b?.minutesLeft != null ? `${Math.floor(b.minutesLeft / 60)} h ${b.minutesLeft % 60} min` : null;
      return {
        ...base,
        label: "Batteria",
        value: round(p),
        unit: "%",
        detail: left ?? state,
        summary: percent(p),
        percent: p,
        hot: p != null && p <= HOT.battery && b?.state !== "charging",
      };
    }
  }
}
