import { useRef } from "react";
import { MdOutlineForum } from "react-icons/md";
import FriendsPanel from "./FriendsPanel";
import { useFriends } from "./useFriends";
import "./FriendsButton.css";

interface FriendsButtonProps {
  /** Telefono: il pulsante della barra in alto (`cbar-btn`) e il pannello a tutto schermo. */
  compact?: boolean;
}

/**
 * Gli amici nell'intestazione della dashboard, accanto alla campanella (docs/design/amici-notifiche.html, vista 1):
 * un pallino quando c'è un messaggio non letto o una richiesta. Lo mette in pagina app/App.tsx.
 */
function FriendsButton({ compact = false }: FriendsButtonProps) {
  const { panel, attention, openPanel, closePanel } = useFriends();
  const ref = useRef<HTMLButtonElement | null>(null);
  const label = attention > 0 ? `Amici, ${attention} da leggere` : "Amici";

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={compact ? "cbar-btn fbtn fbtn--compact" : "fbtn"}
        aria-label={label}
        title="Amici"
        aria-haspopup="dialog"
        aria-expanded={panel.open}
        onClick={() => (panel.open ? closePanel() : openPanel())}
      >
        <MdOutlineForum aria-hidden="true" />
        {attention > 0 && <span className="fbtn-pip" aria-hidden="true" />}
      </button>
      {panel.open && (
        <FriendsPanel
          anchor={ref}
          full={compact}
          onClose={() => {
            closePanel();
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

export default FriendsButton;
