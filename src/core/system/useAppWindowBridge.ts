import { useEffect } from "react";
import { useSettings } from "../settings/useSettings";
import { getMeta, setMeta } from "../db/meta";
import { sendAppNotification } from "../notify/notifier";
import { isMac } from "./platform";
import { APP_TRAY_AVAILABLE, onHiddenToTray, onQuitRequested, quitApp, setCloseToTray } from "./appWindowApi";
import { runBeforeQuit } from "./beforeQuit";

const HINT_META = "tray_hint_shown";

/**
 * Collega l'app all'icona vicino all'orologio (src-tauri/src/app_tray.rs): passa l'impostazione `closeToTray`,
 * avvisa la prima volta che la X nasconde la finestra e, su "Esci", finisce i lavori registrati (beforeQuit.ts)
 * prima di uscire. Va chiamato una volta, dentro le impostazioni (app/App.tsx).
 */
export function useAppWindowBridge() {
  const { settings } = useSettings();
  const closeToTray = settings.closeToTray;

  useEffect(() => {
    if (APP_TRAY_AVAILABLE) void setCloseToTray(closeToTray).catch(() => {});
  }, [closeToTray]);

  useEffect(() => {
    if (!APP_TRAY_AVAILABLE) return;
    const unlisten: Array<() => void> = [];
    let cancelled = false;
    const keep = (p: Promise<() => void>) =>
      p.then((stop) => (cancelled ? stop() : unlisten.push(stop))).catch(() => {});

    keep(
      onQuitRequested(() => {
        void runBeforeQuit().finally(() => void quitApp().catch(() => {}));
      })
    );
    keep(
      onHiddenToTray(() => {
        void (async () => {
          if ((await getMeta(HINT_META)) === "1") return;
          await setMeta(HINT_META, "1");
          await sendAppNotification({
            kind: "trayHidden",
            title: "La dashboard resta qui",
            body: isMac()
              ? "Continua a contare il tempo dalla barra dei menu. Per chiuderla davvero: clic sull'icona › Esci."
              : "Continua a contare il tempo vicino all'orologio. Per chiuderla davvero: tasto destro sull'icona › Esci.",
            inbox: false,
          });
        })().catch(() => {});
      })
    );
    return () => {
      cancelled = true;
      unlisten.forEach((stop) => stop());
    };
  }, []);
}
