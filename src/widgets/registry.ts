import type { WidgetDefinition } from "../core/widgets/types";
import type { LayoutItem } from "../core/layout/layoutRepository";
import { weatherWidget } from "./weather";
import { tasksWidget } from "./tasks";
import { calendarWidget } from "./calendar";
import { notesWidget } from "./notes";
import { studyWidget } from "./study";

/**
 * L'UNICO elenco dei widget dell'app. Per aggiungerne uno:
 *  1. crea src/widgets/<nome>/ con il componente e un index.ts che
 *     esporta una WidgetDefinition;
 *  2. aggiungilo qui sotto.
 * Catalogo, dashboard, layout di default e provider si aggiornano da soli.
 * L'ordine determina anche l'ordine delle righe nel layout di default.
 */
export const WIDGET_REGISTRY: WidgetDefinition[] = [
  weatherWidget,
  tasksWidget,
  calendarWidget,
  notesWidget,
  studyWidget,
];

const widgetsById = new Map(WIDGET_REGISTRY.map((widget) => [widget.id, widget] as const));

export function getWidget(id: string): WidgetDefinition | undefined {
  return widgetsById.get(id);
}

/**
 * Layout iniziale usato SOLO al primo avvio e dal "reset posizione".
 * Derivato dai `defaultPlacement` dei singoli widget.
 */
export const DEFAULT_LAYOUT: LayoutItem[] = WIDGET_REGISTRY.flatMap((widget) =>
  widget.defaultPlacement ? [{ i: widget.id, ...widget.defaultPlacement }] : []
);
