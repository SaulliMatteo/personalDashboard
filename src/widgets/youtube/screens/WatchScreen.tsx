import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../../core/settings/SettingsContext";
import { listSubjects, loadTimerState, logSession } from "../../study/data/studyRepository";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { emitActivityEvent, publishActivity } from "../../../core/activity/activityBus";
import { StudyLinkRecorder } from "../lib/studyLink";
import { MdChevronRight, MdOutlineCheckCircle, MdOutlineDriveFileMove, MdCheckCircle } from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import MoveDialog from "../components/MoveDialog";
import NotesPanel from "../components/NotesPanel";
import VideoPlayer, { type PlayerHandle } from "../components/VideoPlayer";
import VideoRow from "../components/VideoRow";
import {
  deleteVideo,
  saveProgress,
  setDuration,
  setWatched,
  type SavedVideo,
  type VideoFolder,
} from "../data/youtubeRepository";
import { folderPath, nextVideoInFolder, positionInFolder, videosDirectlyIn } from "../lib/library";
import { DEFAULT_PLAYBACK_RATES, describePlayerError, formatRate } from "../lib/youtube";
import type { LibraryLocation } from "./LibraryScreen";

interface WatchScreenProps {
  video: SavedVideo;
  folders: VideoFolder[];
  videos: SavedVideo[];
  onOpenVideo: (video: SavedVideo) => void;
  onNavigateLibrary: (location: LibraryLocation) => void;
  onReload: () => void;
  onError: (message: string) => void;
}

const AUTOPLAY_KEY = "youtube.autoplayNext";

function readAutoplayNext(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Da dove far partire un video: dall'ultimo punto salvato, salvo che sia (quasi) alla fine. */
function resumePoint(video: SavedVideo): number {
  if (video.durationSeconds !== null && video.positionSeconds >= video.durationSeconds - 10) return 0;
  return video.positionSeconds;
}

/** Fino a 3 video non guardati da proporre dopo questo: prima quelli della stessa cartella (dopo il corrente, poi dall'inizio), poi gli altri. */
function suggestionsFor(video: SavedVideo, videos: readonly SavedVideo[]): SavedVideo[] {
  const siblings = videosDirectlyIn(videos, video.folderId);
  const index = siblings.findIndex((v) => v.id === video.id);
  const ordered = index < 0 ? siblings : [...siblings.slice(index + 1), ...siblings.slice(0, index)];
  const picked = ordered.filter((v) => !v.watched);
  if (picked.length < 3) {
    const seen = new Set([video.id, ...picked.map((v) => v.id)]);
    const others = videos.filter((v) => !v.watched && !seen.has(v.id)).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
    picked.push(...others);
  }
  return picked.slice(0, 3);
}

function WatchScreen({ video, folders, videos, onOpenVideo, onNavigateLibrary, onReload, onError }: WatchScreenProps) {
  // Uscendo dalla pagina il player sparisce senza dire "pausa": lo diciamo noi.
  useEffect(() => () => publishActivity({ watchingVideo: false }), []);
  const playerRef = useRef<PlayerHandle | null>(null);
  // Letti una sola volta per montaggio: il player non si ricarica se cambiano dopo.
  const [startSeconds] = useState(() => resumePoint(video));
  const [rates, setRates] = useState<number[]>(DEFAULT_PLAYBACK_RATES);
  const [rate, setRate] = useState(1);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [autoplayNext, setAutoplayNext] = useState(readAutoplayNext);
  const [moving, setMoving] = useState(false);

  const path = useMemo(() => folderPath(folders, video.folderId), [folders, video.folderId]);

  // Collegamento facoltativo con lo Studio (impostazione del widget).
  const { settings } = useSettings();
  const folderName = path.length > 0 ? path[path.length - 1].name : null;
  const linkConfig = useLatestRef({
    enabled: settings.youtubeCountAsStudy,
    folderName,
    minSeconds: settings.studyMinLoggableSeconds,
  });
  const [recorder] = useState(
    () =>
      new StudyLinkRecorder({
        listSubjects,
        isStudyTimerRunning: async () => {
          const t = await loadTimerState();
          return t.phase === "work" && t.runningSince !== null;
        },
        logSession,
        getConfig: () => linkConfig.current,
      })
  );
  const position = useMemo(() => positionInFolder(videos, video), [videos, video]);
  const suggestions = useMemo(() => suggestionsFor(video, videos), [video, videos]);

  function toggleAutoplay() {
    const next = !autoplayNext;
    setAutoplayNext(next);
    try {
      localStorage.setItem(AUTOPLAY_KEY, next ? "1" : "0");
    } catch {
      // senza storage la scelta vale solo per questa sessione
    }
  }

  async function handleEnded() {
    try {
      await saveProgress(video.id, 0);
      await setWatched(video.id, true);
    } catch (err) {
      onError(String(err));
    }
    onReload();
    if (autoplayNext) {
      const next = nextVideoInFolder(videos, video);
      if (next) onOpenVideo(next);
    }
  }

  async function toggleWatched() {
    try {
      await setWatched(video.id, !video.watched);
      onReload();
    } catch (err) {
      onError(String(err));
    }
  }

  async function remove() {
    try {
      await deleteVideo(video.id); 
      onReload();
      onNavigateLibrary(video.folderId ?? "none");
    } catch (err) {
      onError(String(err));
    }
  }

  return (
    <div className="yt-watch">
      <nav className="yt-breadcrumb" aria-label="Percorso">
        <button type="button" onClick={() => onNavigateLibrary(null)}>
          Libreria
        </button>
        {path.map((f) => (
          <span key={f.id} className="yt-breadcrumb-item">
            <MdChevronRight />
            <button type="button" onClick={() => onNavigateLibrary(f.id)}>
              {f.name}
            </button>
          </span>
        ))}
        <MdChevronRight />
        <span className="is-current yt-breadcrumb-title">{video.title}</span>
      </nav>

      <div className="yt-screen-head">
        <div>
          <h2>Guarda e annota</h2>
          {position && (
            <p className="yt-muted">
              Video {position.index} di {position.total}
              {path.length > 0 ? ` in ${path[path.length - 1].name}` : " senza cartella"}
            </p>
          )}
        </div>
      </div>

      <div className="yt-watch-grid">
        <div className="yt-watch-main">
          <div className="yt-player-frame">
            {/* key = id del video: cambiare video monta un iframe nuovo (e consegna il tempo di visione del precedente). */}
            <VideoPlayer
              key={video.id}
              youtubeId={video.youtubeId}
              startSeconds={startSeconds}
              autoplay
              handleRef={playerRef}
              onReady={() => {
                const handle = playerRef.current;
                if (!handle) return;
                setRates(handle.getAvailablePlaybackRates());
                setRate(handle.getPlaybackRate());
              }}
              onRateChange={setRate}
              onDuration={(seconds) => {
                if (video.durationSeconds === null) void setDuration(video.id, seconds).then(onReload).catch((e) => onError(String(e)));
              }}
              onProgress={(seconds) => void saveProgress(video.id, seconds).catch((e) => console.error(e))}
              onWatchSegment={(_startedAt, endedAt, seconds) => recorder.add(endedAt, seconds, (e) => console.error("Tempo di studio non salvato:", e))}
              onPlayingChange={(playing) => {
                // Per il Companion (e chiunque ascolti): "sto guardando un video".
                publishActivity({ watchingVideo: playing });
              }}
              onEnded={() => {
                publishActivity({ watchingVideo: false });
                emitActivityEvent({ type: "videoEnded" });
                void handleEnded();
              }}
              onError={(code) => setPlayerError(describePlayerError(code))}
            />
          </div>
          {playerError && (
            <div className="yt-banner yt-banner--error" role="alert">
              <span>{playerError}</span>
            </div>
          )}

          <div className="yt-player-bar">
            <label className="yt-player-control">
              <span className="yt-label">Velocità</span>
              <select
                className="yt-input yt-rate"
                value={rate}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setRate(next);
                  playerRef.current?.setPlaybackRate(next);
                }}
                aria-label="Velocità di riproduzione"
              >
                {(rates.includes(rate) ? rates : [...rates, rate].sort((a, b) => a - b)).map((r) => (
                  <option key={r} value={r}>
                    {formatRate(r)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={autoplayNext}
              className={`yt-switch${autoplayNext ? " is-on" : ""}`}
              onClick={toggleAutoplay}
              title="Alla fine del video passa al successivo non guardato della stessa cartella"
            >
              <span className="yt-switch-track">
                <span className="yt-switch-knob" />
              </span>
              Riproduzione automatica
            </button>
          </div>

          <div className="yt-card yt-watch-info">
            <h3 className="yt-watch-title">{video.title}</h3>
            <p className="yt-muted">{video.channel || "Canale sconosciuto"}</p>
            <p className="yt-saved-in">
              Salvato in{" "}
              <button type="button" className="yt-link-btn" onClick={() => onNavigateLibrary(video.folderId ?? "none")}>
                {path.length > 0 ? path.map((f) => f.name).join(" / ") : "Senza cartella"}
              </button>
            </p>
            <div className="yt-watch-actions">
              <button type="button" className="yt-btn" onClick={() => void toggleWatched()}>
                {video.watched ? <MdCheckCircle /> : <MdOutlineCheckCircle />}
                {video.watched ? "Guardato" : "Segna come guardato"}
              </button>
              <button type="button" className="yt-btn" onClick={() => setMoving(true)}>
                <MdOutlineDriveFileMove /> Sposta
              </button>
              <ConfirmButton className="yt-btn yt-btn--danger" label="Elimina video" confirmLabel="Sicuro? Elimina anche le note" onConfirm={remove} />
            </div>
          </div>

          {suggestions.length > 0 && (
            <section className="yt-explore">
              <div className="yt-section-title">
                <h3>Continua a esplorare</h3>
              </div>
              <div className="yt-video-list">
                {suggestions.map((v) => (
                  <VideoRow key={v.id} video={v} folderLabel={folderPath(folders, v.folderId).map((f) => f.name).join(" / ")} onOpen={() => onOpenVideo(v)} />
                ))}
              </div>
            </section>
          )}
        </div>

        <NotesPanel video={video} playerRef={playerRef} onError={onError} onChanged={onReload} />
      </div>

      {moving && <MoveDialog video={video} folders={folders} onClose={() => setMoving(false)} onDone={onReload} />}
    </div>
  );
}

export default WatchScreen;
