/**
 * Parametri "fisici" della griglia che NON sono impostazioni utente,
 * perché cambiarli invaliderebbe i layout salvati e le taglie dei widget
 * (vedi core/widgets/sizes.ts).
 *
 * Il numero di colonne è fisso. Le RIGHE sono invece impostabili
 * (settings.gridRows, minimo 4): aumentarle non invalida nessun layout.
 *
 * Margine, altezza righe e ritardo di spinta: vedi core/settings/schema.ts.
 */
export const GRID_COLS = 4;

// Altezza minima di riga in px, per non schiacciare i widget con finestre strette.
export const MIN_ROW_HEIGHT = 40;
