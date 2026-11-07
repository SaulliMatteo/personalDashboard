import { useEffect, useMemo, useState } from "react";
import { MdOutlineStickyNote2 } from "react-icons/md";
import type { ChatCardProps } from "../../../core/widgets/chatActions";
import { useNav } from "../../../core/nav/useNav";
import { ChatCard, ChatCardButton, ChatCardError } from "../../../ui/ChatCard";
import { htmlToText } from "../lib/html";
import { requestOpenNote } from "../lib/launch";
import { linkedNote, saveReceivedNote, RECEIVED_FOLDER } from "./noteChat";
import type { NoteCardPayload } from "./notePayload";
import "./NoteChat.css";

/**
 * Scheda di una nota (docs/design/amici-notifiche.html, vista 9): titolo e prime righe; "Salva nel Quaderno" mette
 * una copia in "Ricevute", poi (o per chi l'ha mandata) "Apri".
 */
function NoteCard({ payload, messageId, closePanel }: ChatCardProps<NoteCardPayload>) {
  const { openWidgetDetail } = useNav();
  const [local, setLocal] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => htmlToText(payload.pages[0]?.content ?? "").slice(0, 180), [payload]);
  const pages = payload.pages.length;
  const ink = payload.pages.some((p) => p.ink.length > 0);

  useEffect(() => {
    let cancelled = false;
    linkedNote(messageId)
      .then((id) => {
        if (!cancelled) setLocal(id);
      })
      .catch(() => {
        if (!cancelled) setLocal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  function open(id: number) {
    requestOpenNote(id);
    closePanel();
    openWidgetDetail("notes");
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      open(await saveReceivedNote(messageId, payload));
    } catch (err) {
      setError(`Nota non salvata: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <ChatCard
      source="Quaderno"
      icon={<MdOutlineStickyNote2 />}
      actions={
        local ? (
          <ChatCardButton onClick={() => open(local)}>Apri</ChatCardButton>
        ) : (
          <ChatCardButton primary onClick={() => void save()} disabled={busy || local === undefined}>
            Salva nel Quaderno
          </ChatCardButton>
        )
      }
    >
      <div className="nqc-page">
        <b>{payload.title}</b>
        {preview && <span>{preview}</span>}
      </div>
      <p className="nqc-meta">
        {pages === 1 ? "1 pagina" : `${pages} pagine`}
        {ink && " · scrittura a mano"}
        {!local && ` · si salva in «${RECEIVED_FOLDER}»`}
      </p>
      {error && <ChatCardError>{error}</ChatCardError>}
    </ChatCard>
  );
}

export default NoteCard;
