import { useMemo } from "react";
import { MdAdd, MdPlayArrow } from "react-icons/md";
import FolderCard from "../components/FolderCard";
import VideoRow from "../components/VideoRow";
import VideoThumb from "../components/VideoThumb";
import type { SavedVideo, VideoFolder } from "../data/youtubeRepository";
import { buildFolderTree, folderPath, pickVideoToContinue, summarizeFolder } from "../lib/library";
import { formatTimestamp } from "../lib/youtube";

interface HomeScreenProps {
  folders: VideoFolder[];
  videos: SavedVideo[];
  onOpenVideo: (video: SavedVideo) => void;
  onOpenFolder: (folderId: number) => void;
  onNewFolder: () => void;
  onAddVideo: () => void;
}

const LIST_LIMIT = 5;

/** "Da guardare": prima i video iniziati (l'ultimo aperto per primo), poi i mai aperti dal più vecchio. */
function queueOf(videos: readonly SavedVideo[]): SavedVideo[] {
  const pending = videos.filter((v) => !v.watched);
  const started = pending
    .filter((v) => v.positionSeconds > 0)
    .sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0) || b.id - a.id);
  const fresh = pending.filter((v) => v.positionSeconds <= 0).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  return [...started, ...fresh];
}

function HomeScreen({ folders, videos, onOpenVideo, onOpenFolder, onNewFolder, onAddVideo }: HomeScreenProps) {
  const hero = useMemo(() => pickVideoToContinue(videos), [videos]);
  const queue = useMemo(() => queueOf(videos).filter((v) => v.id !== hero?.id), [videos, hero]);
  const roots = useMemo(() => buildFolderTree(folders), [folders]);
  const labelOf = (v: SavedVideo) => folderPath(folders, v.folderId).map((f) => f.name).join(" / ");
  const pendingCount = videos.filter((v) => !v.watched).length;

  return (
    <div className="yt-home">
      <div className="yt-screen-head">
        <div>
          <h2>Da dove ripartiamo?</h2>
          <p className="yt-muted">
            {videos.length === 0
              ? "La tua libreria è vuota."
              : pendingCount === 0
                ? "Hai guardato tutto: aggiungi qualcosa di nuovo."
                : `${pendingCount} ${pendingCount === 1 ? "video" : "video"} da guardare.`}
          </p>
        </div>
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
                {queue.slice(0, LIST_LIMIT).map((v) => (
                  <VideoRow key={v.id} video={v} folderLabel={labelOf(v)} onOpen={() => onOpenVideo(v)} />
                ))}
                {queue.length > LIST_LIMIT && <p className="yt-muted yt-queue-more">e altri {queue.length - LIST_LIMIT} nella libreria</p>}
              </div>
            )}
          </section>

          <section className="yt-card yt-hero">
            <span className="yt-label">RIPRENDI DA QUI</span>
            {hero ? (
              <>
                <button type="button" className="yt-hero-thumb-btn" onClick={() => onOpenVideo(hero)} aria-label={`Guarda: ${hero.title}`}>
                  <VideoThumb video={hero} large showProgress showPlay showDuration className="yt-hero-thumb" />
                </button>
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
              </>
            ) : (
              <p className="yt-muted">Niente da riprendere: hai guardato tutto.</p>
            )}
          </section>
        </div>
      )}

      <section className="yt-library-section">
        <div className="yt-section-title">
          <h3>La tua libreria</h3>
        </div>
        <div className="yt-folder-grid">
          {roots.map(({ folder }) => (
            <FolderCard key={folder.id} folder={folder} summary={summarizeFolder(folders, videos, folder.id)} onOpen={() => onOpenFolder(folder.id)} />
          ))}
          <button type="button" className="yt-folder-new" onClick={onNewFolder}>
            <MdAdd />
            <span>Nuova cartella</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export default HomeScreen;
