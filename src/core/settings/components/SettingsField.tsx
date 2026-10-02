import { useState } from "react";
import { useSettings } from "../SettingsContext";
import type { SettingDef, SettingKey } from "../schema";
import "./settingsFields.css";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function formatNumber(value: number, step: number) {
  const decimals = step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0;
  return value.toFixed(decimals);
}

/**
 * Renderizza UN controllo a partire dalla sua definizione nello schema.
 * Aggiungere un tipo di controllo = aggiungere un caso qui.
 */
function SettingsField({ def }: { def: SettingDef }) {
  const { settings, updateSetting } = useSettings();
  const [draft, setDraft] = useState<string | null>(null);

  const value = settings[def.key];
  // Disattivato (ma visibile) se la impostazione da cui dipende è spenta.
  const disabled = def.dependsOn !== undefined && !settings[def.dependsOn];
  // def.key è un'unione di chiavi: la coerenza chiave/valore è garantita
  // dallo schema (e da sanitizeSettings in lettura), non dal type system.
  const set = (next: unknown) =>
    (updateSetting as (key: SettingKey, value: unknown) => void)(def.key, next);

  let control;
  switch (def.type) {
    case "boolean":
      control = (
        <label className="settings-field-inline">
          <input type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
          <span>{def.label}</span>
        </label>
      );
      break;

    case "select":
      control = (
        <label className="settings-field-stack">
          <span>{def.label}</span>
          <select disabled={disabled} value={String(value)} onChange={(e) => set(e.target.value)}>
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
      break;

    case "color":
      control = (
        <label className="settings-field-stack">
          <span>{def.label}</span>
          <input type="color" disabled={disabled} value={String(value)} onChange={(e) => set(e.target.value)} />
        </label>
      );
      break;

    case "text":
      control = (
        <label className="settings-field-stack">
          <span>{def.label}</span>
          <input
            type="text"
            disabled={disabled}
            maxLength={def.maxLength}
            placeholder={def.placeholder}
            value={String(value)}
            onChange={(e) => set(e.target.value.slice(0, def.maxLength))}
          />
        </label>
      );
      break;

    case "number": {
      const num = Number(value);
      if (def.control === "slider") {
        control = (
          <label className="settings-field-stack">
            <span>
              {def.label}: {formatNumber(num, def.step)}
              {def.unit ?? ""}
            </span>
            <input
              type="range"
              disabled={disabled}
              min={def.min}
              max={def.max}
              step={def.step}
              value={num}
              onChange={(e) => set(Number(e.target.value))}
            />
          </label>
        );
      } else {
        // Campo numerico con bozza locale: si può cancellare e riscrivere
        // senza che il valore "scatti" indietro a ogni tasto.
        control = (
          <label className="settings-field-stack">
            <span>{def.label}</span>
            <input
              type="number"
              disabled={disabled}
              min={def.min}
              max={def.max}
              step={def.step}
              value={draft ?? String(num)}
              onChange={(e) => {
                setDraft(e.target.value);
                const parsed = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(parsed)) {
                  set(clamp(parsed, def.min, def.max));
                }
              }}
              onBlur={() => setDraft(null)}
            />
          </label>
        );
      }
      break;
    }
  }

  return (
    <div className={`settings-field${disabled ? " is-disabled" : ""}`}>
      {control}
      {def.description && <p className="settings-field-description">{def.description}</p>}
    </div>
  );
}

export default SettingsField;
