import type { MouseEvent } from "react";
import { PauseIcon, PlayIcon, SkipIcon, StopIcon } from "../../../ui/icons";
import type { StudyCardData } from "./useStudyCard";

interface StudyControlsProps {
  data: StudyCardData;
  className: string;
  /** Lato delle icone (pulsante principale, secondario) e raggio degli angoli: cambiano col tema. */
  iconSize: [number, number];
  round?: [number, number];
}

/** I due pulsanti del timer: play/pausa e ferma/salta la pausa. Lo stile lo dà la card del tema. */
function StudyControls({ data, className, iconSize, round = [1, 2] }: StudyControlsProps) {
  const { isIdle, isRunning, isBreak, canStart, primaryLabel, secondaryLabel, primaryAction, secondaryAction } = data;

  function onPrimary(e: MouseEvent) {
    e.stopPropagation();
    primaryAction();
  }

  function onSecondary(e: MouseEvent) {
    e.stopPropagation();
    secondaryAction();
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="study-btn study-btn--primary"
        onClick={onPrimary}
        disabled={isIdle && !canStart}
        aria-label={primaryLabel}
        title={primaryLabel}
      >
        {isRunning ? <PauseIcon size={iconSize[0]} round={round[0]} /> : <PlayIcon size={iconSize[0]} />}
      </button>
      <button
        type="button"
        className="study-btn study-btn--secondary"
        onClick={onSecondary}
        disabled={isIdle}
        aria-label={secondaryLabel}
        title={secondaryLabel}
      >
        {isBreak ? <SkipIcon size={iconSize[1]} round={round[0]} /> : <StopIcon size={iconSize[1]} round={round[1]} />}
      </button>
    </div>
  );
}

export default StudyControls;
