import { createElement, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { IconType } from "react-icons";
import {
  MdArrowBack,
  MdChatBubbleOutline,
  MdNotificationsNone,
  MdPeopleOutline,
  MdPersonAddAlt,
  MdStarOutline,
  MdSystemUpdateAlt,
  MdTimer,
  MdTimerOff,
} from "react-icons/md";
import { markInboxRead, useInbox } from "../../core/notify/inbox";
import { groupInboxByDay, type InboxItem } from "../../core/notify/inboxStore";
import { useNav } from "../../core/nav/useNav";
import { useUpdater } from "../../core/updater/useUpdater";
import Popover from "../../ui/Popover";
import "./notificationsPanel.css";

const ICON_OF: Record<string, IconType> = {
  pomodoroDone: MdTimer,
  breakOver: MdTimer,
  autoStopWarning: MdTimerOff,
  autoStopped: MdTimerOff,
  groupMessage: MdChatBubbleOutline,
  groupJoined: MdPersonAddAlt,
  groupStudied: MdStarOutline,
  updateAvailable: MdSystemUpdateAlt,
  friendRequest: MdPersonAddAlt,
  friendAccepted: MdPeopleOutline,
  friendMessage: MdChatBubbleOutline,
};

const pad = (n: number) => String(n).padStart(2, "0");
const timeText = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface NotificationsPanelProps {
  /** La campanella: il pannello si apre sotto di lei (sul desktop). */
  anchor: RefObject<HTMLElement | null>;
  /** Telefono: a tutto schermo invece che sotto la campanella. */
  full: boolean;
  onClose: () => void;
}

/**
 * Il pannello della campanella (docs/design/amici-notifiche.html, viste 2 e 8): le notifiche per giorno, quelle non
 * lette col punto. Un clic apre ciò di cui parla la notifica. Chiudendo il pannello le notifiche viste diventano lette:
 * il numero sulla campanella sparisce, ma finché il pannello è aperto si vede cosa era nuovo.
 */
function NotificationsPanel({ anchor, full, onClose }: NotificationsPanelProps) {
  const { items, unread, markRead, markAllRead, clear } = useInbox();
  const { openNotification, openSettings } = useNav();
  const updater = useUpdater();
  // "Oggi" e "Ieri" rispetto a quando si è aperto il pannello
  const [openedAt] = useState(() => Date.now());
  const groups = groupInboxByDay(items, openedAt);

  // alla chiusura diventano lette tutte quelle comparse non lette mentre il pannello era aperto
  const seenRef = useRef(new Set<number>());
  useEffect(() => {
    for (const item of items) if (item.readAt === null) seenRef.current.add(item.id);
  }, [items]);
  useEffect(() => {
    const seen = seenRef.current;
    return () => markInboxRead([...seen]);
  }, []);

  function open(item: InboxItem) {
    markRead(item.id);
    onClose();
    if (item.open) openNotification(item.open);
  }

  function update() {
    onClose();
    // trovato in questa sessione: si installa da qui; dopo un riavvio va ricontrollato, in Impostazioni
    if (updater.status.kind === "available") void updater.install();
    openSettings("general");
  }

  const body = (
    <>
      <div className="ntf-head">
        {full && (
          <button type="button" className="ntf-icon-btn" onClick={onClose} aria-label="Indietro">
            <MdArrowBack aria-hidden="true" />
          </button>
        )}
        <h2 className="ntf-title">Notifiche</h2>
        <button type="button" className="ntf-link" onClick={markAllRead} disabled={unread === 0}>
          Segna tutte come lette
        </button>
      </div>

      {items.length === 0 ? (
        <div className="ntf-empty">
          <MdNotificationsNone aria-hidden="true" />
          <p>Nessuna notifica.</p>
          <small>Qui trovi gli avvisi dell'app: timer dello Studio, Gruppi, amici, aggiornamenti.</small>
        </div>
      ) : (
        <div className="ntf-list">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="ntf-day">{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id} className={`ntf-item${item.readAt === null ? " is-unread" : ""}`}>
                    <button type="button" className="ntf-row" onClick={() => open(item)}>
                      <span className="ntf-item-icon" aria-hidden="true">
                        {createElement(ICON_OF[item.kind] ?? MdNotificationsNone)}
                      </span>
                      <span className="ntf-item-text">
                        <strong>
                          {item.title}
                          {item.readAt === null && <span className="ntf-sr"> (non letta)</span>}
                        </strong>
                        {item.body && <span>{item.body}</span>}
                      </span>
                      <time dateTime={new Date(item.createdAt).toISOString()}>{timeText(item.createdAt)}</time>
                    </button>
                    {item.kind === "updateAvailable" && (
                      <div className="ntf-actions">
                        <button type="button" className="ntf-pill ntf-pill--primary" onClick={update}>
                          Aggiorna
                        </button>
                        <button type="button" className="ntf-pill" onClick={() => open(item)}>
                          Novità
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="ntf-foot">
        <span>Solo su questo dispositivo, ultimi 30 giorni</span>
        {items.length > 0 && (
          <button type="button" className="ntf-link" onClick={clear}>
            Svuota
          </button>
        )}
      </div>
    </>
  );

  if (full) {
    return createPortal(
      <div
        className="ntf ntf--full"
        role="dialog"
        aria-modal="true"
        aria-label="Notifiche"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {body}
      </div>,
      document.body
    );
  }

  return (
    <Popover anchor={anchor} onClose={onClose} align="end" className="ntf ntf--pop" label="Notifiche">
      {body}
    </Popover>
  );
}

export default NotificationsPanel;
