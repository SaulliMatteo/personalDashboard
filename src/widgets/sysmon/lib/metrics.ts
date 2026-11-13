/**
 * Le metriche che il widget può mostrare e le regole della scelta (dialog "Metriche del widget"). Puro: lo prova
 * `scripts/sysmon/metrics.test.mts`.
 *
 * La scelta sta nell'impostazione `sysmonMetrics` ("cpu,gpu,…"), che è del singolo dispositivo
 * (`PER_DEVICE_SETTINGS`): un PC Windows e un Mac hanno hardware diverso. Stringa vuota = la scelta di default.
 */

export type MetricId = "cpu" | "cpuTemp" | "gpu" | "memory" | "disk" | "network" | "temps" | "processes" | "battery";

/** Taglie del widget: Piccola 1×1, Media 2×1, Grande 2×2 (chiavi di core/widgets/sizes.ts). */
export type SysmonSize = "S" | "W" | "M";

export interface MetricDef {
  id: MetricId;
  label: string;
  hint: string;
}

/** In quest'ordine nel dialog e nel widget; quando la taglia si riduce si tolgono le ultime di quest'ordine. */
export const METRICS: readonly MetricDef[] = [
  { id: "cpu", label: "CPU · utilizzo", hint: "Totale, con grafico degli ultimi 60 s" },
  { id: "cpuTemp", label: "CPU · temperatura", hint: "Solo su Mac" },
  { id: "gpu", label: "GPU · utilizzo", hint: "Con temperatura e VRAM se disponibili" },
  { id: "memory", label: "Memoria", hint: "Usata / totale" },
  { id: "disk", label: "Disco", hint: "Spazio e lettura/scrittura" },
  { id: "network", label: "Rete", hint: "Download / upload" },
  { id: "temps", label: "Temperature", hint: "GPU e SSD (CPU solo su Mac)" },
  { id: "processes", label: "Processi più pesanti", hint: "Top 3 per CPU" },
  { id: "battery", label: "Batteria", hint: "Solo portatili" },
];

export const MAX_METRICS: Record<SysmonSize, number> = { S: 3, W: 4, M: 8 };

/** Proposta per chi non ha ancora scelto (prese nell'ordine, finché c'è posto e sono disponibili). */
const DEFAULT_ORDER: readonly MetricId[] = ["cpu", "gpu", "memory", "network", "temps", "disk", "processes", "battery"];

const ORDER = new Map(METRICS.map((m, i) => [m.id, i] as const));
const isMetricId = (value: string): value is MetricId => ORDER.has(value as MetricId);

/** Ordina come in METRICS e toglie i doppioni. */
function canonical(ids: Iterable<MetricId>): MetricId[] {
  return [...new Set(ids)].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

/** Legge l'impostazione salvata: id sconosciuti (es. di versioni future) ignorati. null = mai scelta. */
export function parseMetrics(raw: string): MetricId[] | null {
  if (raw.trim() === "") return null;
  return canonical(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(isMetricId)
  );
}

export function serializeMetrics(ids: readonly MetricId[]): string {
  return canonical(ids).join(",");
}

/**
 * Le metriche da mostrare: quelle scelte (o la proposta di default) che questa macchina sa leggere, al massimo
 * quante ne entrano nella taglia.
 */
export function effectiveMetrics(saved: readonly MetricId[] | null, size: SysmonSize, available: (id: MetricId) => boolean): MetricId[] {
  // Prima si sceglie quali entrano (la proposta ha le sue priorità), poi si mettono nell'ordine della lista.
  const chosen = saved ? canonical(saved) : DEFAULT_ORDER;
  return canonical(chosen.filter(available).slice(0, MAX_METRICS[size]));
}

/** Quando la taglia si riduce: tiene le prime che ci stanno, nell'ordine della lista. */
export function trimToSize(ids: readonly MetricId[], size: SysmonSize): MetricId[] {
  return canonical(ids).slice(0, MAX_METRICS[size]);
}

/** Spunta o toglie una metrica, senza mai andare oltre il massimo della taglia (né accendere una non disponibile). */
export function toggleMetric(
  ids: readonly MetricId[],
  id: MetricId,
  size: SysmonSize,
  available: (id: MetricId) => boolean
): MetricId[] {
  if (ids.includes(id)) return ids.filter((m) => m !== id);
  if (!available(id) || ids.length >= MAX_METRICS[size]) return [...ids];
  return canonical([...ids, id]);
}

/** Una casella del dialog è disattivata se la metrica non si legge qui, o se è spenta e il massimo è raggiunto. */
export function isMetricDisabled(ids: readonly MetricId[], id: MetricId, size: SysmonSize, available: (id: MetricId) => boolean): boolean {
  if (!available(id)) return true;
  return !ids.includes(id) && ids.length >= MAX_METRICS[size];
}

/** La taglia del widget dalla chiave della griglia (layout vecchi o fuori catalogo ricadono sulla più vicina). */
export function sysmonSize(sizeKey: string): SysmonSize {
  if (sizeKey === "S" || sizeKey === "T") return "S";
  if (sizeKey === "W" || sizeKey === "STRIP") return "W";
  return "M";
}

/** Cosa sa leggere questa macchina (da `sysmon_capabilities`): le altre metriche sono sempre disponibili sul desktop. */
export interface MetricSupport {
  cpuTemp: boolean;
  gpu: boolean;
  temps: boolean;
  battery: boolean;
}

export function metricAvailable(support: MetricSupport | null, id: MetricId): boolean {
  if (!support) return id !== "cpuTemp" && id !== "gpu" && id !== "temps" && id !== "battery";
  switch (id) {
    case "cpuTemp":
      return support.cpuTemp;
    case "gpu":
      return support.gpu;
    case "temps":
      return support.temps;
    case "battery":
      return support.battery;
    default:
      return true;
  }
}
