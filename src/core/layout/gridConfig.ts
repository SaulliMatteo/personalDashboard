/**
 * Parametri "fisici" della griglia che NON sono (ancora) impostazioni
 * utente, perché cambiarli invaliderebbe i layout salvati e le taglie
 * dei widget (vedi core/widgets/sizes.ts).
 *
 * Margine, altezza righe e ritardo di spinta sono invece impostazioni:
 * vedi core/settings/schema.ts.
 */
export const GRID_COLS = 4;
export const GRID_MAX_ROWS = 4;

// Altezza minima di riga in px, per non schiacciare i widget con finestre strette.
export const MIN_ROW_HEIGHT = 40;
