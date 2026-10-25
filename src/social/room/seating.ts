/*
 * Chi siede dove nella Stanza comune. Puro (lo prova scripts/gruppi/room.test.mts): con gli stessi dati dà lo
 * stesso risultato su tutti i computer, perché l'ordine dipende solo da quando si è entrati nel gruppo.
 *
 * Sale da `seats` posti (8: due file da due tavoli da due). Chi ha scelto una sala ci si siede se c'è posto;
 * gli altri riempiono le sale in ordine, dalla prima. Una sala in più esiste solo se serve o se qualcuno l'ha
 * scelta.
 */

export interface SeatCandidate {
  userId: string;
  /** Ingresso nel gruppo (ms): decide l'ordine, uguale per tutti. */
  joinedAt: number;
  /** Sala scelta (0..maxRooms-1); null = riempimento automatico. */
  room: number | null;
}

export interface SeatingOptions {
  seats: number;
  maxRooms: number;
}

/** Le sale con chi ci siede (id utente, in ordine di ingresso nel gruppo). Sempre almeno una sala. */
export function assignRooms(candidates: SeatCandidate[], { seats, maxRooms }: SeatingOptions): string[][] {
  const ordered = [...candidates].sort((a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const rooms: SeatCandidate[][] = Array.from({ length: maxRooms }, () => []);
  const auto: SeatCandidate[] = [];
  for (const c of ordered) {
    const chosen = c.room !== null && Number.isInteger(c.room) && c.room >= 0 && c.room < maxRooms ? rooms[c.room] : null;
    if (chosen && chosen.length < seats) chosen.push(c);
    else auto.push(c);
  }
  for (const c of auto) {
    const free = rooms.find((r) => r.length < seats);
    if (free) free.push(c);
    // oltre maxRooms × seats non si siede (non succede: il gruppo ha al massimo 30 membri)
  }
  for (const room of rooms) room.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));
  let count = 1;
  rooms.forEach((room, i) => {
    if (room.length > 0) count = i + 1;
  });
  return rooms.slice(0, count).map((room) => room.map((c) => c.userId));
}

/** La sala in cui siede un utente, -1 se non c'è. */
export function roomOf(rooms: string[][], userId: string): number {
  return rooms.findIndex((room) => room.includes(userId));
}

/** L'ordine dei posti in una sala: prima io, poi chi studia, poi gli altri, ognuno nell'ordine della sala. */
export function seatOrder(room: string[], meId: string | null, isStudying: (userId: string) => boolean): string[] {
  const score = (id: string) => (id === meId ? 0 : isStudying(id) ? 1 : 2);
  return room.map((id, i) => ({ id, i })).sort((a, b) => score(a.id) - score(b.id) || a.i - b.i).map((x) => x.id);
}

/**
 * Le 8 posizioni della scena in ordine di lettura (fila dietro: tavolo sinistro, tavolo destro, due posti
 * ciascuno; poi fila davanti): la posizione p mostra il posto SEAT_SLOTS[p] di `seatOrder`. Così i primi
 * posti stanno davanti, al centro (come nel mockup).
 */
export const SEAT_SLOTS = [6, 5, 4, 7, 2, 1, 0, 3] as const;

/**
 * Chi siede in quale posizione della scena (indice = posizione, null = posto libero). Chi ha scelto un posto
 * valido e libero lo prende, con la precedenza a chi è entrato prima nel gruppo (`room` è nell'ordine di
 * assignRooms): così i posti scelti sono uguali su tutti i computer. Gli altri, nell'ordine di `autoOrder`
 * (seatOrder), riempiono i posti rimasti dal primo di SEAT_SLOTS (davanti, al centro).
 */
export function placeSeats(room: string[], chosenSeat: (userId: string) => number | null, autoOrder: string[]): (string | null)[] {
  const places: (string | null)[] = SEAT_SLOTS.map(() => null);
  const placed = new Set<string>();
  for (const id of room) {
    const seat = chosenSeat(id);
    if (seat === null || !Number.isInteger(seat) || seat < 0 || seat >= places.length || places[seat] !== null) continue;
    places[seat] = id;
    placed.add(id);
  }
  const preferred = places.map((_, p) => p).sort((a, b) => SEAT_SLOTS[a] - SEAT_SLOTS[b]);
  for (const id of autoOrder) {
    if (placed.has(id) || !room.includes(id)) continue;
    const free = preferred.find((p) => places[p] === null);
    if (free === undefined) break;
    places[free] = id;
    placed.add(id);
  }
  return places;
}
