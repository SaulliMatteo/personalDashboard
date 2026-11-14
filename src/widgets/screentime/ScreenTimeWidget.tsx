import { createElement, useState } from "react";
import { MdOutlineDesktopWindows, MdOutlinePauseCircle, MdOutlineSchedule } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { useSettings } from "../../core/settings/useSettings";
import { useElementSize } from "../../core/hooks/useElementSize";
import { useScreenTime } from "./useScreenTime";
import { SCREENTIME_RINGS } from "./card/cards";
import { BigTime, ClassLegend, ClassSplit, DayChart, LimitBar, TopList } from "./components/parts";
import { formatDelta, formatDuration, formatShort } from "./lib/format";
import "./ScreenTimeWidget.css";

type Size = "S" | "W" | "T" | "M";

/** Altezza di una riga dell'elenco "più usati" più lo spazio tra le righe (ScreenTimeWidget.css). */
const TOP_ROW_PX = 22;

function Head({ title = "Tempo al PC", sub }: { title?: string; sub?: string | null }) {
  return (
    <header className="stw-head">
      <h2 className="stw-title">{title}</h2>
      {sub && <span className="stw-sub">{sub}</span>}
    </header>
  );
}

/** Telefono, Linux, browser; oppure conteggio spento. */
function MessageCell({ size, icon, text }: { size: Size; icon: "pc" | "off"; text: string }) {
  return (
    <WidgetFrame>
      <article className={`widget stw stw--${size}`} aria-label="Tempo al PC">
        <Head />
        <div className="stw-na">
          {icon === "pc" ? <MdOutlineDesktopWindows size={26} aria-hidden="true" /> : <MdOutlinePauseCircle size={26} aria-hidden="true" />}
          <p>{text}</p>
        </div>
      </article>
    </WidgetFrame>
  );
}

/**
 * Tempo al PC in dashboard (docs/mockup/temi/tempo-pc.html): Piccola 1×1 anello delle classi col totale, Larga 2×1
 * totale + barra + più usati, Alta 1×2 totale + elenco, Media 2×2 linea del giorno, più usati, limiti e pausa.
 */
function ScreenTimeWidget({ w, h }: WidgetProps) {
  const ctx = useScreenTime();
  const key = sizeKey(w, h);
  const size: Size = key === "S" || key === "W" || key === "T" ? key : "M";
  if (!ctx.available) return <MessageCell size={size} icon="pc" text="Conta le app di questo computer: c'è solo nell'app per Windows e macOS." />;
  if (!ctx.enabled) return <MessageCell size={size} icon="off" text="Conteggio spento. Si riaccende nelle impostazioni del widget." />;
  return <LiveWidget size={size} />;
}

function LiveWidget({ size }: { size: Size }) {
  const { today, yesterdaySoFar, limits, continuousMinutes, loading } = useScreenTime();
  const { settings } = useSettings();
  const Ring = useThemeVariant(SCREENTIME_RINGS);
  const [list, setList] = useState<HTMLElement | null>(null);
  const listBox = useElementSize(list);
  const rowsThatFit = Math.max(1, Math.floor((listBox.height + 6) / TOP_ROW_PX));

  const delta = loading || today.total === 0 && yesterdaySoFar === 0 ? null : formatDelta(today.total - yesterdaySoFar, "ieri");
  const empty = !loading && today.total === 0;
  const focusPct = today.total > 0 ? Math.round((today.byClass.focus / today.total) * 100) : 0;
  const goal = settings.screentimeFocusGoalMinutes * 60;

  if (size === "S") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--S" aria-label="Tempo al PC">
          <Head title="Oggi al PC" />
          <div className="stw-hero">
            {createElement(
              Ring,
              { byClass: today.byClass, label: `Oggi ${formatDuration(today.total)} al PC, ${focusPct} per cento di focus` },
              <BigTime seconds={today.total} />,
              <small>{today.total > 0 ? `${focusPct}% focus` : "si comincia"}</small>
            )}
          </div>
        </article>
      </WidgetFrame>
    );
  }

  if (empty) {
    return (
      <WidgetFrame>
        <article className={`widget stw stw--${size}`} aria-label="Tempo al PC">
          <Head sub="oggi" />
          <div className="stw-na">
            <p>Si comincia a contare da adesso. Lascia la dashboard aperta o vicino all'orologio: qui vedrai quanto tempo passi al PC e su cosa.</p>
          </div>
        </article>
      </WidgetFrame>
    );
  }

  if (size === "W") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--W" aria-label="Tempo al PC">
          <Head sub={delta} />
          <div className="stw-body">
            <div className="stw-total">
              <BigTime seconds={today.total} />
              <ClassSplit byClass={today.byClass} />
              <ClassLegend />
            </div>
            <div className="stw-top-box" ref={setList}>
              <TopList items={today.top} max={Math.min(4, rowsThatFit)} />
            </div>
          </div>
        </article>
      </WidgetFrame>
    );
  }

  if (size === "T") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--T" aria-label="Tempo al PC">
          <Head sub="oggi" />
          <div className="stw-total">
            <BigTime seconds={today.total} />
            {delta && <span className="stw-label">{delta}</span>}
            <ClassSplit byClass={today.byClass} />
            <ClassLegend />
          </div>
          <div className="stw-sep" />
          <div className="stw-top-box" ref={setList}>
            <TopList items={today.top} max={rowsThatFit} />
          </div>
        </article>
      </WidgetFrame>
    );
  }

  const nowHour = new Date().getHours();
  const shownLimits = limits.slice(0, 2);
  return (
    <WidgetFrame>
      <article className="widget stw stw--M" aria-label="Tempo al PC">
        <Head sub={delta} />
        <div className="stw-total-row">
          <BigTime seconds={today.total} />
          <div className="stw-focus">
            <span className="stw-num">
              {focusPct}
              <span className="stw-unit">%</span>
            </span>
            <span className="stw-label">
              focus · {formatShort(today.byClass.focus)}
              {goal > 0 ? ` di ${formatShort(goal)}` : ""}
            </span>
          </div>
        </div>
        <div className="stw-day-box">
          <DayChart hours={today.hours} nowHour={nowHour} />
        </div>
        <div className="stw-cols">
          <div className="stw-col">
            <h3>Più usati</h3>
            <div className="stw-top-box" ref={setList}>
              <TopList items={today.top} max={rowsThatFit} />
            </div>
          </div>
          <div className="stw-col">
            <h3>{shownLimits.length > 0 ? "Limiti" : "Classi"}</h3>
            {shownLimits.length > 0 ? (
              shownLimits.map(({ limit, usedSeconds }) => (
                <div key={limit.id} className="stw-limit">
                  <div className="stw-limit-top">
                    <span>{limit.label}</span>
                    <span className="stw-mono">
                      {Math.floor(usedSeconds / 60)}/{limit.minutes} min
                    </span>
                  </div>
                  <LimitBar used={usedSeconds} max={limit.minutes * 60} />
                </div>
              ))
            ) : (
              <>
                <ClassSplit byClass={today.byClass} />
                <ClassLegend byClass={today.byClass} withTime />
              </>
            )}
            {continuousMinutes > 0 && (
              <div className="stw-pause">
                <MdOutlineSchedule size={13} aria-hidden="true" />
                al PC da {formatDuration(continuousMinutes * 60)}
              </div>
            )}
          </div>
        </div>
      </article>
    </WidgetFrame>
  );
}

export default ScreenTimeWidget;
