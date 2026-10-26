/* Testi della Stanza comune. Puri (li prova scripts/gruppi/room.test.mts). */

const pad = (n: number) => String(n).padStart(2, "0");

/** Il timer di un posto: "25:12", oltre l'ora "1:02:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
}

/**
 * Da quanto non si vede qualcuno (ora del server): "ultima volta 5 min fa", "… 2 h fa", "… ieri", "… 3 giorni fa".
 * Senza dato: "mai connesso". Il mockup dice "visto/vista": qui una forma neutra, il nome utente non dice il genere.
 */
export function lastSeenText(seenAt: number | null, serverNow: number): string {
  if (seenAt === null) return "mai connesso";
  const minutes = Math.max(0, Math.floor((serverNow - seenAt) / 60_000));
  if (minutes < 1) return "ultima volta poco fa";
  if (minutes < 60) return `ultima volta ${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ultima volta ${hours} h fa`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ultima volta ieri" : `ultima volta ${days} giorni fa`;
}

/** Il sottotitolo della stanza: "9 presenti in 2 sale, 7 stanno studiando. 13 membri in tutto." */
export function roomSubtitle(present: number, rooms: number, studying: number, members: number): string {
  const where = rooms > 1 ? `${rooms} sale` : "una sala";
  const who = present === 1 ? "1 presente" : `${present} presenti`;
  const study = studying === 1 ? "1 sta studiando" : `${studying} stanno studiando`;
  const all = members === 1 ? "1 membro in tutto" : `${members} membri in tutto`;
  return `${who} in ${where}, ${study}. ${all[0].toUpperCase()}${all.slice(1)}.`;
}

/** "3 al tavolo, 5 posti liberi". */
export function roomInfo(seated: number, seats: number): string {
  const free = Math.max(0, seats - seated);
  return `${seated} al tavolo, ${free === 1 ? "1 posto libero" : `${free} posti liberi`}`;
}
