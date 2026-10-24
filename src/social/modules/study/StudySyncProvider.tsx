import { useEffect, type ReactNode } from "react";
import { getActivity, subscribeActivity } from "../../../core/activity/activityBus";
import { touchDevice } from "../../../core/cloud/accountApi";
import { toCloudError } from "../../../core/cloud/errors";
import { upsertStudyTotals } from "../../../core/cloud/studyTotalsApi";
import { useCloud } from "../../../core/cloud/useCloud";
import { getDeviceId } from "../../../core/db";
import { getSessionSpansBetween, loadLastSync, saveLastSync } from "./data/studyTotalsRepository";
import { StudySync, type SyncFailure } from "./sync/studySync";

/** Dopo una sessione registrata si aspetta un attimo: più cambi ravvicinati diventano un solo invio. */
const CHANGE_DELAY_MS = 5_000;

function classifyError(error: unknown): SyncFailure {
  const { code } = toCloudError(error);
  if (code === "unreachable") return "unreachable";
  if (code === "auth") return "auth";
  // solo il nostro codice: il testo del server non va nei log
  console.warn(`Gruppi: invio dei totali di studio non riuscito (${code})`);
  return "other";
}

/**
 * Manda al server i totali giornalieri di studio di questo computer, solo con l'account pronto.
 * Trigger: avvio, sessione registrata (i secondi di oggi sul bus cambiano), ritorno della rete, ogni 15 min.
 */
export function StudySyncProvider({ children }: { children: ReactNode }) {
  const { status, userId, retry } = useCloud();
  const activeUser = status.kind === "ready" ? userId : null;

  useEffect(() => {
    if (!activeUser) return;
    const sync = new StudySync({
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      loadSessions: getSessionSpansBetween,
      loadLastSync: () => loadLastSync(activeUser),
      saveLastSync: (at) => saveLastSync(activeUser, at),
      registerDevice: async () => touchDevice(await getDeviceId(activeUser)),
      upload: async (totals) => upsertStudyTotals(activeUser, await getDeviceId(activeUser), totals),
      classifyError,
      // l'account rilegge la sessione: se non vale più esce, e questo effect si ferma
      onAuthError: retry,
    });
    sync.request(0);

    let todaySeconds = getActivity().studyTodaySeconds;
    const unsubscribe = subscribeActivity(() => {
      const seconds = getActivity().studyTodaySeconds;
      if (seconds === todaySeconds) return;
      todaySeconds = seconds;
      sync.request(CHANGE_DELAY_MS);
    });
    const onOnline = () => sync.retryNow();
    window.addEventListener("online", onOnline);
    return () => {
      sync.stop();
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [activeUser, retry]);

  return children;
}
