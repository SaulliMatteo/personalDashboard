import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BACKUP_FILE_FILTERS, BackupError, exportDatabase, exportFileName, importDatabase } from "../../../core/db/backup";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import { useSettings } from "../../../core/settings/useSettings";
import ConfirmButton from "../../../ui/ConfirmButton";
import ExpandableText from "../../../ui/ExpandableText";
import UpdateSection from "./UpdateSection";

/** Esporta/importa tutte le impostazioni come testo JSON (backup, trasferimento tra computer). */
function BackupSection() {
  const { settings, importSettings } = useSettings();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
    setText(JSON.stringify(settings, null, 2));
    setMessage("Impostazioni correnti caricate qui sotto: copiale e conservale.");
  }

  function handleImport() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setMessage("Il testo non è un JSON valido.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setMessage("Il JSON deve essere un oggetto di impostazioni.");
      return;
    }
    const { applied, ignored } = importSettings(parsed as Record<string, unknown>);
    setMessage(
      applied === 0
        ? "Nessuna impostazione valida trovata."
        : `Applicate ${applied} impostazioni${ignored > 0 ? ` (${ignored} scartate perché non valide)` : ""}.`
    );
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Backup</h4>
      <p className="settings-field-description">Copia tutte le impostazioni come testo, oppure incolla un backup per ripristinarlo.</p>
      <div className="settings-backup">
        <textarea
          className="settings-backup-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Premi «Mostra impostazioni» per esportare, oppure incolla qui un JSON e premi «Applica»."
          spellCheck={false}
          rows={6}
        />
        <div className="settings-backup-actions">
          <button type="button" className="sp-btn" onClick={handleExport}>
            Mostra impostazioni
          </button>
          <button type="button" className="sp-btn" onClick={handleImport} disabled={text.trim() === ""}>
            Applica
          </button>
        </div>
        {message && <p className="settings-field-description">{message}</p>}
      </div>
    </div>
  );
}

/** Copia di tutti i dati (il database) in un file, e ripristino da una copia (core/db/backup.ts). */
function DataSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    setMessage(null);
    const target = await save({ defaultPath: exportFileName(), filters: BACKUP_FILE_FILTERS });
    if (!target) return;
    setBusy(true);
    try {
      await exportDatabase(target);
      setMessage("Dati esportati. Conserva il file in un posto sicuro (es. su un altro dispositivo).");
    } catch (error) {
      setMessage(error instanceof BackupError ? error.message : "Esportazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setMessage(null);
    const source = await open({ multiple: false, directory: false, filters: BACKUP_FILE_FILTERS });
    if (typeof source !== "string") return;
    setBusy(true);
    try {
      await importDatabase(source); // se riesce l'app si riavvia da sola
    } catch (error) {
      setMessage(error instanceof BackupError ? error.message : "Importazione non riuscita.");
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Dati</h4>
      <div className="settings-fields">
        <div className="settings-field">
          <div className="settings-field-text">
            <span className="settings-field-label">Esporta i dati</span>
            <ExpandableText className="settings-field-description">
              Salva in un file tutto ciò che l'app ricorda: impostazioni, dashboard, studio, note e raccolte. Gli allegati delle note restano fuori.
            </ExpandableText>
          </div>
          <div className="settings-field-control">
            <button type="button" className="sp-btn" onClick={() => void handleExport()} disabled={busy}>
              Esporta
            </button>
          </div>
        </div>
        <div className="settings-field">
          <div className="settings-field-text">
            <span className="settings-field-label">Importa i dati</span>
            <ExpandableText className="settings-field-description">
              Sostituisce tutti i dati di questo dispositivo con quelli di un file esportato, poi l'app si riavvia. I dati di adesso si perdono: esportali prima se ti servono.
            </ExpandableText>
          </div>
          <div className="settings-field-control">
            {busy ? (
              <button type="button" className="sp-btn" disabled>
                Attendi…
              </button>
            ) : (
              <ConfirmButton className="sp-btn sp-btn--danger" label="Importa" onConfirm={handleImport} />
            )}
          </div>
        </div>
      </div>
      {message && <p className="settings-field-description">{message}</p>}
    </div>
  );
}

function GeneralTab() {
  const { resetSettings } = useSettings();

  return (
    <>
      <header className="sp-head">
        <h2>Generale</h2>
        <p>Il tuo nome, il titolo dell'app, il backup delle impostazioni e di tutti i dati, gli aggiornamenti.</p>
      </header>

      <SettingsSection group="general" />
      <UpdateSection />
      <BackupSection />
      <DataSection />

      <div className="settings-section">
        <h4 className="settings-section-title">Ripristino</h4>
        <div className="settings-fields">
          <div className="settings-field">
            <div className="settings-field-text">
              <span className="settings-field-label">Torna alle impostazioni iniziali</span>
              <ExpandableText className="settings-field-description">Tutte le impostazioni tornano ai valori di default. La posizione dei widget non cambia.</ExpandableText>
            </div>
            <div className="settings-field-control">
              <ConfirmButton className="sp-btn sp-btn--danger" label="Ripristina" onConfirm={resetSettings} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default GeneralTab;
