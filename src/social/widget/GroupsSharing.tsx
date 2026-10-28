import { useSettings } from "../../core/settings/useSettings";
import "../../core/settings/components/settingsFields.css";
import "./GroupsSharing.css";

type SharingKey =
  | "groupsShowSubject"
  | "groupsReportSubjects"
  | "groupsSharePixy"
  | "groupsSharePixyBubbles"
  | "groupsShowOthersBubbles"
  | "groupsShareTodo"
  | "groupsNotifyMessages";

function SwitchRow({ setting, label, help, disabled = false }: { setting: SharingKey; label: string; help: string; disabled?: boolean }) {
  const { settings, updateSetting } = useSettings();
  return (
    <label className={`gs-row${disabled ? " is-disabled" : ""}`}>
      <span className="gs-text">
        <span className="gs-label">{label}</span>
        <span className="gs-help">{help}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="settings-switch"
        checked={settings[setting]}
        disabled={disabled}
        onChange={(e) => updateSetting(setting, e.target.checked)}
      />
    </label>
  );
}

/**
 * "Cosa vedono gli altri": vale per tutti i gruppi. Materia, report, Pixy e foglietto Da fare (gli stessi di
 * Impostazioni > Widget > Gruppi); sotto, in "Per te", le scelte che non cambiano nulla per gli altri.
 */
function GroupsSharing() {
  const { settings } = useSettings();
  return (
    <section className="gp-card gs" aria-labelledby="gs-title">
      <div className="gs-head">
        <h2 id="gs-title">Cosa vedono gli altri</h2>
        <span className="gs-sub">Vale per tutti i tuoi gruppi.</span>
      </div>
      <SwitchRow setting="groupsShowSubject" label="Mostra la materia che sto studiando" help="Nella Stanza comune, accanto al tuo timer" />
      <SwitchRow
        setting="groupsReportSubjects"
        label="Includi le mie materie nei report dei gruppi"
        help={'Solo quelle che abbini nel report di ogni gruppo. Spento: il tuo tempo conta in "Altre materie" e le tue righe per materia vengono cancellate dal server. Vale per il tuo account, su tutti i dispositivi.'}
      />
      <SwitchRow
        setting="groupsSharePixy"
        label="Condividi le espressioni di Pixy"
        help="Le pose rivelano che tipo di app hai in primo piano"
      />
      <SwitchRow
        setting="groupsSharePixyBubbles"
        label="Condividi anche i fumetti"
        help="Possono contenere il tuo nome e il nome delle app"
        disabled={!settings.groupsSharePixy}
      />
      <SwitchRow
        setting="groupsShareTodo"
        label="Mostra la mia lista Da fare"
        help="Solo a chi è connesso, in sola lettura, nei dettagli della tua riga in Membri. Non viene salvata sul server"
      />
      <div className="gs-info">
        Gli altri vedono sempre e solo il tuo <strong>nome utente</strong>, se stai studiando o sei in pausa, e il tempo di
        oggi e della settimana. Email e nome Google non vengono mai mostrati. Le singole sessioni, le note e i video restano
        sul tuo computer. I messaggi arrivano solo a chi è connesso in quel momento e non vengono salvati.
      </div>
      <div className="gs-head gs-head--sub">
        <h3>Per te</h3>
        <span className="gs-sub">Non cambia nulla di quello che vedono gli altri.</span>
      </div>
      <SwitchRow
        setting="groupsNotifyMessages"
        label="Notifica i messaggi nuovi"
        help="Quando l'app non è in primo piano o la scheda Messaggi è chiusa"
      />
      <SwitchRow setting="groupsShowOthersBubbles" label="Mostra i fumetti degli altri" help="Nella Stanza comune" />
    </section>
  );
}

export default GroupsSharing;
