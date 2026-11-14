import { useState } from "react";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import { useThemeVariant, type ThemeVariants } from "../../../core/theme/variants";
import { chooseWallpaper, resetWallpaper, useWallpaper } from "../../../core/theme/wallpaper";
import { useSettings } from "../../../core/settings/useSettings";
import { ACCENT_KEYS } from "../../../core/settings/schema";
import { ACCENT_PRESETS, THEME_IDS, THEMES } from "../../../core/theme/themes";
import { useTheme } from "../../../core/theme/useTheme";
import { GRID_COLS } from "../../../core/layout/gridConfig";
import { useCompact } from "../../../core/layout/useCompact";

/** Opzioni del controllo "Variante"; con "auto" le anteprime mostrano la variante risolta. */
const MODE_OPTIONS = [
  { value: "giorno", label: "Giorno" },
  { value: "notte", label: "Notte" },
  { value: "auto", label: "Automatico" },
] as const;

/** Le impostazioni degli effetti del tema in fondo alla scheda: il glow (Notte) o il vetro (Vetro). */
const THEME_EFFECTS: ThemeVariants<"glow" | "glass"> = {
  notte: "glow",
  opaco: "glow",
  quaderno: "glow",
  fosforo: "glow",
  vetro: "glass",
  ombra: "glow",
};

/** Vetro: lo sfondo dietro il vetro (di questo dispositivo) e gli effetti, come nel mockup. */
function GlassSettings() {
  const wallpaper = useWallpaper();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      console.error("Sfondo di Vetro non cambiato:", e);
      setError("Non riesco a leggere questa immagine: prova con un JPEG o un PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sp-block">
        <div className="sp-block-head">
          <h3>
            Sfondo del vetro <span className="sp-block-sub">solo su questo dispositivo</span>
          </h3>
        </div>
        <div className="sp-actions">
          <button type="button" className="sp-btn" disabled={busy} onClick={() => void run(chooseWallpaper)}>
            {wallpaper ? "Scegli un'altra immagine" : "Scegli un'immagine"}
          </button>
          <button type="button" className="sp-btn" disabled={busy || !wallpaper} onClick={() => void run(resetWallpaper)}>
            Torna alla stanza
          </button>
        </div>
        <p className="sp-note">{error ?? "Dietro il vetro c'è una stanza disegnata, oppure una tua immagine: resta sfocata e non lascia il dispositivo."}</p>
      </div>
      <SettingsSection group="glass" />
    </>
  );
}

/** Scheda Aspetto: come il mockup impostazioni-aspetto.html (tema, accent, griglia) più il resto del gruppo. */
function AppearanceTab() {
  const { settings, updateSetting } = useSettings();
  const theme = useTheme();
  // sul telefono griglia, glow e barra laterale non ci sono (o si regolano dal desktop)
  const compact = useCompact();
  // L'accent si sceglie per la variante attiva: l'altra tiene il suo.
  const accentKeys = ACCENT_KEYS[theme.mode];
  const effectiveAccent = theme.accent.toLowerCase();
  const isPreset = ACCENT_PRESETS.some((p) => p.color.toLowerCase() === effectiveAccent);
  // Ombra chiama le varianti "Ombra" e "Fiamma"; gli altri temi "Giorno" e "Notte".
  const modeLabels = THEMES[settings.theme].modeLabels;
  const effects = useThemeVariant(THEME_EFFECTS);

  function pickAccent(color: string) {
    updateSetting(accentKeys.color, color);
    updateSetting(accentKeys.override, color.toLowerCase() !== theme.defaultAccent.toLowerCase());
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
                <span className="sp-theme-side" />
                <span />
                <span />
                <span className="sp-theme-a" />
                <span />
              </span>
              <span className="sp-theme-name">
                <span>{def.label}</span>
              </span>
              <span className="sp-theme-desc">{def.description}</span>
            </button>
          );
        })}
      </div>

      <div className="sp-block">
        <div className="sp-block-head">
          <h3>Variante</h3>
        </div>
        <div className="sp-segmented" role="radiogroup" aria-label="Variante">
          {MODE_OPTIONS.map((option) => {
            const selected = settings.themeMode === option.value;
            const label = option.value === "auto" ? option.label : (modeLabels?.[option.value] ?? option.label);
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? "is-on" : ""}
                onClick={() => updateSetting("themeMode", option.value)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="sp-note">Automatico segue il tema chiaro o scuro del sistema.</p>
      </div>

      <div className="sp-block">
        <div className="sp-block-head">
          <h3>
            Colore accent <span className="sp-block-sub">per la variante {modeLabels?.[theme.mode] ?? theme.mode}</span>
          </h3>
          <button type="button" className="sp-link" disabled={!settings[accentKeys.override]} onClick={() => updateSetting(accentKeys.override, false)}>
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

      {!compact && (
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
      )}

      <SettingsSection group="appearance" omit={["theme", "themeMode", "accentOverrideGiorno", "accentColorGiorno", "accentOverrideNotte", "accentColorNotte"]} />

      {effects === "glass" ? (
        <GlassSettings />
      ) : compact ? (
        <p className="sp-note">Glow dei widget, griglia e posizione della barra laterale si regolano dal desktop.</p>
      ) : theme.glow ? (
        <SettingsSection group="glow" />
      ) : (
        <p className="sp-note">Il bordo luminoso dei widget c'è solo nel tema {THEMES.notte.label}, variante notte: le sue impostazioni compaiono quando lo scegli.</p>
      )}
    </>
  );
}

export default AppearanceTab;
