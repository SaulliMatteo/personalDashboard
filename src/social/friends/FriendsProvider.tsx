import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listenDeepLinks } from "../../core/cloud/auth";
import { retryDelayMs } from "../../core/cloud/backoff";
import { CloudError, toCloudError } from "../../core/cloud/errors";
import * as api from "../../core/cloud/friendsApi";
import { authorizeRealtime } from "../../core/cloud/presence";
import { useCloud } from "../../core/cloud/useCloud";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import type { PlacedChatAction } from "../../core/widgets/chatActions";
import { onFriendsPanelRequest, requestFriendsPanel, type FriendsPanelRequest } from "../../core/nav/friendsPanel";
import { postInAppNotification } from "../../core/notify/inbox";
import { sendAppNotification } from "../../core/notify/notifier";
import { cleanMessageText } from "../modules/chat/payload";
import {
  DM_TEXT_MAX,
  EMPTY_FRIENDS,
  applyRead,
  attentionCount,
  lastIncomingAt,
  parseFriendLink,
  parseInboxEvent,
  previewText,
  readUntilOf,
  upsertMessage,
  type FriendsData,
  type InboxEvent,
} from "./friendsStore";
import { FriendsContext, type FriendsContextValue, type FriendsPanelState, type FriendsStatus } from "./useFriends";

/** Al rientro in primo piano si rilegge tutto se l'ultima lettura è più vecchia di così. */
const STALE_MS = 30_000;

const CLOSED_PANEL: FriendsPanelState = { open: false, chat: null, add: false, addCode: "" };

/**
 * Amici e chat salvate (docs/design/amici-notifiche.html): legge amici, richieste, messaggi e letture dal server,
 * ascolta la propria casella in tempo reale e tiene lo stato del pannello. Inerte senza account pronto.
 * Nessun messaggio va perso: oltre al tempo reale si rilegge tutto all'avvio, al rientro in primo piano, quando torna
 * la rete e quando la casella si riallaccia.
 */
interface FriendsProviderProps {
  /** Le azioni dei widget nella chat (le raccoglie app/App.tsx: social non importa i widget). */
  actions: readonly PlacedChatAction[];
  children: ReactNode;
}

export function FriendsProvider({ actions, children }: FriendsProviderProps) {
  const cloud = useCloud();
  const me = cloud.status.kind === "ready" ? cloud.userId : null;
  const [data, setData] = useState<FriendsData>(EMPTY_FRIENDS);
  const [status, setStatus] = useState<FriendsStatus>("off");
  const [panel, setPanel] = useState<FriendsPanelState>(CLOSED_PANEL);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => !document.hidden);
  const dataRef = useLatestRef(data);
  const panelRef = useLatestRef(panel);
  const visibleRef = useLatestRef(visible);
  const lastLoadRef = useRef(0);
  // una riga per anteprime e notifiche delle schede (null = scheda sconosciuta o non valida)
  const describeCard = useCallback(
    (kind: string, payload: unknown) => actions.find((a) => a.kind === kind)?.describe(payload) ?? null,
    [actions]
  );
  const describeRef = useLatestRef(describeCard);
  const loadSeq = useRef(0);

  /* ---------- Lettura ---------- */

  const load = useCallback(async (): Promise<FriendsData | null> => {
    if (!me) return null;
    const seq = ++loadSeq.current;
    lastLoadRef.current = Date.now();
    try {
      const [friends, requests, messages, reads] = await Promise.all([
        api.fetchFriends(me),
        api.fetchFriendRequests(me),
        api.fetchDirectMessages(),
        api.fetchDirectReads(),
      ]);
      if (seq !== loadSeq.current) return null;
      const next = { friends, requests, messages, reads };
      setData(next);
      setStatus("ready");
      return next;
    } catch (e) {
      if (seq !== loadSeq.current) return null;
      console.error("Amici non letti:", toCloudError(e).code);
      setStatus((s) => (s === "off" ? s : "offline"));
      return null;
    }
  }, [me]);
  const loadRef = useLatestRef(load);

  // account cambiato: si riparte da capo (durante il render, così non si vede mai l'account di prima)
  const [owner, setOwner] = useState<string | null>(null);
  if (owner !== me) {
    setOwner(me);
    setData(EMPTY_FRIENDS);
    setMyCode(null);
    setStatus(me ? "loading" : "off");
    setPanel((p) => ({ ...p, chat: null }));
  }
  useEffect(() => {
    // una lettura ancora in corso per l'account di prima non vale più
    loadSeq.current++;
    if (me) void loadRef.current();
  }, [me, loadRef]);

  /* ---------- Eventi della casella ---------- */

  const isViewing = useCallback(
    (friendId: string) => panelRef.current.open && panelRef.current.chat === friendId && visibleRef.current,
    [panelRef, visibleRef]
  );

  const usernameOf = useCallback(
    (userId: string) =>
      dataRef.current.friends.find((f) => f.userId === userId)?.username ??
      dataRef.current.requests.find((r) => r.userId === userId)?.username ??
      "",
    [dataRef]
  );

  const onEvent = useCallback(
    async (event: InboxEvent) => {
      if (!me) return;
      switch (event.t) {
        case "dm": {
          const m = event.message;
          const isNew = !dataRef.current.messages.some((x) => x.id === m.id);
          setData((d) => ({ ...d, messages: upsertMessage(d.messages, m) }));
          if (isNew && m.sender !== me && !m.deleted && !isViewing(m.sender)) {
            void sendAppNotification({
              kind: "friendMessage",
              title: usernameOf(m.sender) || "Un amico",
              body: previewText(m, me, describeRef.current),
              open: { type: "friends", userId: m.sender },
              // i messaggi di testo restano nella chat; le schede (video, note, inviti) anche nella campanella
              inbox: m.kind !== "text",
            });
          }
          return;
        }
        case "read": {
          // "friend" c'è quando a leggere sono io da un altro dispositivo; altrimenti è l'amico che ha letto me
          const read = event.friend
            ? { userId: event.by, friendId: event.friend, readUntil: event.until }
            : { userId: event.by, friendId: me, readUntil: event.until };
          setData((d) => ({ ...d, reads: applyRead(d.reads, read) }));
          return;
        }
        case "request": {
          const requests = await api.fetchFriendRequests(me).catch(() => null);
          if (!requests) return;
          setData((d) => ({ ...d, requests }));
          const from = requests.find((r) => r.userId === event.from && r.direction === "in");
          if (from) {
            void sendAppNotification({
              kind: "friendRequest",
              title: `${from.username} vuole essere tuo amico`,
              body: "Ha usato il tuo codice. Accetta o rifiuta dagli amici.",
              open: { type: "friends" },
            });
          }
          return;
        }
        case "accepted": {
          const fresh = await loadRef.current();
          const name = fresh?.friends.find((f) => f.userId === event.by)?.username;
          if (name) {
            void postInAppNotification({
              kind: "friendAccepted",
              title: `${name} ha accettato la tua richiesta`,
              body: "Ora siete amici: potete scrivervi.",
              open: { type: "friends", userId: event.by },
            });
          }
          return;
        }
        case "friends":
          await loadRef.current();
      }
    },
    [me, dataRef, describeRef, isViewing, usernameOf, loadRef]
  );
  const onEventRef = useLatestRef(onEvent);

  // la casella: si entra, e se cade si riprova con attesa crescente (subito al rientro e col ritorno della rete)
  useEffect(() => {
    if (!me) return;
    let stopped = false;
    let failures = 0;
    let joinedOnce = false;
    let channel: api.InboxChannel | null = null;
    let timer: number | undefined;

    const connect = async () => {
      window.clearTimeout(timer);
      if (channel) return;
      await authorizeRealtime().catch(() => {});
      if (stopped || channel) return;
      const current = api.joinInbox(me, {
        event: (payload) => {
          const event = parseInboxEvent(payload);
          if (event) void onEventRef.current(event);
        },
        status: (s) => {
          if (stopped || channel !== current) return;
          if (s === "joined") {
            failures = 0;
            // riallacciata: ciò che è arrivato nel frattempo si legge da capo
            if (joinedOnce) void loadRef.current();
            joinedOnce = true;
            return;
          }
          channel = null;
          void current.leave();
          timer = window.setTimeout(() => void connect(), retryDelayMs(failures++));
        },
      });
      channel = current;
    };

    const wake = () => {
      if (document.hidden) return;
      if (Date.now() - lastLoadRef.current > STALE_MS) void loadRef.current();
      failures = 0;
      if (!channel) void connect();
    };
    const onOnline = () => {
      lastLoadRef.current = 0;
      wake();
    };

    void connect();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", onOnline);
      void channel?.leave();
    };
  }, [me, onEventRef, loadRef]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* ---------- Letto ---------- */

  const viewingChat = panel.open && visible ? panel.chat : null;
  const lastIncoming = me && viewingChat ? lastIncomingAt(data.messages, me, viewingChat) : null;
  const readUntil = me && viewingChat ? readUntilOf(data.reads, me, viewingChat) : 0;
  useEffect(() => {
    if (!me || !viewingChat || lastIncoming === null || lastIncoming <= readUntil) return;
    api
      .markDirectRead(viewingChat, lastIncoming)
      .then(() =>
        setData((d) => ({ ...d, reads: applyRead(d.reads, { userId: me, friendId: viewingChat, readUntil: lastIncoming }) }))
      )
      .catch(() => {});
  }, [me, viewingChat, lastIncoming, readUntil]);

  /* ---------- Pannello, link e notifiche ---------- */

  const openPanel = useCallback((request: FriendsPanelRequest = {}) => {
    setPanel((p) => ({
      open: true,
      chat: request.userId ?? p.chat,
      add: request.add === true || request.code !== undefined,
      addCode: request.code ?? "",
    }));
  }, []);

  useEffect(() => onFriendsPanelRequest(openPanel), [openPanel]);

  // personaldashboard://amici/<codice>: apre "Aggiungi un amico" col codice già scritto
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void listenDeepLinks((url) => {
      const code = parseFriendLink(url);
      if (code) requestFriendsPanel({ code });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const closePanel = useCallback(() => setPanel((p) => ({ ...p, open: false, add: false, addCode: "" })), []);
  const openChat = useCallback((friendId: string | null) => setPanel((p) => ({ ...p, chat: friendId })), []);
  const closeAdd = useCallback(() => setPanel((p) => ({ ...p, add: false, addCode: "" })), []);

  /* ---------- Azioni ---------- */

  const guard = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    try {
      return await task();
    } catch (e) {
      throw toCloudError(e);
    }
  }, []);

  const sendCard = useCallback(
    (friendId: string, kind: string, body: string, payload: unknown) =>
      guard(async () => {
        try {
          const m = await api.sendDirectMessage(friendId, kind, body, payload);
          setData((d) => ({ ...d, messages: upsertMessage(d.messages, m) }));
          return m.id;
        } catch (e) {
          const err = toCloudError(e);
          throw err.code === "rate_limited" ? new CloudError("dm_rate_limited") : err;
        }
      }),
    [guard]
  );

  const sendText = useCallback(
    async (friendId: string, text: string) => {
      const clean = cleanMessageText(text);
      if (!clean) throw new CloudError("invalid_message");
      if (clean.length > DM_TEXT_MAX) throw new CloudError("message_too_long");
      await sendCard(friendId, "text", clean, null);
    },
    [sendCard]
  );

  const deleteMessage = useCallback(
    (id: string) =>
      guard(async () => {
        await api.deleteDirectMessage(id);
        setData((d) => ({
          ...d,
          messages: d.messages.map((m) => (m.id === id ? { ...m, deleted: true, body: "", payload: null } : m)),
        }));
      }),
    [guard]
  );

  const requestFriend = useCallback(
    (code: string) =>
      guard(async () => {
        const result = await api.requestFriend(code);
        if (result === "sent" || result === "accepted") void loadRef.current();
        return result;
      }),
    [guard, loadRef]
  );

  const answerRequest = useCallback(
    (userId: string, accept: boolean) =>
      guard(async () => {
        await api.answerFriend(userId, accept);
        await loadRef.current();
      }),
    [guard, loadRef]
  );

  const cancelRequest = useCallback(
    (userId: string) =>
      guard(async () => {
        await api.cancelFriendRequest(userId);
        setData((d) => ({ ...d, requests: d.requests.filter((r) => !(r.userId === userId && r.direction === "out")) }));
      }),
    [guard]
  );

  const removeFriend = useCallback(
    (userId: string) =>
      guard(async () => {
        await api.removeFriend(userId);
        setPanel((p) => (p.chat === userId ? { ...p, chat: null } : p));
        await loadRef.current();
      }),
    [guard, loadRef]
  );

  const loadMyCode = useCallback(
    () =>
      guard(async () => {
        setMyCode(await api.fetchMyFriendCode());
      }),
    [guard]
  );

  const regenerateCode = useCallback(
    () =>
      guard(async () => {
        setMyCode(await api.regenerateFriendCode());
      }),
    [guard]
  );

  const reload = useCallback(() => void loadRef.current(), [loadRef]);

  const attention = me ? attentionCount(data, me) : 0;

  const value = useMemo<FriendsContextValue>(
    () => ({
      status,
      me,
      data,
      attention,
      panel,
      openPanel,
      closePanel,
      openChat,
      closeAdd,
      sendText,
      sendCard,
      actions,
      describeCard,
      deleteMessage,
      requestFriend,
      answerRequest,
      cancelRequest,
      removeFriend,
      myCode,
      loadMyCode,
      regenerateCode,
      reload,
    }),
    [
      status,
      me,
      data,
      attention,
      panel,
      openPanel,
      closePanel,
      openChat,
      closeAdd,
      sendText,
      sendCard,
      actions,
      describeCard,
      deleteMessage,
      requestFriend,
      answerRequest,
      cancelRequest,
      removeFriend,
      myCode,
      loadMyCode,
      regenerateCode,
      reload,
    ]
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}
