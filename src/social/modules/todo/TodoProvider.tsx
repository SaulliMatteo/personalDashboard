import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { joinPresenceChannel } from "../../../core/cloud/presence";
import { useCloud } from "../../../core/cloud/useCloud";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { useSettings } from "../../../core/settings/useSettings";
import { useGroups } from "../../groups/useGroups";
import { openChannels } from "../../presence/openChannels";
import { PresenceHub, type PresenceSnapshot } from "../../presence/presenceHub";
import { addTodo, deleteTodo, listTodos, purgeDoneBefore, setTodoDone } from "./data/todoRepository";
import { TODO_FEATURE_KEY } from "./feature";
import { buildTodoPresence, nextMidnight, parseTodoChannelState, startOfDay, TODO_TEXT_MAX, type SharedTodo, type TodoItem, type TodoPresence } from "./payload";
import { TodoContext, type TodoValue } from "./useTodo";

/** Chi spunta molte voci di fila manda l'ultimo stato al massimo ogni tanto. */
const MIN_TRACK_INTERVAL_MS = 1000;

interface LocalTodo {
  items: TodoItem[];
  share: boolean;
}

const EMPTY: PresenceSnapshot<TodoPresence> = { members: {}, channels: {} };

/**
 * Il foglietto Da fare: le voci stanno su questo computer (le fatte spariscono il giorno dopo) e, con "Mostra la mia
 * lista Da fare", arrivano dal vivo ai compagni nei canali `group:<id>:todo`. Raccoglie quelli che condividono gli
 * altri. La rete è attiva solo con l'account pronto; il foglietto funziona sempre.
 */
export function TodoProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const { settings } = useSettings();
  const { groups } = useGroups();
  const activeUser = status.kind === "ready" ? userId : null;
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState<PresenceSnapshot<TodoPresence>>(EMPTY);
  const hubRef = useRef<PresenceHub<LocalTodo, TodoPresence> | null>(null);
  const share = settings.groupsShareTodo;
  const local = useMemo<LocalTodo>(() => ({ items, share }), [items, share]);
  const localRef = useLatestRef(local);
  const groupKey = groups
    .filter((g) => g.features.includes(TODO_FEATURE_KEY))
    .map((g) => g.id)
    .join(",");
  const groupKeyRef = useLatestRef(groupKey);

  const reload = useCallback(async () => {
    setItems(await listTodos());
    setLoaded(true);
  }, []);

  // all'avvio e a ogni mezzanotte: via le voci fatte nei giorni prima
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const purge = () => {
      const now = Date.now();
      void purgeDoneBefore(startOfDay(now))
        .then(reload)
        .catch((e) => console.error("Foglietto Da fare non letto:", e));
      timer = window.setTimeout(() => {
        if (!stopped) purge();
      }, nextMidnight(now) - now + 1000);
    };
    purge();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [reload]);

  useEffect(() => {
    hubRef.current?.setLocal(local);
  }, [local]);

  useEffect(() => {
    if (!activeUser) return;
    let disposed = false;
    const next = new PresenceHub<LocalTodo, TodoPresence>(
      {
        now: () => Date.now(),
        join: (groupId, listeners) => joinPresenceChannel(groupId, TODO_FEATURE_KEY, activeUser, listeners),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
        onChange: (value) => {
          if (!disposed) setSnapshot(value);
        },
      },
      {
        build: (value) => buildTodoPresence(value.items, value.share),
        // chi riceve tiene solo chi condivide qualcosa
        parse: (raw) => {
          const parsed: Record<string, TodoPresence> = {};
          for (const [id, list] of Object.entries(parseTodoChannelState(raw))) parsed[id] = { v: 1, items: list };
          return parsed;
        },
      },
      localRef.current,
      { minTrackIntervalMs: MIN_TRACK_INTERVAL_MS, fastPath: { key: activeUser, instance: crypto.randomUUID() } }
    );
    hubRef.current = next;
    openChannels(next, groupKeyRef.current);
    return () => {
      disposed = true;
      next.stop();
      hubRef.current = null;
      setSnapshot(EMPTY);
    };
  }, [activeUser, localRef, groupKeyRef]);

  useEffect(() => {
    if (hubRef.current) openChannels(hubRef.current, groupKey);
  }, [groupKey]);

  const add = useCallback(
    async (text: string) => {
      const clean = text.trim().slice(0, TODO_TEXT_MAX);
      if (!clean) return;
      await addTodo(clean, Date.now());
      await reload();
    },
    [reload]
  );
  const toggle = useCallback(
    async (id: number, done: boolean) => {
      await setTodoDone(id, done, Date.now());
      await reload();
    },
    [reload]
  );
  const remove = useCallback(
    async (id: number) => {
      await deleteTodo(id);
      await reload();
    },
    [reload]
  );

  const shared = useMemo(() => {
    const result: TodoValue["shared"] = {};
    for (const [groupId, people] of Object.entries(snapshot.members)) {
      const group: Record<string, SharedTodo[]> = {};
      for (const [id, p] of Object.entries(people)) if (p.items) group[id] = p.items;
      result[groupId] = group;
    }
    return result;
  }, [snapshot]);

  const value = useMemo<TodoValue>(() => ({ items, loaded, add, toggle, remove, shared }), [items, loaded, add, toggle, remove, shared]);

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>;
}

