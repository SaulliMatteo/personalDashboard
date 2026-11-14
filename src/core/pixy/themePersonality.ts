import { perMode, useThemeVariant, type ThemeVariants } from "../theme/variants";
import type { PersonalityId } from "./engine/personalities";

/**
 * Temi che decidono da soli il carattere di Pixy (null = vale quello scelto dall'utente). Solo Ombra, e per
 * variante: l'ombra è sarcastica, la fiamma stoica (docs/TEMI.md). L'impostazione dell'utente non cambia e torna
 * a valere negli altri temi; ai compagni dei Gruppi si manda sempre quella (payload.ts conosce anche queste due,
 * ma le versioni vecchie dell'app no).
 */
const THEME_PERSONALITY: ThemeVariants<PersonalityId | null> = {
  notte: null,
  opaco: null,
  quaderno: null,
  fosforo: null,
  vetro: null,
  ombra: perMode<PersonalityId | null>({ notte: "sarcastic", giorno: "stoic" }),
};

/** La personalità di Pixy in questo tema: quella del tema, se ne ha una, o quella scelta. */
export function useThemePersonality(chosen: PersonalityId): PersonalityId {
  return useThemeVariant(THEME_PERSONALITY) ?? chosen;
}

/** Vero se il tema decide il carattere (la pagina di Pixy mostra il selettore della variante invece delle personalità). */
export function useThemeOwnsPersonality(): boolean {
  return useThemeVariant(THEME_PERSONALITY) !== null;
}
