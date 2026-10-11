/**
 * Controllo della schermata di avvio, definita in index.html (fuori da React).
 * Tre funzioni, nessuna dipendenza: qualunque parte dell'app può usarle.
 */

const MIN_VISIBLE_MS = 700; // evita il "flash" quando tutto carica in un attimo
const FADE_MS = 420; // = transizione CSS in index.html

function splashElement(): HTMLElement | null {
  return document.getElementById("splash");
}

/** Cambia la riga di stato ("Apro il database…", "Preparo i widget…"). */
export function setSplashStatus(text: string): void {
  const el = document.getElementById("splash-status");
  if (el) el.textContent = text;
}

/** Fa sparire la splash (rispettando il tempo minimo) e la toglie dal DOM. */
export function hideSplash(): void {
  const el = splashElement();
  if (!el || el.classList.contains("is-leaving")) return;
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add("is-leaving");
    window.setTimeout(() => el.remove(), FADE_MS + 50);
  }, wait);
}
