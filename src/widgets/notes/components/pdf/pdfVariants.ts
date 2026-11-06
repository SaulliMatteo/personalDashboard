import type { ThemeVariants } from "../../../../core/theme/variants";

/**
 * Il contatore delle pagine nella barra del blocco PDF cambia forma con il tema
 * (useThemeVariant): cifre sobrie in Notte, "di" in Opaco, a mano in Quaderno, display a 3 cifre in Fosforo.
 */
export const PDF_PAGE_COUNTER: ThemeVariants<(current: number, total: number) => string> = {
  notte: (c, t) => `${c} / ${t}`,
  opaco: (c, t) => `${c} di ${t}`,
  quaderno: (c, t) => `pag. ${c} di ${t}`,
  fosforo: (c, t) => `${String(c).padStart(3, "0")}/${String(t).padStart(3, "0")}`,
};
