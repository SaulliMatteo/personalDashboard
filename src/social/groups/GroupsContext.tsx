import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchLastSeen } from "../../core/cloud/accountApi";
import { retryDelayMs } from "../../core/cloud/backoff";
import * as api from "../../core/cloud/groupsApi";
import type { CloudGroup, CloudGroupMember } from "../../core/cloud/groupsApi";
import { useCloud } from "../../core/cloud/useCloud";
import { loadSelectedGroup, saveSelectedGroup } from "./data/groupsRepository";
import { GroupsContext, type GroupsValue } from "./useGroups";

/** Ogni quanto si rileggono gruppi, membri e "visto fa" (le azioni e il ritorno della rete rileggono subito). */
const REFRESH_MS = 5 * 60_000;

interface Loaded {
  groups: CloudGroup[];
  members: Record<string, CloudGroupMember[]>;
  lastSeen: Record<string, number>;
  loadedAt: number;
}

/** Stato legato all'account che l'ha prodotto: cambiando account quello vecchio smette di valere da solo. */
interface ForUser<T> {
  userId: string;
  value: T;
}

async function loadAll(): Promise<Loaded> {
  const groups = await api.fetchMyGroups();
  const list = await api.fetchGroupMembers(groups.map((g) => g.id));
  const members: Record<string, CloudGroupMember[]> = {};
  for (const g of groups) members[g.id] = [];
  for (const m of list) members[m.groupId]?.push(m);
  const lastSeen = await fetchLastSeen([...new Set(list.map((m) => m.userId))]);
  return { groups, members, lastSeen, loadedAt: Date.now() };
}

/**
 * I propri gruppi e i loro membri: il nucleo dei Gruppi, sotto tutti i moduli (social/SocialProviders.tsx).
 * Si legge solo con l'account pronto; se il server non risponde restano gli ultimi dati, segnati come vecchi.
 */
export function GroupsProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const ready = status.kind === "ready";
  const [loaded, setLoaded] = useState<ForUser<Loaded> | null>(null);
  const [failed, setFailed] = useState<ForUser<boolean> | null>(null);
  const [selected, setSelected] = useState<ForUser<string> | null>(null);
  const reloadRef = useRef<() => Promise<Loaded | null>>(async () => null);
  const groupIdsRef = useRef<string[]>([]);

  // La scelta del gruppo fatta l'ultima volta con questo account.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadSelectedGroup(userId)
      .then((id) => {
        if (!cancelled && id) setSelected((current) => (current?.userId === userId ? current : { userId, value: id }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    let disposed = false;
    let timer: number | undefined;
    let failures = 0;
    const load = async (): Promise<Loaded | null> => {
      window.clearTimeout(timer);
      try {
        const next = await loadAll();
        if (disposed) return null;
        failures = 0;
        groupIdsRef.current = next.groups.map((g) => g.id);
        setLoaded({ userId, value: next });
        setFailed({ userId, value: false });
        timer = window.setTimeout(() => void load(), REFRESH_MS);
        return next;
      } catch {
        // restano i dati di prima: la UI li mostra come "ultimo dato alle…"
        if (disposed) return null;
        setFailed({ userId, value: true });
        timer = window.setTimeout(() => void load(), retryDelayMs(failures++));
        return null;
      }
    };
    reloadRef.current = load;
    void load();
    const onOnline = () => {
      failures = 0;
      void load();
    };
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      reloadRef.current = async () => null;
    };
  }, [ready, userId]);

  const selectGroup = useCallback(
    (groupId: string) => {
      if (!userId) return;
      setSelected({ userId, value: groupId });
      saveSelectedGroup(userId, groupId).catch(() => {});
    },
    [userId]
  );

  const reload = useCallback(() => void reloadRef.current(), []);

  const createGroup = useCallback(
    async (name: string, description: string) => {
      const id = await api.createGroup(name, description);
      selectGroup(id);
      await reloadRef.current();
    },
    [selectGroup]
  );

  const joinGroup = useCallback(
    async (code: string) => {
      const before = new Set(groupIdsRef.current);
      const result = await api.joinGroup(code);
      if (result === "ok") {
        const next = await reloadRef.current();
        const joined = next?.groups.find((g) => !before.has(g.id));
        if (joined) selectGroup(joined.id);
      }
      return result;
    },
    [selectGroup]
  );

  const leaveGroup = useCallback(async (groupId: string) => {
    await api.leaveGroup(groupId);
    await reloadRef.current();
  }, []);

  const removeMember = useCallback(async (groupId: string, memberId: string) => {
    await api.removeMember(groupId, memberId);
    await reloadRef.current();
  }, []);

  const regenerateInviteCode = useCallback(async (groupId: string) => {
    await api.regenerateInviteCode(groupId);
    await reloadRef.current();
  }, []);

  const updateGroup = useCallback(async (groupId: string, name: string, description: string) => {
    await api.updateGroup(groupId, name, description);
    await reloadRef.current();
  }, []);

  const value = useMemo<GroupsValue>(() => {
    const data = loaded && loaded.userId === userId ? loaded.value : null;
    const stale = failed !== null && failed.userId === userId && failed.value;
    const selectedId = selected && selected.userId === userId ? selected.value : null;
    const groups = data?.groups ?? [];
    return {
      groups,
      members: data?.members ?? {},
      lastSeen: data?.lastSeen ?? {},
      loaded: data !== null,
      stale,
      loadedAt: data?.loadedAt ?? null,
      selectedGroup: groups.find((g) => g.id === selectedId) ?? groups[0] ?? null,
      selectGroup,
      reload,
      createGroup,
      joinGroup,
      leaveGroup,
      removeMember,
      regenerateInviteCode,
      updateGroup,
    };
  }, [loaded, failed, selected, userId, selectGroup, reload, createGroup, joinGroup, leaveGroup, removeMember, regenerateInviteCode, updateGroup]);

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}
