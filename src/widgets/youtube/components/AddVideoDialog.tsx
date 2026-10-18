import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MdCheckCircle, MdErrorOutline } from "react-icons/md";
import { addFolder, addVideo, findVideoByYoutubeId, isUniqueViolation, listFolders, type SavedVideo, type VideoFolder } from "../data/youtubeRepository";
import { folderOptions } from "../lib/folderOptions";
import { folderPath } from "../lib/library";
import { fetchVideoMetadata, parseYouTubeId, type VideoMetadata } from "../lib/youtube";
import Dialog from "./Dialog";

interface AddVideoDialogProps {
  folders: VideoFolder[];
  /** Cartella proposta all'apertura (quella in cui sei). */
  defaultFolderId: number | null;
  onClose: () => void;
  /** Dopo l'aggiunta: il genitore rilegge i dati; `video` è quello salvato (o quello già presente). */
  onAdded: (youtubeId: string) => void;
}

type Preview =
  | { state: "idle" }
  | { state: "invalid" }
  | { state: "loading" }
  | { state: "ready"; youtubeId: string; meta: VideoMetadata }
  | { state: "exists"; video: SavedVideo }
  | { state: "error"; message: string };

const NEW_FOLDER = "__new__";

/** Aggiunta di un video da link: validazione, anteprima (oEmbed), cartella (anche nuova al volo). */
function AddVideoDialog({ folders, defaultFolderId, onClose, onAdded }: AddVideoDialogProps) {
  const [link, setLink] = useState("");
  // Esito (asincrono) del controllo dell'ultimo link: vale solo se si riferisce al link attuale.
  const [result, setResult] = useState<{ youtubeId: string; preview: Preview } | null>(null);
  const [folderValue, setFolderValue] = useState<string>(defaultFolderId === null ? "" : String(defaultFolderId));
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string>(""); // "" = primo livello
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => folderOptions(folders), [folders]);

  const trimmed = link.trim();
  const youtubeId = trimmed ? parseYouTubeId(trimmed) : null;
  const preview: Preview = !trimmed
    ? { state: "idle" }
    : !youtubeId
      ? { state: "invalid" }
      : result?.youtubeId === youtubeId
        ? result.preview
        : { state: "loading" };

  // Anteprima con attesa di 400 ms dall'ultimo tasto: niente richieste a ogni lettera.
  useEffect(() => {
    if (!youtubeId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        let outcome: Preview;
        try {
          const existing = await findVideoByYoutubeId(youtubeId);
          outcome = existing
            ? { state: "exists", video: existing }
            : { state: "ready", youtubeId, meta: await fetchVideoMetadata(youtubeId) };
        } catch (err) {
          outcome = { state: "error", message: err instanceof Error ? err.message : String(err) };
        }
        if (!cancelled) setResult({ youtubeId, preview: outcome });
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [youtubeId]);

  const creatingFolder = folderValue === NEW_FOLDER;
  const canSubmit = preview.state === "ready" && !busy && (!creatingFolder || newName.trim().length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (preview.state !== "ready" || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      let folderId: number | null = folderValue === "" ? null : Number(folderValue);
      if (creatingFolder) {
        const name = newName.trim();
        const parent = newParent === "" ? null : Number(newParent);
        try {
          await addFolder(name, parent);
        } catch (err) {
          // Esiste già con quel nome nello stesso livello: la si usa, non è un errore per chi la sta creando.
          if (!isUniqueViolation(err)) throw err;
        }
        const fresh = await listFolders();
        const created = fresh.find((f) => f.parentId === parent && f.name.toLowerCase() === name.toLowerCase());
        if (!created) throw new Error("Cartella non trovata dopo la creazione.");
        folderId = created.id;
      }
      try {
        await addVideo({ youtubeId: preview.youtubeId, ...preview.meta, folderId });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // salvato nel frattempo: va bene lo stesso
      }
      onAdded(preview.youtubeId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Aggiungi video" onClose={onClose} width={520}>
      <form className="yt-dialog-body" onSubmit={(e) => void submit(e)}>
        <label className="yt-field">
          <span className="yt-label">LINK DI YOUTUBE</span>
          <input
            className="yt-input"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="Link del video"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {preview.state === "invalid" && (
          <div className="yt-validation yt-validation--bad">
            <MdErrorOutline /> Link non riconosciuto: incolla un link di YouTube (watch, youtu.be, shorts…).
          </div>
        )}
        {preview.state === "loading" && <div className="yt-validation">Controllo il link…</div>}
        {preview.state === "error" && (
          <div className="yt-validation yt-validation--bad">
            <MdErrorOutline /> {preview.message}
          </div>
        )}
        {preview.state === "exists" && (
          <div className="yt-validation yt-validation--warn">
            <MdErrorOutline /> Già salvato: "{preview.video.title}"
            {preview.video.folderId !== null && ` (in ${folderPath(folders, preview.video.folderId).map((f) => f.name).join(" / ") || "una cartella"})`}.
          </div>
        )}
        {preview.state === "ready" && (
          <>
            <div className="yt-validation yt-validation--ok">
              <MdCheckCircle /> Link valido
            </div>
            <div className="yt-preview">
              {preview.meta.thumbnailUrl ? <img src={preview.meta.thumbnailUrl} alt="" /> : <div className="yt-thumb-empty" />}
              <div className="yt-preview-text">
                <span className="yt-preview-title">{preview.meta.title}</span>
                <span className="yt-muted">{preview.meta.channel || "Canale sconosciuto"}</span>
              </div>
            </div>
          </>
        )}

        <label className="yt-field">
          <span className="yt-label">CARTELLA</span>
          <select className="yt-input" value={folderValue} onChange={(e) => setFolderValue(e.target.value)}>
            <option value="">Senza cartella</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value={NEW_FOLDER}>+ Nuova cartella…</option>
          </select>
        </label>

        {creatingFolder && (
          <div className="yt-newfolder">
            <input className="yt-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome della nuova cartella" maxLength={80} aria-label="Nome della nuova cartella" />
            <select className="yt-input" value={newParent} onChange={(e) => setNewParent(e.target.value)} aria-label="Dove creare la cartella">
              <option value="">Primo livello</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  dentro: {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

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
          <button type="submit" className="yt-btn yt-btn--primary" disabled={!canSubmit}>
            {busy ? "Aggiungo…" : "Aggiungi"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default AddVideoDialog;
