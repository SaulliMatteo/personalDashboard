import { useSyncExternalStore, type MouseEvent } from "react";
import { useNav } from "../../core/nav/useNav";
import { useSingleClick } from "../../core/hooks/useSingleClick";
import { useThemeVariant } from "../../core/theme/variants";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import ProgressBar from "../../ui/ProgressBar";
import { PlayIcon } from "../../ui/icons";
import ConfirmButton from "../../ui/ConfirmButton";
import type { SavedVideo } from "./data/youtubeRepository";
import { useSuggestion } from "./hooks/useSuggestion";
import { pendingDiscards, requestDiscard, subscribeDiscards, undoDiscard } from "./lib/discard";
import { requestOpenVideo } from "./lib/launch";
import { videoProgress } from "./lib/library";
import { snoozeSuggested } from "./lib/suggestion";
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

/** I pulsanti dentro la cella non devono arrivare alla cella (click, doppio click). */
const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * Widget in dashboard: il video consigliato (lib/suggestion.ts, lo stesso del mini e della Home) e, nelle
 * taglie grandi, i successivi della classifica. Solo la 3×2 ha "Non ora" / "Scarta" e il motivo. Il player
 * vive solo nella pagina di dettaglio (un iframe qui romperebbe il drag della griglia).
 */
function YoutubeWidget({ w, h }: WidgetProps) {
  const { openWidgetDetail } = useNav();
  const size = sizeKey(w, h);
  const positionText = useThemeVariant(POSITION_TEXT);
  const layout = useThemeVariant(LARGE_LAYOUT);
  // undefined = in caricamento.
  const suggestion = useSuggestion();
  const discarding = useSyncExternalStore(subscribeDiscards, pendingDiscards);
  const lastDiscarded = discarding.length > 0 ? discarding[discarding.length - 1] : null;

  const hero = suggestion?.pick ?? null;
  const queue = suggestion?.queue ?? [];
  const next = queue.slice(0, NEXT_COUNT);

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
            // aria-disabled e non disabled: su WebKit un pulsante disabilitato si mangia il doppio click del dettaglio
            onClick={hero ? onCellClick : (e) => e.stopPropagation()}
            aria-disabled={!hero || undefined}
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

  // Nella 3×2 un video appena scartato tiene il posto per "Annulla" anche se non resta altro da proporre.
  const keepsUndo = size !== "W" && size !== "T" && lastDiscarded !== null;
  if (suggestion !== undefined && !hero && !keepsUndo) {
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
          {hero && suggestion?.reason && <span className="ytw-reason">{suggestion.reason}</span>}
          {lastDiscarded ? (
            <span className="ytw-actions" role="status">
              <span className="ytw-actions-note">Scartato</span>
              <button
                type="button"
                className="ytw-action"
                onClick={(e) => {
                  stop(e);
                  undoDiscard(lastDiscarded.id);
                }}
              >
                Annulla
              </button>
            </span>
          ) : (
            hero && (
              <span className="ytw-actions">
                <button
                  type="button"
                  className="ytw-action"
                  onClick={(e) => {
                    stop(e);
                    void snoozeSuggested(hero.id).catch((error) => console.error("Rinvio non salvato:", error));
                  }}
                  title="Nascondi questo video dai consigli per qualche giorno"
                >
                  Non ora
                </button>
                <span className="ytw-actions-sep" aria-hidden="true">·</span>
                {suggestion && suggestion.pickNotes > 0 ? (
                  <span onClick={stop}>
                    <ConfirmButton
                      className="ytw-action ytw-action--danger"
                      label="Scarta"
                      confirmLabel={`Perdi ${suggestion.pickNotes === 1 ? "1 nota" : `${suggestion.pickNotes} note`}?`}
                      onConfirm={() => requestDiscard(hero)}
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    className="ytw-action ytw-action--danger"
                    onClick={(e) => {
                      stop(e);
                      requestDiscard(hero);
                    }}
                    title="Elimina il video dalla libreria (puoi annullare per qualche secondo)"
                  >
                    Scarta
                  </button>
                )}
              </span>
            )
          )}
        </div>
        <div className="ytw-col ytw-col--right">
          <div className="ytw-head">
            <h2 className="ytw-heading">YouTube</h2>
            {layout.showCount && <span className="ytw-count">{suggestion?.pendingCount ?? 0} in coda</span>}
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
