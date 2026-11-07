import { useEffect } from "react";
import { getMeta, setMeta } from "../db/meta";
import { postInAppNotification } from "../notify/inbox";
import { useSettings } from "../settings/useSettings";
import { UPDATES_SUPPORTED } from "./updaterApi";
import { checkForUpdates } from "./useUpdater";

/** Al massimo un controllo ogni 24 ore, contate fra un avvio e l'altro (metadati). */
const CHECK_EVERY_MS = 24 * 60 * 60_000;
/** Il primo controllo aspetta un po' dopo l'avvio: prima l'app, poi la rete. */
const FIRST_DELAY_MS = 20_000;
/** Con l'app sempre aperta si riguarda ogni ora se sono passate le 24 ore. */
const RECHECK_MS = 60 * 60_000;

const LAST_CHECK_KEY = "updater_last_auto_check";
/** L'ultima versione già annunciata nella campanella: la stessa non si annuncia due volte. */
const NOTIFIED_KEY = "updater_notified_version";

async function runIfDue(): Promise<void> {
  const last = Number(await getMeta(LAST_CHECK_KEY)) || 0;
  if (Date.now() - last < CHECK_EVERY_MS) return;
  // senza rete non conta come controllo: si riprova all'ora successiva
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  await setMeta(LAST_CHECK_KEY, String(Date.now()));
  const status = await checkForUpdates({ quiet: true });
  if (status.kind !== "available" || (await getMeta(NOTIFIED_KEY)) === status.version) return;
  await setMeta(NOTIFIED_KEY, status.version);
  await postInAppNotification({
    kind: "updateAvailable",
    title: `È uscita la versione ${status.version}`,
    body: "Le novità sono in Impostazioni > Generale.",
    open: { type: "settings", section: "general" },
  });
}

/**
 * Controllo automatico degli aggiornamenti (impostazione `autoCheckUpdates`, accesa di default): una volta al giorno
 * legge `latest.json` dalle Release di GitHub, senza scaricare nulla, e una versione nuova compare nella campanella.
 * Installare resta una scelta dell'utente ("Aggiorna"). Niente sulle build senza aggiornamenti (dev, Android).
 */
export function useAutoUpdateCheck(): void {
  const { settings } = useSettings();
  const enabled = UPDATES_SUPPORTED && settings.autoCheckUpdates;

  useEffect(() => {
    if (!enabled) return;
    const run = () => void runIfDue().catch((error) => console.error("Controllo automatico degli aggiornamenti:", error));
    const first = window.setTimeout(run, FIRST_DELAY_MS);
    const every = window.setInterval(run, RECHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [enabled]);
}
