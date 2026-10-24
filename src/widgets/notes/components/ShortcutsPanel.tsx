import { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";
import { SHORTCUTS, shortcutKeys, type ShortcutAction, type ShortcutGroup } from "../lib/shortcuts";
import "./ShortcutsPanel.css";

const GROUPS: ShortcutGroup[] = ["Modifica", "Testo", "Tabelle", "Navigazione", "Scrittura a mano"];

/** Voci che nel pannello stanno su una riga sola (come nel mockup). */
const EXTRA_ROWS: Partial<Record<ShortcutGroup, { label: string; keys: string[] }[]>> = {
  Modifica: [{ label: "Menu inserisci", keys: ["/"] }],
  Tabelle: [
    { label: "Cella successiva", keys: ["Tab"] },
    { label: "Cella precedente", keys: ["⇧", "Tab"] },
    { label: "Riga nuova (dall'ultima cella)", keys: ["Tab"] },
  ],
};

/** Pannello delle scorciatoie (Ctrl+/ o F1). Esc o un click fuori lo chiude. */
function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className="nq-keys-bg"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="nq-keys" role="dialog" aria-modal="true" aria-labelledby="nq-keys-title">
        <div className="nq-keys-head">
          <h3 id="nq-keys-title">Scorciatoie</h3>
          <button ref={closeRef} type="button" className="nq-icon-btn" onClick={onClose} aria-label="Chiudi le scorciatoie">
            <MdClose />
          </button>
        </div>
        <div className="nq-keys-grid">
          {GROUPS.map((group) => (
            <section key={group} className="nq-kgroup">
              <h4>{group}</h4>
              {(Object.keys(SHORTCUTS) as ShortcutAction[])
                .filter((a) => SHORTCUTS[a].group === group)
                .map((a) => ({ label: SHORTCUTS[a].label, keys: shortcutKeys(a) }))
                .concat(EXTRA_ROWS[group] ?? [])
                .map((row) => (
                  <div key={row.label} className="nq-krow">
                    <span>{row.label}</span>
                    <span>
                      {row.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
            </section>
          ))}
        </div>
        <p className="nq-keys-note">Le lettere della scrittura a mano valgono solo in modalità disegno. Su macOS Ctrl diventa ⌘.</p>
      </div>
    </div>
  );
}

export default ShortcutsPanel;
