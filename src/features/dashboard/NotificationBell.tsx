import { useRef, useState } from "react";
import { MdNotificationsNone } from "react-icons/md";
import { useInbox } from "../../core/notify/inbox";
import { badgeText } from "../../core/notify/inboxStore";
import NotificationsPanel from "./NotificationsPanel";
import "./notificationBell.css";

interface NotificationBellProps {
  /** Telefono: il pulsante della barra in alto (`cbar-btn`) e il pannello a tutto schermo. */
  compact?: boolean;
}

/** La campanella dell'intestazione della dashboard, col numero delle notifiche non lette (amici-notifiche.html). */
function NotificationBell({ compact = false }: NotificationBellProps) {
  const { unread } = useInbox();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const label = unread > 0 ? `Notifiche, ${unread} ${unread === 1 ? "non letta" : "non lette"}` : "Notifiche";

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={compact ? "cbar-btn nbell nbell--compact" : "nbell"}
        aria-label={label}
        title="Notifiche"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MdNotificationsNone aria-hidden="true" />
        {unread > 0 && (
          <span className="nbell-badge" aria-hidden="true">
            {badgeText(unread)}
          </span>
        )}
      </button>
      {open && (
        <NotificationsPanel
          anchor={ref}
          full={compact}
          onClose={() => {
            setOpen(false);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

export default NotificationBell;
