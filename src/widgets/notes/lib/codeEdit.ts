/**
 * Modifiche del testo dentro un blocco di codice (Tab, Shift+Tab, Invio). Logica pura su
 * stringa + selezione: il componente applica il risultato con execCommand("insertText") sul
 * textarea, così l'annulla nativo del textarea resta intatto. Si prova con node.
 */

export const INDENT = "    ";

export interface TextEdit {
  /** Pezzo da sostituire [from, to) e testo nuovo. */
  from: number;
  to: number;
  text: string;
  /** Selezione dopo la modifica. */
  selStart: number;
  selEnd: number;
}

function lineStart(value: string, pos: number): number {
  return value.lastIndexOf("\n", pos - 1) + 1;
}

function lineEnd(value: string, pos: number): number {
  const i = value.indexOf("\n", pos);
  return i === -1 ? value.length : i;
}

/** Spazi da togliere all'inizio di una riga per Shift+Tab (un livello: 4 spazi o una tabulazione). */
function outdentWidth(line: string): number {
  if (line.startsWith("\t")) return 1;
  let n = 0;
  while (n < INDENT.length && line[n] === " ") n++;
  return n;
}

/**
 * Tab / Shift+Tab. Senza selezione Tab inserisce un livello al cursore; con una selezione (anche
 * dentro una riga sola che la copre tutta) o con Shift agisce sulle righe intere.
 */
export function indentEdit(value: string, selStart: number, selEnd: number, direction: 1 | -1): TextEdit | null {
  const multi = value.slice(selStart, selEnd).includes("\n");
  if (direction > 0 && !multi) {
    // Tab semplice: spazi fino al prossimo multiplo di 4 dalla colonna.
    const col = selStart - lineStart(value, selStart);
    const pad = INDENT.length - (col % INDENT.length);
    const text = " ".repeat(pad);
    return { from: selStart, to: selEnd, text, selStart: selStart + pad, selEnd: selStart + pad };
  }
  const from = lineStart(value, selStart);
  // Una selezione che finisce all'inizio di una riga non tocca quella riga.
  const endPos = selEnd > selStart && value[selEnd - 1] === "\n" ? selEnd - 1 : selEnd;
  const to = lineEnd(value, endPos);
  const lines = value.slice(from, to).split("\n");
  let deltaFirst = 0;
  let deltaTotal = 0;
  const out = lines.map((line, i) => {
    if (direction > 0) {
      if (line === "" && lines.length > 1) return line; // righe vuote: niente spazi inutili
      if (i === 0) deltaFirst = INDENT.length;
      deltaTotal += INDENT.length;
      return INDENT + line;
    }
    const w = outdentWidth(line);
    if (i === 0) deltaFirst = -w;
    deltaTotal -= w;
    return line.slice(w);
  });
  if (deltaTotal === 0) return null;
  const text = out.join("\n");
  const newStart = Math.max(from, selStart + deltaFirst);
  const newEnd = Math.max(newStart, selEnd + deltaTotal);
  return { from, to, text, selStart: newStart, selEnd: newEnd };
}

/** Invio: a capo con la stessa indentazione della riga (spazi e tabulazioni iniziali). */
export function newlineEdit(value: string, selStart: number, selEnd: number): TextEdit {
  const start = lineStart(value, selStart);
  const indent = value.slice(start, selStart).match(/^[ \t]*/)?.[0] ?? "";
  const text = `\n${indent}`;
  return { from: selStart, to: selEnd, text, selStart: selStart + text.length, selEnd: selStart + text.length };
}
