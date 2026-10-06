import type { ComponentType, ReactNode } from "react";
import type { SettingsGroup } from "../settings/schema";

/** Taglia ammessa, in unità di griglia (colonne × righe), non pixel. */
export interface WidgetSize {
  /** Identificatore stabile, usato come key nelle liste. */
  key: string;
  w: number;
  h: number;
  /** Etichetta mostrata nel catalogo, es. "Piccola (1×1)". */
  label: string;
}

export interface WidgetPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Props che la dashboard passa a ogni widget: la taglia con cui è disegnato. */
export interface WidgetProps {
  w: number;
  h: number;
}

/**
 * Tutto ciò che serve sapere di un widget, in UN posto. Per aggiungere un
 * widget: crea src/widgets/<nome>/ con un index.ts che esporta una
 * WidgetDefinition e aggiungilo a src/widgets/registry.ts.
 */
export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  component: ComponentType<WidgetProps>;
  /** Taglie ammesse. La prima è quella proposta di default nel catalogo. */
  sizes: WidgetSize[];
  /** Se presente, il widget fa parte del layout iniziale (primo avvio / reset). */
  defaultPlacement?: WidgetPlacement;
  /** Pagina a schermo intero aperta cliccando il widget in dashboard. */
  detailComponent?: ComponentType;
  /** Gruppo di impostazioni dello schema che appartiene a questo widget (scheda Settings > Widgets). */
  settingsGroup?: SettingsGroup;
  /** Provider di contesto che il widget richiede (sempre montato, anche se il widget non è in dashboard). */
  provider?: ComponentType<{ children: ReactNode }>;
}
