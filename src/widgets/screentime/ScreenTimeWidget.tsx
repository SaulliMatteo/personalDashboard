import { createElement, useState, type ReactNode } from "react";
import { MdOutlineDesktopWindows, MdOutlinePauseCircle, MdOutlineSchedule } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { useSettings } from "../../core/settings/useSettings";
import { useElementSize } from "../../core/hooks/useElementSize";
import { useScreenTime } from "./useScreenTime";
import { SCREENTIME_RINGS } from "./card/cards";
import { BigTime, ClassLegend, ClassSplit, DayChart, DeviceBars, DeviceIcon, LimitBar, TopList } from "./components/parts";
import { formatDelta, formatDuration, formatShort } from "./lib/format";
import { othersFreshText } from "./lib/devices";
import "./ScreenTimeWidget.css";

type Size = "S" | "W" | "T" | "M";

/** Altezza di una riga dell'elenco "più usati" più lo spazio tra le righe (ScreenTimeWidget.css). */
const TOP_ROW_PX = 22;

const NAME = "Tempo allo schermo";

function Head({ title = NAME, sub }: { title?: string; sub?: ReactNode }) {
  return (
    <header className="stw-head">
      <h2 className="stw-title">{title}</h2>
      {sub && <span className="stw-sub">{sub}</span>}
    </header>
  );
}

/** Browser; oppure conteggio spento. */
function MessageCell({ size, icon, text }: { size: Size; icon: "pc" | "off"; text: string }) {
  return (
    <WidgetFrame>
      <article className={`widget stw stw--${size}`} aria-label={NAME}>
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
 * Tempo allo schermo in dashboard (docs/mockup/temi/tempo-pc.html e tempo-pc-telefono.html): Piccola 1×1 anello
 * delle classi col totale, Larga 2×1 totale + barra + più usati, Alta 1×2 totale + elenco, Media 2×2 linea del giorno,
 * più usati, limiti e pausa (o i dispositivi dove non si conta). Somma i dispositivi del filtro della pagina.
 */
function ScreenTimeWidget({ w, h }: WidgetProps) {
  const ctx = useScreenTime();
  const key = sizeKey(w, h);
  const size: Size = key === "S" || key === "W" || key === "T" ? key : "M";
  if (!ctx.viewable) return <MessageCell size={size} icon="pc" text="Tempo allo schermo c'è solo nell'app, sul computer e sul telefono." />;
  if (ctx.canRecord && !ctx.enabled) return <MessageCell size={size} icon="off" text="Conteggio spento. Si riaccende nelle impostazioni del widget." />;
  return <LiveWidget size={size} />;
}

function LiveWidget({ size }: { size: Size }) {
  const { today, yesterdaySoFar, limits, continuousMinutes, loading, canRecord, filter, device, todayByDevice, othersUpdatedAt } = useScreenTime();
  const { settings } = useSettings();
  const Ring = useThemeVariant(SCREENTIME_RINGS);
  const [list, setList] = useState<HTMLElement | null>(null);
  const listBox = useElementSize(list);
  const rowsThatFit = Math.max(1, Math.floor((listBox.height + 6) / TOP_ROW_PX));

  const delta = loading || today.total === 0 && yesterdaySoFar === 0 ? null : formatDelta(today.total - yesterdaySoFar, "ieri");
  const empty = !loading && today.total === 0;
  const focusPct = today.total > 0 ? Math.round((today.byClass.focus / today.total) * 100) : 0;
  const goal = settings.screentimeFocusGoalMinutes * 60;
  // Con "Tutti" e del tempo su più dispositivi: segno del dispositivo accanto alle app.
  const marks = filter === "all" && today.byDevice.computer > 0 && today.byDevice.phone > 0;
  const filterIcon = filter === "all" ? null : <DeviceIcon device={filter} />;

  if (size === "S") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--S" aria-label={NAME}>
          <Head title="Oggi" sub={filterIcon} />
          <div className="stw-hero">
            {createElement(
              Ring,
              { byClass: today.byClass, label: `Oggi ${formatDuration(today.total)} allo schermo, ${focusPct} per cento di focus` },
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
        <article className={`widget stw stw--${size}`} aria-label={NAME}>
          <Head sub="oggi" />
          <div className="stw-na">
            <p>
              {canRecord
                ? "Si comincia a contare da adesso. Lascia la dashboard aperta o vicino all'orologio: qui vedrai quanto tempo passi al PC e su cosa."
                : settings.syncEnabled
                  ? "Ancora niente oggi. Qui arrivano col sync i minuti contati sul computer."
                  : "Qui si vedono i minuti contati sul computer: accendi il sync in Account per farli arrivare."}
            </p>
          </div>
        </article>
      </WidgetFrame>
    );
  }

  if (size === "W") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--W" aria-label={NAME}>
          <Head sub={delta} />
          <div className="stw-body">
            <div className="stw-total">
              <BigTime seconds={today.total} />
              <ClassSplit byClass={today.byClass} />
              <ClassLegend />
            </div>
            <div className="stw-top-box" ref={setList}>
              <TopList items={today.apps} max={Math.min(4, rowsThatFit)} marks={marks} />
            </div>
          </div>
        </article>
      </WidgetFrame>
    );
  }

  if (size === "T") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--T" aria-label={NAME}>
          <Head sub="oggi" />
          <div className="stw-total">
            <BigTime seconds={today.total} />
            {marks ? (
              <span className="stw-label">
                PC {formatShort(today.byDevice.computer)} · telefono {formatShort(today.byDevice.phone)}
              </span>
            ) : (
              delta && <span className="stw-label">{delta}</span>
            )}
            <ClassSplit byClass={today.byClass} />
            <ClassLegend />
          </div>
          <div className="stw-sep" />
          <div className="stw-top-box" ref={setList}>
            <TopList items={today.apps} max={rowsThatFit} marks={marks} />
          </div>
        </article>
      </WidgetFrame>
    );
  }

  const nowHour = new Date().getHours();
  const shownLimits = canRecord ? limits.slice(0, 2) : [];
  const fresh = othersFreshText(device, othersUpdatedAt);
  // Colonna di destra: i limiti di qui; senza limiti, i dispositivi (se ce n'è più di uno) o le classi.
  const right = shownLimits.length > 0 ? "limits" : !canRecord || (todayByDevice.computer > 0 && todayByDevice.phone > 0) ? "devices" : "classes";
  return (
    <WidgetFrame>
      <article className="widget stw stw--M" aria-label={NAME}>
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
              <TopList items={today.apps} max={rowsThatFit} marks={marks} />
            </div>
          </div>
          <div className="stw-col">
            <h3>{right === "limits" ? (fresh ? "Limiti del computer" : "Limiti") : right === "devices" ? "Dispositivi" : "Classi"}</h3>
            {right === "devices" ? (
              <DeviceBars byDevice={todayByDevice} here={device} />
            ) : right === "limits" ? (
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
            {fresh && <div className="stw-fresh">{fresh}</div>}
          </div>
        </div>
      </article>
    </WidgetFrame>
  );
}

export default ScreenTimeWidget;
