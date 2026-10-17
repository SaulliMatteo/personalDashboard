import { useEffect, useState, type MouseEvent } from "react";
import { MdPlayArrow } from "react-icons/md";
import { useNav } from "../../core/nav/NavContext";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { getVideoToContinue, type SavedVideo } from "./data/youtubeRepository";
import { requestOpenVideo } from "./lib/launch";
import { formatTimestamp } from "./lib/youtube";
import "./YoutubeWidget.css";

/**
 * Widget in dashboard: il video che stai guardando (iniziato e non finito) o,
 * se non ce n'è, il primo da guardare. Il player vive solo nella pagina di
 * dettaglio (un iframe qui romperebbe il drag della griglia). Niente provider:
 * il dato si rilegge ogni volta che la dashboard si monta.
 */
function YoutubeWidget({ w }: WidgetProps) {
  const { openWidgetDetail } = useNav();
  // undefined = in caricamento, null = nessun video da guardare.
  const [video, setVideo] = useState<SavedVideo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getVideoToContinue()
      .then((result) => {
        if (!cancelled) setVideo(result);
      })
      .catch((error) => {
        console.error("Errore nel caricamento del video da guardare:", error);
        if (!cancelled) setVideo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isWide = w >= 2;

  // Il click sul widget apre la pagina di dettaglio: il pulsante invece apre
  // quella pagina già sul video proposto, quindi ferma la propagazione.
  function handleWatch(e: MouseEvent) {
    e.stopPropagation();
    if (!video) return;
    requestOpenVideo(video.youtubeId);
    openWidgetDetail("youtube");
  }

  const started = video ? video.positionSeconds > 0 : false;
  const progress =
    video && started && video.durationSeconds !== null && video.durationSeconds > 0
      ? Math.min(1, video.positionSeconds / video.durationSeconds)
      : null;

  let stateLabel = "";
  if (video) {
    if (!started) stateLabel = "Da guardare";
    else if (video.durationSeconds !== null)
      stateLabel = `Continua · ${formatTimestamp(video.positionSeconds)} / ${formatTimestamp(video.durationSeconds)}`;
    else stateLabel = `Continua · da ${formatTimestamp(video.positionSeconds)}`;
  }

  return (
    <WidgetFrame>
      <article className={`widget yt-widget ${isWide ? "yt-widget--wide" : "yt-widget--small"}`}>
        <div className="widget-header yt-widget-header">
          <h2>YouTube</h2>
          {isWide && stateLabel && <span className="yt-widget-state">{stateLabel}</span>}
        </div>

        {video === undefined ? null : video === null ? (
          <p className="yt-widget-empty">Nessun video da guardare</p>
        ) : (
          <div className="yt-widget-body">
            <button
              type="button"
              className="yt-widget-thumb"
              onClick={handleWatch}
              aria-label={`${started ? "Continua" : "Guarda"}: ${video.title}`}
              title={`${video.title}${stateLabel ? ` — ${stateLabel}` : ""}`}
            >
              {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" draggable={false} /> : null}
              <span className="yt-widget-play">
                <MdPlayArrow />
              </span>
              {progress !== null && (
                <span className="yt-widget-progress">
                  <span style={{ width: `${progress * 100}%` }} />
                </span>
              )}
            </button>

            {isWide && (
              <div className="yt-widget-text">
                <span className="yt-widget-title">{video.title}</span>
                {video.channel && <span className="yt-widget-channel">{video.channel}</span>}
              </div>
            )}
          </div>
        )}
      </article>
    </WidgetFrame>
  );
}

export default YoutubeWidget;
