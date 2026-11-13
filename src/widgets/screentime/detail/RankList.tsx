import { useEffect, useRef, useState, type CSSProperties } from "react";
import { APP_CATEGORIES, type AppCategory } from "../../../core/system/appCategory";
import { CATEGORY_LABEL } from "../lib/categories";
import { FOCUS_CLASSES } from "../lib/focus";
import { formatShort } from "../lib/format";
import type { RankItem } from "../lib/summary";

interface RankListProps {
  items: RankItem[];
  /** Voci mostrate prima di "Mostra tutte". */
  max?: number;
  /** Categoria scelta a mano per questa voce (null = automatica). */
  manualCategory: (item: RankItem) => AppCategory | undefined;
  onCategory: (item: RankItem, category: AppCategory | null) => void;
  onLimit: (item: RankItem) => void;
  /** Solo per i browser nella lista delle app. */
  onShowSites?: (item: RankItem) => void;
  hasSites?: (item: RankItem) => boolean;
  empty: string;
}

/**
 * Classifica di app o siti (docs/design/temi/tempo-pc.html, pagina): nome, categoria, tempo, barra colorata per classe
 * (un browser divisa tra i suoi siti) e il menu ⋯ per cambiare categoria o mettere un limite.
 */
function RankList({ items, max = 8, manualCategory, onCategory, onLimit, onShowSites, hasSites, empty }: RankListProps) {
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
              <span>{item.label}</span>
              <span className="stp-chip">{CATEGORY_LABEL[item.category]}</span>
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
              {FOCUS_CLASSES.map((c) =>
                item.byClass[c] > 0 ? (
                  <span key={c} className={`st-seg is-${c}`} style={{ "--v": `${(item.byClass[c] / top) * 100}%` } as CSSProperties} />
                ) : null
              )}
            </div>
            {open === item.key && (
              <RowMenu
                item={item}
                manual={manualCategory(item)}
                onClose={() => setOpen(null)}
                onCategory={(c) => onCategory(item, c)}
                onLimit={() => onLimit(item)}
                onShowSites={onShowSites && hasSites?.(item) ? () => onShowSites(item) : undefined}
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
  onLimit: () => void;
  onShowSites?: () => void;
}

function RowMenu({ item, manual, onClose, onCategory, onLimit, onShowSites }: RowMenuProps) {
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
          {onShowSites && (
            <>
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  onShowSites();
                }}
              >
                Vedi i siti
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default RankList;
