import { createContext, useContext } from "react";
import type { AppCategory } from "../../core/system/appCategory";
import type { FocusClass } from "./lib/focus";
import type { ScreenLimit } from "./lib/limits";
import type { ClassifyContext, Summary, UsageRow } from "./lib/summary";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export const SCREENTIME_WIDGET_ID = "screentime";

export interface LimitStatus {
  limit: ScreenLimit;
  usedSeconds: number;
}

export interface ScreenTimeContextValue {
  /** False sul telefono, su Linux e nel browser: il widget mostra solo il messaggio. */
  available: boolean;
  enabled: boolean;
  /** Prima lettura dal DB non ancora fatta. */
  loading: boolean;
  /** Righe di oggi (aggiornate a ogni salvataggio, ~30 s). */
  todayRows: UsageRow[];
  today: Summary;
  /** Totale di ieri (secondi). */
  yesterdayTotal: number;
  /** Ieri fino alla stessa ora di adesso (secondi): il confronto del widget. */
  yesterdaySoFar: number;
  limits: LimitStatus[];
  /** Minuti al PC senza una pausa di 5 (0 se sei in pausa). */
  continuousMinutes: number;
  /** Scelte a mano e classi: servono alla pagina per riassumere altri giorni allo stesso modo. */
  classify: ClassifyContext;
  /** Cresce a ogni salvataggio: la pagina rilegge i suoi dati quando cambia. */
  revision: number;
  /** Salva subito quello che il registratore ha in mano (es. prima di aprire la pagina). */
  flush: () => Promise<void>;
  /** Categoria scelta a mano per un'app (app_key) o un sito ("web:<sito>"); null = torna automatica. */
  setCategory: (key: string, category: AppCategory | null) => void;
  setFocusClass: (category: AppCategory, cls: FocusClass) => void;
  saveLimit: (limit: Omit<ScreenLimit, "id">) => Promise<void>;
  deleteLimit: (id: number) => Promise<void>;
}

export const ScreenTimeContext = createContext<ScreenTimeContextValue | undefined>(undefined);

export function useScreenTime() {
  const ctx = useContext(ScreenTimeContext);
  if (!ctx) throw new Error("useScreenTime deve essere usato dentro <ScreenTimeProvider>");
  return ctx;
}
