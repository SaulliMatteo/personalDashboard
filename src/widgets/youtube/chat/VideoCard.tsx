import { useEffect, useState } from "react";
import { MdOndemandVideo } from "react-icons/md";
import type { ChatCardProps } from "../../../core/widgets/chatActions";
import { useNav } from "../../../core/nav/useNav";
import { ChatCard, ChatCardButton, ChatCardError, ChatCardText } from "../../../ui/ChatCard";
import { addVideo, findVideoByYoutubeId, isUniqueViolation } from "../data/youtubeRepository";
import { requestOpenVideo } from "../lib/launch";
import { emitLibraryChanged } from "../lib/libraryEvents";
import { invalidateSuggestion } from "../lib/suggestion";
import { thumbnailOf, type VideoCardPayload } from "./videoPayload";
import "./VideoChat.css";

/** Salva il video nella libreria ("Senza cartella") se non c'è già. */
async function saveVideo(p: VideoCardPayload): Promise<void> {
  if (await findVideoByYoutubeId(p.youtubeId)) return;
  try {
    await addVideo({ youtubeId: p.youtubeId, title: p.title, channel: p.channel, thumbnailUrl: thumbnailOf(p.youtubeId), folderId: null });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err; // salvato nel frattempo
  }
  emitLibraryChanged();
  invalidateSuggestion();
}

/** Scheda di un video consigliato (docs/design/amici-notifiche.html, vista 3): "Salva e guarda" o "Solo salva". */
function VideoCard({ payload, closePanel }: ChatCardProps<VideoCardPayload>) {
  const { openWidgetDetail } = useNav();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    findVideoByYoutubeId(payload.youtubeId)
      .then((v) => {
        if (!cancelled) setSaved(v !== null);
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload.youtubeId]);

  async function run(watch: boolean) {
    setBusy(true);
    setError(null);
    try {
      await saveVideo(payload);
      setSaved(true);
      if (watch) {
        requestOpenVideo(payload.youtubeId);
        closePanel();
        openWidgetDetail("youtube");
        return;
      }
    } catch (err) {
      setError(`Video non salvato: ${err instanceof Error ? err.message : String(err)}`);
    }
    setBusy(false);
  }

  return (
    <ChatCard
      source="YouTube"
      icon={<MdOndemandVideo />}
      actions={
        saved ? (
          <ChatCardButton primary onClick={() => void run(true)} disabled={busy}>
            Guarda
          </ChatCardButton>
        ) : (
          <>
            <ChatCardButton primary onClick={() => void run(true)} disabled={busy || saved === null}>
              Salva e guarda
            </ChatCardButton>
            <ChatCardButton onClick={() => void run(false)} disabled={busy || saved === null}>
              Solo salva
            </ChatCardButton>
          </>
        )
      }
    >
      <div className="ytc-thumb">{!thumbFailed && <img src={thumbnailOf(payload.youtubeId)} alt="" loading="lazy" onError={() => setThumbFailed(true)} />}</div>
      <ChatCardText title={payload.title} sub={payload.channel || null} />
      {error && <ChatCardError>{error}</ChatCardError>}
    </ChatCard>
  );
}

export default VideoCard;
