import { useEffect, useMemo, useState } from "react";
import { MdOutlineStickyNote2 } from "react-icons/md";
import type { ChatCardProps } from "../../../core/widgets/chatActions";
import { useNav } from "../../../core/nav/useNav";
import { ChatCard, ChatCardButton, ChatCardError } from "../../../ui/ChatCard";
import { htmlToText } from "../lib/html";
import { formatBytes } from "../lib/insertFiles";
import { pdfThumbName } from "../lib/pdf/pdfData";
import { requestOpenNote } from "../lib/launch";
import { linkedNote, saveReceivedNote, RECEIVED_FOLDER } from "./noteChat";
import type { NoteCardPayload } from "./notePayload";
import "./NoteChat.css";

/**
 * Scheda di una nota (docs/mockup/gruppi/amici-notifiche.html, vista 9): titolo e prime righe; "Salva nel Quaderno" mette
 * una copia in "Ricevute" con i suoi file (scaricati dal lotto), poi (o per chi l'ha mandata) "Apri".
 */
function NoteCard({ payload, mine, messageId, senderId, recipientId, closePanel }: ChatCardProps<NoteCardPayload>) {
  const { openWidgetDetail } = useNav();
  const [local, setLocal] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const preview = useMemo(() => htmlToText(payload.pages[0]?.content ?? "").slice(0, 180), [payload]);
  const pages = payload.pages.length;
  const ink = payload.pages.some((p) => p.ink.length > 0);
  const files = useMemo(() => {
    const list = payload.files?.list ?? [];
    const pdfs = new Set(payload.pages.flatMap((p) => (p.pdf ? [p.pdf.file] : [])));
    const thumbs = new Set([...pdfs].map(pdfThumbName));
    const pdf = list.filter((f) => pdfs.has(f.name)).length;
    const other = list.filter((f) => !pdfs.has(f.name) && !thumbs.has(f.name)).length;
    return { count: list.length, pdf, other, bytes: list.reduce((n, f) => n + f.size, 0) };
  }, [payload]);

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
      const saved = await saveReceivedNote(messageId, payload, { senderId, recipientId, mine }, setProgress);
      if (saved.missing > 0) {
        // la nota c'è, senza qualche file: si resta sulla scheda per dirlo, "Apri" la apre
        setLocal(saved.noteId);
        setProgress(null);
        setBusy(false);
        setError(
          `Nota salvata, ma ${saved.missing === 1 ? "1 file non c'era più" : `${saved.missing} file non c'erano più`} (restano sul server al massimo 30 giorni).`
        );
        return;
      }
      open(saved.noteId);
    } catch (err) {
      setError(`Nota non salvata: ${err instanceof Error ? err.message : String(err)}`);
      setProgress(null);
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
        {files.pdf > 0 && ` · ${files.pdf} PDF`}
        {files.other > 0 && ` · ${files.other === 1 ? "1 allegato o immagine" : `${files.other} allegati e immagini`}`}
        {files.count > 0 && ` · ${formatBytes(files.bytes)}`}
        {progress !== null && payload.files
          ? ` · scarico i file… ${progress}/${payload.files.list.length}`
          : !local && ` · si salva in «${RECEIVED_FOLDER}»`}
      </p>
      {error && <ChatCardError>{error}</ChatCardError>}
    </ChatCard>
  );
}

export default NoteCard;
