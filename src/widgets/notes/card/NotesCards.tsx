import type { ReactNode } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import WidgetFrame from "../../../core/widgets/WidgetFrame";
import NoteTitle from "../components/NoteTitle";
import { NotesCardM, NotesCardStrip } from "./NotesCardParts";
import { useNotesCard, type NotesCardData } from "./useNotesCard";
import "./notesCard.css";

interface CardProps {
  size: SizeKey;
}

/** Guscio comune: classe del tema e della taglia, errore nel titolo. */
function Shell({ theme, size, data, label, children, frameClass }: {
  theme: string;
  size: SizeKey;
  data: NotesCardData;
  label?: string;
  children: ReactNode;
  frameClass?: string;
}) {
  return (
    <WidgetFrame className={frameClass}>
      <article
        className={`widget nc nc--${theme} nc--${size}${data.failed ? " nc--error" : ""}`}
        title={data.errorTitle}
        aria-label={label}
      >
        {children}
      </article>
    </WidgetFrame>
  );
}

/** Corpo per le taglie grandi (3×1 e 2×2), uguale nei temi: cambia solo il CSS. */
function Body({ size, data, quickIcon, limit }: { size: SizeKey; data: NotesCardData; quickIcon: boolean; limit?: number }) {
  return size === "STRIP" ? <NotesCardStrip data={data} /> : <NotesCardM data={data} quickIcon={quickIcon} limit={limit} />;
}

function countText(data: NotesCardData): string {
  return data.ready ? String(data.count) : data.failed ? "!" : "–";
}

const TICKS = 36;

/** Notte, 1×1: ghiera a tacche (accese = note toccate negli ultimi 7 giorni) e il numero. */
function NotteRing({ data }: { data: NotesCardData }) {
  const lit = data.count > 0 ? Math.round((data.recentWeek / data.count) * TICKS) : 0;
  const lines = Array.from({ length: TICKS }, (_, i) => {
    const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
    const r2 = i % 3 === 0 ? 58 : 56;
    return (
      <line
        key={i}
        x1={60 + 50 * Math.cos(a)}
        y1={60 + 50 * Math.sin(a)}
        x2={60 + r2 * Math.cos(a)}
        y2={60 + r2 * Math.sin(a)}
        className={i < lit ? "is-on" : undefined}
      />
    );
  });
  return (
    <div className="nc-ring-wrap">
      <svg className="nc-ring" viewBox="0 0 120 120" aria-hidden="true">
        {lines}
      </svg>
      <div className="nc-ring-num">
        <div className="nc-big">{countText(data)}</div>
        <small>{data.countLabel}</small>
      </div>
    </div>
  );
}

export function NotesCardNotte({ size }: CardProps) {
  const data = useNotesCard();
  return (
    <Shell theme="notte" size={size} data={data} label={size === "S" ? `Note: ${countText(data)}` : undefined}>
      {/* In Notte le righe sono più alte: 3 note che si dividono lo spazio. */}
      {size === "S" ? <NotteRing data={data} /> : <Body size={size} data={data} quickIcon limit={3} />}
    </Shell>
  );
}

/** Opaco, 1×1: il numero gigante sul pigmento "carta". */
export function NotesCardOpaco({ size }: CardProps) {
  const data = useNotesCard();
  return (
    <Shell theme="opaco" size={size} data={data} label={size === "S" ? `Note: ${countText(data)}` : undefined}>
      {size === "S" ? (
        <div className="nc-s-opaco">
          <small>Notes</small>
          <div className="nc-big">{countText(data)}</div>
        </div>
      ) : (
        <Body size={size} data={data} quickIcon />
      )}
    </Shell>
  );
}

/** Quaderno, 1×1: un post-it con il titolo dell'ultima nota. */
export function NotesCardQuaderno({ size }: CardProps) {
  const data = useNotesCard();
  const last = data.notes[0];
  return (
    <Shell
      theme="quaderno"
      size={size}
      data={data}
      frameClass={size === "S" ? "card-postit" : undefined}
      label={size === "S" ? (last ? `Ultima nota: ${last.title}` : "Note") : undefined}
    >
      {size === "S" ? (
        last ? (
          <button type="button" className="nc-s-quaderno" onClick={(e) => data.open(e, last.id)} data-cell-action>
            <NoteTitle as="b" color={last.titleColor}>
              {last.title}
            </NoteTitle>
            <small>modificata {last.when}</small>
          </button>
        ) : (
          <div className="nc-s-quaderno">
            <b>{data.failed ? "Errore" : "Nessuna nota"}</b>
            <small>{data.failed ? "impossibile caricare" : "scrivine una"}</small>
          </div>
        )
      ) : (
        <Body size={size} data={data} quickIcon={false} />
      )}
    </Shell>
  );
}

/** Fosforo, 1×1: LED, etichetta e il numero Doto sul display a punti. */
export function NotesCardFosforo({ size }: CardProps) {
  const data = useNotesCard();
  return (
    <Shell theme="fosforo" size={size} data={data} label={size === "S" ? `Note: ${countText(data)}` : undefined}>
      {size === "S" ? (
        <div className="nc-s-fosforo">
          <div className="nc-led-row">
            <span className="nc-led" aria-hidden="true" />
            notes
          </div>
          <div className="nc-disp">
            <div className="nc-big">{data.ready ? data.countPadded : countText(data)}</div>
          </div>
        </div>
      ) : (
        <Body size={size} data={data} quickIcon={false} />
      )}
    </Shell>
  );
}
