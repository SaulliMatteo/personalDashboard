import { presenceKind, unsavedStudySeconds, type PresenceKind, type StudyPresence } from "./presence/payload";

/*
 * Classifica di studio di un gruppo: totali salvati + sessione in corso non ancora salvata. Pura: ora del
 * server e dati arrivano da fuori (lo prova scripts/gruppi/leaderboard.test.mts).
 */

export type LeaderboardPeriod = "today" | "week";

/** Stato da mostrare accanto al nome: quello live, oppure "offline" se non è connesso. */
export type MemberKind = PresenceKind | "offline";

export interface LeaderboardMember {
  userId: string;
  username: string;
}

export interface LeaderboardInput {
  members: LeaderboardMember[];
  meId: string | null;
  /** utente → secondi salvati nel periodo. */
  saved: Record<string, number>;
  /** utente → stato live (chi manca è offline). */
  live: Record<string, StudyPresence>;
  serverNow: number;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  isMe: boolean;
  /** 1 = primo; a pari secondi stessa posizione (1, 1, 3…). */
  rank: number;
  seconds: number;
  kind: MemberKind;
}

/** Tutti i membri, dal più studioso; a pari tempo in ordine di nome. */
export function buildLeaderboard(input: LeaderboardInput): LeaderboardRow[] {
  const rows = input.members.map((m) => {
    const live = input.live[m.userId];
    const seconds = (input.saved[m.userId] ?? 0) + (live ? unsavedStudySeconds(live, input.serverNow) : 0);
    return {
      userId: m.userId,
      username: m.username,
      isMe: m.userId === input.meId,
      rank: 0,
      seconds,
      kind: live ? presenceKind(live) : ("offline" as const),
    };
  });
  rows.sort((a, b) => b.seconds - a.seconds || a.username.localeCompare(b.username));
  rows.forEach((row, i) => {
    row.rank = i > 0 && rows[i - 1].seconds === row.seconds ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

/**
 * Le righe da mostrare in uno spazio di `limit` righe: le prime, ma se io resto fuori l'ultima riga è la mia
 * (le prime `limit - 1` + me), così ognuno vede sempre dove si trova.
 */
export function visibleRows(rows: LeaderboardRow[], limit: number): LeaderboardRow[] {
  if (limit <= 0) return [];
  const top = rows.slice(0, limit);
  if (top.some((r) => r.isMe)) return top;
  const me = rows.find((r) => r.isMe);
  return me ? [...rows.slice(0, limit - 1), me] : top;
}

/** Quanti stanno studiando adesso (timer di studio in corsa). */
export function studyingCount(rows: LeaderboardRow[]): number {
  return rows.filter((r) => r.kind === "studying").length;
}

/** "2h 05m", "45m": come la barra laterale. */
export function formatStudyTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Testo dello stato, mai solo il colore del pallino. */
export const KIND_LABELS: Record<MemberKind, string> = {
  studying: "Sta studiando",
  paused: "In pausa",
  break: "In pausa pomodoro",
  online: "Online",
  offline: "Offline",
};
