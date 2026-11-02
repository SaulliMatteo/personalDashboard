import type { MouseEvent } from "react";
import { useNav } from "../../../core/nav/useNav";
import { PlayIcon } from "../../../ui/icons";
import { useSuggestion } from "../hooks/useSuggestion";
import { requestOpenVideo } from "../lib/launch";
import { formatTimestamp } from "../lib/youtube";
import "./YoutubeMini.css";

/** Mini da intestazione: play sul video consigliato, titolo e quanti ne restano in coda. Nessun altro controllo. */
function YoutubeMini() {
  const { openWidgetDetail } = useNav();
  // Lo stesso consiglio del widget e della Home (lib/suggestion.ts). undefined = in caricamento.
  const suggestion = useSuggestion();
  const hero = suggestion?.pick ?? null;
  const queued = suggestion?.pendingCount ?? 0;

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
        <span className="yt-mini-title">{hero ? hero.title : suggestion ? "Niente da guardare" : "…"}</span>
        <span className="yt-mini-sub">
          {hero && hero.positionSeconds > 0 ? `Da ${formatTimestamp(hero.positionSeconds)} · ` : ""}
          {queued === 1 ? "1 in coda" : `${queued} in coda`}
        </span>
      </div>
    </div>
  );
}

export default YoutubeMini;
