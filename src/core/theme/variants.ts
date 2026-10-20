import type { ThemeId } from "./themes";
import { useTheme } from "./useTheme";

/** Una versione per ogni tema: la mappa obbliga a non dimenticarne nessuno. */
export type ThemeVariants<T> = Record<ThemeId, T>;

/**
 * Sceglie la versione del tema corrente (un componente, un valore...).
 * È il modo per far cambiare un pezzo di interfaccia col tema senza
 * scrivere `if (theme === ...)` nei widget.
 */
export function useThemeVariant<T>(variants: ThemeVariants<T>): T {
  return variants[useTheme().id];
}
