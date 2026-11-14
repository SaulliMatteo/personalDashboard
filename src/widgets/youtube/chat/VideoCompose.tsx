import { useEffect, useMemo, useState } from "react";
import type { ChatComposeProps } from "../../../core/widgets/chatActions";
import { ChatComposeFoot, ChatComposeList, ChatComposeRow, ChatComposeSearch, ChatComposeTabs } from "../../../ui/ChatCompose";
import { listAllVideos, listFolders, type SavedVideo, type VideoFolder } from "../data/youtubeRepository";
import { folderPath, searchVideos } from "../lib/library";
import { fetchVideoMetadata, formatTimestamp, parseYouTubeId, type VideoMetadata } from "../lib/youtube";
import { thumbnailOf, videoPayload } from "./videoPayload";
import "./VideoChat.css";

type Tab = "mine" | "link";
const TABS = [
  { id: "mine", label: "I tuoi video" },
  { id: "link", label: "Incolla un link" },
] as const;

type LinkPreview =
  | { state: "idle" }
  | { state: "invalid" }
  | { state: "loading" }
  | { state: "ready"; meta: VideoMetadata }
  | { state: "error"; message: string };

/** "Consiglia un video" (docs/mockup/gruppi/amici-notifiche.html, vista 5): dai video salvati o da un link. */
function VideoCompose({ send, onClose }: ChatComposeProps) {
  const [tab, setTab] = useState<Tab>("mine");
  const [videos, setVideos] = useState<SavedVideo[] | null>(null);
  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<SavedVideo | null>(null);
  const [link, setLink] = useState("");
  const [fetched, setFetched] = useState<{ youtubeId: string; preview: LinkPreview } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllVideos(), listFolders()])
      .then(([v, f]) => {
        if (cancelled) return;
        // i più recenti prima: di solito si consiglia quello appena visto
        setVideos([...v].sort((a, b) => (b.lastWatchedAt ?? b.createdAt) - (a.lastWatchedAt ?? a.createdAt)));
        setFolders(f);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!videos) return [];
    if (!query.trim()) return videos;
    return searchVideos(videos, folders, query).map((h) => h.video);
  }, [videos, folders, query]);

  const trimmed = link.trim();
  const linkId = trimmed ? parseYouTubeId(trimmed) : null;
  const preview: LinkPreview = !trimmed
    ? { state: "idle" }
    : !linkId
      ? { state: "invalid" }
      : fetched?.youtubeId === linkId
        ? fetched.preview
        : { state: "loading" };

  // titolo e canale dal link, 400 ms dopo l'ultimo tasto (come "Aggiungi video")
  useEffect(() => {
    if (!linkId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchVideoMetadata(linkId)
        .then((meta) => {
          if (!cancelled) setFetched({ youtubeId: linkId, preview: { state: "ready", meta } });
        })
        .catch((err: unknown) => {
          if (!cancelled) setFetched({ youtubeId: linkId, preview: { state: "error", message: err instanceof Error ? err.message : String(err) } });
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [linkId]);

  let payload: Record<string, unknown> | null = null;
  if (tab === "mine" && chosen) payload = videoPayload(chosen);
  if (tab === "link" && linkId && preview.state === "ready") payload = videoPayload({ youtubeId: linkId, ...preview.meta });

  return (
    <>
      <ChatComposeTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "mine" ? (
        <>
          <ChatComposeSearch value={query} onChange={setQuery} placeholder="Cerca tra i tuoi video" />
          <ChatComposeList
            empty={
              loadError ??
              (videos === null
                ? "Carico i video…"
                : videos.length === 0
                  ? "Nessun video salvato: incolla un link."
                  : shown.length === 0
                    ? "Nessun video con queste parole."
                    : null)
            }
          >
            {shown.map((v) => (
              <ChatComposeRow
                key={v.id}
                selected={chosen?.id === v.id}
                onSelect={() => setChosen(v)}
                lead={<VideoMiniThumb youtubeId={v.youtubeId} />}
                title={v.title}
                sub={[v.channel, folderPath(folders, v.folderId).map((f) => f.name).join(" / "), v.durationSeconds !== null ? formatTimestamp(v.durationSeconds) : null].filter(Boolean).join(" · ")}
              />
            ))}
          </ChatComposeList>
        </>
      ) : (
        <div className="ytc-link">
          <input
            type="url"
            className="ytc-link-field"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="Link del video"
            autoFocus
          />
          {preview.state === "invalid" && <p className="ytc-link-note">Non sembra un link di YouTube.</p>}
          {preview.state === "loading" && <p className="ytc-link-note">Leggo il video…</p>}
          {preview.state === "error" && <p className="ytc-link-note is-error">{preview.message}</p>}
          {preview.state === "ready" && linkId && (
            <div className="ytc-link-preview">
              <VideoMiniThumb youtubeId={linkId} />
              <span>
                <b>{preview.meta.title}</b>
                {preview.meta.channel && <small>{preview.meta.channel}</small>}
              </span>
            </div>
          )}
        </div>
      )}
      <ChatComposeFoot payload={payload} send={send} onClose={onClose} busy={tab === "link" && preview.state === "loading"} />
    </>
  );
}

/** Miniatura piccola dall'id (si nasconde se non si carica, ad esempio senza rete). */
export function VideoMiniThumb({ youtubeId }: { youtubeId: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="ytc-mini" aria-hidden="true">
      {!failed && <img src={thumbnailOf(youtubeId)} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

export default VideoCompose;
