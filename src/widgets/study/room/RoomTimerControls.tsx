import { useState } from "react";
import { PauseIcon, PlayIcon, SkipIcon, StopIcon } from "../../../ui/icons";
import { useTimerView } from "../timer/useTimerView";
import "./RoomTimerControls.css";

/**
 * Il timer dello Studio nell'intestazione della Stanza comune, per non dover uscire dalla stanza: da fermo si sceglie
 * la materia (proposta l'ultima usata) e si parte; avviato, pausa/riprendi e stop (in pausa pomodoro "Salta pausa").
 * Il tempo non c'è: si vede già sul proprio posto nella sala.
 * Sedersi e alzarsi viene da solo: la presenza dei Gruppi legge il timer dal bus.
 */
function RoomTimerControls() {
  const { ready, subjectId, subjects, isIdle, isBreak, isRunning, startWork, pause, resume, stopOrSkip } = useTimerView();
  // l'ultima materia usata, da proporre dopo lo stop (da fermo il timer non ne ha una)
  const [lastSubject, setLastSubject] = useState<number | null>(subjectId);
  const [picked, setPicked] = useState<number | null>(null);
  if (subjectId !== null && subjectId !== lastSubject) setLastSubject(subjectId);

  if (!ready) return null;

  if (isIdle) {
    if (subjects.length === 0) return <span className="rtc-empty">Aggiungi una materia nel widget Studio</span>;
    const valid = (id: number | null) => (id !== null && subjects.some((s) => s.id === id) ? id : null);
    const chosen = valid(picked) ?? valid(lastSubject) ?? subjects[0].id;
    return (
      <div className="rtc" role="group" aria-label="Timer di studio">
        <select className="rtc-select" aria-label="Materia" value={chosen} onChange={(e) => setPicked(Number(e.target.value))}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className="rtc-btn rtc-btn--start" onClick={() => void startWork(chosen)}>
          <PlayIcon size={16} />
          Studia
        </button>
      </div>
    );
  }

  return (
    <div className="rtc" role="group" aria-label="Timer di studio">
      {isRunning ? (
        <button type="button" className="rtc-btn" onClick={pause}>
          <PauseIcon size={16} />
          Pausa
        </button>
      ) : (
        <button type="button" className="rtc-btn" onClick={resume}>
          <PlayIcon size={16} />
          Riprendi
        </button>
      )}
      <button type="button" className="rtc-btn" onClick={() => void stopOrSkip()}>
        {isBreak ? <SkipIcon size={16} /> : <StopIcon size={16} />}
        {isBreak ? "Salta pausa" : "Stop"}
      </button>
    </div>
  );
}

export default RoomTimerControls;
