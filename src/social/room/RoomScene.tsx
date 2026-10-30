import type { CSSProperties } from "react";
import type { PixyPresence } from "../modules/pixy/payload";
import { phaseElapsedSeconds } from "../modules/study/presence/payload";
import MemberName from "./MemberName";
import { formatClock } from "./roomText";
import SeatPixy from "./SeatPixy";
import type { RoomMember } from "./useRoomMembers";
import "./RoomScene.css";

/*
 * La sala della Stanza comune (docs/mockup-gruppi/gruppi/stanza-comune.html): parete con libreria e finestre,
 * due file da due tavoli da due posti. Il disegno è lo stesso per tutti i temi; cambiano i token --scene-*
 * (illustrazione in Notte, pigmento in Opaco, penna in Quaderno, matrice di LED in Fosforo). Le facce sono i
 * Pixy veri (core/pixy), uno per posto.
 */

/** Grandezza della scena nel mockup: la pagina la scala (scale) per riempire lo spazio. */
export const STAGE_WIDTH = 720;
export const STAGE_HEIGHT = 470;

interface RoomSceneProps {
  /** 1 = grandezza del mockup; meno quando lo spazio non basta, di più nelle finestre grandi. */
  scale: number;
  /** Chi siede in ogni posizione della scena (placeSeats); null = posto libero. */
  seats: (RoomMember | null)[];
  /** Il posto che ho scelto ma in cui non siedo ancora (timer fermo); null = nessuno. */
  reservedSeat: number | null;
  onSit: (seat: number) => void;
  pixies: Record<string, PixyPresence>;
  offsetMs: number;
  serverNow: number;
  localNow: number;
  selectedId: string | null;
  onSelect: (userId: string) => void;
}

/** Libreria: ripiani e dorsi dei libri ([x, y, larghezza, altezza, colore]). */
type Book = [number, number, number, number, 1 | 2 | 3];
const SHELF_LEFT: Book[] = [
  [12, 34, 8, 24, 1], [22, 30, 6, 28, 2], [30, 36, 9, 22, 3], [41, 32, 6, 26, 1], [58, 38, 10, 20, 2], [70, 33, 7, 25, 3],
  [14, 72, 7, 24, 2], [23, 75, 10, 21, 3], [44, 70, 6, 26, 1], [52, 74, 9, 22, 2], [63, 71, 6, 25, 3],
];
const SHELF_RIGHT: Book[] = [
  [14, 32, 9, 26, 2], [25, 36, 6, 22, 1], [40, 30, 8, 28, 3], [50, 35, 10, 23, 1], [62, 33, 6, 25, 2],
  [12, 74, 10, 22, 1], [30, 70, 6, 26, 2], [38, 73, 8, 23, 3], [60, 71, 9, 25, 1], [71, 75, 6, 21, 2],
];

function Shelf({ books }: { books: Book[] }) {
  return (
    <svg width="96" height="112" viewBox="0 0 96 112">
      <rect className="rs-shelf rs-line" x="2" y="10" width="92" height="100" rx="4" />
      <rect className="rs-board" x="8" y="20" width="80" height="4" />
      <rect className="rs-board" x="8" y="58" width="80" height="4" />
      <rect className="rs-board" x="8" y="96" width="80" height="4" />
      {books.map(([x, y, w, h, c]) => (
        <rect key={`${x}-${y}`} className={`rs-b${c} rs-line`} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  );
}

function Window({ stars, moon = false }: { stars: [number, number, number][]; moon?: boolean }) {
  return (
    <svg width="120" height="150" viewBox="0 0 120 150">
      <path className="rs-win" d="M6 148V60a54 54 0 0 1 108 0v88z" />
      <path className="rs-mullion" d="M60 8v140M6 92h108" />
      {moon && <path className="rs-moon rs-line" d="M96 46a14 14 0 1 1-12-14a11 11 0 0 0 12 14z" />}
      {stars.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} className="rs-star" cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  );
}

/** Come mostrare il posto: studia (testa china sul libro) o in pausa (appoggiato, con la tazza). */
function seatLook(member: RoomMember | null) {
  if (!member) return "empty" as const;
  return member.kind === "studying" ? ("work" as const) : ("break" as const);
}

function seatClock(member: RoomMember, serverNow: number): string {
  const p = member.presence;
  if (!p) return "";
  if (member.kind === "studying") return formatClock(phaseElapsedSeconds(p, serverNow));
  // in pausa: da quanto (pausa del pomodoro = tempo della fase, timer fermato = dall'ultimo cambio)
  const seconds = member.kind === "break" ? phaseElapsedSeconds(p, serverNow) : Math.max(0, (serverNow - p.changedAt) / 1000);
  return `pausa ${formatClock(seconds)}`;
}

function Seat({
  position,
  side,
  props,
}: {
  position: number;
  side: "left" | "right";
  props: RoomSceneProps;
}) {
  const member = props.seats[position] ?? null;
  const look = seatLook(member);
  const selected = member !== null && member.userId === props.selectedId;
  return (
    <div className={`rs-seat rs-seat--${look}`}>
      <div className={`rs-seat-art${side === "left" ? " is-flipped" : ""}`} aria-hidden="true">
        <svg width="150" height="170" viewBox="0 0 150 170">
          <rect className="rs-chair rs-line" x="45" y="30" width="60" height="82" rx="12" />
          {look === "work" && (
            <g>
              <polygon className="rs-cone" points="134,62 92,110 150,110 150,74" />
              <rect className="rs-head" x="48" y="42" width="54" height="40" rx="14" />
              <rect className="rs-body rs-line" x="58" y="82" width="34" height="26" rx="10" />
            </g>
          )}
          {look === "break" && (
            <g>
              <ellipse className="rs-warm" cx="128" cy="96" rx="26" ry="18" />
              <rect className="rs-head" x="48" y="38" width="54" height="40" rx="14" />
              <rect className="rs-body rs-line" x="58" y="78" width="34" height="30" rx="10" />
              <rect className="rs-mug rs-line" x="16" y="94" width="14" height="16" rx="3" />
              <path className="rs-steam" d="M30 98h3a3 3 0 0 1 0 7h-3" strokeWidth="1.8" />
              <path className="rs-steam" d="M20 90q-3-4 0-8M26 90q-3-4 0-8" strokeWidth="1.3" strokeLinecap="round" />
            </g>
          )}
          <rect className="rs-top rs-line" x="0" y="110" width="150" height="8" />
          <rect className="rs-top-hi" x="0" y="110" width="150" height="1.5" />
          <rect className="rs-front rs-line" x="0" y="118" width="150" height="52" />
          {look === "work" && (
            <g>
              <ellipse className="rs-pool" cx="122" cy="111" rx="30" ry="4" />
              <rect className="rs-body rs-line" x="52" y="102" width="14" height="7" rx="3.5" />
              <rect className="rs-body rs-line" x="84" y="102" width="14" height="7" rx="3.5" />
              <path className="rs-page rs-line" d="M56 109l19-4 19 4v2l-19-3-19 3z" />
            </g>
          )}
          {look === "break" && <rect className="rs-b2 rs-line" x="60" y="104" width="30" height="6" rx="1" />}
          <rect className="rs-lamp-base" x="112" y="104" width="22" height="6" rx="3" />
          <path className="rs-lamp-arm" d="M123 104l-6-32 15-12" />
          <path className={`rs-shade rs-line${look === "empty" ? "" : " is-on"}`} d="M124 52l22 9-7 9z" />
          <circle className={`rs-bulb rs-bulb--${look}`} cx="137" cy="66" r="3.2" />
        </svg>
      </div>

      {member === null ? (
        <button
          type="button"
          className={`rs-free${position === props.reservedSeat ? " is-mine" : ""}`}
          aria-label={position === props.reservedSeat ? "Il tuo posto, libero finché non studi" : "Posto libero, siediti qui"}
          onClick={() => props.onSit(position)}
        >
          <span className="rs-free-idle">{position === props.reservedSeat ? "il tuo posto" : "posto libero"}</span>
          <span className="rs-free-hover">siediti qui</span>
        </button>
      ) : (
        <button
          type="button"
          className={`rs-seat-btn${selected ? " is-selected" : ""}`}
          aria-pressed={selected}
          aria-label={`${member.username}${member.isMe ? ", sei tu" : ""}, ${member.kind === "studying" ? "sta studiando" : "in pausa"}`}
          onClick={() => props.onSelect(member.userId)}
        >
          <span className="rs-face-slot">
            <SeatPixy
              kind={member.kind}
              isMe={member.isMe}
              pixy={props.pixies[member.userId]}
              offsetMs={props.offsetMs}
              localNow={props.localNow}
              renderScale={props.scale}
            />
          </span>
          <span className={`rs-pill rs-pill--${look}`}>{seatClock(member, props.serverNow)}</span>
          <span className="rs-plate">
            <MemberName username={member.username} isMe={member.isMe} />
          </span>
        </button>
      )}
    </div>
  );
}

function RoomScene(props: RoomSceneProps) {
  const table = (first: number) => (
    <div className="rs-table" key={first}>
      <Seat position={first} side="left" props={props} />
      <Seat position={first + 1} side="right" props={props} />
    </div>
  );
  const fit = { width: STAGE_WIDTH * props.scale, height: STAGE_HEIGHT * props.scale, "--rs-scale": props.scale } as CSSProperties;
  return (
    <div className="rs-fit" style={fit}>
      <div className="rs-stage">
        <svg width="0" height="0" className="rs-defs" aria-hidden="true">
          <defs>
            <pattern id="room-fz-a" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
              <circle className="rs-dot-a" cx="1.6" cy="1.6" r="1" />
            </pattern>
            <pattern id="room-fz-b" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
              <circle className="rs-dot-b" cx="1.6" cy="1.6" r="0.9" />
            </pattern>
            <pattern id="room-fz-r" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
              <circle className="rs-dot-r" cx="1.6" cy="1.6" r="1.1" />
            </pattern>
          </defs>
        </svg>

        <div className="rs-floor" aria-hidden="true" />

        <div className="rs-wall" aria-hidden="true">
          <Shelf books={SHELF_LEFT} />
          <Window stars={[[26, 72, 1.3], [44, 40, 1.1], [96, 118, 1.3], [30, 124, 1.1]]} />
          <Window moon stars={[[28, 50, 1.3], [38, 116, 1.1], [88, 122, 1.3]]} />
          <Window stars={[[92, 66, 1.3], [24, 110, 1.1], [80, 40, 1.1]]} />
          <Shelf books={SHELF_RIGHT} />
        </div>

        <div className="rs-row rs-row--back">
          {table(0)}
          {table(2)}
        </div>
        <div className="rs-row rs-row--front">
          {table(4)}
          {table(6)}
        </div>
      </div>
    </div>
  );
}

export default RoomScene;
