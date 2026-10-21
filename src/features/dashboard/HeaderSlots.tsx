import { createElement } from "react";
import { MdOutlineTune } from "react-icons/md";
import { useNav } from "../../core/nav/NavContext";
import { useSettings } from "../../core/settings/SettingsContext";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import { getWidget } from "../../widgets/registry";
import "./headerSlots.css";

/** Cosa mostra lo spazio "Come il tema": quello che c'è nei mockup. */
const AUTO_SLOT: ThemeVariants<string> = { notte: "study", opaco: "none", quaderno: "none", fosforo: "clock" };

/** Gli spazi in alto a destra dell'intestazione: fino a due `mini` scelti in Impostazioni > Dashboard. */
function HeaderSlots() {
  const { settings } = useSettings();
  const { openSettings } = useNav();
  const auto = useThemeVariant(AUTO_SLOT);

  const ids = [settings.headerSlot1 === "auto" ? auto : settings.headerSlot1, settings.headerSlot2];
  // Id sconosciuti (widget rimossi) o ripetuti si saltano.
  const minis = [...new Set(ids)].flatMap((id) => {
    const mini = getWidget(id)?.mini;
    return mini ? [{ id, mini }] : [];
  });

  return (
    <div className="dh-slots">
      {minis.map(({ id, mini }) => (
        <div key={id} className="dh-slot">
          {createElement(mini)}
        </div>
      ))}
      <button
        type="button"
        className="dh-slots-edit"
        onClick={() => openSettings("dashboard")}
        aria-label="Scegli cosa mostrare in alto a destra"
        title="Scegli cosa mostrare qui"
      >
        <MdOutlineTune aria-hidden="true" />
      </button>
    </div>
  );
}

export default HeaderSlots;
