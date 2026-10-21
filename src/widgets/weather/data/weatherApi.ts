/**
 * L'unico punto in cui il meteo va in rete (come `invoke()` per i widget nativi):
 * Open-Meteo, gratuito e senza chiave. Viene chiamato solo se il meteo è in uso.
 */

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

export interface CurrentWeather {
  /** °C */
  temperature: number;
  /** Codice WMO (vedi lib/conditions.ts). */
  code: number;
  isDay: boolean;
}

/** Errore con un messaggio già pronto da mostrare. */
export class WeatherError extends Error {}

async function getJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new WeatherError("Nessuna connessione");
  }
  if (!response.ok) throw new WeatherError("Servizio meteo non disponibile");
  return response.json();
}

/** Città → coordinate. */
export async function findPlace(city: string): Promise<Place> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=it&format=json&name=${encodeURIComponent(city)}`;
  const data = (await getJson(url)) as { results?: { name: string; latitude: number; longitude: number }[] };
  const first = data.results?.[0];
  if (!first) throw new WeatherError("Città non trovata");
  return { name: first.name, latitude: first.latitude, longitude: first.longitude };
}

/** Condizioni attuali in un punto. */
export async function fetchCurrent(place: Place): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const data = (await getJson(url)) as { current?: { temperature_2m: number; weather_code: number; is_day: number } };
  if (!data.current) throw new WeatherError("Risposta del servizio meteo non valida");
  return { temperature: data.current.temperature_2m, code: data.current.weather_code, isDay: data.current.is_day === 1 };
}
