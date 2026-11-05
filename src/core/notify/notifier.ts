import { isPermissionGranted, requestPermission, sendNotification, cancel, createChannel, Importance, Visibility, Schedule } from "@tauri-apps/plugin-notification";
import { getMeta, setMeta } from "../db/meta";
import type { AppCategory } from "../system/appCategory";
import { isAndroid } from "../system/platform";
import { onNotificationTap } from "../system/androidTaps";
import { pluginNotify, showNotificationWithImage } from "./notifyApi";

/**
 * Unico punto da cui l'app manda notifiche di sistema. Chi notifica dice COSA è
 * successo (`kind` + testo normale); un "decoratore" registrato da fuori può
 * vestirla (il Companion: faccia di Pixy, emoji e frase della personalità), senza
 * che `core` o il widget che notifica lo conoscano. Senza decoratore, o se
 * fallisce, parte la notifica semplice.
 *
 * Su Android in più:
 * - ogni tipo ha il suo canale (regolabile a parte nelle impostazioni di Android);
 * - il tocco sulla notifica apre la vista giusta (`open`, vedi `onNotificationOpen`): la vista è scritta nell'ultima
 *   cifra dell'id della notifica, perché il plugin al tocco non riporta altro (l'id lo legge MainActivity.kt);
 * - le notifiche che devono arrivare ad app chiusa o congelata si pianificano (`scheduleAppNotifications`): le mostra
 *   Android all'ora giusta (AlarmManager, esatto con USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM del manifest).
 */
/** groupMessage: un messaggio dei Gruppi (il testo è di un compagno, nessun decoratore lo veste). */
export type AppNotificationKind = "pomodoroDone" | "breakOver" | "autoStopWarning" | "autoStopped" | "groupMessage";

/** Dove porta il tocco sulla notifica: la pagina di un widget o la Stanza comune. */
export type NotificationOpen = { type: "widget"; widgetId: string } | { type: "room" };

export interface AppNotification {
  kind: AppNotificationKind;
  title: string;
  body: string;
  /** Solo per lo stop automatico e il suo preavviso: cosa l'ha fatto scattare. */
  reason?: "idle" | "app" | "away";
  category?: AppCategory | null;
  /** Cosa aprire al tocco (solo Android). */
  open?: NotificationOpen;
}

export interface DecoratedNotification {
  title: string;
  /** Righe del testo, nell'ordine. */
  lines: string[];
  /** PNG come data URL; senza, notifica semplice. */
  imageDataUrl?: string;
}

/** `image: false` quando l'immagine non servirebbe (notifiche pianificate): niente disegno inutile. */
export type NotificationDecorator = (n: AppNotification, opts: { image: boolean }) => Promise<DecoratedNotification>;

let decorator: NotificationDecorator | null = null;

export function setNotificationDecorator(fn: NotificationDecorator | null) {
  decorator = fn;
}

async function decorate(n: AppNotification, image: boolean): Promise<DecoratedNotification> {
  if (decorator) {
    try {
      return await decorator(n, { image });
    } catch (error) {
      console.error("Decoratore delle notifiche non riuscito:", error);
    }
  }
  return { title: n.title, lines: [n.body] };
}

/* ---------- Canali (Android) ---------- */

type ChannelId = "studio" | "avvisi" | "gruppi";

const CHANNEL_OF: Record<AppNotificationKind, ChannelId> = {
  pomodoroDone: "studio",
  breakOver: "studio",
  autoStopWarning: "avvisi",
  autoStopped: "avvisi",
  groupMessage: "gruppi",
};

let channelsReady: Promise<void> | null = null;

/** Crea i canali una volta per avvio (createChannel su un canale esistente non cambia le scelte dell'utente). */
function ensureChannels(): Promise<void> {
  channelsReady ??= (async () => {
    try {
      await createChannel({
        id: "studio",
        name: "Timer dello Studio",
        description: "Fine del pomodoro e fine della pausa",
        importance: Importance.High,
        visibility: Visibility.Public,
        vibration: true,
      });
      await createChannel({
        id: "avvisi",
        name: "Stop automatico",
        description: "Il timer dello Studio fermato perché eri in altre app",
        importance: Importance.Default,
        visibility: Visibility.Private,
        vibration: true,
      });
      await createChannel({
        id: "gruppi",
        name: "Messaggi dei Gruppi",
        description: "Messaggi dei compagni, quando l'app è aperta",
        importance: Importance.Default,
        visibility: Visibility.Private,
        vibration: true,
      });
    } catch (error) {
      console.error("Canali delle notifiche non creati:", error);
    }
  })();
  return channelsReady;
}

/**
 * Viste che una notifica può aprire, nell'ordine: il codice è la posizione + 1 e diventa l'ultima cifra dell'id
 * (0 = nessuna). Una vista nuova si aggiunge in fondo (al massimo 9).
 */
const OPEN_TARGETS = ["room", "widget:study"] as const;

function openCode(open: NotificationOpen | undefined): number {
  if (!open) return 0;
  const key = open.type === "room" ? "room" : `widget:${open.widgetId}`;
  const index = (OPEN_TARGETS as readonly string[]).indexOf(key);
  return index < 0 ? 0 : index + 1;
}

function openFromId(id: number): NotificationOpen | null {
  const key = OPEN_TARGETS[(id % 10) - 1];
  if (key === undefined) return null;
  return key === "room" ? { type: "room" } : { type: "widget", widgetId: key.slice("widget:".length) };
}

/** Id di una notifica mandata subito: a caso (sotto il miliardo, sopra stanno le pianificate) con la vista in fondo. */
function immediateId(open: NotificationOpen | undefined): number {
  return Math.floor(Math.random() * 100_000_000) * 10 + openCode(open);
}

/* ---------- Permesso ---------- */

/**
 * Il permesso si chiede solo al bisogno, la prima volta che serve davvero — non all'avvio, per non mostrare un popup
 * prima ancora di avviare un timer. Su Android 13+ è il popup di sistema; prima di Android 13 è già concesso.
 */
let askedThisRun = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    // una volta per avvio: rifiutato, non si ripropone a ogni fase del timer
    if (askedThisRun) return false;
    askedThisRun = true;
    return (await requestPermission()) === "granted";
  } catch (error) {
    console.error("Permesso delle notifiche non disponibile:", error);
    return false;
  }
}

/* ---------- Invio subito ---------- */

export async function sendAppNotification(n: AppNotification) {
  const decorated = await decorate(n, true);
  if (decorated.imageDataUrl && (await showNotificationWithImage(decorated.title, decorated.lines, decorated.imageDataUrl))) return;
  if (!(await ensureNotificationPermission())) return;
  try {
    if (isAndroid()) {
      await ensureChannels();
      await pluginNotify({
        id: immediateId(n.open),
        title: decorated.title,
        body: decorated.lines.join("\n"),
        channelId: CHANNEL_OF[n.kind],
        autoCancel: true,
      });
    } else {
      sendNotification({ title: decorated.title, body: decorated.lines.join("\n") });
    }
  } catch (error) {
    console.error("Impossibile inviare la notifica di sistema:", error);
  }
}

/* ---------- Pianificate (solo Android) ---------- */

export interface ScheduledNotification {
  /** Istante (ms) in cui mostrarla. */
  at: number;
  notification: AppNotification;
}

type ScheduledEntry = { id: number; at: number };

/**
 * Cosa ha pianificato questo processo (id → contenuto): una fine fase già pianificata e uguale non si ripassa al
 * plugin a ogni cambio di stato. Solo in memoria: dopo un riavvio del telefono gli allarmi non ci sono più, e la
 * prima pianificazione di ogni avvio dell'app li rimette tutti.
 */
const scheduledThisRun = new Map<number, string>();

/**
 * Le pianificate ancora attese, per gruppo: id del plugin e istante. Salvate nei metadati, perché il processo che le ha
 * pianificate può essere chiuso da Android e quello nuovo deve poterle cancellare (timer fermato alla riapertura).
 */
const metaKey = (group: string) => `notify_scheduled:${group}`;

async function loadScheduled(group: string): Promise<ScheduledEntry[]> {
  try {
    const raw = JSON.parse((await getMeta(metaKey(group))) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is ScheduledEntry => Number.isInteger(x?.id) && Number.isFinite(x?.at));
  } catch {
    return [];
  }
}

/** Per quanto si ricordano le pianificate già comparse (per ritirarle). */
const SHOWN_MEMORY_MS = 6 * 60 * 60_000;

/** Una pianificata a meno di così dall'ora non si cancella più: sta per comparire (o è appena comparsa). */
const ABOUT_TO_FIRE_MS = 3000;

/**
 * Id del plugin per una notifica pianificata: diverso per ogni istante, così cancellare quelle future non tocca mai
 * una già comparsa (cancel() del plugin toglie anche la notifica visibile con lo stesso id). Dal miliardo in su,
 * con la vista da aprire nell'ultima cifra.
 */
function scheduledId(group: string, at: number, open: NotificationOpen | undefined): number {
  let h = 0;
  for (const c of group) h = (h * 31 + c.charCodeAt(0)) | 0;
  return 1_000_000_000 + Math.abs((h + Math.floor(at / 1000)) % 100_000_000) * 10 + openCode(open);
}

export function canScheduleNotifications(): boolean {
  // sul desktop il plugin ignora l'orario e la mostrerebbe subito
  return isAndroid();
}

let scheduleQueue: Promise<void> = Promise.resolve();

/**
 * Sostituisce le notifiche pianificate del gruppo `group` (es. "study") con `list`: cancella quelle future che non ci
 * sono più e pianifica le nuove. Quelle già comparse (o che stanno per comparire) restano. Una stessa fine fase ha
 * sempre lo stesso id, quindi ripianificarla la sovrascrive. Chiamate in coda, una alla volta.
 * Attenzione: il plugin non le salva per il riavvio del telefono, che le perde fino alla prossima apertura dell'app.
 */
export function scheduleAppNotifications(group: string, list: ScheduledNotification[]): Promise<void> {
  if (!canScheduleNotifications()) return Promise.resolve();
  const run = async () => {
    const now = Date.now();
    const previous = await loadScheduled(group);
    const wanted = list.filter((x) => x.at > now + 1000);
    const wantedIds = new Set(wanted.map((x) => scheduledId(group, x.at, x.notification.open)));
    const stale = previous.filter((x) => x.at > now + ABOUT_TO_FIRE_MS && !wantedIds.has(x.id)).map((x) => x.id);
    // quelle già comparse si ricordano ancora un po', per poterle ritirare (withdrawAppNotifications)
    let kept: ScheduledEntry[] = previous.filter((x) => x.at > now - SHOWN_MEMORY_MS && !stale.includes(x.id) && !wantedIds.has(x.id));
    try {
      if (stale.length > 0) await cancel(stale);
      for (const id of stale) scheduledThisRun.delete(id);
    } catch (error) {
      // non cancellate: restano nel registro, si riprova la prossima volta
      console.error("Notifiche pianificate non cancellate:", error);
      kept = kept.concat(previous.filter((x) => stale.includes(x.id)));
    }
    if (wanted.length > 0 && (await ensureNotificationPermission())) {
      await ensureChannels();
      for (const item of wanted) {
        const id = scheduledId(group, item.at, item.notification.open);
        const content = JSON.stringify(item.notification);
        if (scheduledThisRun.get(id) === content) {
          kept.push({ id, at: item.at });
          continue;
        }
        const decorated = await decorate(item.notification, false);
        try {
          await pluginNotify({
            id,
            title: decorated.title,
            body: decorated.lines.join("\n"),
            channelId: CHANNEL_OF[item.notification.kind],
            autoCancel: true,
            schedule: Schedule.at(new Date(item.at), false, true),
          });
          kept.push({ id, at: item.at });
          scheduledThisRun.set(id, content);
        } catch (error) {
          console.error("Notifica non pianificata:", error);
        }
      }
    }
    try {
      await setMeta(metaKey(group), JSON.stringify(kept));
    } catch (error) {
      console.error("Registro delle notifiche pianificate non salvato:", error);
    }
  };
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

/* ---------- Tocco sulla notifica (Android) ---------- */

/**
 * Chiama `listener` quando si tocca una notifica dell'app che deve aprire una vista. Restituisce la funzione per
 * smettere. Sul desktop non arriva nulla.
 */
export function onNotificationOpen(listener: (open: NotificationOpen) => void): () => void {
  return onNotificationTap((id) => {
    const open = openFromId(id);
    if (open) listener(open);
  });
}

/**
 * Ritira le notifiche del gruppo comparse (o in arrivo) da `sinceMs` a adesso: dicevano una cosa che poi non è stata
 * vera (es. "Pomodoro completato" mentre eri in altre app, e al rientro lo stop automatico ha fermato il timer
 * all'uscita). Le future le sistema la prossima pianificazione.
 */
export function withdrawAppNotifications(group: string, sinceMs: number): Promise<void> {
  if (!canScheduleNotifications()) return Promise.resolve();
  const run = async () => {
    const now = Date.now();
    const previous = await loadScheduled(group);
    const gone = previous.filter((x) => x.at >= sinceMs && x.at <= now + ABOUT_TO_FIRE_MS).map((x) => x.id);
    if (gone.length === 0) return;
    try {
      await cancel(gone);
      for (const id of gone) scheduledThisRun.delete(id);
      await setMeta(metaKey(group), JSON.stringify(previous.filter((x) => !gone.includes(x.id))));
    } catch (error) {
      console.error("Notifiche non ritirate:", error);
    }
  };
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}
