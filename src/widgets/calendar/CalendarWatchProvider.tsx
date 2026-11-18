import type { ReactNode } from "react";
import { useCalendarWatch } from "./hooks/useCalendarWatch";

/** Sempre montato (provider del widget): promemoria e momenti per il Companion, vedi useCalendarWatch. */
function CalendarWatchProvider({ children }: { children: ReactNode }) {
  useCalendarWatch();
  return children;
}

export default CalendarWatchProvider;
