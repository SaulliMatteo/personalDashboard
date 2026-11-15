import { createContext, useContext } from "react";
import type { AppCategory } from "../../core/system/appCategory";
import type { DeviceFilter, DeviceKind } from "./lib/devices";
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
  /** False solo nel browser (niente DB): il widget mostra solo il messaggio. */
  viewable: boolean;
  /** Si conta su questo dispositivo (Windows e macOS); altrove si vedono solo le righe arrivate col sync. */
  canRecord: boolean;
  /** Si conta adesso: `canRecord` e conteggio acceso. */
  enabled: boolean;
  /** Questo dispositivo: computer o telefono. */
  device: DeviceKind;
  /** Prima lettura dal DB non ancora fatta. */
  loading: boolean;
  /** Ora dell'ultimo salvataggio o dell'ultima lettura (ms): la pagina ne ricava "oggi" e l'ora in corso. */
  now: number;
  /** Righe di oggi di tutti i dispositivi (aggiornate a ogni salvataggio, ~30 s, e dopo ogni giro del sync). */
  todayRows: UsageRow[];
  /** Oggi, solo i dispositivi del filtro. */
  today: Summary;
  /** Oggi per dispositivo, senza filtro (colonna "Dispositivi"). */
  todayByDevice: Record<DeviceKind, number>;
  /** Filtro "Tutti / Computer / Telefono" in uso (sempre "all" col sync spento). */
  filter: DeviceFilter;
  /** Il filtro serve (sync acceso): pagina e widget lo mostrano. */
  showFilter: boolean;
  setFilter: (filter: DeviceFilter) => void;
  /** Ultimo secondo contato oggi sugli altri dispositivi (ms), arrivato col sync; null se non c'è. */
  othersUpdatedAt: number | null;
  /** Totale di ieri (secondi), coi dispositivi del filtro. */
  yesterdayTotal: number;
  /** Ieri fino alla stessa ora di adesso (secondi): il confronto del widget. */
  yesterdaySoFar: number;
  /** Limiti di questo dispositivo: contano solo le righe contate qui. */
  limits: LimitStatus[];
  /** Minuti al PC senza una pausa di 5 (0 se sei in pausa). */
  continuousMinutes: number;
  /** Scelte a mano e classi: servono alla pagina per riassumere altri giorni allo stesso modo. */
  classify: ClassifyContext;
  /** Cresce a ogni salvataggio: la pagina rilegge i suoi dati quando cambia. */
  revision: number;
  /** Salva subito quello che il registratore ha in mano (es. prima di aprire la pagina). */
  flush: () => Promise<void>;
  /** Categoria scelta a mano per un'app (app_key); null = torna automatica. */
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
