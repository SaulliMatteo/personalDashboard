import SettingsSection from "../../../core/settings/components/SettingsSection";
import { useSettings } from "../../../core/settings/SettingsContext";
import { ACCENT_PRESETS, THEME_IDS, THEMES } from "../../../core/theme/themes";
import { useTheme } from "../../../core/theme/useTheme";
import { GRID_COLS } from "../../../core/layout/gridConfig";

/** Scheda Aspetto: come il mockup impostazioni-aspetto.html (tema, accent, griglia) più il resto del gruppo. */
function AppearanceTab() {
  const { settings, updateSetting } = useSettings();
  const theme = useTheme();
  const effectiveAccent = (settings.accentOverride ? settings.accentColor : theme.defaultAccent).toLowerCase();
  const isPreset = ACCENT_PRESETS.some((p) => p.color.toLowerCase() === effectiveAccent);

  function pickAccent(color: string) {
    updateSetting("accentColor", color);
    updateSetting("accentOverride", color.toLowerCase() !== theme.defaultAccent.toLowerCase());
  }

  return (
    <>
      <header className="sp-head">
        <h2>Tema</h2>
        <p>Cambia colori, caratteri e l'aspetto di ogni widget. La griglia si adatta sempre alla finestra.</p>
      </header>

      <div className="sp-themes" role="radiogroup" aria-label="Tema">
        {THEME_IDS.map((id) => {
          const def = THEMES[id];
          const selected = settings.theme === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`sp-theme sp-theme--${id}${selected ? " is-selected" : ""}`}
              onClick={() => updateSetting("theme", id)}
            >
              <span className="sp-theme-preview" aria-hidden="true">
                <span className="sp-theme-a" />
                <span className="sp-theme-b" />
                <span className="sp-theme-c" />
              </span>
              <span className="sp-theme-name">
                <span>{def.label}</span>
                <span className="sp-theme-scheme">{def.schemeLabel}</span>
              </span>
              <span className="sp-theme-desc">{def.description}</span>
            </button>
          );
        })}
      </div>

      <div className="sp-block">
        <div className="sp-block-head">
          <h3>Colore accent</h3>
          <button type="button" className="sp-link" disabled={!settings.accentOverride} onClick={() => updateSetting("accentOverride", false)}>
            Usa quello del tema
          </button>
        </div>
        <div className="sp-swatches">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.color}
              type="button"
              className={`sp-swatch${preset.color.toLowerCase() === effectiveAccent ? " is-selected" : ""}`}
              style={{ background: preset.color }}
              aria-label={preset.label}
              aria-pressed={preset.color.toLowerCase() === effectiveAccent}
              title={preset.label}
              onClick={() => pickAccent(preset.color)}
            />
          ))}
          <label
            className={`sp-swatch sp-swatch--custom${isPreset ? "" : " is-selected"}`}
            style={isPreset ? undefined : { background: effectiveAccent }}
            title="Colore personalizzato"
          >
            {isPreset && <span aria-hidden="true">+</span>}
            <input type="color" aria-label="Colore personalizzato" value={effectiveAccent} onChange={(e) => pickAccent(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="sp-info-row">
        <div>
          <div className="sp-info-title">Griglia</div>
          <div className="sp-info-desc">
            {GRID_COLS} colonne per {settings.gridRows} righe, riempie la finestra senza scorrere. Le righe si cambiano in Dashboard.
          </div>
        </div>
        <span className="sp-info-value">
          {GRID_COLS} × {settings.gridRows}
        </span>
      </div>

      <SettingsSection group="appearance" omit={["theme", "accentOverride", "accentColor"]} />

      {theme.glow ? (
        <SettingsSection group="glow" />
      ) : (
        <p className="sp-note">Il bordo luminoso dei widget c'è solo nel tema {THEMES.notte.label}: le sue impostazioni compaiono quando lo scegli.</p>
      )}
    </>
  );
}

export default AppearanceTab;
