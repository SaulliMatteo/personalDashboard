/**
 * Parametri "fisici" della griglia che NON sono impostazioni utente,
 * perché cambiarli invaliderebbe i layout salvati e le taglie dei widget
 * (vedi core/widgets/sizes.ts).
 *
 * Il numero di colonne è fisso. Le RIGHE sono invece impostabili
 * (settings.gridRows, minimo 4): aumentarle non invalida nessun layout.
 *
 * L'altezza di riga si ricava dall'altezza disponibile (la griglia riempie
 * la finestra e non la supera mai: la dashboard non scorre); lo spazio fra
 * i widget lo decide il tema (--grid-gap).
 */
export const GRID_COLS = 6;
