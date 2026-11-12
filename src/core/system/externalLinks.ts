import { openUrl } from "@tauri-apps/plugin-opener";

const EXTERNAL = /^(https?:|mailto:)/i;

/**
 * Un click su un link esterno (es. in una nota ricevuta) lo apre nel browser di sistema invece di far navigare la
 * finestra dell'app. La guardia vera resta `on_navigation` in `src-tauri/src/lib.rs`, ma su macOS quella vede anche le
 * navigazioni degli iframe e deve lasciar passare gli host del player di YouTube: senza questo, un link a youtube.com
 * porterebbe via la pagina principale. I link dentro un testo modificabile (l'editor delle Note) non si aprono al
 * click, come prima; chi gestisce già il click (preventDefault) resta com'è.
 */
export function installExternalLinks(): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.isContentEditable) return;
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!EXTERNAL.test(href)) return;
    e.preventDefault();
    void openUrl(href).catch((error) => console.error("Link non aperto:", error));
  });
}
