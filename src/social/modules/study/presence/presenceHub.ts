import type { StudyTimerSnapshot } from "../../../../core/activity/activityBus";
import {
  PresenceHub,
  type ChannelState,
  type PresenceHubDeps,
  type PresenceSnapshot as GenericSnapshot,
} from "../../../presence/presenceHub";
import { buildPresence, parseChannelState, type StudyPresence } from "./payload";

/*
 * I canali di presenza dello Studio, uno per gruppo: il hub generico dei moduli (social/presence/presenceHub.ts)
 * con il payload dello Studio. In più tiene "da quando il timer è fermo", che va nel payload.
 * Puro: canali, orologio e timer arrivano da fuori (lo prova scripts/gruppi/presence.test.mts).
 */

export type { ChannelState };
export type PresenceSnapshot = GenericSnapshot<StudyPresence>;

/** Ciò che si manda: il timer del bus e le scelte dell'utente. */
export interface LocalStudyState {
  timer: StudyTimerSnapshot | null;
  /** Nome della materia già filtrato dall'impostazione "mostra la materia" (null = non mostrarla). */
  subject: string | null;
  /** Sala scelta per gruppo (assente = riempimento automatico). */
  rooms: Record<string, number>;
  /** Posto scelto nella sala scelta, per gruppo (assente = posto automatico). */
  seats: Record<string, number>;
}

interface StudyLocal extends LocalStudyState {
  /** Da quando il timer è fermo (ora locale): resta fissa finché il timer non riparte. */
  idleSince: number;
}

export class StudyPresenceHub {
  private readonly hub: PresenceHub<StudyLocal, StudyPresence>;
  private readonly now: () => number;

  constructor(deps: PresenceHubDeps<StudyPresence>) {
    this.now = deps.now;
    this.hub = new PresenceHub<StudyLocal, StudyPresence>(
      deps,
      {
        build: (local, groupId, offsetMs) =>
          buildPresence(local.timer, {
            offsetMs,
            now: local.idleSince,
            subject: local.subject,
            room: local.rooms[groupId] ?? null,
            seat: local.seats[groupId] ?? null,
          }),
        parse: parseChannelState,
      },
      { timer: null, subject: null, rooms: {}, seats: {}, idleSince: deps.now() }
    );
  }

  serverNow(): number {
    return this.hub.serverNow();
  }

  setOffset(offsetMs: number): void {
    this.hub.setOffset(offsetMs);
  }

  /** I gruppi in cui stare (quelli con il modulo Studio attivo). */
  setGroups(groupIds: string[]): void {
    this.hub.setGroups(groupIds);
  }

  setLocal(local: LocalStudyState): void {
    const prev = this.hub.getLocal();
    const idleSince = prev.timer !== null && local.timer === null ? this.now() : prev.idleSince;
    this.hub.setLocal({ ...local, idleSince });
  }

  stop(): void {
    this.hub.stop();
  }

  /** Il payload per un gruppo (la sala cambia da gruppo a gruppo). */
  payloadFor(groupId: string): StudyPresence {
    return this.hub.payloadFor(groupId);
  }
}
