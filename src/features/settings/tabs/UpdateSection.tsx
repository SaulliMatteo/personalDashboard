import { useUpdater, type UpdaterStatus } from "../../../core/updater/useUpdater";
import type { SettingDef } from "../../../core/settings/schema";
import SettingsField from "../../../core/settings/components/SettingsField";
import { isAndroid } from "../../../core/system/platform";
import ExpandableText from "../../../ui/ExpandableText";
import ProgressBar from "../../../ui/ProgressBar";
import "./updateSection.css";

/** Riga di stato sotto la versione installata. */
function statusText(status: UpdaterStatus): string {
  switch (status.kind) {
    case "unsupported":
      return isAndroid()
        ? "Su Android si aggiorna installando l'APK nuovo sopra il vecchio."
        : "Aggiornamenti disponibili solo nella versione installata.";
    case "idle":
      return "Premi «Controlla aggiornamenti» per cercare una versione nuova.";
    case "checking":
      return "Controllo in corso…";
    case "upToDate":
      return "Sei aggiornato.";
    case "available":
      return `È disponibile la versione ${status.version}.`;
    case "downloading":
      return status.progress === null
        ? `Download della versione ${status.version}…`
        : `Download della versione ${status.version}: ${Math.round(status.progress * 100)}%`;
    case "installing":
      return `Installazione della versione ${status.version}: l'app si riavvierà da sola.`;
    case "error":
      return status.during === "check"
        ? `Nessuna connessione o errore: ${status.message}`
        : `Aggiornamento non riuscito: ${status.message}`;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Il controllo giornaliero (core/updater/autoCheck.ts): qui e non in SETTING_DEFS, solo dove gli aggiornamenti ci sono. */
const AUTO_CHECK_DEF: SettingDef = {
  key: "autoCheckUpdates",
  group: "general",
  section: "Versione e aggiornamenti",
  type: "boolean",
  label: "Controlla da solo una volta al giorno",
  description: "Una versione nuova compare nella campanella della dashboard. Non scarica nulla finché non premi «Aggiorna».",
};

/**
 * Impostazioni > Generale: versione installata e aggiornamenti (core/updater/). Va in rete quando si preme
 * "Controlla aggiornamenti" o "Aggiorna", e una volta al giorno se il controllo automatico è acceso.
 */
function UpdateSection() {
  const { currentVersion, status, check, install, canRetryInstall } = useUpdater();
  const busy = status.kind === "checking" || status.kind === "downloading" || status.kind === "installing";
  const release = status.kind === "available" || status.kind === "downloading" ? status : null;
  const date = status.kind === "available" ? formatDate(status.date) : null;

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Versione e aggiornamenti</h4>
      <div className="settings-fields">
        <div className="settings-field">
          <div className="settings-field-text">
            <span className="settings-field-label">{currentVersion ? `Versione ${currentVersion}` : "Versione"}</span>
            <p className={`settings-field-description${status.kind === "error" ? " upd-error" : ""}`} role="status" aria-live="polite">
              {statusText(status)}
            </p>
          </div>
          <div className="settings-field-control">
            <button type="button" className="sp-btn sp-btn--ghost" onClick={() => void check()} disabled={status.kind === "unsupported" || busy}>
              {status.kind === "checking" ? "Controllo…" : "Controlla aggiornamenti"}
            </button>
          </div>
        </div>

        {status.kind !== "unsupported" && <SettingsField def={AUTO_CHECK_DEF} />}

        {release && (
          <div className="settings-field upd-release">
            <div className="upd-release-head">
              <span className="settings-field-label">
                Versione {release.version}
                {date && <span className="upd-date"> · {date}</span>}
              </span>
              {status.kind === "available" && (
                <button type="button" className="sp-btn" onClick={() => void install()}>
                  Aggiorna
                </button>
              )}
            </div>
            {release.notes !== "" && (
              <ExpandableText id="upd-notes" className="settings-field-description upd-notes">
                {release.notes}
              </ExpandableText>
            )}
            {status.kind === "downloading" && <ProgressBar className="upd-progress" value={status.progress ?? 0} label="Download dell'aggiornamento" />}
          </div>
        )}

        {status.kind === "installing" && (
          <div className="settings-field">
            <ProgressBar className="upd-progress" value={1} label="Installazione dell'aggiornamento" />
          </div>
        )}

        {canRetryInstall && (
          <div className="settings-field">
            <span className="settings-field-description">Il download ricomincia da capo.</span>
            <div className="settings-field-control">
              <button type="button" className="sp-btn" onClick={() => void install()}>
                Riprova
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpdateSection;
