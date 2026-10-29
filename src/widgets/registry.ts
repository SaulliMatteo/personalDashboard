import type { WidgetDefinition } from "../core/widgets/types";
import type { LayoutItem } from "../core/layout/layoutRepository";
import { pigmentFor, type Pigment } from "../core/theme/themes";
import { studyWidget } from "./study";
import { fileTransferWidget } from "./filetransfer";
import { youtubeWidget } from "./youtube";
import { notesWidget } from "./notes";
import { companionWidget } from "./companion";
import { clockWidget } from "./clock";
import { dateWidget } from "./date";
import { weatherWidget } from "./weather";
import { whiteboardWidget } from "./whiteboard";
// L'unica eccezione a "widgets non importa social": il widget Gruppi sta con i moduli che legge.
import { groupsWidget } from "../social/widget";

/**
 * L'UNICO elenco dei widget dell'app. Per aggiungerne uno:
 *  1. crea src/widgets/<nome>/ con il componente e un index.ts che
 *     esporta una WidgetDefinition;
 *  2. aggiungilo qui sotto.
 * Catalogo, dashboard, layout di default e provider si aggiornano da soli.
 * L'ordine determina anche l'ordine delle righe nel layout di default.
 */
export const WIDGET_REGISTRY: WidgetDefinition[] = [studyWidget, fileTransferWidget, youtubeWidget, notesWidget, companionWidget, clockWidget, dateWidget, weatherWidget, groupsWidget, whiteboardWidget];

const widgetsById = new Map(WIDGET_REGISTRY.map((widget) => [widget.id, widget] as const));

export function getWidget(id: string): WidgetDefinition | undefined {
  return widgetsById.get(id);
}

/** Pigmento del widget nel tema Opaco (attributo `data-pigment` della sua cella e della sua pagina). */
export function widgetPigment(id: string): Pigment {
  return pigmentFor(id, Math.max(0, WIDGET_REGISTRY.findIndex((widget) => widget.id === id)));
}

/**
 * Layout iniziale usato SOLO al primo avvio e dal "reset posizione".
 * Derivato dai `defaultPlacement` dei singoli widget.
 */
export const DEFAULT_LAYOUT: LayoutItem[] = WIDGET_REGISTRY.flatMap((widget) =>
  widget.defaultPlacement ? [{ i: widget.id, ...widget.defaultPlacement }] : []
);
