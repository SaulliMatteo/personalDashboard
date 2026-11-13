/** Testi dei valori del Monitor di sistema. `null` (dato non disponibile su questa macchina) diventa sempre "—". */

export const NA = "—";

const GB = 1024 ** 3;

/** Numero con la virgola all'italiana. */
function num(value: number, digits: number): string {
  return value.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function percent(value: number | null | undefined, digits = 0): string {
  return value == null ? NA : `${num(value, digits)}%`;
}

export function celsius(value: number | null | undefined): string {
  return value == null ? NA : `${num(value, 0)} °C`;
}

/** Byte in KB/MB/GB/TB (base 1024, come Gestione attività). */
export function bytes(value: number | null | undefined): string {
  if (value == null) return NA;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${num(v, i >= 3 && v < 100 ? 1 : 0)} ${units[i]}`;
}

/** "11,2 / 32 GB": usato e totale con la stessa unità (quella del totale). */
export function usedOfTotal(used: number | null | undefined, total: number | null | undefined): string {
  if (used == null || total == null) return NA;
  if (total >= 1024 * GB) return `${num(used / (1024 * GB), 1)} / ${num(total / (1024 * GB), 1)} TB`;
  return `${num(used / GB, 1)} / ${num(total / GB, 0)} GB`;
}

export function rate(value: number | null | undefined): string {
  return value == null ? NA : `${bytes(value)}/s`;
}

export function ghz(mhz: number | null | undefined): string {
  return mhz == null ? NA : `${num(mhz / 1000, 1)} GHz`;
}

export function mhz(value: number | null | undefined): string {
  if (value == null) return NA;
  return value >= 1000 ? ghz(value) : `${num(value, 0)} MHz`;
}

export function rpm(value: number | null | undefined): string {
  return value == null ? NA : `${num(value, 0)} RPM`;
}

/** Quota 0-1 di usato su totale, per le barre (null se manca uno dei due). */
export function ratio(used: number | null | undefined, total: number | null | undefined): number | null {
  if (used == null || total == null || total <= 0) return null;
  return Math.min(1, Math.max(0, used / total));
}

/** "acceso da 3 h 12 min". */
export function uptime(seconds: number | null | undefined): string {
  if (seconds == null) return NA;
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} g ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
