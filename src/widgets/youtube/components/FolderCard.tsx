import type { CSSProperties } from "react";
import { MdOutlineEdit, MdOutlineFolder } from "react-icons/md";
import type { VideoFolder } from "../data/youtubeRepository";
import { colorForFolder, type FolderSummary } from "../lib/library";
import VideoThumb from "./VideoThumb";

interface FolderCardProps {
  folder: VideoFolder;
  summary: FolderSummary;
  onOpen: () => void;
  onEdit?: () => void;
}

/** Scheda di una cartella: mosaico di fino a 3 miniature, nome e conteggi. */
function FolderCard({ folder, summary, onOpen, onEdit }: FolderCardProps) {
  const color = colorForFolder(folder);
  const parts = [`${summary.totalVideos} ${summary.totalVideos === 1 ? "video" : "video"}`];
  if (summary.subfolders > 0) parts.push(`${summary.subfolders} ${summary.subfolders === 1 ? "sottocartella" : "sottocartelle"}`);

  return (
    <div className="yt-folder-card" style={{ "--folder-color": color } as CSSProperties}>
      <button type="button" className="yt-folder-card-main" onClick={onOpen} title={folder.name}>
        <div className={`yt-mosaic yt-mosaic--${Math.max(1, summary.preview.length)}`}>
          {summary.preview.length === 0 ? (
            <div className="yt-mosaic-empty">
              <MdOutlineFolder />
            </div>
          ) : (
            summary.preview.map((v) => <VideoThumb key={v.id} video={v} />)
          )}
        </div>
        <div className="yt-folder-card-text">
          <span className="yt-folder-card-name">
            <span className="yt-dot" />
            {folder.name}
          </span>
          <span className="yt-muted">{parts.join(" · ")}</span>
          {summary.toWatch > 0 && <span className="yt-folder-card-towatch">{summary.toWatch} da guardare</span>}
        </div>
      </button>
      {onEdit && (
        <button type="button" className="yt-icon-btn yt-folder-card-edit" onClick={onEdit} aria-label={`Modifica la cartella ${folder.name}`} title="Modifica cartella">
          <MdOutlineEdit />
        </button>
      )}
    </div>
  );
}

export default FolderCard;
