import { createElement, useState, type MouseEvent, type ReactNode } from "react";
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
import type { DeviceKind } from "./lib/devices";
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

/** Browser; conteggio spento; telefono senza permesso (con il pulsante, tranne nella 1×1: lì si tocca la card). */
function MessageCell({ size, icon, text, onGrant }: { size: Size; icon: "pc" | "off" | "phone"; text: string; onGrant?: () => void }) {
  const grant = (e: MouseEvent) => {
    e.stopPropagation();
    onGrant?.();
  };
  return (
    <WidgetFrame>
      <article className={`widget stw stw--${size}`} aria-label={NAME}>
        <Head />
        <div className="stw-na">
          {icon === "pc" ? (
            <MdOutlineDesktopWindows size={26} aria-hidden="true" />
          ) : icon === "phone" ? (
            <DeviceIcon device="phone" size={26} />
          ) : (
            <MdOutlinePauseCircle size={26} aria-hidden="true" />
          )}
          <p>{text}</p>
          {onGrant && (
            <button type="button" className="stw-grant" onClick={grant}>
              Concedi l'accesso
            </button>
          )}
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
  if (ctx.switchedOff) {
    const text = ctx.device === "phone" ? "Conteggio spento su questo telefono." : "Conteggio spento. Si riaccende nelle impostazioni del widget.";
    return <MessageCell size={size} icon="off" text={text} />;
  }
  // Senza permesso la Media mostra lo stesso il computer arrivato col sync, con l'invito in fondo.
  if (ctx.needsAccess && !(size === "M" && ctx.today.total > 0)) {
    return size === "S" ? (
      <MessageCell size={size} icon="phone" text="Il telefono non conta ancora. Tocca per dare il permesso." />
    ) : (
      <MessageCell size={size} icon="phone" text={'Per contare anche le app del telefono serve il permesso "Accesso ai dati di utilizzo".'} onGrant={ctx.grantAccess} />
    );
  }
  return <LiveWidget size={size} />;
}

function LiveWidget({ size }: { size: Size }) {
  const { today, yesterdaySoFar, limits, continuousMinutes, loading, canRecord, hasLimits, needsAccess, grantAccess, filter, device, todayByDevice, othersUpdatedAt } =
    useScreenTime();
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
              {canRecord && device === "phone"
                ? "Si comincia a contare: il telefono legge la cronologia di Android ogni volta che apri la dashboard."
                : canRecord
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
  const shownLimits = hasLimits ? limits.slice(0, 2) : [];
  const fresh = othersFreshText(device, othersUpdatedAt);
  // Colonna di destra: i limiti di qui; senza limiti, i dispositivi (se ce n'è più di uno, o dove non ci sono
  // limiti) o le classi. Telefono senza permesso: solo il computer, con l'invito in fondo.
  const right = shownLimits.length > 0 ? "limits" : !hasLimits || (todayByDevice.computer > 0 && todayByDevice.phone > 0) ? "devices" : "classes";
  const devices: DeviceKind[] | undefined = needsAccess ? ["computer"] : undefined;
  const grant = (e: MouseEvent) => {
    e.stopPropagation();
    grantAccess();
  };
  return (
    <WidgetFrame>
      <article className="widget stw stw--M" aria-label={NAME}>
        <Head sub={needsAccess ? "solo computer" : delta} />
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
            <h3>{right === "limits" ? (fresh ? "Limiti del computer" : "Limiti") : right === "devices" ? (devices ? "Computer" : "Dispositivi") : "Classi"}</h3>
            {right === "devices" ? (
              <DeviceBars byDevice={todayByDevice} here={device} kinds={devices} />
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
            {hasLimits && continuousMinutes > 0 && (
              <div className="stw-pause">
                <MdOutlineSchedule size={13} aria-hidden="true" />
                al PC da {formatDuration(continuousMinutes * 60)}
              </div>
            )}
            {fresh && <div className="stw-fresh">{fresh}</div>}
          </div>
        </div>
        {needsAccess && (
          <button type="button" className="stw-cta" onClick={grant}>
            <DeviceIcon device="phone" size={14} />
            <span>Il telefono non conta ancora</span>
            <b>Concedi l'accesso</b>
          </button>
        )}
      </article>
    </WidgetFrame>
  );
}

export default ScreenTimeWidget;
