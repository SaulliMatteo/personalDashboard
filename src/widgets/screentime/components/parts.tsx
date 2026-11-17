import type { CSSProperties } from "react";
import { MdOutlineDesktopWindows, MdOutlineSmartphone } from "react-icons/md";
import { DEVICE_FILTERS, DEVICE_KINDS, DEVICE_LABEL, FILTER_LABEL, type DeviceFilter, type DeviceKind } from "../lib/devices";
import { CLASS_LABEL, FOCUS_CLASSES, type FocusClass } from "../lib/focus";
import type { ClassSeconds, RankItem } from "../lib/summary";
import { formatShort, splitHours } from "../lib/format";
import { dayMoments, mixWords, MOMENT_HOURS, MOMENT_NAMES } from "../lib/widgetText";

/** Pezzi di Tempo allo schermo usati dal widget e dalla pagina. Forma per tema solo nel CSS (ScreenTimeWidget.css). */

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
      <div className="st-day" style={height ? ({ "--h": `${height}px` } as CSSProperties) : undefined} role="img" aria-label="Tempo allo schermo ora per ora">
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

/** Icona di un dispositivo (docs/mockup/temi/tempo-pc-telefono.html). */
export function DeviceIcon({ device, size = 12 }: { device: DeviceKind; size?: number }) {
  const Icon = device === "phone" ? MdOutlineSmartphone : MdOutlineDesktopWindows;
  return <Icon size={size} aria-hidden="true" />;
}

/** Segno accanto al nome di un'app: da quali dispositivi viene il suo tempo. */
export function DeviceMark({ byDevice }: { byDevice: Record<DeviceKind, number> }) {
  const kinds = DEVICE_KINDS.filter((d) => byDevice[d] > 0);
  if (kinds.length === 0) return null;
  return (
    <span className="st-dev" role="img" aria-label={kinds.map((d) => DEVICE_LABEL[d].toLowerCase()).join(" e ")}>
      {kinds.map((d) => (
        <DeviceIcon key={d} device={d} />
      ))}
    </span>
  );
}

/**
 * Le app più usate come barre lunghe quanto il loro tempo (la più usata è piena); il tempo scritto solo sulla prima
 * (docs/mockup/widget/tempo-allo-schermo.html). Con `marks` il segno del dispositivo accanto al nome.
 */
export function AppBars({ items, max, marks = false }: { items: RankItem[]; max: number; marks?: boolean }) {
  const shown = items.slice(0, max);
  const top = shown[0]?.seconds ?? 0;
  return (
    <div className="stw-apps">
      {shown.map((item, i) => (
        <div key={item.key} className="stw-app">
          <div className="stw-app-top">
            <span>
              {item.label}
              {marks && <DeviceMark byDevice={item.byDevice} />}
            </span>
            {i === 0 && <span className="stw-app-time">{formatShort(item.seconds)}</span>}
          </div>
          <div className="stw-nbar" role="img" aria-label={`${item.label}: ${formatShort(item.seconds)}`}>
            <span className={`st-seg is-${item.cls}`} style={{ "--v": `${pct(item.seconds, top)}%` } as CSSProperties} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** La giornata in 6 momenti di 4 ore (ogni colonna piena = 4 ore), quello di adesso si chiama "adesso". */
export function DayMoments({ hours, nowHour }: { hours: ClassSeconds[]; nowHour: number }) {
  const moments = dayMoments(hours);
  const now = Math.floor(nowHour / MOMENT_HOURS);
  const full = MOMENT_HOURS * 3600;
  return (
    <div className="stw-moments-box">
      <div className="stw-moments" role="img" aria-label="La giornata in sei momenti">
        {moments.map((m, i) => (
          <div key={i} className={`stw-moment${i === now ? " is-now" : ""}`} title={`${MOMENT_NAMES[i]}: ${formatShort(m.focus + m.fun + m.neutral)}`}>
            {FOCUS_CLASSES.map((c) =>
              m[c] > 0 ? <span key={c} className={`st-seg is-${c}`} style={{ "--v": `${Math.min(100, (m[c] / full) * 100)}%` } as CSSProperties} /> : null
            )}
          </div>
        ))}
      </div>
      <div className="stw-moments-lab" aria-hidden="true">
        {MOMENT_NAMES.map((name, i) => (
          <span key={name} className={i === now ? "is-now" : undefined}>
            {i === now ? "adesso" : name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "metà focus, quasi niente svago, il resto neutro", nei colori delle classi: al posto della legenda. */
export function DayInWords({ byClass }: { byClass: ClassSeconds }) {
  const words = mixWords(byClass);
  return (
    <p className="stw-mix">
      <b className="is-focus">{words.focus}</b>, <b className="is-fun">{words.fun}</b>, il resto neutro
    </p>
  );
}

/** Filtro "Tutti / Computer / Telefono" (`wide`: tre colonne uguali, come sul telefono). */
export function DeviceFilterTabs({ value, onChange, wide = false }: { value: DeviceFilter; onChange: (f: DeviceFilter) => void; wide?: boolean }) {
  return (
    <div className={`stp-tabs is-dev${wide ? " is-wide" : ""}`} role="group" aria-label="Dispositivi">
      {DEVICE_FILTERS.map((f) => (
        <button key={f} type="button" aria-pressed={value === f} onClick={() => onChange(f)}>
          {f !== "all" && <DeviceIcon device={f} size={14} />}
          {FILTER_LABEL[f]}
        </button>
      ))}
    </div>
  );
}

/** Tempo di oggi per dispositivo, con la barra (colonna "Dispositivi"); `here` = questo dispositivo, `kinds` = quali. */
export function DeviceBars({ byDevice, here, kinds = DEVICE_KINDS }: { byDevice: Record<DeviceKind, number>; here: DeviceKind; kinds?: readonly DeviceKind[] }) {
  const max = Math.max(1, ...kinds.map((d) => byDevice[d]));
  return (
    <>
      {kinds.map((d) => (
        <div key={d} className={`stw-dev${d === here ? " is-here" : ""}`}>
          <div className="stw-dev-top">
            <span>
              <DeviceIcon device={d} size={13} />
              {DEVICE_LABEL[d]}
            </span>
            <span className="stw-mono">{byDevice[d] > 0 ? formatShort(byDevice[d]) : "—"}</span>
          </div>
          <div className="stw-bar">
            <i style={{ width: `${pct(byDevice[d], max)}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}

/** Barra di un limite (pagina): colore d'avviso dall'80 % (`quiet`: mai, es. l'obiettivo di focus). */
export function LimitBar({ used, max, quiet = false }: { used: number; max: number; quiet?: boolean }) {
  const near = !quiet && max > 0 && used / max >= 0.8;
  return (
    <div className={`stw-bar${near ? " is-near" : ""}`}>
      <i style={{ width: `${Math.min(100, pct(used, max))}%` }} />
    </div>
  );
}
