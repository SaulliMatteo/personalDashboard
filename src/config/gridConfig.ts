/**
 * Parametri "fisici" della griglia della dashboard.
 *
 * Centralizzati qui perché servono in più punti che devono restare
 * PERFETTAMENTE sincronizzati tra loro: Dashboard.tsx (per configurare
 * <GridLayout>), il compactor (per bloccare/pushare entro i limiti) e
 * WidgetCatalog (per calcolare se c'è spazio libero per un widget).
 * Se questi numeri divergessero tra i vari punti, il ghost o il controllo
 * "spazio disponibile" risulterebbero disallineati rispetto alla griglia
 * vera.
 */

// Colonne fisse: con dimensioni di widget fisse (S/M/L) una griglia più
// piccola e "quadrata" risulta più pulita di una a 12 colonne pensata per
// il resize libero che avevamo prima.
export const GRID_COLS = 4;

// Righe massime fisse. Per ora un numero fisso semplice; se in futuro si
// vuole tornare a calcolarlo dall'altezza reale del contenitore, questo è
// il punto in cui reintrodurlo.
export const GRID_MAX_ROWS = 4;

// Altezza di riga come frazione della larghezza di una colonna, invece di
// un valore fisso in pixel: così la griglia resta proporzionata quando la
// finestra viene ridimensionata, invece di "stirarsi" in orizzontale con
// righe sempre alte uguali.
//
// 0.5 lascia le righe più basse delle colonne (non quadrate): con finestra
// minima (1200px) e sidebar (240px) è la scelta più sicura per far stare
// GRID_MAX_ROWS righe nell'area visibile senza scroll. Se in futuro si
// vuole uno stile a celle più quadrate si può alzare verso 0.6/1, tenendo
// presente che il .grid-container ora scrolla in verticale (vedi App.css)
// come rete di sicurezza se il contenuto risultasse comunque più alto
// dello spazio visibile.
export const ROW_HEIGHT_RATIO = 0.5;
