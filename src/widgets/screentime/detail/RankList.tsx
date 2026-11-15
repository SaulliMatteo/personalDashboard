import { useEffect, useRef, useState, type CSSProperties } from "react";
import { APP_CATEGORIES, type AppCategory } from "../../../core/system/appCategory";
import { CATEGORY_LABEL } from "../lib/categories";
import { formatShort } from "../lib/format";
import type { RankItem } from "../lib/summary";
import { DeviceMark } from "../components/parts";

interface RankListProps {
  items: RankItem[];
  /** Voci mostrate prima di "Mostra tutte". */
  max?: number;
  /** Categoria scelta a mano per questa voce (null = automatica). */
  manualCategory: (item: RankItem) => AppCategory | undefined;
  onCategory: (item: RankItem, category: AppCategory | null) => void;
  /** Assente dove non si conta (i limiti sono del computer). */
  onLimit?: (item: RankItem) => void;
  /** Segno del dispositivo accanto ai nomi e, per le app su tutti e due, quanto viene da ciascuno. */
  marks?: boolean;
  empty: string;
}

/**
 * Classifica delle app (docs/mockup/temi/tempo-pc.html e tempo-pc-telefono.html, pagina): nome, categoria (o la parte
 * di PC e telefono), tempo, barra col colore della classe e il menu ⋯ per cambiare categoria o mettere un limite.
 */
function RankList({ items, max = 8, manualCategory, onCategory, onLimit, marks = false, empty }: RankListProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (items.length === 0) return <p className="stp-fine">{empty}</p>;
  const top = items[0].seconds || 1;
  const shown = all ? items : items.slice(0, max);
  return (
    <>
      <ul className="stp-rank">
        {shown.map((item) => (
          <li key={item.key}>
            <div className="stp-rank-name">
              <span>
                {item.label}
                {marks && <DeviceMark byDevice={item.byDevice} />}
              </span>
              {marks && item.byDevice.computer > 0 && item.byDevice.phone > 0 ? (
                <small>
                  PC {formatShort(item.byDevice.computer)} · tel. {formatShort(item.byDevice.phone)}
                </small>
              ) : (
                <span className="stp-chip">{CATEGORY_LABEL[item.category]}</span>
              )}
            </div>
            <span className="stw-mono">{formatShort(item.seconds)}</span>
            <button
              className="stp-more"
              type="button"
              aria-label={`Opzioni di ${item.label}`}
              aria-haspopup="menu"
              aria-expanded={open === item.key}
              onClick={() => setOpen((cur) => (cur === item.key ? null : item.key))}
            >
              ⋯
            </button>
            <div className="stp-rank-bar">
              <span className={`st-seg is-${item.cls}`} style={{ "--v": `${(item.seconds / top) * 100}%` } as CSSProperties} />
            </div>
            {open === item.key && (
              <RowMenu
                item={item}
                manual={manualCategory(item)}
                onClose={() => setOpen(null)}
                onCategory={(c) => onCategory(item, c)}
                onLimit={onLimit ? () => onLimit(item) : undefined}
              />
            )}
          </li>
        ))}
      </ul>
      {items.length > max && (
        <button type="button" className="stp-link" onClick={() => setAll((v) => !v)}>
          {all ? "Mostra meno" : `Mostra tutte (${items.length})`}
        </button>
      )}
    </>
  );
}

interface RowMenuProps {
  item: RankItem;
  manual: AppCategory | undefined;
  onClose: () => void;
  onCategory: (category: AppCategory | null) => void;
  onLimit?: () => void;
}

function RowMenu({ item, manual, onClose, onCategory, onLimit }: RowMenuProps) {
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && !ref.current.parentElement?.querySelector(".stp-more")?.contains(target)) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  const choose = (category: AppCategory | null) => {
    onCategory(category);
    onClose();
  };

  return (
    <div ref={ref} className="stp-menu" role="menu" aria-label={item.label}>
      {picking ? (
        <>
          <button type="button" role="menuitemradio" aria-checked={!manual} onClick={() => choose(null)}>
            Automatica <span>{manual ? "" : "✓"}</span>
          </button>
          <hr />
          {APP_CATEGORIES.map((c) => (
            <button key={c} type="button" role="menuitemradio" aria-checked={manual === c} onClick={() => choose(c)}>
              {CATEGORY_LABEL[c]} <span>{manual === c ? "✓" : ""}</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <button type="button" role="menuitem" onClick={() => setPicking(true)}>
            Categoria <span>{CATEGORY_LABEL[item.category]} ▸</span>
          </button>
          {onLimit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onLimit();
              }}
            >
              Imposta un limite…
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default RankList;
