import type { ThemeId, ThemeMode } from "./themes";
import { useTheme } from "./useTheme";

const PER_MODE: unique symbol = Symbol("perMode");

/** Un valore diverso per ciascuna variante (giorno / notte) dello stesso tema. */
export interface PerMode<T> {
  readonly [PER_MODE]: true;
  readonly notte: T;
  readonly giorno: T;
}

/**
 * Una versione per ogni tema: la mappa obbliga a non dimenticarne nessuno.
 * Una voce può essere `perMode({ notte, giorno })` quando il tema cambia anche
 * forma tra le varianti: oggi solo Ombra (Ombra di notte, Fiamma di giorno).
 */
export type ThemeVariants<T> = Record<ThemeId, T | PerMode<T>>;

/** Valore per variante, da usare come voce di una `ThemeVariants` (solo per Ombra). */
export function perMode<T>(values: { notte: T; giorno: T }): PerMode<T> {
  return { [PER_MODE]: true, notte: values.notte, giorno: values.giorno };
}

function isPerMode<T>(value: T | PerMode<T>): value is PerMode<T> {
  return typeof value === "object" && value !== null && PER_MODE in value;
}

/** Come `useThemeVariant`, ma fuori da React (canvas, notifiche): tema e variante si passano a mano. */
export function resolveVariant<T>(variants: ThemeVariants<T>, id: ThemeId, mode: ThemeMode): T {
  const value = variants[id];
  return isPerMode(value) ? value[mode] : value;
}

/**
 * Sceglie la versione del tema corrente (un componente, un valore...).
 * È il modo per far cambiare un pezzo di interfaccia col tema senza
 * scrivere `if (theme === ...)` nei widget.
 */
export function useThemeVariant<T>(variants: ThemeVariants<T>): T {
  const { id, mode } = useTheme();
  return resolveVariant(variants, id, mode);
}
