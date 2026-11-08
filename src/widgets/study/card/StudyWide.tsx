import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { PauseIcon, PlayIcon } from "../../../ui/icons";
import type { StudyCardData } from "./useStudyCard";

interface StudyWideProps {
  data: StudyCardData;
  /** Prefisso delle classi del tema (sn, so, sq, sf): la forma la dà il CSS della card. */
  prefix: string;
  /** La riga dell'avanzamento, se il tema la disegna a modo suo (Quaderno: tratto di penna). */
  line?: ReactNode;
  /** Lato dell'icona del pulsante. */
  iconSize?: number;
}

/**
 * Taglia 2×1 (solo sulla dashboard del telefono, docs/design/mobile/novita.html): tempo, fase e materia a sinistra,
 * un solo pulsante avvia/pausa a destra. Uguale nei 4 temi, cambia solo il CSS. I dati sono quelli di useStudyCard,
 * senza interfaccia: un widget della Home di Android potrà mostrare gli stessi.
 */
function StudyWide({ data, prefix, line, iconSize = 20 }: StudyWideProps) {
  function onPrimary(e: MouseEvent) {
    e.stopPropagation();
    data.primaryAction();
  }

  return (
    <div className={`${prefix}-wide`} style={{ "--chars": data.clockText.length } as CSSProperties}>
      <div className={`${prefix}-wide-info`}>
        <span className={`${prefix}-wide-time`}>{data.clockText}</span>
        <span className={`${prefix}-wide-what`}>
          {data.phaseLabel}
          {data.currentSubject && (
            <>
              {" · "}
              <b>{data.currentSubject.name}</b>
            </>
          )}
        </span>
        {line ?? (
          <span className={`${prefix}-wide-line`} aria-hidden="true">
            <span style={{ width: `${data.progress * 100}%` }} />
          </span>
        )}
      </div>
      <button
        type="button"
        className={`study-btn study-btn--primary ${prefix}-wide-btn${data.isRunning ? " is-running" : ""}`}
        onClick={onPrimary}
        disabled={data.isIdle && !data.canStart}
        aria-label={data.primaryLabel}
        title={data.primaryLabel}
      >
        {data.isRunning ? <PauseIcon size={iconSize} /> : <PlayIcon size={iconSize} />}
      </button>
    </div>
  );
}

export default StudyWide;
