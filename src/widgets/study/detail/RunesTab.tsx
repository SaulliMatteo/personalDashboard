import { useId } from "react";
import { useSettings } from "../../../core/settings/useSettings";
import {
  CORE_COUNT,
  CORES_FOR_LEVEL,
  FRAGMENTS_PER_CORE,
  GRADE_THRESHOLDS,
  MAX_LEVEL,
  TRIAL_DAYS,
  TRIAL_HITS,
  fragmentsForCores,
  fragmentsToNext,
  nextStepText,
  roman,
  type Progression,
  type Trait,
} from "../lib/progression";
import { useProgression } from "../progression/useProgression";
import "../../../ui/runes.css";
import "./runesTab.css";

const TRAIT_TEXT: Record<Trait, string> = {
  Costante: "almeno 7 giorni di fila sull'obiettivo",
  Nottambulo: "almeno un terzo dello studio tra le 22 e le 4",
  Mattiniero: "almeno un terzo dello studio tra le 4 e le 8",
};

/** Cosa serve per ogni livello, in parole. */
function requirement(level: number): string {
  if (level === 1) return "all'inizio";
  if (level === 2) return "1° nucleo pieno";
  return `${CORES_FOR_LEVEL[level]} nuclei e la Prova`;
}

/** Un nucleo: anello che si riempie, disco acceso quando è pieno (Temi Vetro e Ombra.html, `coreSvg`). */
function Core({ fill }: { fill: number }) {
  const id = `rc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = 30;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fill));
  return (
    <svg className="study-runes-core" viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <circle className="study-runes-core-track" cx="40" cy="40" r={r} />
      {f > 0 && <circle className="study-runes-core-ink" cx="40" cy="40" r={r} strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 40 40)" />}
      {f >= 1 ? (
        <>
          <circle className="study-runes-core-glow" cx="40" cy="40" r="22" filter={`url(#${id})`} />
          <circle className="study-runes-core-disc" cx="40" cy="40" r="20" />
        </>
      ) : (
        <circle className="study-runes-core-empty" cx="40" cy="40" r="20" />
      )}
    </svg>
  );
}

/** Riempimento del nucleo n (1-based). */
function coreFill(p: Progression, n: number): number {
  if (n <= p.fullCores) return 1;
  if (n === p.fullCores + 1 && p.coreCap > 0) return p.coreFill / p.coreCap;
  return 0;
}

function TrialPanel({ p }: { p: Progression }) {
  if (!p.next) {
    return (
      <div className="study-runes-panel">
        <h3 className="study-runes-title">Livello {roman(MAX_LEVEL)}</h3>
        <p className="study-runes-sub">Hai raggiunto il livello più alto. I frammenti continuano a contare.</p>
      </div>
    );
  }
  const next = roman(p.next.level);
  const trial = p.trial;
  let status = "Chiusa";
  let text: string;
  if (!p.next.trial) {
    text = `Il livello ${next} arriva col 1° nucleo pieno: mancano ${fragmentsToNext(p)} frammenti.`;
    status = "Senza Prova";
  } else if (trial?.status === "running") {
    status = "In corso";
    text = `Raggiungi l'obiettivo giornaliero ${TRIAL_HITS} giorni su ${TRIAL_DAYS}. Riusciti ${trial.hits}, mancati ${trial.misses}.`;
  } else if (trial?.status === "opens") {
    status = "Domani";
    text = "I nuclei sono pieni: la Prova si apre domani.";
  } else if (trial?.status === "needsGoal") {
    status = "Ferma";
    text = "Per la Prova serve un obiettivo giornaliero: impostalo nelle materie o nelle impostazioni dello Studio.";
  } else {
    text = `Si apre quando ${p.next.cores === 1 ? "il 1° nucleo è pieno" : `${p.next.cores} nuclei sono pieni`}: mancano ${fragmentsToNext(p)} frammenti.`;
  }
  return (
    <div className="study-runes-panel study-runes-trial">
      <Core fill={coreFill(p, p.fullCores + 1)} />
      <div>
        <h3 className="study-runes-title">{p.next.trial ? `Prova del livello ${next}` : `Livello ${next}`}</h3>
        <p className="study-runes-sub">
          {text}
          {p.next.trial && (
            <>
              <br />
              Se fallisci ne riparte una il giorno dopo: i frammenti non si perdono.
              {trial && trial.failures > 0 && ` Prove non riuscite finora: ${trial.failures}.`}
            </>
          )}
        </p>
        {trial?.status === "running" && (
          <div className="study-runes-days" aria-label={`Giorni della Prova: ${trial.hits} riusciti, ${trial.misses} mancati`}>
            {trial.days.map((d, i) => (
              <span key={i} className={`study-runes-day is-${d}`} />
            ))}
          </div>
        )}
      </div>
      <span className="study-runes-chip">{status}</span>
    </div>
  );
}

/** Scheda Rune (solo in Ombra): la progressione dello Studio nello stile `Nome: [valore]` del mockup. */
function RunesTab() {
  const p = useProgression();
  const { settings } = useSettings();
  if (!p) return <p className="study-detail-loading">Caricamento…</p>;
  const name = settings.userName.trim() || "Tu";
  return (
    <section className="study-runes">
      <div className="study-runes-row study-runes-row--top">
        <div className="study-runes-panel">
          <h3 className="study-runes-title">Le tue rune</h3>
          <dl className="runes study-runes-list">
            <dt>Nome:</dt>
            <dd>{name}</dd>
            <dt>Livello:</dt>
            <dd>{roman(p.level)}</dd>
            <dt>Serie:</dt>
            <dd>{p.grade > 0 ? `${roman(p.grade)} · ${p.streak} ${p.streak === 1 ? "giorno" : "giorni"}` : "nessuna"}</dd>
            <dt>Nuclei:</dt>
            <dd>
              {p.fullCores}/{CORE_COUNT}
            </dd>
            <dt>Frammenti:</dt>
            <dd>{p.coreCap > 0 ? `${p.coreFill}/${p.coreCap}` : p.fragments}</dd>
            <dt>Tratti:</dt>
            <dd className="plain">
              {p.traits.length === 0
                ? "nessuno, per ora"
                : p.traits.map((t) => (
                    <span key={t} className="study-runes-trait">
                      <span className="br">[</span>
                      {t}
                      <span className="br">]</span>
                    </span>
                  ))}
            </dd>
          </dl>
          <hr className="study-runes-rule" />
          <p className="study-runes-sub">
            {(Object.keys(TRAIT_TEXT) as Trait[]).map((t) => (
              <span key={t} className="study-runes-line">
                {t}: {TRAIT_TEXT[t]}.
              </span>
            ))}
            <span className="study-runes-line">Contano gli ultimi 30 giorni.</span>
          </p>
        </div>

        <div className="study-runes-panel">
          <div className="study-runes-head">
            <h3 className="study-runes-title">Nuclei</h3>
            <span className="study-runes-sub">1 minuto di studio = 1 frammento · {p.fragments} in tutto</span>
          </div>
          <div className="study-runes-cores">
            {Array.from({ length: CORE_COUNT }, (_, i) => (
              <div key={i} className="study-runes-core-cell">
                <Core fill={coreFill(p, i + 1)} />
                <span>{i + 1}°</span>
                <span>{(i + 1) * FRAGMENTS_PER_CORE}</span>
              </div>
            ))}
          </div>
          <p className="study-runes-sub">
            Il nucleo n contiene n × {FRAGMENTS_PER_CORE} frammenti; quelli in più passano al nucleo dopo. Tutti e 7 pieni:{" "}
            {fragmentsForCores(CORE_COUNT)} frammenti.
          </p>
        </div>
      </div>

      <div className="study-runes-panel">
        <div className="study-runes-head">
          <h3 className="study-runes-title">Livelli</h3>
          <span className="study-runes-sub">{nextStepText(p)}</span>
        </div>
        <div className="study-runes-ladder">
          {Array.from({ length: MAX_LEVEL }, (_, i) => {
            const level = i + 1;
            const cls = level < p.level ? " is-done" : level === p.level ? " is-on" : "";
            return (
              <div key={level} className={`study-runes-step${cls}`}>
                <b>{roman(level)}</b>
                <span>{requirement(level)}</span>
              </div>
            );
          })}
        </div>
        <p className="study-runes-sub">Il livello non scende mai.</p>
      </div>

      <div className="study-runes-row">
        <TrialPanel p={p} />
        <div className="study-runes-panel">
          <div className="study-runes-head">
            <h3 className="study-runes-title">Serie</h3>
            <span className="study-runes-sub">giorni di fila sull'obiettivo</span>
          </div>
          <div className="study-runes-grades">
            {GRADE_THRESHOLDS.map((days, i) => (
              <span key={days} className={`study-runes-chip${i + 1 === p.grade ? " is-on" : ""}`}>
                {roman(i + 1)} · {days}g
              </span>
            ))}
          </div>
          <p className="study-runes-sub">
            Serie: {p.streak} {p.streak === 1 ? "giorno" : "giorni"}.
            {p.nextGradeIn !== null && ` Altri ${p.nextGradeIn} per il grado ${roman(p.grade + 1)}.`} Saltare un giorno azzera la
            Serie, mai il livello; oggi conta finché non finisce.
          </p>
        </div>
      </div>
    </section>
  );
}

export default RunesTab;
