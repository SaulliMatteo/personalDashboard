import { MdCheckCircle, MdOutlineCheckCircle, MdOutlineDriveFileMove } from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import type { SavedVideo } from "../data/youtubeRepository";
import { formatTimestamp } from "../lib/youtube";
import VideoThumb from "./VideoThumb";

interface VideoRowProps {
  video: SavedVideo;
  /** Percorso della cartella da mostrare sotto il titolo (ricerca, Home). */
  folderLabel?: string;
  onOpen: () => void;
  onToggleWatched?: () => void;
  onMove?: () => void;
  onDelete?: () => void | Promise<void>;
}

function VideoRow({ video, folderLabel, onOpen, onToggleWatched, onMove, onDelete }: VideoRowProps) {
  const details = [
    video.channel || "Canale sconosciuto",
    video.durationSeconds !== null ? formatTimestamp(video.durationSeconds) : null,
    video.positionSeconds > 0 && !video.watched ? `ripresa da ${formatTimestamp(video.positionSeconds)}` : null,
  ].filter(Boolean);

  return (
    <div className={`yt-row${video.watched ? " is-watched" : ""}`}>
      <button type="button" className="yt-row-main" onClick={onOpen}>
        <VideoThumb video={video} showProgress showPlay className="yt-row-thumb" />
        <span className="yt-row-text">
          <span className="yt-row-title">{video.title}</span>
          <span className="yt-muted yt-row-sub">{details.join(" · ")}</span>
          {folderLabel && <span className="yt-row-folder">{folderLabel}</span>}
        </span>
      </button>
      <div className="yt-row-actions">
        {onToggleWatched && (
          <button
            type="button"
            className={`yt-icon-btn${video.watched ? " is-on" : ""}`}
            onClick={onToggleWatched}
            aria-label={video.watched ? "Segna da guardare" : "Segna come guardato"}
            title={video.watched ? "Guardato: clicca per segnarlo da guardare" : "Segna come guardato"}
          >
            {video.watched ? <MdCheckCircle /> : <MdOutlineCheckCircle />}
          </button>
        )}
        {onMove && (
          <button type="button" className="yt-icon-btn" onClick={onMove} aria-label="Sposta in un'altra cartella" title="Sposta in un'altra cartella">
            <MdOutlineDriveFileMove />
          </button>
        )}
        {onDelete && (
          <ConfirmButton className="yt-icon-btn yt-icon-btn--danger" label="✕" confirmLabel="Elimina?" onConfirm={onDelete} />
        )}
      </div>
    </div>
  );
}

export default VideoRow;
