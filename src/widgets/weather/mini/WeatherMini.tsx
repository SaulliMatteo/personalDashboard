import { createElement } from "react";
import { MdCloudQueue } from "react-icons/md";
import { useNav } from "../../../core/nav/useNav";
import { conditionFor, temperatureText } from "../lib/conditions";
import { useWeather } from "../useWeather";
import "./WeatherMini.css";

/** Mini da intestazione: icona, temperatura nel font display, condizione e città. */
function WeatherMini() {
  const { enabled, weather, stale, error } = useWeather();
  const { openSettings } = useNav();

  if (!enabled) {
    return (
      <button type="button" className="weather-mini-setup" onClick={() => openSettings("widget:weather")}>
        Meteo: scegli la città
      </button>
    );
  }

  const condition = weather ? conditionFor(weather.current.code, weather.current.isDay) : null;
  return (
    <div className={`weather-mini${stale ? " is-stale" : ""}`}>
      <span className="weather-mini-icon" aria-hidden="true">{createElement(condition ? condition.icon : MdCloudQueue)}</span>
      {weather && <span className="weather-mini-temp">{temperatureText(weather.current.temperature)}</span>}
      <span className="weather-mini-text">
        <span className="weather-mini-title">{condition ? condition.label : (error ?? "Carico…")}</span>
        {weather && <span>{stale ? `${weather.place.name} · non aggiornato` : weather.place.name}</span>}
      </span>
    </div>
  );
}

export default WeatherMini;
