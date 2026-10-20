import { useState } from "react";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import { useSettings } from "../../../core/settings/SettingsContext";
import ConfirmButton from "../../../ui/ConfirmButton";

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

function GeneralTab() {
  const { resetSettings } = useSettings();

  return (
    <>
      <header className="sp-head">
        <h2>Generale</h2>
        <p>Il tuo nome, il titolo dell'app e il backup delle impostazioni.</p>
      </header>

      <SettingsSection group="general" />
      <BackupSection />

      <div className="settings-section">
        <h4 className="settings-section-title">Ripristino</h4>
        <div className="settings-fields">
          <div className="settings-field">
            <div className="settings-field-text">
              <span className="settings-field-label">Torna alle impostazioni iniziali</span>
              <p className="settings-field-description">Tutte le impostazioni tornano ai valori di default. La posizione dei widget non cambia.</p>
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
