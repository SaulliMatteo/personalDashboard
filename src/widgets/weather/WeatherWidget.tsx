import WidgetFrame from "../../core/widgets/WidgetFrame";
import "./weather.css";

function WeatherWidget() {
  return (
    <WidgetFrame>
      <article className="widget">
        <div className="widget-header">
          <h2>Weather</h2>
        </div>

        <div className="weather-content">
          <span className="weather-temperature">24°</span>

          <div>
            <p>Sunny</p>
            <span>Spoleto</span>
          </div>
        </div>
      </article>
    </WidgetFrame>
  );
}

export default WeatherWidget;
