import type { IconType } from "react-icons";
import {
  MdAcUnit,
  MdCloud,
  MdFoggy,
  MdGrain,
  MdNightlight,
  MdThunderstorm,
  MdWaterDrop,
  MdWbCloudy,
  MdWbSunny,
} from "react-icons/md";

export interface Condition {
  label: string;
  icon: IconType;
}

/** Codici WMO di Open-Meteo → descrizione breve e icona. */
export function conditionFor(code: number, isDay: boolean): Condition {
  if (code === 0) return { label: "Sereno", icon: isDay ? MdWbSunny : MdNightlight };
  if (code <= 2) return { label: "Poco nuvoloso", icon: isDay ? MdWbCloudy : MdNightlight };
  if (code === 3) return { label: "Nuvoloso", icon: MdCloud };
  if (code <= 48) return { label: "Nebbia", icon: MdFoggy };
  if (code <= 57) return { label: "Pioviggine", icon: MdGrain };
  if (code <= 67) return { label: "Pioggia", icon: MdWaterDrop };
  if (code <= 77) return { label: "Neve", icon: MdAcUnit };
  if (code <= 82) return { label: "Rovesci", icon: MdWaterDrop };
  if (code <= 86) return { label: "Neve", icon: MdAcUnit };
  return { label: "Temporale", icon: MdThunderstorm };
}

/** "18°". */
export function temperatureText(celsius: number): string {
  return `${Math.round(celsius)}°`;
}
