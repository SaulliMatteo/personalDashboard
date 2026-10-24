import { Fragment } from "react";

export interface Crumb {
  label: string;
  onClick?: () => void;
}

/** "Scuola / Sistemi e reti / Subnetting /26": l'ultima voce è in grassetto, le altre aprono la cartella. */
function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="nq-crumbs" aria-label="Percorso">
      {items.map((crumb, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <span className="nq-crumb-sep" aria-hidden="true">/</span>}
            {crumb.onClick ? (
              <button type="button" className="nq-crumb" onClick={crumb.onClick}>
                {crumb.label}
              </button>
            ) : last ? (
              <b className="nq-crumb is-current">{crumb.label}</b>
            ) : (
              <span className="nq-crumb">{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export default Crumbs;
