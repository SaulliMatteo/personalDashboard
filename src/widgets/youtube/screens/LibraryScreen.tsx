import { useMemo, useState } from "react";
import { MdAdd, MdChevronRight, MdOutlineCreateNewFolder, MdOutlineEdit, MdOutlineFolderOff } from "react-icons/md";
import FolderCard from "../components/FolderCard";
import FolderDialog from "../components/FolderDialog";
import MoveDialog from "../components/MoveDialog";
import VideoRow from "../components/VideoRow";
import { deleteVideo, setWatched, type SavedVideo, type VideoFolder } from "../data/youtubeRepository";
import { childFolders, folderPath, summarizeFolder, videosDirectlyIn } from "../lib/library";

/** null = radice della libreria; "none" = video senza cartella; numero = id di una cartella. */
export type LibraryLocation = number | "none" | null;

interface LibraryScreenProps {
  folders: VideoFolder[];
  videos: SavedVideo[];
  location: LibraryLocation;
  onNavigate: (location: LibraryLocation) => void;
  onOpenVideo: (video: SavedVideo) => void;
  onAddVideo: () => void;
  onReload: () => void;
  onError: (message: string) => void;
}

type DialogState = { kind: "new" } | { kind: "edit"; folder: VideoFolder } | { kind: "move"; video: SavedVideo } | null;

function LibraryScreen({ folders, videos, location, onNavigate, onOpenVideo, onAddVideo, onReload, onError }: LibraryScreenProps) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const current = typeof location === "number" ? (folders.find((f) => f.id === location) ?? null) : null;
  // Se la cartella non esiste più (eliminata altrove) si torna alla radice invece di mostrare una pagina vuota rotta.
  const effective: LibraryLocation = typeof location === "number" && !current ? null : location;

  const path = useMemo(() => (current ? folderPath(folders, current.id) : []), [folders, current]);
  const subfolders = useMemo(() => childFolders(folders, current ? current.id : null), [folders, current]);
  const unfiled = useMemo(() => videosDirectlyIn(videos, null), [videos]);
  const shownVideos = useMemo(() => {
    if (effective === "none") return unfiled;
    if (current) return videosDirectlyIn(videos, current.id);
    return [];
  }, [effective, current, unfiled, videos]);

  async function toggleWatched(v: SavedVideo) {
    try {
      await setWatched(v.id, !v.watched);
      onReload();
    } catch (err) {
      onError(String(err));
    }
  }

  async function remove(v: SavedVideo) {
    try {
      await deleteVideo(v.id); // elimina anche le note; il tempo già guardato resta nel report
      onReload();
    } catch (err) {
      onError(String(err));
    }
  }

  const title = effective === "none" ? "Senza cartella" : current ? current.name : "Libreria";

  return (
    <div className="yt-library">
      <nav className="yt-breadcrumb" aria-label="Percorso">
        <button type="button" onClick={() => onNavigate(null)} className={effective === null ? "is-current" : ""}>
          Libreria
        </button>
        {effective === "none" && (
          <>
            <MdChevronRight />
            <span className="is-current">Senza cartella</span>
          </>
        )}
        {path.map((f, i) => (
          <span key={f.id} className="yt-breadcrumb-item">
            <MdChevronRight />
            {i === path.length - 1 ? (
              <span className="is-current">{f.name}</span>
            ) : (
              <button type="button" onClick={() => onNavigate(f.id)}>
                {f.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="yt-screen-head">
        <div>
          <h2>{title}</h2>
          {current && (
            <p className="yt-muted">
              {(() => {
                const s = summarizeFolder(folders, videos, current.id);
                return `${s.directVideos} ${s.directVideos === 1 ? "video" : "video"} qui · ${s.totalVideos} in totale con le sottocartelle`;
              })()}
            </p>
          )}
        </div>
        <div className="yt-screen-actions">
          {effective !== "none" && (
            <button type="button" className="yt-btn" onClick={() => setDialog({ kind: "new" })}>
              <MdOutlineCreateNewFolder /> Nuova cartella
            </button>
          )}
          {current && (
            <button type="button" className="yt-btn" onClick={() => setDialog({ kind: "edit", folder: current })}>
              <MdOutlineEdit /> Modifica
            </button>
          )}
          <button type="button" className="yt-btn yt-btn--primary" onClick={onAddVideo}>
            <MdAdd /> Aggiungi video
          </button>
        </div>
      </div>

      {effective !== "none" && (subfolders.length > 0 || effective === null) && (
        <section>
          {effective !== null && <div className="yt-section-title"><h3>Sottocartelle</h3></div>}
          <div className="yt-folder-grid">
            {subfolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                summary={summarizeFolder(folders, videos, folder.id)}
                onOpen={() => onNavigate(folder.id)}
                onEdit={() => setDialog({ kind: "edit", folder })}
              />
            ))}
            {effective === null && unfiled.length > 0 && (
              <button type="button" className="yt-folder-card yt-folder-card--plain" onClick={() => onNavigate("none")}>
                <div className="yt-mosaic yt-mosaic--1">
                  <div className="yt-mosaic-empty">
                    <MdOutlineFolderOff />
                  </div>
                </div>
                <div className="yt-folder-card-text">
                  <span className="yt-folder-card-name">Senza cartella</span>
                  <span className="yt-muted">{unfiled.length} video</span>
                </div>
              </button>
            )}
            {effective === null && (
              <button type="button" className="yt-folder-new" onClick={() => setDialog({ kind: "new" })}>
                <MdAdd />
                <span>Nuova cartella</span>
              </button>
            )}
          </div>
        </section>
      )}

      {effective !== null && (
        <section>
          <div className="yt-section-title">
            <h3>Video</h3>
            <span className="yt-muted">{shownVideos.length}</span>
          </div>
          {shownVideos.length === 0 ? (
            <p className="yt-muted yt-empty-note">
              {effective === "none" ? "Nessun video senza cartella." : "Nessun video direttamente in questa cartella."}
            </p>
          ) : (
            <div className="yt-video-list">
              {shownVideos.map((v) => (
                <VideoRow
                  key={v.id}
                  video={v}
                  onOpen={() => onOpenVideo(v)}
                  onToggleWatched={() => void toggleWatched(v)}
                  onMove={() => setDialog({ kind: "move", video: v })}
                  onDelete={() => remove(v)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {effective === null && folders.length === 0 && unfiled.length === 0 && (
        <p className="yt-muted yt-empty-note">Nessuna cartella né video: crea una cartella o aggiungi il primo video.</p>
      )}

      {dialog?.kind === "new" && (
        <FolderDialog folders={folders} defaultParentId={current ? current.id : null} onClose={() => setDialog(null)} onDone={onReload} />
      )}
      {dialog?.kind === "edit" && (
        <FolderDialog
          folder={dialog.folder}
          folders={folders}
          onClose={() => setDialog(null)}
          onDone={({ deleted }) => {
            onReload();
            if (deleted && current && dialog.folder.id === current.id) onNavigate(current.parentId);
          }}
        />
      )}
      {dialog?.kind === "move" && <MoveDialog video={dialog.video} folders={folders} onClose={() => setDialog(null)} onDone={onReload} />}
    </div>
  );
}

export default LibraryScreen;
