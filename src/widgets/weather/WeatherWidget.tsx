import WidgetFrame from "../../core/widgets/WidgetFrame";
import { useSettings } from "../../core/settings/SettingsContext";
import "./weather.css";

// Dati di esempio finché non c'è una vera fonte meteo: 24 °C, soleggiato.
const SAMPLE_TEMP_C = 24;

function WeatherWidget() {
  const { settings } = useSettings();
  const isFahrenheit = settings.weatherUnit === "f";
  const temperature = isFahrenheit ? Math.round((SAMPLE_TEMP_C * 9) / 5 + 32) : SAMPLE_TEMP_C;

  return (
    <WidgetFrame>
      <article className="widget">
        <div className="widget-header">
          <h2>Weather</h2>
        </div>

        <div className="weather-content">
          <span className="weather-temperature">{temperature}°{isFahrenheit ? "F" : ""}</span>

          <div>
            <p>Sunny</p>
            <span>{settings.weatherCity}</span>
          </div>
        </div>
      </article>
    </WidgetFrame>
  );
}

export default WeatherWidget;
