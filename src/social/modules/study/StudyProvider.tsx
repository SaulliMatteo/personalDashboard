import type { ReactNode } from "react";
import { StudySyncProvider } from "./StudySyncProvider";
import { StudyPresenceProvider } from "./presence/StudyPresenceProvider";
import { StudyTotalsProvider } from "./totals/StudyTotalsProvider";

/** Tutto il lavoro in sottofondo del modulo Studio: invio dei totali, presenza live e totali dei compagni. */
export function StudyProvider({ children }: { children: ReactNode }) {
  return (
    <StudySyncProvider>
      <StudyPresenceProvider>
        <StudyTotalsProvider>{children}</StudyTotalsProvider>
      </StudyPresenceProvider>
    </StudySyncProvider>
  );
}
