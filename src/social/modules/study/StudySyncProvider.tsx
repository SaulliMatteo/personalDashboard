import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { getActivity, subscribeActivity } from "../../../core/activity/activityBus";
import { touchDevice } from "../../../core/cloud/accountApi";
import { toCloudError } from "../../../core/cloud/errors";
import {
  fetchGroupSubjects,
  revokeGroupSubjectTotals,
  setSubjectReportConsent,
  syncGroupSubjectTotals,
} from "../../../core/cloud/groupSubjectsApi";
import { fetchDeviceStudyDays, upsertStudyTotals } from "../../../core/cloud/studyTotalsApi";
import { useCloud } from "../../../core/cloud/useCloud";
import { getDeviceId } from "../../../core/db";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { useSettings } from "../../../core/settings/useSettings";
import { useGroups } from "../../groups/useGroups";
import {
  dropGroupSubjectLinks,
  dropSubjectLinksTo,
  getSubjectSessionsBetween,
  loadSubjectLinks,
  retargetSubjectLinks,
  updateSubjectPending,
} from "./data/subjectLinksRepository";
import { getSessionSpansBetween, loadLastSync, saveLastSync } from "./data/studyTotalsRepository";
import { STUDY_FEATURE_KEY } from "./feature";
import { syncGroupSubjects } from "./subjects/subjectSync";
import { StudySync, type SyncFailure } from "./sync/studySync";
import { StudySyncContext, type StudySyncValue } from "./useStudySync";

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
 * Manda al server i totali giornalieri di studio di questo computer, solo con l'account pronto, e subito dopo il
 * report per materie (consenso, revoche, righe per materia del gruppo: subjects/subjectSync.ts).
 * Trigger: avvio, sessione registrata (i secondi di oggi sul bus cambiano), ritorno della rete, ogni 15 min,
 * `requestSync` (abbinamenti e consenso cambiati dalla pagina Gruppi).
 */
export function StudySyncProvider({ children }: { children: ReactNode }) {
  const { status, userId, retry } = useCloud();
  const { settings, updateSetting } = useSettings();
  const { groups, loaded } = useGroups();
  const activeUser = status.kind === "ready" ? userId : null;
  const syncRef = useRef<StudySync | null>(null);

  // letti nel giro di invio, che dura più di un render
  const consentRef = useLatestRef(settings.groupsReportSubjects);
  const groupIdsRef = useLatestRef(loaded ? groups.filter((g) => g.features.includes(STUDY_FEATURE_KEY)).map((g) => g.id) : null);
  const updateSettingRef = useLatestRef(updateSetting);

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
      afterUpload: (days) =>
        syncGroupSubjects(
          {
            now: () => Date.now(),
            consentEnabled: () => consentRef.current,
            groupIds: () => groupIdsRef.current,
            updatePending: (change) => updateSubjectPending(activeUser, change),
            pushConsent: setSubjectReportConsent,
            revoke: revokeGroupSubjectTotals,
            fetchSubjects: fetchGroupSubjects,
            loadLinks: () => loadSubjectLinks(activeUser),
            retargetLinks: (groupId, fromId, toId) => retargetSubjectLinks(activeUser, groupId, fromId, toId),
            dropLinksTo: (groupId, subjectId) => dropSubjectLinksTo(activeUser, groupId, subjectId),
            dropGroupLinks: (groupId) => dropGroupSubjectLinks(activeUser, groupId),
            fetchDeviceDays: async (fromDay) => fetchDeviceStudyDays(activeUser, await getDeviceId(activeUser), fromDay),
            loadSessions: getSubjectSessionsBetween,
            uploadDaily: async (totals) => upsertStudyTotals(activeUser, await getDeviceId(activeUser), totals),
            upload: async (groupId, days, rows) => syncGroupSubjectTotals(await getDeviceId(activeUser), groupId, days, rows),
            onDisabledByServer: () => updateSettingRef.current("groupsReportSubjects", false),
          },
          days
        ),
      classifyError,
      // l'account rilegge la sessione: se non vale più esce, e questo effect si ferma
      onAuthError: retry,
    });
    syncRef.current = sync;
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
      if (syncRef.current === sync) syncRef.current = null;
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [activeUser, retry, consentRef, groupIdsRef, updateSettingRef]);

  const context = useMemo<StudySyncValue>(
    () => ({
      requestSync: (delayMs = 0) => {
        syncRef.current?.request(delayMs);
      },
    }),
    []
  );

  return <StudySyncContext.Provider value={context}>{children}</StudySyncContext.Provider>;
}
