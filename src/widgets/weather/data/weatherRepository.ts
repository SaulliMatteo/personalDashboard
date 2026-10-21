import { getMeta, setMeta } from "../../../core/db";
import type { CurrentWeather, Place } from "./weatherApi";

/** Ultimo meteo scaricato: si mostra subito all'avvio e quando la rete non c'è. */
export interface WeatherCache {
  /** Città come scritta nelle impostazioni: se cambia, la cache non vale più. */
  city: string;
  place: Place;
  current: CurrentWeather;
  /** ms */
  fetchedAt: number;
}

const CACHE_KEY = "weather_cache";

export async function loadWeatherCache(): Promise<WeatherCache | null> {
  const raw = await getMeta(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WeatherCache;
  } catch {
    return null;
  }
}

export async function saveWeatherCache(cache: WeatherCache): Promise<void> {
  await setMeta(CACHE_KEY, JSON.stringify(cache));
}
