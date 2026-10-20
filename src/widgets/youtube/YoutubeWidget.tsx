import { useEffect, useState, type MouseEvent } from "react";
import { useNav } from "../../core/nav/NavContext";
import { useSingleClick } from "../../core/hooks/useSingleClick";
import { useThemeVariant } from "../../core/theme/variants";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import ProgressBar from "../../ui/ProgressBar";
import { PlayIcon } from "../../ui/icons";
import { listAllVideos, type SavedVideo } from "./data/youtubeRepository";
import { requestOpenVideo } from "./lib/launch";
import { pickVideoToContinue, videoProgress, videoQueue } from "./lib/library";
import { formatTimestamp } from "./lib/youtube";
import "./YoutubeWidget.css";

/** Quanti video mostra "Prossimi". */
const NEXT_COUNT = 2;

type PositionText = (video: SavedVideo) => string;

const positionOf = (v: SavedVideo) => formatTimestamp(v.positionSeconds);
const durationOf = (v: SavedVideo) => (v.durationSeconds ? formatTimestamp(v.durationSeconds) : null);

// "Dove sei arrivato", con le parole dei mockup di ogni tema.
const continueFrom: PositionText = (v) => (v.positionSeconds > 0 ? `Continua da ${positionOf(v)}` : "Da guardare");
const positionOfTotal: PositionText = (v) => {
  const total = durationOf(v);
  if (v.positionSeconds <= 0) return total ? `Da guardare, ${total}` : "Da guardare";
  return total ? `${positionOf(v)} di ${total}` : `Da ${positionOf(v)}`;
};
const POSITION_TEXT = {
  notte: continueFrom,
  opaco: positionOfTotal,
  quaderno: (v: SavedVideo) => {
    const total = durationOf(v);
    return v.positionSeconds > 0 && total ? `Continua da ${positionOf(v)} su ${total}` : continueFrom(v);
  },
  fosforo: positionOfTotal,
};

/**
 * Come si dispone la 3×2 nei mockup: dove sta il titolo, se l'intestazione
 * conta i video in coda, se i successivi sono un elenco o una riga "Poi:".
 */
const LARGE_LAYOUT = {
  notte: { titleLeft: true, showCount: true, nextAsList: true },
  opaco: { titleLeft: false, showCount: false, nextAsList: false },
  quaderno: { titleLeft: false, showCount: false, nextAsList: true },
  fosforo: { titleLeft: true, showCount: true, nextAsList: true },
};

/**
 * Widget in dashboard: il video da riprendere e, nelle taglie grandi, i
 * successivi. Il player vive solo nella pagina di dettaglio (un iframe qui
 * romperebbe il drag della griglia). I dati si rileggono a ogni montaggio.
 */
function YoutubeWidget({ w, h }: WidgetProps) {
  const { openWidgetDetail } = useNav();
  const size = sizeKey(w, h);
  const positionText = useThemeVariant(POSITION_TEXT);
  const layout = useThemeVariant(LARGE_LAYOUT);
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
  const queue = videos ? videoQueue(videos) : [];
  const next = queue.filter((v) => v.id !== hero?.id).slice(0, NEXT_COUNT);

  function watch() {
    if (!hero) return;
    requestOpenVideo(hero.youtubeId);
    openWidgetDetail("youtube");
  }

  const onCellClick = useSingleClick(watch);

  function onThumbClick(e: MouseEvent) {
    e.stopPropagation();
    watch();
  }

  const label = hero ? `${hero.positionSeconds > 0 ? "Continua" : "Guarda"}: ${hero.title}` : "";
  const progress = hero ? videoProgress(hero) : 0;

  if (size === "S") {
    return (
      <WidgetFrame>
        <article className="widget ytw ytw--S">
          <button
            type="button"
            data-cell-action
            className="ytw-cell"
            onClick={onCellClick}
            disabled={!hero}
            aria-label={hero ? label : "Nessun video da guardare"}
            title={hero ? label : "Nessun video da guardare"}
          >
            {hero?.thumbnailUrl && <img className="ytw-cell-img" src={hero.thumbnailUrl} alt="" draggable={false} />}
            <span className="ytw-play">
              <PlayIcon size={20} />
            </span>
            <span className="ytw-thumb-track" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          </button>
        </article>
      </WidgetFrame>
    );
  }

  if (videos !== undefined && !hero) {
    return (
      <WidgetFrame>
        <article className={`widget ytw ytw--${size} ytw--empty`}>
          <span className="ytw-heading">YouTube</span>
          <p className="ytw-empty">Nessun video da guardare. Aggiungine uno dalla pagina del widget.</p>
        </article>
      </WidgetFrame>
    );
  }

  const thumb = hero && (
    <button type="button" className="ytw-thumb" onClick={onThumbClick} aria-label={label} title={label}>
      {hero.thumbnailUrl && <img src={hero.thumbnailUrl} alt="" draggable={false} />}
      <span className="ytw-play">
        <PlayIcon size={17} />
      </span>
      {hero.durationSeconds ? <span className="ytw-badge">{formatTimestamp(hero.durationSeconds)}</span> : null}
      <span className="ytw-thumb-track" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </span>
    </button>
  );

  const title = hero && <span className="ytw-title">{hero.title}</span>;
  const position = hero && <span className="ytw-position">{positionText(hero)}</span>;
  const bar = <ProgressBar value={progress} className="ytw-bar" label="Avanzamento del video" />;

  if (size === "W" || size === "T") {
    return (
      <WidgetFrame>
        <article className={`widget ytw ytw--${size}`}>
          {thumb}
          <div className="ytw-text">
            {title}
            {position}
          </div>
        </article>
      </WidgetFrame>
    );
  }

  return (
    <WidgetFrame>
      <article className="widget ytw ytw--L">
        <div className="ytw-col ytw-col--left">
          {thumb}
          {bar}
          {layout.titleLeft && title}
          {position}
        </div>
        <div className="ytw-col ytw-col--right">
          <div className="ytw-head">
            <h2 className="ytw-heading">YouTube</h2>
            {layout.showCount && <span className="ytw-count">{queue.length} in coda</span>}
          </div>
          {!layout.titleLeft && title}
          {layout.nextAsList ? (
            <>
              {next.length > 0 && <span className="ytw-next-label">Prossimi</span>}
              {next.map((v) => (
                <span key={v.id} className="ytw-next-row">
                  <span className="ytw-next-title">{v.title}</span>
                  {v.durationSeconds ? <span className="ytw-next-time">{formatTimestamp(v.durationSeconds)}</span> : null}
                </span>
              ))}
            </>
          ) : (
            next[0] && <span className="ytw-then">Poi: {next[0].title}</span>
          )}
        </div>
      </article>
    </WidgetFrame>
  );
}

export default YoutubeWidget;
