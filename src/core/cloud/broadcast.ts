import type { RealtimeChannel } from "@supabase/supabase-js";
import { requireCloudClient } from "./client";
import { presenceTopic, type PresenceChannelStatus } from "./presence";

/*
 * Broadcast nei canali privati dei gruppi, generico: gemello di presence.ts. I messaggi passano dal server ma non
 * vengono salvati: li riceve solo chi è nel canale in quel momento. Il topic è `group:<group_id>:<feature_key>`,
 * autorizzato dalla stessa regola su realtime.messages (membro del gruppo + modulo attivo).
 */

/** Un solo nome di evento: il tipo vero sta nel payload, che il modulo valida. */
const EVENT = "m";

export interface BroadcastListeners {
  /** Un payload ricevuto da un altro (non ancora validato). */
  message: (payload: unknown) => void;
  status: (status: PresenceChannelStatus) => void;
}

export interface BroadcastChannel {
  /** Manda a tutti gli altri nel canale; fallisce se il server non conferma. */
  send: (payload: Record<string, unknown>) => Promise<void>;
  leave: () => Promise<void>;
}

export function joinBroadcastChannel(groupId: string, featureKey: string, listeners: BroadcastListeners): BroadcastChannel {
  const supabase = requireCloudClient();
  // self: false, i propri messaggi li mostra chi li manda; ack: l'invio aspetta la conferma del server
  const channel: RealtimeChannel = supabase.channel(presenceTopic(groupId, featureKey), {
    config: { private: true, broadcast: { self: false, ack: true } },
  });
  let left = false;
  channel.on("broadcast", { event: EVENT }, (message: { payload?: unknown }) => {
    if (!left) listeners.message(message.payload);
  });
  channel.subscribe((status) => {
    if (left) return;
    if (status === "SUBSCRIBED") listeners.status("joined");
    else if (status === "CLOSED") listeners.status("closed");
    else listeners.status("error"); // CHANNEL_ERROR, TIMED_OUT: senza dettagli (niente testo del server)
  });
  return {
    send: async (payload) => {
      const result = await channel.send({ type: "broadcast", event: EVENT, payload });
      if (result !== "ok") throw new Error("broadcast_send_failed");
    },
    leave: async () => {
      left = true;
      await supabase.removeChannel(channel);
    },
  };
}
