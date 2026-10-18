import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdSearch } from "react-icons/md";
import { useNav } from "../../core/nav/NavContext";
import BackButton from "../../ui/BackButton";
import AddVideoDialog from "./components/AddVideoDialog";
import { findVideoByYoutubeId, type SavedVideo } from "./data/youtubeRepository";
import { useYoutubeData } from "./hooks/useYoutubeData";
import { takePendingVideo } from "./lib/launch";
import { searchVideos } from "./lib/library";
import { formatTimestamp } from "./lib/youtube";
import HomeScreen from "./screens/HomeScreen";
import LibraryScreen, { type LibraryLocation } from "./screens/LibraryScreen";
import WatchScreen from "./screens/WatchScreen";
import "./YoutubeDetail.css";

type Screen =
  | { name: "home" }
  | { name: "library"; location: LibraryLocation }
  | { name: "watch"; videoId: number };

const TABS = [
  { id: "home", label: "Home" },
  { id: "library", label: "Libreria" },
] as const;

const SEARCH_LIMIT = 8;

/**
 * Pagina del widget YouTube: Home ("da dove ripartiamo"), Libreria (cartelle ad albero),
 * Guarda (player + appunti). Le cartelle e i video stanno tutti in memoria
 * (vedi useYoutubeData) e si rileggono dopo ogni modifica e a ogni cambio di schermata.
 */
function YoutubeDetail() {
  const { goToDashboard } = useNav();
  const { folders, videos, loaded, error, setError, reload } = useYoutubeData();

  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [addOpen, setAddOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const pendingRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstScreen = useRef(true);

  // Aperta dal pulsante del widget: legge UNA volta il video richiesto.
  // Nessun flag `cancelled`: in StrictMode l'effetto gira due volte e la prima lettura consuma la richiesta.
  useEffect(() => {
    const id = takePendingVideo();
    if (id) pendingRef.current = id;
  }, []);

  // Il video richiesto si apre appena la libreria è caricata (dichiarato dopo l'effetto che lo legge).
  useEffect(() => {
    const youtubeId = pendingRef.current;
    if (!youtubeId || !loaded) return;
    pendingRef.current = null;
    findVideoByYoutubeId(youtubeId)
      .then((video) => {
        if (video) setScreen({ name: "watch", videoId: video.id });
      })
      .catch((e: unknown) => setError(String(e)));
  }, [loaded, setError]);

  // A ogni cambio di schermata si rileggono i dati: il player salva posizione e stato senza ricaricare la pagina.
  const screenKey = screen.name === "watch" ? `watch:${screen.videoId}` : screen.name;
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    reload(); // reload() cambia solo un contatore: i dati arrivano in modo asincrono
  }, [screenKey, reload]);

  // Ctrl+K porta alla ricerca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Messaggi informativi: spariscono da soli.
  useEffect(() => {
    if (!info) return;
    const t = window.setTimeout(() => setInfo(null), 4000);
    return () => window.clearTimeout(t);
  }, [info]);

  const openVideo = useCallback((video: SavedVideo) => {
    setQuery("");
    setScreen({ name: "watch", videoId: video.id });
  }, []);

  const hits = useMemo(() => searchVideos(videos, folders, query), [videos, folders, query]);

  const watchedVideo = screen.name === "watch" ? (videos.find((v) => v.id === screen.videoId) ?? null) : null;
  // Il video che si sta guardando è stato eliminato (da qui o altrove): si mostra la libreria invece di una pagina rotta.
  const current: Screen = screen.name === "watch" && loaded && !watchedVideo ? { name: "library", location: null } : screen;

  const activeTab = current.name === "watch" ? null : current.name;

  function goTab(id: (typeof TABS)[number]["id"]) {
    setQuery("");
    if (id === "library") setScreen({ name: "library", location: null });
    else setScreen({ name: "home" });
  }

  return (
    <div className="yt-detail">
      <header className="dashboard-header yt-detail-header">
        <div>
          <h1>YouTube</h1>
          <p>Video da guardare per lo studio, in cartelle, con appunti a tempo.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      <div className="yt-topbar">
        <nav className="yt-tabs" aria-label="Sezioni">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={activeTab === t.id ? "active" : ""} onClick={() => goTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="yt-search">
          <MdSearch />
          <input
            ref={searchRef}
            className="yt-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                searchRef.current?.blur();
              }
            }}
            placeholder="Cerca video o cartelle…  (Ctrl+K)"
            aria-label="Cerca nella libreria"
          />
          {query.trim() && (
            <div className="yt-search-results" role="listbox">
              {hits.length === 0 ? (
                <p className="yt-muted yt-search-empty">Nessun risultato.</p>
              ) : (
                <>
                  {hits.slice(0, SEARCH_LIMIT).map(({ video, folderLabel }) => (
                    <button key={video.id} type="button" className="yt-search-hit" role="option" aria-selected={false} onClick={() => openVideo(video)}>
                      <span className="yt-search-hit-title">{video.title}</span>
                      <span className="yt-muted">
                        {[video.channel, folderLabel, video.durationSeconds !== null ? formatTimestamp(video.durationSeconds) : null].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                  {hits.length > SEARCH_LIMIT && <p className="yt-muted yt-search-empty">e altri {hits.length - SEARCH_LIMIT}: restringi la ricerca</p>}
                </>
              )}
            </div>
          )}
        </div>

        <button type="button" className="yt-btn yt-btn--primary" onClick={() => setAddOpen(true)}>
          <MdAdd /> Aggiungi
        </button>
      </div>

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

      {!loaded && !error ? (
        <p className="yt-muted">Carico la libreria…</p>
      ) : (
        <>
          {current.name === "home" && (
            <HomeScreen
              folders={folders}
              videos={videos}
              onOpenVideo={openVideo}
              onAddVideo={() => setAddOpen(true)}
            />
          )}
          {current.name === "library" && (
            <LibraryScreen
              folders={folders}
              videos={videos}
              location={current.location}
              onNavigate={(location) => setScreen({ name: "library", location })}
              onOpenVideo={openVideo}
              onAddVideo={() => setAddOpen(true)}
              onReload={reload}
              onError={setError}
            />
          )}
          {current.name === "watch" && watchedVideo && (
            <WatchScreen
              key={watchedVideo.id}
              video={watchedVideo}
              folders={folders}
              videos={videos}
              onOpenVideo={openVideo}
              onNavigateLibrary={(location) => setScreen({ name: "library", location })}
              onReload={reload}
              onError={setError}
            />
          )}
        </>
      )}

      {addOpen && (
        <AddVideoDialog
          folders={folders}
          defaultFolderId={current.name === "library" && typeof current.location === "number" ? current.location : null}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            reload();
            setInfo("Video aggiunto alla libreria.");
          }}
        />
      )}
    </div>
  );
}

export default YoutubeDetail;
