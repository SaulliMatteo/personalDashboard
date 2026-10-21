import { useEffect, useMemo, useState, type ReactNode } from "react";
import { publishActivity } from "../../core/activity/activityBus";
import { useLayout } from "../../core/layout/useLayout";
import { useSettings } from "../../core/settings/useSettings";
import { useNow } from "../../core/hooks/useNow";
import { fetchCurrent, findPlace, WeatherError } from "./data/weatherApi";
import { loadWeatherCache, saveWeatherCache, type WeatherCache } from "./data/weatherRepository";
import { WEATHER_WIDGET_ID, WeatherContext } from "./useWeather";

/** Ogni quanto si riscarica il meteo. */
const REFRESH_MS = 30 * 60_000;
/** Oltre quest'età il dato si segna "non aggiornato". */
const STALE_MS = 60 * 60_000;
/** Attesa prima di cercare una città appena scritta: niente richieste a ogni lettera. */
const TYPING_DELAY_MS = 1000;

/**
 * Meteo condiviso tra widget 1×1 e mini dell'intestazione. Va in rete solo se la città
 * è impostata e il meteo è in uso (in dashboard o in uno spazio dell'intestazione).
 */
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { layout } = useLayout();
  const now = useNow();
  const city = settings.weatherCity.trim();
  const inUse =
    layout.some((item) => item.i === WEATHER_WIDGET_ID) ||
    settings.headerSlot1 === WEATHER_WIDGET_ID ||
    settings.headerSlot2 === WEATHER_WIDGET_ID;
  const enabled = city !== "";

  const [weather, setWeather] = useState<WeatherCache | null>(null);
  // L'errore ricorda per quale città è nato: cambiando città sparisce da solo.
  const [failure, setFailure] = useState<{ city: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !inUse) return;
    let cancelled = false;

    async function refresh(force: boolean) {
      const cached = await loadWeatherCache();
      const valid = cached && cached.city === city ? cached : null;
      if (cancelled) return;
      if (valid) setWeather(valid);
      // Cache ancora fresca: niente rete.
      if (!force && valid && Date.now() - valid.fetchedAt < REFRESH_MS) return;

      setLoading(true);
      try {
        // La città si cerca solo quando cambia; poi bastano le coordinate salvate.
        const place = valid ? valid.place : await findPlace(city);
        const current = await fetchCurrent(place);
        const next = { city, place, current, fetchedAt: Date.now() };
        await saveWeatherCache(next);
        if (!cancelled) {
          setWeather(next);
          setFailure(null);
        }
      } catch (e) {
        if (!cancelled) setFailure({ city, message: e instanceof WeatherError ? e.message : "Errore nel caricamento del meteo" });
        if (!(e instanceof WeatherError)) console.error("Errore nel caricamento del meteo:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const first = window.setTimeout(() => void refresh(false), TYPING_DELAY_MS);
    const timer = window.setInterval(() => void refresh(true), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [enabled, inUse, city]);

  const current = weather && weather.city === city ? weather : null;
  const error = failure && failure.city === city ? failure.message : null;
  const stale = current !== null && (error !== null || now.getTime() - current.fetchedAt > STALE_MS);

  // Per chi ascolta (es. il Companion, che si trasforma col caldo e col freddo), senza conoscere il Meteo.
  const temperature = current ? current.current.temperature : null;
  useEffect(() => {
    publishActivity({ weatherTemperature: enabled ? temperature : null });
  }, [enabled, temperature]);

  const value = useMemo(
    () => ({ enabled, weather: current, stale, error, loading }),
    [enabled, current, stale, error, loading]
  );
  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}
