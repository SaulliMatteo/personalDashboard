import { MdAdd, MdPlayArrow } from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import VideoRow from "../components/VideoRow";
import VideoThumb from "../components/VideoThumb";
import type { SavedVideo, VideoFolder } from "../data/youtubeRepository";
import { useSuggestion } from "../hooks/useSuggestion";
import { requestDiscard } from "../lib/discard";
import { folderPath } from "../lib/library";
import { snoozeSuggested } from "../lib/suggestion";
import { formatTimestamp } from "../lib/youtube";

interface HomeScreenProps {
  folders: VideoFolder[];
  videos: SavedVideo[];
  onOpenVideo: (video: SavedVideo) => void;
  onAddVideo: () => void;
  /** Dopo "Non ora" / "Scarta": rilegge la libreria. */
  onChanged: () => void;
  onError: (message: string) => void;
}

/**
 * Home della pagina: il video consigliato (lo stesso del widget, lib/suggestion.ts) con il motivo e
 * "Non ora" / "Scarta", e a fianco gli altri da guardare nell'ordine della classifica. "Annulla" dopo uno
 * scarto sta nel banner di YoutubeDetail.
 */
function HomeScreen({ folders, videos, onOpenVideo, onAddVideo, onChanged, onError }: HomeScreenProps) {
  // Si rilegge anche quando la pagina ricarica i video (dopo un'aggiunta, uno spostamento…).
  const suggestion = useSuggestion(videos);
  const hero = suggestion?.pick ?? null;
  const queue = suggestion?.queue ?? [];
  const labelOf = (v: SavedVideo) => folderPath(folders, v.folderId).map((f) => f.name).join(" / ");

  function snooze(video: SavedVideo) {
    snoozeSuggested(video.id).then(onChanged, (e: unknown) => onError(String(e)));
  }

  function discard(video: SavedVideo) {
    requestDiscard(video, (e) => onError(String(e)));
  }

  const notes = suggestion?.pickNotes ?? 0;

  return (
    <div className="yt-home">
      <div className="yt-screen-head">
        <h2>Da dove ripartiamo?</h2>
      </div>

      {videos.length === 0 ? (
        <section className="yt-card yt-welcome">
          <p>Salva i video che vuoi guardare per studiare, mettili in cartelle e prendi appunti agganciati al minuto.</p>
          <button type="button" className="yt-btn yt-btn--primary" onClick={onAddVideo}>
            <MdAdd /> Aggiungi il primo video
          </button>
        </section>
      ) : (
        <div className="yt-home-top">
          <section className="yt-card yt-queue">
            <div className="yt-section-title">
              <h3>Da guardare</h3>
              <span className="yt-muted">{suggestion?.pendingCount ?? ""}</span>
            </div>
            {queue.length === 0 ? (
              <p className="yt-muted">{suggestion ? "Nient'altro in coda." : "…"}</p>
            ) : (
              <div className="yt-queue-list">
                {queue.map((v) => (
                  <VideoRow key={v.id} video={v} folderLabel={labelOf(v)} onOpen={() => onOpenVideo(v)} />
                ))}
              </div>
            )}
          </section>

          <section className="yt-card yt-hero">
            <div className="yt-section-title">
              <h3>Proposto per te</h3>
            </div>
            {hero ? (
              <>
                <div className="yt-hero-stage">
                  <button type="button" className="yt-hero-thumb-btn" onClick={() => onOpenVideo(hero)} aria-label={`Guarda: ${hero.title}`}>
                    <VideoThumb video={hero} large showProgress showPlay showDuration className="yt-hero-thumb" />
                  </button>
                </div>
                <div className="yt-hero-bottom">
                  <div className="yt-hero-info">
                    <h3 className="yt-hero-title">{hero.title}</h3>
                    <p className="yt-muted">
                      {hero.channel || "Canale sconosciuto"}
                      {labelOf(hero) && ` · ${labelOf(hero)}`}
                    </p>
                    {suggestion?.reason && <p className="yt-hero-reason">{suggestion.reason}</p>}
                  </div>
                  <div className="yt-hero-actions">
                    <button type="button" className="yt-btn yt-btn--primary yt-hero-btn" onClick={() => onOpenVideo(hero)}>
                      <MdPlayArrow />
                      {hero.positionSeconds > 0 ? `Riprendi da ${formatTimestamp(hero.positionSeconds)}` : "Guarda"}
                    </button>
                    <button type="button" className="yt-btn" onClick={() => snooze(hero)} title="Nascondi questo video dai consigli per qualche giorno">
                      Non ora
                    </button>
                    {notes > 0 ? (
                      <ConfirmButton
                        className="yt-btn"
                        label="Scarta"
                        confirmLabel={`Perdi ${notes === 1 ? "1 nota" : `${notes} note`}?`}
                        onConfirm={() => discard(hero)}
                      />
                    ) : (
                      <button type="button" className="yt-btn" onClick={() => discard(hero)} title="Elimina il video dalla libreria (puoi annullare per qualche secondo)">
                        Scarta
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="yt-muted">{suggestion ? "Niente da guardare: hai visto tutto." : "…"}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
