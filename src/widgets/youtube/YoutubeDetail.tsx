import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MdCheckCircle, MdOutlineFolder, MdOutlineFolderOff } from "react-icons/md";
import { useNav } from "../../core/nav/NavContext";
import BackButton from "../../ui/BackButton";
import ConfirmButton from "../../ui/ConfirmButton";
import VideoPlayer, { type PlayerHandle } from "./components/VideoPlayer";
import {
  addFolder,
  addNote,
  addVideo,
  deleteFolder,
  deleteNote,
  deleteVideo,
  findVideoByYoutubeId,
  isUniqueViolation,
  listFolders,
  listNotes,
  listVideosInFolder,
  moveVideo,
  saveProgress,
  setDuration,
  setWatched,
  type SavedVideo,
  type VideoFolder,
  type VideoNote,
} from "./data/youtubeRepository";
import { takePendingVideo } from "./lib/launch";
import { describePlayerError, fetchVideoMetadata, formatTimestamp, parseYouTubeId } from "./lib/youtube";
import "./YoutubeDetail.css";

// ---------------------------------------------------------------------
// Albero delle cartelle
// ---------------------------------------------------------------------

interface FlatFolder {
  folder: VideoFolder;
  depth: number;
  /** "Elettronica › Pratica": usato nei menu a tendina. */
  path: string;
}

/** Appiattisce l'albero in ordine di visita (genitore prima dei figli), con profondità e percorso. */
function flattenFolders(folders: VideoFolder[]): FlatFolder[] {
  const children = new Map<number | null, VideoFolder[]>();
  for (const f of folders) {
    const list = children.get(f.parentId) ?? [];
    list.push(f);
    children.set(f.parentId, list);
  }
  const result: FlatFolder[] = [];
  const visit = (parentId: number | null, depth: number, prefix: string) => {
    for (const folder of children.get(parentId) ?? []) {
      const path = prefix ? `${prefix} › ${folder.name}` : folder.name;
      result.push({ folder, depth, path });
      visit(folder.id, depth + 1, path);
    }
  };
  visit(null, 0, "");
  return result;
}

/** Da dove far partire un video: dall'ultimo punto salvato, salvo che sia (quasi) alla fine. */
function resumePoint(video: SavedVideo): number {
  if (video.durationSeconds !== null && video.positionSeconds >= video.durationSeconds - 10) return 0;
  return video.positionSeconds;
}

const NO_FOLDER_LABEL = "Senza cartella";

/**
 * Pagina a schermo intero: cartelle a sinistra; a destra l'aggiunta di un
 * video da link, il player con le note a tempo e i video della cartella
 * selezionata (solo quelli diretti, non delle sottocartelle).
 */
function YoutubeDetail() {
  const { goToDashboard } = useNav();

  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null); // null = "Senza cartella"
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [active, setActive] = useState<SavedVideo | null>(null);
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [linkInput, setLinkInput] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderParent, setFolderParent] = useState<string>(""); // "" = primo livello
  const [noteText, setNoteText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const playerRef = useRef<PlayerHandle | null>(null);

  const flat = useMemo(() => flattenFolders(folders), [folders]);
  const selectedFolder = folders.find((f) => f.id === folderId) ?? null;
  const reload = () => setRefreshKey((k) => k + 1);

  // Cartelle (si rileggono dopo ogni modifica).
  useEffect(() => {
    let cancelled = false;
    listFolders()
      .then((result) => {
        if (!cancelled) setFolders(result);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Video della cartella selezionata.
  useEffect(() => {
    let cancelled = false;
    listVideosInFolder(folderId)
      .then((result) => {
        if (!cancelled) setVideos(result);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [folderId, refreshKey]);

  // Note del video attivo.
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (activeId === null) return;
    let cancelled = false;
    listNotes(activeId)
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, refreshKey]);

  // Aperta dal pulsante del widget: si parte subito dal video proposto (e dalla sua cartella).
  // Nessun flag `cancelled`: in StrictMode l'effetto gira due volte e la prima lettura consuma la richiesta.
  useEffect(() => {
    const youtubeId = takePendingVideo();
    if (!youtubeId) return;
    findVideoByYoutubeId(youtubeId)
      .then((video) => {
        if (!video) return;
        setFolderId(video.folderId);
        setActive(video);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // ---- azioni -------------------------------------------------------

  /** Apre un video leggendolo di nuovo dal DB, così la posizione salvata è quella aggiornata. */
  async function openVideo(youtubeId: string) {
    const fresh = await findVideoByYoutubeId(youtubeId);
    if (!fresh) return;
    setPlayerError(null);
    setNotes([]);
    setActive(fresh);
  }

  async function handleAddVideo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const youtubeId = parseYouTubeId(linkInput);
    if (!youtubeId) {
      setError("Link non riconosciuto: incolla un link di YouTube (watch, youtu.be, shorts…).");
      return;
    }
    setAdding(true);
    try {
      const existing = await findVideoByYoutubeId(youtubeId);
      if (existing) {
        setFolderId(existing.folderId);
        setInfo(
          existing.folderId === null
            ? `Già salvato: "${existing.title}" (in "${NO_FOLDER_LABEL}").`
            : `Già salvato: "${existing.title}".`
        );
        await openVideo(youtubeId);
        setLinkInput("");
        return;
      }
      const meta = await fetchVideoMetadata(youtubeId);
      try {
        await addVideo({ youtubeId, ...meta, folderId });
      } catch (err) {
        // Salvato nel frattempo da un'altra azione: non è un errore per l'utente.
        if (!isUniqueViolation(err)) throw err;
      }
      setLinkInput("");
      reload();
      await openVideo(youtubeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleAddFolder(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const name = folderName.trim();
    if (!name) return;
    try {
      await addFolder(name, folderParent === "" ? null : Number(folderParent));
      setFolderName("");
      reload();
    } catch (err) {
      setError(isUniqueViolation(err) ? `Esiste già una cartella "${name}" in quel livello.` : String(err));
    }
  }

  async function handleDeleteFolder(id: number) {
    setError(null);
    setInfo(null);
    try {
      await deleteFolder(id);
      // La cartella (e le sottocartelle) spariscono, i video tornano in "Senza cartella".
      setFolderId(null);
      setFolderParent("");
      reload();
      setInfo("Cartella eliminata. I suoi video sono in \"Senza cartella\".");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleMoveVideo(video: SavedVideo, value: string) {
    setError(null);
    const target = value === "" ? null : Number(value);
    try {
      await moveVideo(video.id, target);
      setActive({ ...video, folderId: target });
      reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleToggleWatched(video: SavedVideo) {
    try {
      await setWatched(video.id, !video.watched);
      setActive({ ...video, watched: !video.watched });
      reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDeleteVideo(video: SavedVideo) {
    try {
      await deleteVideo(video.id);
      setActive(null);
      setNotes([]);
      reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    const text = noteText.trim();
    if (!text) return;
    const handle = playerRef.current;
    if (!handle) {
      setError("Il player non è ancora pronto: aspetta che il video si carichi.");
      return;
    }
    try {
      await addNote(active.id, handle.getCurrentTime(), text);
      setNoteText("");
      reload();
    } catch (err) {
      setError(String(err));
    }
  }

  // ---- render -------------------------------------------------------

  const folderLabel = selectedFolder ? selectedFolder.name : NO_FOLDER_LABEL;

  return (
    <div className="yt-detail">
      <header className="dashboard-header yt-detail-header">
        <div>
          <h1>YouTube</h1>
          <p>Video da guardare per lo studio, in cartelle, con note a tempo.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      {error && (
        <div className="yt-banner yt-banner--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Chiudi errore">
            ✕
          </button>
        </div>
      )}
      {info && !error && (
        <div className="yt-banner" role="status">
          <span>{info}</span>
          <button type="button" onClick={() => setInfo(null)} aria-label="Chiudi messaggio">
            ✕
          </button>
        </div>
      )}

      <div className="yt-layout">
        {/* ------------------------- Cartelle ------------------------- */}
        <aside className="yt-card yt-folders">
          <div className="yt-label">CARTELLE</div>

          <ul className="yt-folder-list">
            <li>
              <button
                type="button"
                className={`yt-folder-item${folderId === null ? " is-selected" : ""}`}
                onClick={() => setFolderId(null)}
              >
                <MdOutlineFolderOff /> <span>{NO_FOLDER_LABEL}</span>
              </button>
            </li>
            {flat.map(({ folder, depth }) => (
              <li key={folder.id}>
                <button
                  type="button"
                  className={`yt-folder-item${folderId === folder.id ? " is-selected" : ""}`}
                  style={{ paddingLeft: 10 + depth * 16 }}
                  onClick={() => setFolderId(folder.id)}
                  title={folder.name}
                >
                  <MdOutlineFolder /> <span>{folder.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <form className="yt-folder-form" onSubmit={(e) => void handleAddFolder(e)}>
            <input
              className="yt-input"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Nuova cartella"
              aria-label="Nome della nuova cartella"
            />
            <select
              className="yt-input"
              value={folderParent}
              onChange={(e) => setFolderParent(e.target.value)}
              aria-label="Dove creare la cartella"
            >
              <option value="">Primo livello</option>
              {flat.map(({ folder, path }) => (
                <option key={folder.id} value={folder.id}>
                  dentro: {path}
                </option>
              ))}
            </select>
            <button type="submit" className="yt-btn" disabled={!folderName.trim()}>
              Crea cartella
            </button>
          </form>

          {selectedFolder && (
            <ConfirmButton
              className="yt-btn yt-btn--danger"
              label="Elimina cartella selezionata"
              confirmLabel="Sicuro? Elimina anche le sottocartelle"
              onConfirm={() => handleDeleteFolder(selectedFolder.id)}
            />
          )}
        </aside>

        {/* ------------------------- Contenuto ------------------------- */}
        <div className="yt-main">
          <form className="yt-card yt-add" onSubmit={(e) => void handleAddVideo(e)}>
            <input
              className="yt-input yt-add-input"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={`Incolla un link di YouTube (verrà salvato in "${folderLabel}")`}
              aria-label="Link del video"
              disabled={adding}
            />
            <button type="submit" className="yt-btn yt-btn--primary" disabled={adding || !linkInput.trim()}>
              {adding ? "Aggiungo…" : "Aggiungi video"}
            </button>
          </form>

          {active ? (
            <section className="yt-card yt-watch">
              <div className="yt-watch-grid">
                <div className="yt-watch-player">
                  <div className="yt-player-frame">
                    {/* key = id del video: cambiare video monta un iframe nuovo. */}
                    <VideoPlayer
                      key={active.id}
                      youtubeId={active.youtubeId}
                      startSeconds={resumePoint(active)}
                      handleRef={playerRef}
                      onDuration={(seconds) => {
                        if (active.durationSeconds === null) {
                          void setDuration(active.id, seconds).then(() => {
                            setActive((current) =>
                              current && current.id === active.id ? { ...current, durationSeconds: Math.floor(seconds) } : current
                            );
                          });
                        }
                      }}
                      onProgress={(seconds) => void saveProgress(active.id, seconds)}
                      onEnded={() => {
                        void saveProgress(active.id, 0).then(() => setWatched(active.id, true)).then(reload);
                        setActive((current) => (current && current.id === active.id ? { ...current, watched: true } : current));
                      }}
                      onError={(code) => setPlayerError(describePlayerError(code))}
                    />
                  </div>
                  {playerError && (
                    <div className="yt-banner yt-banner--error" role="alert">
                      <span>{playerError}</span>
                    </div>
                  )}
                  <h2 className="yt-watch-title">{active.title}</h2>
                  <p className="yt-muted">{active.channel || "Canale sconosciuto"}</p>

                  <div className="yt-watch-actions">
                    <button type="button" className="yt-btn" onClick={() => void handleToggleWatched(active)}>
                      {active.watched ? "Segna da guardare" : "Segna come guardato"}
                    </button>
                    <select
                      className="yt-input yt-move"
                      value={active.folderId === null ? "" : String(active.folderId)}
                      onChange={(e) => void handleMoveVideo(active, e.target.value)}
                      aria-label="Sposta il video in una cartella"
                    >
                      <option value="">Sposta in: {NO_FOLDER_LABEL}</option>
                      {flat.map(({ folder, path }) => (
                        <option key={folder.id} value={folder.id}>
                          Sposta in: {path}
                        </option>
                      ))}
                    </select>
                    <ConfirmButton
                      className="yt-btn yt-btn--danger"
                      label="Elimina video"
                      confirmLabel="Sicuro? Elimina anche le note"
                      onConfirm={() => handleDeleteVideo(active)}
                    />
                  </div>
                </div>

                <div className="yt-notes">
                  <div className="yt-label">NOTE A TEMPO</div>
                  <form className="yt-note-form" onSubmit={(e) => void handleAddNote(e)}>
                    <textarea
                      className="yt-input yt-note-input"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Scrivi una nota: verrà agganciata al punto del video in cui sei ora"
                      rows={3}
                      aria-label="Testo della nota"
                    />
                    <button type="submit" className="yt-btn yt-btn--primary" disabled={!noteText.trim()}>
                      Aggiungi nota al punto attuale
                    </button>
                  </form>

                  {notes.length === 0 ? (
                    <p className="yt-muted">Nessuna nota per questo video.</p>
                  ) : (
                    <ul className="yt-note-list">
                      {notes.map((note) => (
                        <li key={note.id} className="yt-note">
                          <button
                            type="button"
                            className="yt-note-time"
                            onClick={() => playerRef.current?.seekTo(note.timestampSeconds)}
                            title="Vai a questo punto del video"
                          >
                            {formatTimestamp(note.timestampSeconds)}
                          </button>
                          <span className="yt-note-text">{note.text}</span>
                          <ConfirmButton
                            className="yt-note-delete"
                            label="✕"
                            confirmLabel="Sicuro?"
                            onConfirm={async () => {
                              await deleteNote(note.id);
                              reload();
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="yt-card yt-empty">
              <p className="yt-muted">Incolla un link qui sopra o scegli un video dall'elenco per iniziare.</p>
            </section>
          )}

          <section className="yt-card yt-videos">
            <div className="yt-label">
              VIDEO IN "{folderLabel.toUpperCase()}" · {videos.length}
            </div>
            {videos.length === 0 ? (
              <p className="yt-muted">Nessun video in questa cartella. Aggiungine uno con il campo qui sopra.</p>
            ) : (
              <ul className="yt-video-list">
                {videos.map((video) => (
                  <li key={video.id}>
                    <button
                      type="button"
                      className={`yt-video-item${active?.id === video.id ? " is-selected" : ""}`}
                      onClick={() => void openVideo(video.youtubeId)}
                    >
                      {video.thumbnailUrl ? (
                        <img className="yt-thumb" src={video.thumbnailUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="yt-thumb yt-thumb--empty" />
                      )}
                      <span className="yt-video-text">
                        <span className="yt-video-title">{video.title}</span>
                        <span className="yt-muted">
                          {video.channel || "Canale sconosciuto"}
                          {video.durationSeconds !== null && ` · ${formatTimestamp(video.durationSeconds)}`}
                          {video.positionSeconds > 0 && !video.watched && ` · ripresa da ${formatTimestamp(video.positionSeconds)}`}
                        </span>
                      </span>
                      {video.watched && <MdCheckCircle className="yt-watched" aria-label="Guardato" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default YoutubeDetail;
