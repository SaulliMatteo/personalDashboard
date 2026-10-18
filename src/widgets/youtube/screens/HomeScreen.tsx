import { useMemo } from "react";
import { MdAdd, MdPlayArrow } from "react-icons/md";
import VideoRow from "../components/VideoRow";
import VideoThumb from "../components/VideoThumb";
import type { SavedVideo, VideoFolder } from "../data/youtubeRepository";
import { folderPath, pickVideoToContinue } from "../lib/library";
import { formatTimestamp } from "../lib/youtube";

interface HomeScreenProps {
  folders: VideoFolder[];
  videos: SavedVideo[];
  onOpenVideo: (video: SavedVideo) => void;
  onAddVideo: () => void;
}

/** "Da guardare": prima i video iniziati (l'ultimo aperto per primo), poi i mai aperti dal più vecchio. */
function queueOf(videos: readonly SavedVideo[]): SavedVideo[] {
  const pending = videos.filter((v) => !v.watched);
  const started = pending
    .filter((v) => v.positionSeconds > 0)
    .sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0) || b.id - a.id);
  const fresh = pending.filter((v) => v.positionSeconds <= 0).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  return [...started, ...fresh];
}

function HomeScreen({ folders, videos, onOpenVideo, onAddVideo }: HomeScreenProps) {
  const hero = useMemo(() => pickVideoToContinue(videos), [videos]);
  const queue = useMemo(() => queueOf(videos).filter((v) => v.id !== hero?.id), [videos, hero]);
  const labelOf = (v: SavedVideo) => folderPath(folders, v.folderId).map((f) => f.name).join(" / ");
  const pendingCount = videos.filter((v) => !v.watched).length;

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
              <span className="yt-muted">{pendingCount}</span>
            </div>
            {queue.length === 0 ? (
              <p className="yt-muted">Nient'altro in coda.</p>
            ) : (
              <div className="yt-queue-list">
                {queue.map((v) => (
                  <VideoRow key={v.id} video={v} folderLabel={labelOf(v)} onOpen={() => onOpenVideo(v)} />
                ))}
              </div>
            )}
          </section>

          <section className="yt-card yt-hero">
            <span className="yt-label">RIPRENDI DA QUI</span>
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
                  </div>
                  <button type="button" className="yt-btn yt-btn--primary yt-hero-btn" onClick={() => onOpenVideo(hero)}>
                    <MdPlayArrow />
                    {hero.positionSeconds > 0 ? `Riprendi da ${formatTimestamp(hero.positionSeconds)}` : "Guarda"}
                  </button>
                </div>
              </>
            ) : (
              <p className="yt-muted">Niente da riprendere: hai guardato tutto.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
