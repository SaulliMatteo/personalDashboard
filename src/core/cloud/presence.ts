import type { RealtimeChannel } from "@supabase/supabase-js";
import { requireCloudClient } from "./client";

/*
 * Presenza nei canali privati dei gruppi, generica: non sa nulla dello studio. Il topic è sempre
 * `group:<group_id>:<feature_key>` ed è autorizzato dall'unica regola su realtime.messages
 * (supabase/migrations/…_realtime.sql): membro del gruppo + modulo attivo.
 */

export type PresenceChannelStatus = "joined" | "error" | "closed";

export interface PresenceListeners {
  /** Stato completo del canale: per ogni utente, un payload per dispositivo (non ancora validati). */
  sync: (state: Record<string, unknown[]>) => void;
  /** Un messaggio in broadcast sullo stesso canale (non validato): la via rapida dei cambi di stato. */
  message?: (payload: unknown) => void;
  status: (status: PresenceChannelStatus) => void;
}

export interface PresenceChannel {
  /** Pubblica il proprio stato (sostituisce il precedente). */
  track: (payload: Record<string, unknown>) => Promise<void>;
  /** Manda un messaggio in broadcast agli altri nel canale (non a sé). Fallisce se il server non conferma. */
  send: (payload: Record<string, unknown>) => Promise<void>;
  leave: () => Promise<void>;
}

/** Nome dell'evento broadcast sui canali di presenza (uno solo: il contenuto dice cos'è). */
const BROADCAST_EVENT = "m";

export function presenceTopic(groupId: string, featureKey: string): string {
  return `group:${groupId}:${featureKey}`;
}

/** Il token della sessione corrente al client Realtime, prima di entrare in un canale privato. */
export async function authorizeRealtime(): Promise<void> {
  const supabase = requireCloudClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
}

function stripMeta(entries: unknown[]): unknown[] {
  // presence_ref è un campo di Realtime, non nostro
  return entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) return entry;
    const { presence_ref: _ref, ...rest } = entry as Record<string, unknown>;
    return rest;
  });
}

export function joinPresenceChannel(
  groupId: string,
  featureKey: string,
  userId: string,
  listeners: PresenceListeners
): PresenceChannel {
  const supabase = requireCloudClient();
  // più dispositivi dello stesso utente condividono la chiave: chi riceve li unisce
  const channel: RealtimeChannel = supabase.channel(presenceTopic(groupId, featureKey), {
    config: { private: true, presence: { key: userId, enabled: true }, broadcast: { self: false, ack: true } },
  });
  let left = false;
  channel.on("presence", { event: "sync" }, () => {
    const raw = channel.presenceState();
    const state: Record<string, unknown[]> = {};
    for (const [key, entries] of Object.entries(raw)) state[key] = stripMeta(entries);
    listeners.sync(state);
  });
  channel.on("broadcast", { event: BROADCAST_EVENT }, (message) => listeners.message?.(message.payload));
  channel.subscribe((status) => {
    if (left) return;
    if (status === "SUBSCRIBED") listeners.status("joined");
    else if (status === "CLOSED") listeners.status("closed");
    else listeners.status("error"); // CHANNEL_ERROR, TIMED_OUT: senza dettagli (niente testo del server)
  });
  return {
    track: async (payload) => {
      const result = await channel.track(payload);
      if (result !== "ok") throw new Error("presence_track_failed");
    },
    send: async (payload) => {
      const result = await channel.send({ type: "broadcast", event: BROADCAST_EVENT, payload });
      if (result !== "ok") throw new Error("presence_send_failed");
    },
    leave: async () => {
      left = true;
      await supabase.removeChannel(channel);
    },
  };
}
