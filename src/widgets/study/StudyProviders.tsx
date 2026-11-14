import type { ReactNode } from "react";
import ProgressionProvider from "./progression/ProgressionProvider";
import { TimerProvider } from "./timer/TimerContext";

/** Il timer e, dentro, la progressione (che legge materie e sessioni di oggi dal timer). */
function StudyProviders({ children }: { children: ReactNode }) {
  return (
    <TimerProvider>
      <ProgressionProvider>{children}</ProgressionProvider>
    </TimerProvider>
  );
}

export default StudyProviders;
