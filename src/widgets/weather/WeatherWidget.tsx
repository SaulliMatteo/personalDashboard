import { createElement } from "react";
import { MdCloudQueue } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import { useNav } from "../../core/nav/useNav";
import { conditionFor, temperatureText } from "./lib/conditions";
import { useWeather } from "./useWeather";
import "./WeatherWidget.css";

/**
 * 1×1: temperatura in grande, icona in alto a destra, condizione sotto.
 * Senza città è un pulsante a tutta cella che apre le impostazioni del meteo
 * (il meteo non ha una pagina di dettaglio, quindi basta il click singolo).
 */
function WeatherWidget() {
  const { enabled, weather, stale, error } = useWeather();
  const { openSettings } = useNav();

  if (!enabled) {
    return (
      <WidgetFrame>
        <article className="widget weatherw">
          <button
            type="button"
            className="weatherw-setup"
            onClick={(e) => {
              e.stopPropagation();
              openSettings("widget:weather");
            }}
          >
            <MdCloudQueue className="weatherw-empty" aria-hidden="true" />
            <span className="weatherw-cap">Scegli la città</span>
          </button>
        </article>
      </WidgetFrame>
    );
  }

  const condition = weather ? conditionFor(weather.current.code, weather.current.isDay) : null;
  const caption = condition ? (stale ? "Non aggiornato" : condition.label) : (error ?? "Carico…");
  return (
    <WidgetFrame>
      <article
        className={`widget weatherw${stale ? " is-stale" : ""}`}
        aria-label={weather && condition ? `Meteo a ${weather.place.name}: ${temperatureText(weather.current.temperature)}, ${condition.label}` : `Meteo: ${caption}`}
      >
        {weather ? (
          <span className="weatherw-temp" aria-hidden="true">{temperatureText(weather.current.temperature)}</span>
        ) : (
          <MdCloudQueue className="weatherw-empty" aria-hidden="true" />
        )}
        {condition && <span className="weatherw-icon" aria-hidden="true">{createElement(condition.icon)}</span>}
        <span className="weatherw-cap" aria-hidden="true">{caption}</span>
      </article>
    </WidgetFrame>
  );
}

export default WeatherWidget;
