import type { InkStroke, NewNoteInput, PageBackground } from "../data/notesRepository";

export interface TemplateInfo {
  id: string;
  label: string;
  description: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: "blank", label: "Nota vuota", description: "Una pagina bianca." },
  { id: "meeting", label: "Verbale di riunione", description: "Data, partecipanti, decisioni e azioni." },
  { id: "todo", label: "To-do giornaliera", description: "Priorità e attività di oggi, da spuntare." },
  { id: "wireframe", label: "Wireframe UI", description: "Sfondo a quadretti con una traccia di schermata." },
  { id: "dots", label: "Griglia a puntini", description: "Pagina puntinata per schizzi e appunti a mano." },
];

export const BACKGROUND_OPTIONS: { value: PageBackground; label: string }[] = [
  { value: "none", label: "Sfondo liscio" },
  { value: "dots", label: "Puntini" },
  { value: "grid", label: "Quadretti" },
  { value: "lines", label: "Righe" },
];

const check = (text = "<br>") => `<p data-check="0">${text}</p>`;

function stroke(points: [number, number][]): InkStroke {
  return { tool: "pen", color: "#8a8f98", size: 2, points };
}

/** Traccia di uno schermo di telefono (coordinate normalizzate sulla larghezza della pagina). */
const PHONE_FRAME: InkStroke[] = [
  stroke([[0.3, 0.1], [0.7, 0.1], [0.7, 0.82], [0.3, 0.82], [0.3, 0.1]]),
  stroke([[0.3, 0.16], [0.7, 0.16]]),
  stroke([[0.3, 0.76], [0.7, 0.76]]),
];

/** Costruisce il contenuto di una nota a partire da un modello (la data è quella di oggi). */
export function buildFromTemplate(id: string): NewNoteInput {
  const now = new Date();
  const longDate = now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const shortDate = now.toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");
  const page = (content: string, background: PageBackground = "none", ink: InkStroke[] = []) => [
    { content, ink, background },
  ];

  switch (id) {
    case "meeting":
      return {
        title: `Verbale · ${shortDate}`,
        tags: ["riunione"],
        pages: page(
          `<h1>Verbale di riunione</h1>` +
            `<p><b>Data:</b> ${longDate}</p><p><b>Partecipanti:</b> </p><p><b>Argomento:</b> </p>` +
            `<h2>Ordine del giorno</h2><ul><li><br></li></ul>` +
            `<h2>Decisioni</h2><ul><li><br></li></ul>` +
            `<h2>Azioni da svolgere</h2>${check("Chi · cosa · entro quando")}${check()}${check()}`
        ),
      };
    case "todo":
      return {
        title: `To-do · ${shortDate}`,
        tags: ["to-do"],
        pages: page(
          `<h1>Oggi</h1><p>${longDate}</p>` +
            `<h2>Priorità</h2>${check()}${check()}${check()}` +
            `<h2>Se c'è tempo</h2>${check()}${check()}` +
            `<h2>Note</h2><p><br></p>`
        ),
      };
    case "wireframe":
      return {
        title: "Wireframe",
        tags: ["design"],
        pages: page(
          `<h2>Wireframe · nome schermata</h2><p>Usa «Scrittura a mano» per disegnare. Il telefono è solo una traccia: cancellalo con la gomma.</p>`,
          "grid",
          PHONE_FRAME
        ),
      };
    case "dots":
      return { title: "Schizzi", tags: [], pages: page("<p><br></p>", "dots") };
    default:
      return { title: "Nuova nota", tags: [], pages: page("<p><br></p>") };
  }
}
