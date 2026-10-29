import { rowTitle, valueText, viewRows, type ValueContext } from "./collections";
import { fieldsOf, getCollectionsState, rowInfo, rowsOf, type CollectionsState } from "./collectionsStore";

/**
 * Esportazione (Markdown, PDF/PNG, copia su disco): le viste collegate diventano tabelle con i
 * dati del momento, i riferimenti @ il titolo della riga. Si lavora su una copia dell'HTML.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface ExpandOptions {
  /** true = i riferimenti diventano testo "@titolo" (Markdown); false = restano chip (PDF). */
  refsAsText?: boolean;
  /** Titolo di una nota per i campi "nota" (se non lo si sa: "nota collegata"). */
  noteTitle?: (id: number) => string | null;
}

export function expandCollectionBlocks(html: string, options: ExpandOptions = {}, s: CollectionsState = getCollectionsState()): string {
  if (!html.includes("data-view=") && !html.includes("data-ref-row=")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ctx: ValueContext = { now: new Date(), noteTitle: (id) => options.noteTitle?.(id) ?? "nota collegata" };

  doc.body.querySelectorAll<HTMLElement>('[data-block="collection-view"]').forEach((block) => {
    const view = s.views.find((v) => v.id === Number(block.dataset.view));
    const collection = view ? s.collections.find((c) => c.id === view.collectionId) : undefined;
    const holder = doc.createElement("div");
    if (!view || !collection || collection.deletedAt !== null) {
      holder.innerHTML = `<p><i>Raccolta eliminata${collection ? `: «${escapeHtml(collection.name)}»` : ""}</i></p>`;
    } else {
      const fields = fieldsOf(s, collection.id).filter((f) => !view.hidden.includes(f.id));
      const rows = viewRows(rowsOf(s, collection.id), fields, view, ctx);
      const head = fields.map((f) => `<th>${escapeHtml(f.name)}</th>`).join("");
      const body = rows
        .map((r) => `<tr>${fields.map((f) => `<td>${escapeHtml(valueText(f, r.data[String(f.id)] ?? null, ctx)) || "<br>"}</td>`).join("")}</tr>`)
        .join("");
      holder.innerHTML = `<p><b>${escapeHtml(collection.name)}</b></p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    block.replaceWith(...Array.from(holder.childNodes));
  });

  doc.body.querySelectorAll<HTMLElement>("[data-ref-row]").forEach((el) => {
    const info = rowInfo(s, Number(el.dataset.refRow));
    const title = info ? rowTitle(info.fields, info.row, ctx) : el.textContent || "riga eliminata";
    if (options.refsAsText) el.replaceWith(doc.createTextNode(`@${title}`));
    else el.textContent = title;
  });
  return doc.body.innerHTML;
}
