import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import "./PageMenu.css";

export interface PageMenuItem {
  label: string;
  icon: ReactNode;
  /** Scorciatoia da mostrare a destra ("Ctrl C"). */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

interface PageMenuProps {
  /** Punto del clic destro (coordinate dello schermo). */
  x: number;
  y: number;
  /** Gruppi di voci, separati da una linea. */
  groups: PageMenuItem[][];
  onClose: () => void;
}

/**
 * Menu del tasto destro nella pagina, al posto di quello del browser (che non si può allungare):
 * nello stile dei menu del tema (nq-menu). Il focus resta nel testo (taglia, copia e incolla
 * lavorano sulla selezione): le frecce, Invio ed Esc li ascolta il menu finché è aperto.
 */
function PageMenu({ x, y, groups, onClose }: PageMenuProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const items = groups.flat();
  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const left = Math.max(8, Math.min(x, window.innerWidth - box.offsetWidth - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - box.offsetHeight - 8));
    setPos({ left, top });
  }, [x, y]);

  function select(item: PageMenuItem | undefined) {
    if (!item || item.disabled) return;
    onClose();
    item.onSelect();
  }

  const keysRef = useLatestRef((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (enabled.length === 0) return;
      const at = enabled.indexOf(active);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(enabled[at < 0 ? (step > 0 ? 0 : enabled.length - 1) : (at + step + enabled.length) % enabled.length]);
    } else if (e.key === "Enter") select(items[active]);
    else {
      // Qualunque altro tasto: il menu si chiude e il tasto fa il suo lavoro nel testo.
      onClose();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  });

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && e.target instanceof Node && boxRef.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => keysRef.current(e);
    const onAway = () => onClose();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onAway);
    document.addEventListener("scroll", onAway, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onAway);
      document.removeEventListener("scroll", onAway, true);
    };
  }, [onClose, keysRef]);

  let index = -1;
  return (
    <div
      ref={boxRef}
      className="nq-menu nq-page-menu"
      role="menu"
      aria-label="Azioni sul testo"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }}
      // Le voci non rubano il focus né la selezione al testo.
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {groups
        .filter((g) => g.length > 0)
        .map((group, gi) => (
          <div key={gi} className="nq-page-menu-group" role="group">
            {group.map((item) => {
              index++;
              const i = index;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={`${item.danger ? "is-danger" : ""}${i === active ? " is-active" : ""}`.trim() || undefined}
                  disabled={item.disabled}
                  onPointerEnter={() => !item.disabled && setActive(i)}
                  onClick={() => select(item)}
                >
                  <span className="nq-page-menu-ico">{item.icon}</span>
                  <span className="nq-page-menu-label">{item.label}</span>
                  {item.hint && <kbd>{item.hint}</kbd>}
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
}

export default PageMenu;
