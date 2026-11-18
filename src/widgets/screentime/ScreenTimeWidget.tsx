import { createElement, type MouseEvent, type ReactNode } from "react";
import { MdOutlineDesktopWindows, MdOutlinePauseCircle } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { useSettings } from "../../core/settings/useSettings";
import { useScreenTime } from "./useScreenTime";
import { SCREENTIME_RINGS } from "./card/cards";
import { classParts, fillParts } from "./card/ringParts";
import { AppBars, BigTime, ClassSplit, DayInWords, DayMoments, DeviceIcon, LockIcon } from "./components/parts";
import { formatDuration, formatShort } from "./lib/format";
import { deltaWords, isLimitAlert, moodWord, pickAlert, type WidgetAlert } from "./lib/widgetText";
import "./ScreenTimeWidget.css";

type Size = "S" | "W" | "T" | "M";

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
 * Tempo allo schermo in dashboard (docs/mockup/widget/tempo-allo-schermo.html, proposta A): ogni taglia dice una cosa
 * sola e c'è un solo numero grande, il totale di oggi. Piccola 1×1 l'anello delle classi con una parola; Larga 2×1
 * totale e 3 app; Alta 1×2 totale, la giornata a parole e 4 app; Media 2×2 totale, anello del focus, la giornata in 6
 * momenti e 3 app. Limiti, pausa e permesso del telefono: un solo avviso, il più urgente (`pickAlert`), e solo quando
 * serve; il resto è nella pagina. Somma i dispositivi del filtro della pagina.
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
  const { today, yesterdaySoFar, limits, continuousMinutes, loading, canRecord, needsAccess, grantAccess, filter, device, now } = useScreenTime();
  const { settings } = useSettings();
  const Ring = useThemeVariant(SCREENTIME_RINGS);

  const empty = !loading && today.total === 0;
  const focusPct = today.total > 0 ? Math.round((today.byClass.focus / today.total) * 100) : 0;
  // Con "Tutti" e del tempo su più dispositivi: segno del dispositivo accanto alle app e la riga PC / telefono.
  const marks = filter === "all" && today.byDevice.computer > 0 && today.byDevice.phone > 0;
  const filterIcon = filter === "all" ? null : <DeviceIcon device={filter} />;
  const alert = pickAlert({ limits, continuousMinutes, breakMinutes: settings.screentimeBreakMinutes, needsAccess, now });

  /** L'unica riga sotto al totale: PC e telefono, o il confronto con ieri. */
  const line = marks ? (
    <span className="stw-line">
      <span className="stw-line-dev">
        <DeviceIcon device="computer" />
        {formatShort(today.byDevice.computer)}
      </span>
      <span className="stw-line-dev">
        <DeviceIcon device="phone" />
        {formatShort(today.byDevice.phone)}
      </span>
    </span>
  ) : loading ? null : (
    <span className="stw-line">{deltaWords(today.total - yesterdaySoFar)}</span>
  );

  if (size === "S") {
    const nearLimit = isLimitAlert(alert);
    return (
      <WidgetFrame>
        <article className="widget stw stw--S" aria-label={NAME}>
          {/* Il testo sta dentro l'anello e scala con lui (CSS: l'anello è un container). */}
          <div className="stw-hero">
            {createElement(
              Ring,
              { parts: classParts(today.byClass), label: `Oggi ${formatDuration(today.total)} allo schermo, ${focusPct} per cento di focus` },
              <span className="stw-kicker">{filterIcon ?? "oggi"}</span>,
              <BigTime seconds={today.total} />,
              <span className={`stw-word${nearLimit ? " is-warn" : ""}`}>{alert?.kind === "blocked" ? "bloccato" : nearLimit ? "al limite" : moodWord(today.byClass)}</span>
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
        {/* Senza titolo: a sinistra il totale al centro, a destra le app (meno righe se la cella è bassa). */}
        <article className="widget stw stw--W" aria-label={NAME}>
          <div className="stw-lead">
            <BigTime seconds={today.total} />
            {alert && isLimitAlert(alert) ? (
              <span className="stw-line is-warn">{alertText(alert)}</span>
            ) : marks ? (
              line
            ) : (
              // Il segno del filtro (senza titolo non ha altro posto) va davanti al confronto con ieri.
              <span className="stw-line">
                {filterIcon}
                {loading ? null : deltaWords(today.total - yesterdaySoFar)}
              </span>
            )}
          </div>
          <AppBars items={today.apps} max={3} marks={marks} />
        </article>
      </WidgetFrame>
    );
  }

  if (size === "T") {
    return (
      <WidgetFrame>
        <article className="widget stw stw--T" aria-label={NAME}>
          <Head title="Oggi" sub={filterIcon} />
          <div className="stw-lead">
            <BigTime seconds={today.total} />
            {line}
          </div>
          <div className="stw-words">
            <ClassSplit byClass={today.byClass} />
            <DayInWords byClass={today.byClass} />
          </div>
          <div className="stw-sep" />
          <AppBars items={today.apps} max={alert ? 2 : 4} marks={marks} />
          {alert && <AlertRow alert={alert} onGrant={grantAccess} />}
        </article>
      </WidgetFrame>
    );
  }

  return (
    <WidgetFrame>
      <article className="widget stw stw--M" aria-label={NAME}>
        <Head sub={filterIcon} />
        <div className="stw-top">
          <div className="stw-lead">
            <BigTime seconds={today.total} />
            {line}
          </div>
          <div className="stw-focus">
            {createElement(
              Ring,
              { parts: fillParts("focus", today.byClass.focus, today.total), label: `${focusPct} per cento di focus` },
              <span className="stw-num">{focusPct}%</span>,
              <small>focus</small>
            )}
          </div>
        </div>
        <DayMoments hours={today.hours} nowHour={new Date().getHours()} />
        <AppBars items={today.apps} max={alert ? 2 : 3} marks={marks} />
        {alert && <AlertRow alert={alert} onGrant={grantAccess} />}
      </article>
    </WidgetFrame>
  );
}

function alertText(alert: WidgetAlert): string {
  if (alert.kind === "blocked") return `${alert.label}: bloccata fino a mezzanotte`;
  if (alert.kind === "extended") return `${alert.label}: ${formatDuration(alert.leftSeconds)} in più, poi si blocca`;
  if (alert.kind === "limit") return alert.leftSeconds > 0 ? `${alert.label}: mancano ${formatDuration(alert.leftSeconds)} al limite` : `${alert.label}: limite raggiunto`;
  if (alert.kind === "pause") return `Al PC da ${formatDuration(alert.minutes * 60)}: una pausa?`;
  return "Il telefono non conta ancora";
}

/** L'avviso in fondo (Alta e Media). Telefono senza permesso: si tocca per darlo. */
function AlertRow({ alert, onGrant }: { alert: WidgetAlert; onGrant: () => void }) {
  if (alert.kind === "access") {
    const grant = (e: MouseEvent) => {
      e.stopPropagation();
      onGrant();
    };
    return (
      <button type="button" className="stw-alert is-action" onClick={grant}>
        <DeviceIcon device="phone" size={14} />
        <span>{alertText(alert)}</span>
        <b>Concedi l'accesso</b>
      </button>
    );
  }
  const locked = alert.kind === "blocked" || alert.kind === "extended";
  return (
    <div className={`stw-alert${alert.kind === "blocked" ? " is-blocked" : ""}`} role="status">
      {locked ? <LockIcon className="stw-lock" /> : <i aria-hidden="true" />}
      <span>{alertText(alert)}</span>
    </div>
  );
}

export default ScreenTimeWidget;
