import { useState } from "react";
import { MdPlayArrow } from "react-icons/md";
import { formatTimestamp } from "../lib/youtube";
import { videoProgress } from "../lib/library";
import type { SavedVideo } from "../data/youtubeRepository";

interface VideoThumbProps {
  video: Pick<SavedVideo, "youtubeId" | "thumbnailUrl" | "watched" | "positionSeconds" | "durationSeconds">;
  /** Miniatura grande (hero): prova prima la risoluzione massima. */
  large?: boolean;
  /** Barra di avanzamento in basso. */
  showProgress?: boolean;
  /** Durata in un angolo. */
  showDuration?: boolean;
  /** Icona play al centro. */
  showPlay?: boolean;
  className?: string;
}

/**
 * Miniatura 16:9. `hqdefault` è 4:3 con barre nere: `object-fit: cover` mostra solo il 16:9 vero.
 * `maxresdefault` non esiste per tutti i video (YouTube risponde con errore o con un segnaposto
 * 120×90): in quel caso si ripiega sulla miniatura salvata.
 */
function VideoThumb({ video, large = false, showProgress = false, showDuration = false, showPlay = false, className = "" }: VideoThumbProps) {
  const fallback = video.thumbnailUrl ?? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`;
  const maxres = `https://i.ytimg.com/vi/${video.youtubeId}/maxresdefault.jpg`;
  const [useFallback, setUseFallback] = useState(!large);
  const [failed, setFailed] = useState(false);
  const progress = videoProgress(video);

  return (
    <div className={`yt-thumb ${className}`}>
      {failed ? (
        <div className="yt-thumb-empty" />
      ) : (
        <img
          src={useFallback ? fallback : maxres}
          alt=""
          loading="lazy"
          onLoad={(e) => {
            if (!useFallback && e.currentTarget.naturalWidth <= 120) setUseFallback(true);
          }}
          onError={() => {
            if (!useFallback) setUseFallback(true);
            else setFailed(true);
          }}
        />
      )}
      {showPlay && (
        <span className="yt-thumb-play">
          <MdPlayArrow />
        </span>
      )}
      {showDuration && video.durationSeconds !== null && (
        <span className="yt-thumb-duration">{formatTimestamp(video.durationSeconds)}</span>
      )}
      {showProgress && progress > 0 && (
        <span className="yt-thumb-progress">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

export default VideoThumb;
