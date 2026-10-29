import type { ComponentType, ReactNode } from "react";

/**
 * Un modulo dei Gruppi: una cosa che si fa insieme (oggi lo studio; domani altro, fino al luogo comune
 * con i Pixy di tutti). È il gemello di WidgetDefinition (core/widgets/types.ts).
 */
export interface SocialModule {
  /**
   * Chiave stabile: è la `feature_key` di `group_features` sul server e l'ultima parte del canale
   * Realtime `group:<group_id>:<key>`. Formato `^[a-z][a-z0-9_]{1,30}$`; non si cambia mai.
   */
  key: string;
  /** Nome mostrato in UI. */
  name: string;
  /** Lavoro in sottofondo del modulo (es. invio dei totali), montato sempre con l'app. */
  provider?: ComponentType<{ children: ReactNode }>;
}
