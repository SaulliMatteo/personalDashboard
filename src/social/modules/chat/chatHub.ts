import { retryDelayMs } from "../../../core/cloud/backoff";
import type { BroadcastChannel, BroadcastListeners } from "../../../core/cloud/broadcast";
import type { PresenceChannelStatus } from "../../../core/cloud/presence";
import type { ChannelState } from "../../presence/presenceHub";

/*
 * I canali broadcast della chat, uno per gruppo: entra ed esce quando cambiano i gruppi e rientra da solo con attese
 * crescenti se un canale cade (come PresenceHub). Non tiene messaggi: li passa a chi lo usa.
 * Puro: canali e timer arrivano da fuori (lo prova scripts/gruppi/chat.test.mts).
 */

export interface ChatHubDeps {
  join: (groupId: string, listeners: BroadcastListeners) => BroadcastChannel;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onMessage: (groupId: string, payload: unknown) => void;
  onChannels: (channels: Record<string, ChannelState>) => void;
}

interface GroupChannel {
  channel: BroadcastChannel | null;
  state: ChannelState;
  failures: number;
  retry: unknown;
}

export class ChatHub {
  private readonly deps: ChatHubDeps;
  private readonly groups = new Map<string, GroupChannel>();
  private stopped = false;

  constructor(deps: ChatHubDeps) {
    this.deps = deps;
  }

  setGroups(groupIds: string[]): void {
    if (this.stopped) return;
    const wanted = new Set(groupIds);
    for (const groupId of [...this.groups.keys()]) if (!wanted.has(groupId)) this.leave(groupId);
    for (const groupId of wanted) if (!this.groups.has(groupId)) this.join(groupId);
    this.emit();
  }

  isJoined(groupId: string): boolean {
    return this.groups.get(groupId)?.state === "joined";
  }

  /** Manda nel canale di un gruppo; false se non si è dentro o il server non conferma. */
  async send(groupId: string, payload: Record<string, unknown>): Promise<boolean> {
    const entry = this.groups.get(groupId);
    if (!entry || entry.state !== "joined" || !entry.channel) return false;
    try {
      await entry.channel.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.stopped = true;
    for (const groupId of [...this.groups.keys()]) this.leave(groupId);
  }

  private join(groupId: string): void {
    const entry: GroupChannel = { channel: null, state: "joining", failures: this.groups.get(groupId)?.failures ?? 0, retry: null };
    this.groups.set(groupId, entry);
    entry.channel = this.deps.join(groupId, {
      message: (payload) => {
        if (!this.stopped && this.groups.get(groupId) === entry) this.deps.onMessage(groupId, payload);
      },
      status: (status) => this.onStatus(groupId, entry, status),
    });
  }

  private onStatus(groupId: string, entry: GroupChannel, status: PresenceChannelStatus): void {
    if (this.stopped || this.groups.get(groupId) !== entry) return;
    if (status === "joined") {
      entry.state = "joined";
      entry.failures = 0;
    } else if (entry.state !== "error") {
      // canale caduto (rete, token scaduto, accesso negato): si esce e si riprova più tardi
      entry.state = "error";
      void entry.channel?.leave().catch(() => {});
      const delay = retryDelayMs(entry.failures);
      entry.failures += 1;
      entry.retry = this.deps.setTimer(() => {
        if (this.stopped || this.groups.get(groupId) !== entry) return;
        this.join(groupId);
        this.emit();
      }, delay);
    }
    this.emit();
  }

  private leave(groupId: string): void {
    const entry = this.groups.get(groupId);
    if (!entry) return;
    this.groups.delete(groupId);
    if (entry.retry !== null) this.deps.clearTimer(entry.retry);
    void entry.channel?.leave().catch(() => {});
  }

  private emit(): void {
    if (this.stopped) return;
    const channels: Record<string, ChannelState> = {};
    for (const [groupId, entry] of this.groups) channels[groupId] = entry.state;
    this.deps.onChannels(channels);
  }
}
