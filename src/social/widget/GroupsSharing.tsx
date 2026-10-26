import { useSettings } from "../../core/settings/useSettings";
import "../../core/settings/components/settingsFields.css";
import "./GroupsSharing.css";

type SharingKey =
  | "groupsShowSubject"
  | "groupsReportSubjects"
  | "groupsSharePixy"
  | "groupsSharePixyBubbles"
  | "groupsShowOthersBubbles";

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
 * "Cosa vedono gli altri": vale per tutti i gruppi. I primi due interruttori sono quelli del mockup, sotto quelli di
 * Pixy (gli stessi di Impostazioni > Widget > Gruppi).
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
        help={'Solo quelle che abbini nel report di ogni gruppo. Spento: il tuo tempo conta in "Altre materie". Il report per materie è in arrivo: per ora non ha effetto.'}
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
      <SwitchRow setting="groupsShowOthersBubbles" label="Mostra i fumetti degli altri" help="Solo per te, nella Stanza comune" />
      <div className="gs-info">
        Gli altri vedono sempre e solo il tuo <strong>nome utente</strong>, se stai studiando o sei in pausa, e il tempo di
        oggi e della settimana. Email e nome Google non vengono mai mostrati. Le singole sessioni, le note e i video restano
        sul tuo computer.
      </div>
    </section>
  );
}

export default GroupsSharing;
