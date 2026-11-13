/**
 * Quale forma del widget entra nello spazio vero della cella: le celle cambiano con la finestra (la griglia divide
 * l'altezza disponibile), quindi la taglia da sola non basta. Puro (prova in `scripts/sysmon/metrics.test.mts`).
 *
 * - "full": la forma del mockup (anello nella Piccola, tessere con numero e grafico in Larga, Alta e Media);
 * - "lines": una riga per metrica, etichetta e valore, con la barra sottile se c'è posto.
 * Se nemmeno le righe entrano si toglie prima l'intestazione ("bare": la rotellina resta nella pagina di dettaglio),
 * poi le ultime metriche: mai testi schiacciati o sovrapposti.
 */
import type { SysmonSize } from "./metrics";

export interface WidgetFit {
  mode: "full" | "lines";
  /** Quante metriche si vedono (le prime della lista). */
  count: number;
  /** Righe con la barra sotto (solo "lines"). */
  bars: boolean;
  /** Senza intestazione (titolo e rotellina). */
  bare: boolean;
  /** Lato dell'anello della Piccola, in px. */
  gauge: number;
}

/** Intestazione (22 px) più lo spazio sotto (10 px). */
export const HEAD_SPACE = 32;
const LINE = 22;
const LINE_WITH_BAR = 30;
const LINE_GAP = 5;
/** Tessera piena: etichetta, numero e un minimo di grafico o barra. */
const FULL_TILE_W = 46;
const FULL_TILE_M = 62;
/** Alta: tessere una sotto l'altra (etichetta, poi numero e grafico affiancati); i processi valgono due tessere. */
const FULL_TILE_T = 44;
const TILE_GAP = 8;
const MIN_GAUGE = 62;
const MAX_GAUGE = 84;
/** Riga in fondo della Piccola (testo e barra) sotto l'anello. */
const S_FOOT = 34;

function lines(n: number, columns: number, height: number, headroom: number): WidgetFit {
  const fit = (h: number, row: number) => Math.max(0, Math.floor((h + LINE_GAP) / (row + LINE_GAP))) * columns;
  for (const bare of [false, true]) {
    const h = bare ? height + headroom : height;
    if (fit(h, LINE_WITH_BAR) >= n) return { mode: "lines", count: n, bars: true, bare, gauge: 0 };
    if (fit(h, LINE) >= n) return { mode: "lines", count: n, bars: false, bare, gauge: 0 };
  }
  return { mode: "lines", count: Math.max(1, Math.min(n, fit(height + headroom, LINE))), bars: false, bare: true, gauge: 0 };
}

/**
 * `width`/`height`: lo spazio del contenuto sotto l'intestazione (cella meno margini e intestazione).
 * `hasWide`: ci sono i processi, che nella Media prendono una riga intera e nell'Alta il posto di due tessere.
 */
export function fitWidget(size: SysmonSize, n: number, hasWide: boolean, width: number, height: number): WidgetFit {
  const full: WidgetFit = { mode: "full", count: n, bars: true, bare: false, gauge: MAX_GAUGE };
  if (height <= 0 || width <= 0 || n === 0) return full;

  if (size === "S") {
    const gauge = Math.floor(Math.min(MAX_GAUGE, n >= 3 ? height - S_FOOT : height, width * 0.55));
    if (gauge >= MIN_GAUGE) return { ...full, gauge };
    return lines(n, 1, height, HEAD_SPACE);
  }

  if (size === "T") {
    const units = n + (hasWide ? 1 : 0);
    if ((height - (n - 1) * TILE_GAP) / units >= FULL_TILE_T) return full;
    return lines(n, 1, height, HEAD_SPACE);
  }

  const rows = size === "W" ? Math.ceil(n / 2) : Math.ceil((n - (hasWide ? 1 : 0)) / 2) + (hasWide ? 1 : 0);
  const rowHeight = (height - (rows - 1) * TILE_GAP) / rows;
  if (rowHeight >= (size === "W" ? FULL_TILE_W : FULL_TILE_M)) return full;
  return lines(n, 2, height, HEAD_SPACE);
}
