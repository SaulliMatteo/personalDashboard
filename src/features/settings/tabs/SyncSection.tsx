import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { getActivity } from "../../../core/activity/activityBus";
import { BACKUP_FILE_FILTERS, BackupError, exportDatabase, exportFileName } from "../../../core/db/backup";
import { useSettings } from "../../../core/settings/useSettings";
import { useSync } from "../../../core/sync/useSync";
import type { SyncStatus } from "../../../core/sync/useSync";
import ConfirmButton from "../../../ui/ConfirmButton";
import ExpandableText from "../../../ui/ExpandableText";

const time = (ms: number) => new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function statusText(status: SyncStatus): string | null {
  switch (status.kind) {
    case "syncing":
      return "Sincronizzazione in corso…";
    case "synced":
      return `Sincronizzato alle ${time(status.at)}.`;
    case "failed":
      return status.reason === "unreachable"
        ? "Servizio non raggiungibile: riprovo da solo."
        : `Sincronizzazione non riuscita: riprovo alle ${time(status.retryAt)}.`;
    default:
      return null;
  }
}

/** Primo sync con dati già nel cloud: unire o usare quelli del cloud (dopo una copia di sicurezza). */
function FirstSyncChoice() {
  const { choose } = useSync();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(choice: "merge" | "replace") {
    setMessage(null);
    if (choice === "replace") {
      if (getActivity().studyTimer !== null) {
        setMessage("Prima ferma il timer dello Studio.");
        return;
      }
      // copia di tutto il database prima di cancellare: senza, non si procede
      const target = await save({ defaultPath: exportFileName(), filters: BACKUP_FILE_FILTERS });
      if (!target) {
        setMessage("Serve una copia di sicurezza: scegli dove salvarla.");
        return;
      }
      setBusy(true);
      try {
        await exportDatabase(target);
      } catch (error) {
        setMessage(error instanceof BackupError ? error.message : "Copia di sicurezza non riuscita.");
        setBusy(false);
        return;
      }
    }
    setBusy(true);
    try {
      await choose(choice);
    } catch {
      setMessage("Qualcosa è andato storto. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="settings-field">
        <div className="settings-field-text">
          <span className="settings-field-label">Nel cloud ci sono già dei dati</span>
          <ExpandableText className="settings-field-description">
            Vengono da un altro dispositivo. Scegli cosa fare con quelli che ci sono qui.
          </ExpandableText>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-text">
          <span className="settings-field-label">Unisci</span>
          <ExpandableText className="settings-field-description">
            Studio, note e raccolte di qui si aggiungono a quelli del cloud; gli elementi uguali (stessa materia, stessa
            sessione, stessa nota…) diventano uno solo. Dove sono diversi, e per le impostazioni, vale il cloud.
          </ExpandableText>
        </div>
        <div className="settings-field-control">
          <button type="button" className="sp-btn" onClick={() => void run("merge")} disabled={busy}>
            Unisci
          </button>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-text">
          <span className="settings-field-label">Usa i dati del cloud</span>
          <ExpandableText className="settings-field-description">
            Studio, note e raccolte di questo dispositivo si cancellano e arrivano quelli del cloud. Prima ti chiedo dove
            salvare una copia di tutti i dati di qui (si ripristina da Generale › Dati).
          </ExpandableText>
        </div>
        <div className="settings-field-control">
          <ConfirmButton className="sp-btn sp-btn--danger" label="Usa i dati del cloud" onConfirm={() => run("replace")} />
        </div>
      </div>
      {message && (
        <p className="settings-field-description" role="alert">
          {message}
        </p>
      )}
    </>
  );
}

/** Sincronizza i miei dati: interruttore, stato, "Sincronizza ora" e la scelta del primo sync. */
function SyncSection() {
  const { settings, updateSetting } = useSettings();
  const { status, syncNow } = useSync();
  const text = statusText(status);

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">I miei dispositivi</h4>
      <div className="settings-fields">
        <div className="settings-field">
          <div className="settings-field-text">
            <label className="settings-field-label" htmlFor="account-sync">
              Sincronizza i miei dati
            </label>
            <ExpandableText className="settings-field-description">
              Studio, note, raccolte e impostazioni uguali su tutti i dispositivi dove accedi con questo account.
              Aspetto, suoni e disposizione restano di ogni dispositivo; gli allegati delle note per ora no. I dati passano dal servizio online e li vedi
              solo tu, nemmeno i membri dei tuoi gruppi.
            </ExpandableText>
            {settings.syncEnabled && text && <p className="settings-field-description">{text}</p>}
          </div>
          <div className="settings-field-control">
            {settings.syncEnabled && status.kind !== "needsChoice" && (
              <button type="button" className="sp-btn" onClick={syncNow} disabled={status.kind === "syncing"}>
                Sincronizza ora
              </button>
            )}
            <input
              id="account-sync"
              type="checkbox"
              role="switch"
              className="settings-switch"
              checked={settings.syncEnabled}
              onChange={(e) => updateSetting("syncEnabled", e.target.checked)}
            />
          </div>
        </div>
        {settings.syncEnabled && status.kind === "needsChoice" && <FirstSyncChoice />}
      </div>
    </div>
  );
}

export default SyncSection;
