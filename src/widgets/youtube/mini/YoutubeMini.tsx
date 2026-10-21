import { useEffect, useState, type MouseEvent } from "react";
import { useNav } from "../../../core/nav/useNav";
import { PlayIcon } from "../../../ui/icons";
import { listAllVideos, type SavedVideo } from "../data/youtubeRepository";
import { requestOpenVideo } from "../lib/launch";
import { pickVideoToContinue, videoQueue } from "../lib/library";
import { formatTimestamp } from "../lib/youtube";
import "./YoutubeMini.css";

/** Mini da intestazione: play per riprendere il video, titolo e quanti ne restano in coda. */
function YoutubeMini() {
  const { openWidgetDetail } = useNav();
  // undefined = in caricamento.
  const [videos, setVideos] = useState<SavedVideo[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    listAllVideos()
      .then((result) => {
        if (!cancelled) setVideos(result);
      })
      .catch((error) => {
        console.error("Errore nel caricamento dei video:", error);
        if (!cancelled) setVideos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hero = videos ? pickVideoToContinue(videos) : null;
  const queued = videos ? videoQueue(videos).length : 0;

  function watch(e: MouseEvent) {
    e.stopPropagation();
    if (!hero) return;
    requestOpenVideo(hero.youtubeId);
    openWidgetDetail("youtube");
  }

  const label = hero ? `${hero.positionSeconds > 0 ? "Continua" : "Guarda"}: ${hero.title}` : "Nessun video da guardare";
  return (
    <div className="yt-mini">
      <button type="button" className="yt-mini-play" onClick={watch} disabled={!hero} aria-label={label} title={label}>
        <PlayIcon size={14} />
      </button>
      <div className="yt-mini-text">
        <span className="yt-mini-title">{hero ? hero.title : videos ? "Niente da riprendere" : "…"}</span>
        <span className="yt-mini-sub">
          {hero && hero.positionSeconds > 0 ? `Da ${formatTimestamp(hero.positionSeconds)} · ` : ""}
          {queued === 1 ? "1 in coda" : `${queued} in coda`}
        </span>
      </div>
    </div>
  );
}

export default YoutubeMini;
