import { useNav } from "../../../core/nav/NavContext";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import type { WidgetDefinition } from "../../../core/widgets/types";

/** Impostazioni di un singolo widget: il suo `settingsGroup` dello schema. */
function WidgetTab({ widget }: { widget: WidgetDefinition }) {
  const { openWidgetDetail } = useNav();
  if (!widget.settingsGroup) return null;

  return (
    <>
      <header className="sp-head sp-head--row">
        <div>
          <h2>{widget.name}</h2>
          <p>{widget.description}</p>
        </div>
        {widget.detailComponent && (
          <button type="button" className="sp-btn sp-btn--ghost" onClick={() => openWidgetDetail(widget.id)}>
            Apri {widget.name}
          </button>
        )}
      </header>

      <SettingsSection group={widget.settingsGroup} />
    </>
  );
}

export default WidgetTab;
