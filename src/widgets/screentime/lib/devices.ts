/**
 * Dispositivi di Tempo allo schermo: ogni riga viene da un computer o da un telefono (col sync arrivano anche quelle
 * degli altri). Il filtro "Tutti / Computer / Telefono" sceglie cosa si somma nel widget e nella pagina.
 */
import { formatClock } from "./format";

export type DeviceKind = "computer" | "phone";
export type DeviceFilter = "all" | DeviceKind;

export const DEVICE_KINDS: readonly DeviceKind[] = ["computer", "phone"];
export const DEVICE_FILTERS: readonly DeviceFilter[] = ["all", "computer", "phone"];

export const DEVICE_LABEL: Record<DeviceKind, string> = { computer: "Computer", phone: "Telefono" };
export const FILTER_LABEL: Record<DeviceFilter, string> = { all: "Tutti", computer: "Computer", phone: "Telefono" };

export function parseDeviceFilter(value: unknown): DeviceFilter {
  return value === "computer" || value === "phone" ? value : "all";
}

export const zeroDevices = (): Record<DeviceKind, number> => ({ computer: 0, phone: 0 });

/** Le righe che il filtro fa contare. */
export function byDevice<T extends { device: DeviceKind }>(rows: readonly T[], filter: DeviceFilter): T[] {
  return filter === "all" ? [...rows] : rows.filter((r) => r.device === filter);
}

/** I dispositivi che hanno del tempo in queste righe. */
export function devicesIn(rows: readonly { device: DeviceKind; seconds: number }[]): Set<DeviceKind> {
  return new Set(rows.filter((r) => r.seconds > 0).map((r) => r.device));
}

/** "telefono aggiornato alle 17:20": l'ultimo secondo contato sugli altri dispositivi e arrivato col sync. */
export function othersFreshText(here: DeviceKind, at: number | null): string | null {
  if (at === null) return null;
  return `${here === "computer" ? "telefono" : "computer"} aggiornato alle ${formatClock(at)}`;
}
