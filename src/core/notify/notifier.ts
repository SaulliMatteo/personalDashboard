import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { AppCategory } from "../system/appCategory";
import { showNotificationWithImage } from "./notifyApi";

/**
 * Unico punto da cui l'app manda notifiche di sistema. Chi notifica dice COSA è
 * successo (`kind` + testo normale); un "decoratore" registrato da fuori può
 * vestirla (il Companion: faccia di Pixy, emoji e frase della personalità), senza
 * che `core` o il widget che notifica lo conoscano. Senza decoratore, o se
 * fallisce, parte la notifica semplice.
 */
export type AppNotificationKind = "pomodoroDone" | "breakOver" | "autoStopWarning" | "autoStopped";

export interface AppNotification {
  kind: AppNotificationKind;
  title: string;
  body: string;
  /** Solo per lo stop automatico e il suo preavviso: cosa l'ha fatto scattare. */
  reason?: "idle" | "app";
  category?: AppCategory | null;
}

export interface DecoratedNotification {
  title: string;
  /** Righe del testo, nell'ordine. */
  lines: string[];
  /** PNG come data URL; senza, notifica semplice. */
  imageDataUrl?: string;
}

export type NotificationDecorator = (n: AppNotification) => Promise<DecoratedNotification>;

let decorator: NotificationDecorator | null = null;

export function setNotificationDecorator(fn: NotificationDecorator | null) {
  decorator = fn;
}

export async function sendAppNotification(n: AppNotification) {
  let decorated: DecoratedNotification = { title: n.title, lines: [n.body] };
  if (decorator) {
    try {
      decorated = await decorator(n);
    } catch (error) {
      console.error("Decoratore delle notifiche non riuscito:", error);
    }
  }
  if (decorated.imageDataUrl && (await showNotificationWithImage(decorated.title, decorated.lines, decorated.imageDataUrl))) return;
  await sendPlain(decorated.title, decorated.lines.join("\n"));
}

/**
 * Notifica del plugin (visibile anche con l'app minimizzata). Il permesso
 * viene chiesto solo al bisogno, la prima volta che serve davvero — non
 * all'avvio, per non mostrare un popup prima ancora di avviare un timer.
 */
async function sendPlain(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch (error) {
    console.error("Impossibile inviare la notifica di sistema:", error);
  }
}
