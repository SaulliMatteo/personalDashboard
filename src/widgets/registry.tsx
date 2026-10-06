import type { ReactElement } from "react";
import WeatherWidget from "../components/widgets/WeatherWidget";
import TasksWidget from "../components/widgets/TasksWidget";
import CalendarWidget from "../components/widgets/CalendarWidget";
import NotesWidget from "../components/widgets/NotesWidget";
import StudyWidget from "../components/widgets/StudyWidget";
import StudyDetail from "../pages/StudyDetail";
import type { LayoutItem } from "../database/layoutRepository";

/**
 * Taglie fisse ammesse nell'app. Le dimensioni sono in unità di griglia
 * (colonne × righe), non pixel — vedi src/grid/gridConfig.ts per quanto
 * misura davvero una cella.
 */
export interface WidgetSize {
  /** Identificatore stabile della taglia, usato come key nelle liste. */
  key: string;
  w: number;
  h: number;
  /** Etichetta mostrata nel catalogo, es. "Piccola (1×1)". */
  label: string;
}

const SIZE_S: WidgetSize = { key: "S", w: 1, h: 1, label: "Piccola (1×1)" };
const SIZE_M_WIDE: WidgetSize = { key: "M_WIDE", w: 2, h: 1, label: "Media (2×1)" };
const SIZE_M_SQUARE: WidgetSize = { key: "M_SQUARE", w: 2, h: 2, label: "Media (2×2)" };
const SIZE_L_WIDE: WidgetSize = { key: "L_WIDE", w: 4, h: 2, label: "Grande (4×2)" };
const SIZE_L_TALL: WidgetSize = { key: "L_TALL", w: 4, h: 3, label: "Grande (4×3)" };

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  component: () => ReactElement;
  /** Taglie ammesse per questo widget. La prima è quella proposta di default nel catalogo. */
  sizes: WidgetSize[];
  /**
   * Pagina a schermo intero aperta cliccando il widget in dashboard.
   * Opzionale: i widget senza pagina propria (Weather, Tasks, Calendar,
   * Notes per ora) restano semplicemente non cliccabili — vedi
   * Dashboard.tsx, che naviga solo se questo campo è presente.
   */
  detailComponent?: () => ReactElement;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: "weather",
    name: "Meteo",
    description: "Temperatura attuale e condizioni del cielo per la tua città.",
    component: () => <WeatherWidget />,
    sizes: [SIZE_S, SIZE_M_WIDE],
  },
  {
    id: "tasks",
    name: "Attività",
    description: "Quante attività ti restano ancora da completare.",
    component: () => <TasksWidget />,
    sizes: [SIZE_S, SIZE_M_WIDE],
  },
  {
    id: "calendar",
    name: "Calendario",
    description: "I prossimi eventi in agenda per oggi.",
    component: () => <CalendarWidget />,
    sizes: [SIZE_M_SQUARE, SIZE_L_WIDE, SIZE_L_TALL],
  },
  {
    id: "notes",
    name: "Note",
    description: "Appunti veloci sempre a portata di mano.",
    component: () => <NotesWidget />,
    sizes: [SIZE_M_SQUARE, SIZE_L_WIDE],
  },
  {
    id: "study",
    name: "Studio",
    description: "Timer pomodoro e tempo di studio per materia, con report periodico.",
    component: () => <StudyWidget />,
    sizes: [SIZE_S, SIZE_M_SQUARE],
    detailComponent: () => <StudyDetail />,
  },
];

export const WIDGET_MAP: Record<string, WidgetDefinition> = Object.fromEntries(
  WIDGET_REGISTRY.map((widget) => [widget.id, widget])
);

/**
 * Layout iniziale usato SOLO se non esiste ancora nulla nel database
 * (primo avvio, o dopo l'azzeramento legato al passaggio a 4 colonne —
 * vedi CURRENT_LAYOUT_SCHEMA_VERSION in src/database/db.ts).
 * Nessuna sovrapposizione, tutto entro GRID_COLS × GRID_MAX_ROWS (4×4).
 */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "weather", x: 0, y: 0, w: 1, h: 1 },
  { i: "tasks", x: 1, y: 0, w: 1, h: 1 },
  { i: "calendar", x: 2, y: 0, w: 2, h: 2 },
  { i: "notes", x: 0, y: 1, w: 2, h: 2 },
];
