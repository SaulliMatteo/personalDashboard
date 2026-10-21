import { createContext, useContext } from "react";
import type { WeatherCache } from "./data/weatherRepository";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export const WEATHER_WIDGET_ID = "weather";

export interface WeatherContextValue {
  /** False se la città non è impostata: il meteo è spento e non va in rete. */
  enabled: boolean;
  /** Ultimo dato valido (anche vecchio), o null se non c'è mai stato. */
  weather: WeatherCache | null;
  /** True se l'ultimo tentativo è fallito o il dato ha più di un'ora. */
  stale: boolean;
  /** Messaggio dell'ultimo errore ("Città non trovata", "Nessuna connessione"…). */
  error: string | null;
  loading: boolean;
}

export const WeatherContext = createContext<WeatherContextValue | undefined>(undefined);

export function useWeather() {
  const ctx = useContext(WeatherContext);
  if (!ctx) throw new Error("useWeather deve essere usato dentro <WeatherProvider>");
  return ctx;
}
