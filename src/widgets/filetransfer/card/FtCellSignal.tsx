import type { CSSProperties, ReactNode } from "react";
import { ReceiveDotsIcon, ReceiveIcon } from "../../../ui/icons";
import { useFtCell } from "./useFtCell";
import "./ftCell.css";
import "./FtCellSignal.css";

const BAR = Array.from({ length: 7 }, (_, i) => i);

/**
 * 1×1 "Segnale" (Notte, Opaco, Fosforo): icona e nome in alto a sinistra, stato a
 * destra, numero al centro e sette punti in basso che scorrono mentre il server è
 * acceso. In Fosforo tutta la cella è il display a punti; negli altri temi cambiano
 * font, colori e icona.
 */
function FtCellSignal({ theme, icon, title }: { theme: string; icon: ReactNode; title: string }) {
  const d = useFtCell();
  return (
    <article className={`widget ftc ftc-s ftc-s--${theme}${d.onlineClass}`} aria-label={d.ariaLabel} title={d.errorTitle}>
      <span className="ftc-s-top">
        <span className="ftc-s-tag">
          {icon}
          <span className="ftc-title">{title}</span>
        </span>
        <span className="ftc-st">
          <span className="ftc-dot" aria-hidden="true" />
          {d.statusLabel}
        </span>
      </span>
      <span className="ftc-num">{d.count}</span>
      <span className="ftc-s-bar" aria-hidden="true">
        {BAR.map((i) => (
          <i key={i} style={{ "--i": i } as CSSProperties} />
        ))}
      </span>
    </article>
  );
}

export function FtCellNotte() {
  return <FtCellSignal theme="notte" icon={<ReceiveIcon size={14} stroke={1.6} />} title="File transfer" />;
}

export function FtCellOpaco() {
  return <FtCellSignal theme="opaco" icon={<ReceiveIcon size={16} stroke={2.4} />} title="File transfer" />;
}

export function FtCellFosforo() {
  return <FtCellSignal theme="fosforo" icon={<ReceiveDotsIcon size={12} />} title="file transfer" />;
}
