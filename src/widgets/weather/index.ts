import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_WIDE } from "../../core/widgets/sizes";
import WeatherWidget from "./WeatherWidget";

export const weatherWidget: WidgetDefinition = {
  id: "weather",
  name: "Meteo",
  description: "Temperatura attuale e condizioni del cielo per la tua città.",
  component: WeatherWidget,
  sizes: [SIZE_S, SIZE_M_WIDE],
  defaultPlacement: { x: 0, y: 0, w: 1, h: 1 },
  settingsGroup: "weather",
};
