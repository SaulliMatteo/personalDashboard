import type { CSSProperties } from "react";
import { CLASS_LABEL, FOCUS_CLASSES, type FocusClass } from "../lib/focus";
import type { ClassSeconds, RankItem } from "../lib/summary";
import { formatShort, splitHours } from "../lib/format";

/** Pezzi di Tempo al PC usati dal widget e dalla pagina. Forma per tema solo nel CSS (ScreenTimeWidget.css). */

const pct = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 100) : 0);

/** Il pallino o il pezzo colorato di una classe. */
export function ClassDot({ cls }: { cls: FocusClass }) {
  return <i className={`st-seg is-${cls}`} aria-hidden="true" />;
}

/** "5h12" con l'unità piccola (oppure "47min"). */
export function BigTime({ seconds, className = "" }: { seconds: number; className?: string }) {
  const { hours, minutes } = splitHours(seconds);
  return (
    <span className={`stw-num ${className}`}>
      {hours > 0 ? (
        <>
          {hours}
          <span className="stw-unit">h</span>
          {String(minutes).padStart(2, "0")}
        </>
      ) : (
        <>
          {minutes}
          <span className="stw-unit">min</span>
        </>
      )}
    </span>
  );
}

/** Barra divisa tra le classi. */
export function ClassSplit({ byClass }: { byClass: ClassSeconds }) {
  const total = byClass.focus + byClass.fun + byClass.neutral;
  const label = FOCUS_CLASSES.map((c) => `${CLASS_LABEL[c]} ${pct(byClass[c], total)}%`).join(", ");
  return (
    <div className="stw-split" role="img" aria-label={total > 0 ? label : "Ancora nessun tempo"}>
      {FOCUS_CLASSES.map((c) =>
        byClass[c] > 0 ? <span key={c} className={`st-seg is-${c}`} style={{ "--v": byClass[c] } as CSSProperties} /> : null
      )}
    </div>
  );
}

export function ClassLegend({ byClass, withTime = false }: { byClass?: ClassSeconds; withTime?: boolean }) {
  return (
    <div className="stw-legend">
      {FOCUS_CLASSES.map((c) => (
        <span key={c}>
          <ClassDot cls={c} />
          {CLASS_LABEL[c]}
          {withTime && byClass && <b>{formatShort(byClass[c])}</b>}
        </span>
      ))}
    </div>
  );
}

/** Linea del giorno: 24 colonne, ognuna piena = 60 minuti, impilate per classe. */
export function DayChart({ hours, nowHour, height }: { hours: ClassSeconds[]; nowHour: number | null; height?: number }) {
  return (
    <div>
      <div className="st-day" style={height ? ({ "--h": `${height}px` } as CSSProperties) : undefined} role="img" aria-label="Tempo al PC ora per ora">
        {hours.map((h, i) => {
          const sum = h.focus + h.fun + h.neutral;
          return (
            <div key={i} className={`st-hour${i === nowHour ? " is-now" : ""}`} title={`ore ${i}: ${sum > 0 ? formatShort(sum) : "niente"}`}>
              {FOCUS_CLASSES.map((c) =>
                h[c] > 0 ? <span key={c} className={`st-seg is-${c}`} style={{ "--v": `${Math.min(100, (h[c] / 3600) * 100)}%` } as CSSProperties} /> : null
              )}
            </div>
          );
        })}
      </div>
      <div className="st-axis" aria-hidden="true">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

/** Le voci più usate: pallino della classe, nome, tempo. */
export function TopList({ items, max }: { items: RankItem[]; max: number }) {
  return (
    <div className="stw-top">
      {items.slice(0, max).map((item) => (
        <div key={item.key} className="stw-top-row">
          <ClassDot cls={item.cls} />
          <span>{item.label}</span>
          <span className="stw-mono">{formatShort(item.seconds)}</span>
        </div>
      ))}
    </div>
  );
}

/** Barra di un limite: colore d'avviso dall'80 %. */
export function LimitBar({ used, max }: { used: number; max: number }) {
  const near = max > 0 && used / max >= 0.8;
  return (
    <div className={`stw-bar${near ? " is-near" : ""}`}>
      <i style={{ width: `${Math.min(100, pct(used, max))}%` }} />
    </div>
  );
}
