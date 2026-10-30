import { useEffect, useRef, type ReactNode } from "react";
import { fetchSubjectReportConsent } from "../../../../core/cloud/groupSubjectsApi";
import { useCloud } from "../../../../core/cloud/useCloud";
import { useLatestRef } from "../../../../core/hooks/useLatestRef";
import { useSettings } from "../../../../core/settings/useSettings";
import { loadSubjectPending, updateSubjectPending } from "../data/subjectLinksRepository";
import { useStudySync } from "../useStudySync";

/**
 * L'interruttore "Includi le mie materie nei report dei gruppi" è una copia locale del consenso dell'account (sul
 * server, uguale per tutti i dispositivi):
 *  - all'accesso vale quello del server, salvo un cambio fatto qui e non ancora mandato;
 *  - un cambio dall'interruttore diventa un'operazione in sospeso (sopravvive a rete assente e riavvii) e parte
 *    subito; acceso, rimanda anche lo storico delle materie abbinate. Spento, l'invio per materia si ferma subito.
 */
export function SubjectConsentProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const { settings, updateSetting } = useSettings();
  const { requestSync } = useStudySync();
  const activeUser = status.kind === "ready" ? userId : null;
  const enabled = settings.groupsReportSubjects;
  const enabledRef = useLatestRef(enabled);
  const previous = useRef(enabled);
  // il prossimo cambio arriva dal server: non va rimandato
  const fromServer = useRef(false);

  useEffect(() => {
    if (!activeUser) return;
    let disposed = false;
    Promise.all([fetchSubjectReportConsent(activeUser), loadSubjectPending(activeUser)])
      .then(([server, pending]) => {
        if (disposed || pending.consent !== undefined || server === enabledRef.current) return;
        fromServer.current = true;
        updateSetting("groupsReportSubjects", server);
      })
      // senza rete resta la copia locale; ci si riprova al prossimo accesso
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [activeUser, enabledRef, updateSetting]);

  useEffect(() => {
    if (previous.current === enabled) return;
    previous.current = enabled;
    if (fromServer.current) {
      fromServer.current = false;
      return;
    }
    if (!activeUser) return;
    void updateSubjectPending(activeUser, (p) => ({ ...p, consent: enabled, backfillAt: enabled ? Date.now() : p.backfillAt }))
      .then(() => requestSync(0))
      .catch(() => undefined);
  }, [enabled, activeUser, requestSync]);

  return children;
}
