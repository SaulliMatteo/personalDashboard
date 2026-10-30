import type { ReactNode } from "react";
import { StudySyncProvider } from "./StudySyncProvider";
import { StudyPresenceProvider } from "./presence/StudyPresenceProvider";
import { SubjectConsentProvider } from "./subjects/SubjectConsentProvider";
import { StudyTotalsProvider } from "./totals/StudyTotalsProvider";

/**
 * Tutto il lavoro in sottofondo del modulo Studio: invio dei totali (e del report per materie, con il consenso
 * dell'account), presenza live e totali dei compagni.
 */
export function StudyProvider({ children }: { children: ReactNode }) {
  return (
    <StudySyncProvider>
      <SubjectConsentProvider>
        <StudyPresenceProvider>
          <StudyTotalsProvider>{children}</StudyTotalsProvider>
        </StudyPresenceProvider>
      </SubjectConsentProvider>
    </StudySyncProvider>
  );
}
