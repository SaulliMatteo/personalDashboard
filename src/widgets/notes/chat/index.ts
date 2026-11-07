import { MdOutlineStickyNote2 } from "react-icons/md";
import { defineChatAction } from "../../../core/widgets/chatActions";
import NoteCard from "./NoteCard";
import NoteCompose from "./NoteCompose";
import { cleanNoteHtml } from "./noteChat";
import { NOTE_KIND, parseNotePayload } from "./notePayload";

/** "Invia una nota" nella chat degli amici: una copia, che chi la riceve può salvare. */
export const noteChatAction = defineChatAction({
  kind: NOTE_KIND,
  label: "Invia una nota",
  hint: "Una copia, che può salvare",
  composeTitle: (friend) => `Invia una nota a ${friend}`,
  icon: MdOutlineStickyNote2,
  parse: (raw) => parseNotePayload(raw, cleanNoteHtml),
  describe: (p) => `📝 ${p.title}`,
  Compose: NoteCompose,
  Card: NoteCard,
});
