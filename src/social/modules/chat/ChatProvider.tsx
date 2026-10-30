import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getActivity } from "../../../core/activity/activityBus";
import { joinBroadcastChannel } from "../../../core/cloud/broadcast";
import { useCloud } from "../../../core/cloud/useCloud";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { sendAppNotification } from "../../../core/notify/notifier";
import { useSettings } from "../../../core/settings/useSettings";
import { useGroups } from "../../groups/useGroups";
import { startClockSync } from "../../presence/clockSync";
import { openChannels } from "../../presence/openChannels";
import type { ChannelState } from "../../presence/presenceHub";
import { STUDY_FEATURE_KEY } from "../study/feature";
import { buildPresence, unsavedStudySeconds } from "../study/presence/payload";
import { dayKey } from "../study/sync/plan";
import { ChatHub } from "./chatHub";
import { applyChatEvent, canSendAt, EMPTY_CHAT, type GroupChat } from "./chatStore";
import { loadLastMilestone, saveLastMilestone } from "./data/milestoneRepository";
import { CHAT_FEATURE_KEY } from "./feature";
import { cleanMessageText, MESSAGE_MAX, newEventId, parseChatEvent, type ChatEvent, type ReactionKind } from "./payload";
import { alreadyAnnounced, crossedStudyHour } from "./studyMilestone";
import { ChatContext, type ChatSendError, type ChatValue } from "./useChat";

/** Chi è entrato da meno di così annuncia "è entrato nel gruppo" la prima volta che apre il canale. */
const JOINED_WINDOW_MS = 3 * 60_000;
/** Una notifica per gruppo al massimo ogni tanto: una raffica di messaggi non diventa una raffica di avvisi. */
const NOTIFY_INTERVAL_MS = 15_000;
/** Ogni quanto si guarda se il proprio studio di oggi ha superato un'ora intera. */
const MILESTONE_CHECK_MS = 20_000;
const NOTIFY_BODY_MAX = 140;

type EventDraft = ChatEvent extends infer E ? (E extends ChatEvent ? Omit<E, "v" | "id" | "from" | "at"> : never) : never;

/** Secondi di studio di oggi su questo computer, con la sessione in corso. */
function myStudyToday(): number {
  const activity = getActivity();
  const now = Date.now();
  const running = activity.studyTimer
    ? unsavedStudySeconds(buildPresence(activity.studyTimer, { offsetMs: 0, now, subject: null, room: null }), now)
    : 0;
  return activity.studyTodaySeconds + running;
}

/**
 * I Messaggi dal vivo nei canali `group:<id>:chat` (broadcast): niente sul server, tutto in memoria finché l'app è
 * aperta. Manda i messaggi di sistema propri ("è entrato nel gruppo", "ha studiato N ore") e la notifica dei
 * messaggi nuovi. Attivo solo con l'account pronto.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const { settings } = useSettings();
  const { groups, members } = useGroups();
  const activeUser = status.kind === "ready" ? userId : null;
  const [chats, setChats] = useState<Record<string, GroupChat>>({});
  const [channels, setChannels] = useState<Record<string, ChannelState>>({});
  const [offsetMs, setOffsetMs] = useState(0);
  const hubRef = useRef<ChatHub | null>(null);
  const chatsRef = useRef<Record<string, GroupChat>>({});
  const offsetRef = useRef(0);
  const viewingRef = useRef<string | null>(null);
  const lastSentRef = useRef<number | null>(null);
  const notifiedRef = useRef<Record<string, number>>({});
  const announcedRef = useRef(new Set<string>());

  const chatGroups = groups.filter((g) => g.features.includes(CHAT_FEATURE_KEY));
  const groupKey = chatGroups.map((g) => g.id).join(",");
  const groupKeyRef = useLatestRef(groupKey);
  const groupsRef = useLatestRef(chatGroups);
  const membersRef = useLatestRef(members);
  const settingsRef = useLatestRef(settings);

  const commit = useCallback((groupId: string, chat: GroupChat) => {
    chatsRef.current = { ...chatsRef.current, [groupId]: chat };
    setChats(chatsRef.current);
  }, []);

  const isMember = useCallback(
    (groupId: string) => (id: string) => (membersRef.current[groupId] ?? []).some((m) => m.userId === id),
    [membersRef]
  );

  const notify = useCallback(
    (groupId: string, event: ChatEvent) => {
      if (event.t !== "msg" || !settingsRef.current.groupsNotifyMessages) return;
      if (viewingRef.current === groupId && document.hasFocus()) return;
      const now = Date.now();
      if (now - (notifiedRef.current[groupId] ?? -Infinity) < NOTIFY_INTERVAL_MS) return;
      notifiedRef.current[groupId] = now;
      const group = groupsRef.current.find((g) => g.id === groupId);
      const author = (membersRef.current[groupId] ?? []).find((m) => m.userId === event.from)?.username ?? "";
      const text = event.text.length > NOTIFY_BODY_MAX ? `${event.text.slice(0, NOTIFY_BODY_MAX - 1)}…` : event.text;
      void sendAppNotification({ kind: "groupMessage", title: group?.name ?? "Messaggi", body: `${author}: ${text}` });
    },
    [settingsRef, groupsRef, membersRef]
  );

  /** Applica un evento (ricevuto o appena mandato) alla chat del gruppo. */
  const apply = useCallback(
    (groupId: string, event: ChatEvent, me: string) => {
      const chat = chatsRef.current[groupId] ?? EMPTY_CHAT;
      const next = applyChatEvent(chat, event, { isMember: isMember(groupId), me, countUnread: viewingRef.current !== groupId });
      if (next === chat) return false;
      commit(groupId, next);
      return true;
    },
    [commit, isMember]
  );

  /** Manda un evento proprio (`id`: nuovo, o del messaggio per del e react) e, se il server lo conferma, lo mostra anche qui (il canale non rimanda i propri). */
  const emit = useCallback(
    async (groupId: string, draft: EventDraft, id: string = newEventId()): Promise<boolean> => {
      const hub = hubRef.current;
      if (!hub || !activeUser) return false;
      const event = { ...draft, v: 1, id, from: activeUser, at: Date.now() + offsetRef.current } as ChatEvent;
      if (!(await hub.send(groupId, event as unknown as Record<string, unknown>))) return false;
      apply(groupId, event, activeUser);
      return true;
    },
    [activeUser, apply]
  );
  const emitRef = useLatestRef(emit);

  useEffect(() => {
    if (!activeUser) return;
    let disposed = false;
    const hub = new ChatHub({
      join: (groupId, listeners) => joinBroadcastChannel(groupId, CHAT_FEATURE_KEY, listeners),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      onMessage: (groupId, payload) => {
        if (disposed) return;
        const event = parseChatEvent(payload, Date.now() + offsetRef.current);
        if (!event || event.from === activeUser) return;
        if (apply(groupId, event, activeUser)) notify(groupId, event);
      },
      onChannels: (value) => {
        if (disposed) return;
        setChannels(value);
        // appena entrato in un gruppo: lo si dice una volta, a chi c'è
        const serverNow = Date.now() + offsetRef.current;
        for (const [groupId, state] of Object.entries(value)) {
          if (state !== "joined" || announcedRef.current.has(groupId)) continue;
          announcedRef.current.add(groupId);
          const me = (membersRef.current[groupId] ?? []).find((m) => m.userId === activeUser);
          if (me && serverNow - me.joinedAt < JOINED_WINDOW_MS) void emitRef.current(groupId, { t: "sys", sys: "joined" });
        }
      },
    });
    hubRef.current = hub;
    openChannels(hub, groupKeyRef.current);
    const stopClock = startClockSync((offset) => {
      if (disposed) return;
      offsetRef.current = offset;
      setOffsetMs(offset);
    });
    return () => {
      disposed = true;
      stopClock();
      hub.stop();
      hubRef.current = null;
      chatsRef.current = {};
      announcedRef.current = new Set();
      setChats({});
      setChannels({});
    };
  }, [activeUser, apply, notify, groupKeyRef, membersRef, emitRef]);

  useEffect(() => {
    if (hubRef.current) openChannels(hubRef.current, groupKey);
  }, [groupKey]);

  // "ha studiato N ore": solo nei gruppi con lo studio insieme (lì i tempi sono già condivisi)
  useEffect(() => {
    if (!activeUser) return;
    let prev = myStudyToday();
    const timer = window.setInterval(() => {
      const current = myStudyToday();
      const hours = crossedStudyHour(prev, current);
      prev = current;
      if (hours === null) return;
      const day = dayKey(new Date());
      void loadLastMilestone(activeUser)
        .then(async (last) => {
          if (alreadyAnnounced(last, day, hours)) return;
          await saveLastMilestone(activeUser, day, hours);
          for (const g of groupsRef.current) {
            if (g.features.includes(STUDY_FEATURE_KEY)) void emitRef.current(g.id, { t: "sys", sys: "studied", hours });
          }
        })
        .catch(() => {});
    }, MILESTONE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [activeUser, groupsRef, emitRef]);

  const send = useCallback(
    async (groupId: string, raw: string): Promise<ChatSendError | null> => {
      const text = cleanMessageText(raw);
      if (!text) return "empty";
      if (text.length > MESSAGE_MAX) return "too_long";
      if (!hubRef.current?.isJoined(groupId)) return "offline";
      const now = Date.now();
      if (!canSendAt(lastSentRef.current, now)) return "too_fast";
      lastSentRef.current = now;
      return (await emit(groupId, { t: "msg", text })) ? null : "failed";
    },
    [emit]
  );

  const remove = useCallback((groupId: string, messageId: string) => emit(groupId, { t: "del" }, messageId), [emit]);
  const react = useCallback(
    (groupId: string, messageId: string, kind: ReactionKind, on: boolean) => emit(groupId, { t: "react", kind, on }, messageId),
    [emit]
  );

  const setViewing = useCallback(
    (groupId: string | null) => {
      viewingRef.current = groupId;
      const chat = groupId ? chatsRef.current[groupId] : undefined;
      if (groupId && chat && chat.unread > 0) commit(groupId, { ...chat, unread: 0 });
    },
    [commit]
  );

  const value = useMemo<ChatValue>(
    () => ({ chats, channels, offsetMs, send, remove, react, setViewing }),
    [chats, channels, offsetMs, send, remove, react, setViewing]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

