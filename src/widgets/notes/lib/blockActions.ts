import { topBlock } from "./editorDom";
import { getTextOffsets, setTextOffsets } from "./selectionOffsets";

/**
 * Azioni sul blocco sotto il cursore (Ctrl+D, Alt+↑/↓). Un blocco è un figlio diretto della
 * pagina: paragrafo, titolo, elenco intero, tabella, immagine, scheda di un file.
 * Il cursore resta nello stesso punto del blocco.
 */

/** Duplica il blocco subito sotto e porta il cursore nella copia. */
export function duplicateBlock(root: HTMLElement): boolean {
  const block = topBlock(root);
  if (!block) return false;
  const offsets = getTextOffsets(block);
  const copy = block.cloneNode(true) as HTMLElement;
  // Il disegno di React (immagine, barra) non si copia: lo rifà da sé sul blocco nuovo.
  copy.querySelectorAll("[data-runtime]").forEach((n) => n.remove());
  copy.removeAttribute("data-selected");
  copy.querySelectorAll("[data-cur]").forEach((n) => n.removeAttribute("data-cur"));
  block.after(copy);
  if (offsets) setTextOffsets(copy, offsets);
  else if (copy.hasAttribute("data-block")) copy.focus();
  return true;
}

/** Scambia il blocco con quello sopra (-1) o sotto (+1). False se è già in cima/in fondo. */
export function moveBlock(root: HTMLElement, direction: -1 | 1): boolean {
  const block = topBlock(root);
  if (!block) return false;
  const sibling = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
  if (!sibling) return false;
  const offsets = getTextOffsets(block);
  if (direction < 0) sibling.before(block);
  else sibling.after(block);
  if (offsets) setTextOffsets(block, offsets);
  else if (block.hasAttribute("data-block")) block.focus();
  block.scrollIntoView({ block: "nearest" });
  return true;
}
