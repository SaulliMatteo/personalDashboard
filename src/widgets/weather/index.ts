import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S } from "../../core/widgets/sizes";
import WeatherWidget from "./WeatherWidget";
import WeatherMini from "./mini/WeatherMini";
import { WeatherProvider } from "./WeatherContext";
import { WEATHER_WIDGET_ID } from "./useWeather";

export const weatherWidget: WidgetDefinition = {
  id: WEATHER_WIDGET_ID,
  name: "Meteo",
  description: "Temperatura e cielo nella tua città (Open-Meteo, usa internet solo se lo attivi).",
  component: WeatherWidget,
  sizes: [SIZE_S],
  mini: WeatherMini,
  settingsGroup: "weather",
  // Lo stesso dato serve al widget e al mini dell'intestazione.
  provider: WeatherProvider,
};
