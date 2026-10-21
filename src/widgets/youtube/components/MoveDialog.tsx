import { useMemo, useState } from "react";
import { moveVideo, type SavedVideo, type VideoFolder } from "../data/youtubeRepository";
import { folderOptions } from "../lib/folderOptions";
import Dialog from "./Dialog";

interface MoveDialogProps {
  video: SavedVideo;
  folders: VideoFolder[];
  onClose: () => void;
  onDone: () => void;
}

function MoveDialog({ video, folders, onClose, onDone }: MoveDialogProps) {
  const [target, setTarget] = useState<number | null>(video.folderId);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => folderOptions(folders), [folders]);

  async function submit() {
    try {
      if (target !== video.folderId) await moveVideo(video.id, target);
      onDone();
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Dialog title="Sposta video" onClose={onClose} width={420}>
      <div className="yt-dialog-body">
        <p className="yt-muted yt-dialog-video">{video.title}</p>
        <label className="yt-field">
          <span className="yt-label">Cartella</span>
          <select className="yt-input" value={target === null ? "" : String(target)} onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Senza cartella</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div className="yt-banner yt-banner--error" role="alert">
            <span>{error}</span>
          </div>
        )}
        <div className="yt-dialog-actions">
          <span className="yt-spacer" />
          <button type="button" className="yt-btn" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className="yt-btn yt-btn--primary" onClick={() => void submit()}>
            Sposta
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default MoveDialog;
