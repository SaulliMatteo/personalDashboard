import type { ThemeVariants } from "../../../core/theme/variants";

/** Etichette di stato del server: in Fosforo sono quelle di un interruttore hardware (mockup). */
export const STATUS_LABELS: ThemeVariants<[string, string]> = {
  notte: ["Online", "Offline"],
  opaco: ["Online", "Offline"],
  quaderno: ["Online", "Offline"],
  fosforo: ["On", "Off"],
};
