import { useId } from "react";
import { useSettings } from "../useSettings";
import type { SettingDef, SettingKey } from "../schema";
import NumberField from "../../../ui/NumberField";
import "./settingsFields.css";

function formatNumber(value: number, step: number) {
  const decimals = step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0;
  return value.toFixed(decimals);
}

/**
 * Renderizza UN controllo a partire dalla sua definizione nello schema:
 * una riga con etichetta e descrizione a sinistra, controllo a destra.
 * Aggiungere un tipo di controllo = aggiungere un caso qui.
 */
function SettingsField({ def }: { def: SettingDef }) {
  const { settings, updateSetting } = useSettings();
  const id = useId();
  const descId = `${id}-desc`;

  const value = settings[def.key];
  // Disattivato (ma visibile) se la impostazione da cui dipende è spenta.
  const disabled = def.dependsOn !== undefined && !settings[def.dependsOn];
  // def.key è un'unione di chiavi: la coerenza chiave/valore è garantita
  // dallo schema (e da sanitizeSettings in lettura), non dal type system.
  const set = (next: unknown) =>
    (updateSetting as (key: SettingKey, value: unknown) => void)(def.key, next);
  const described = def.description ? descId : undefined;

  let control;
  let valueText: string | null = null;
  switch (def.type) {
    case "boolean":
      control = (
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="settings-switch"
          aria-describedby={described}
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(e) => set(e.target.checked)}
        />
      );
      break;

    case "select":
      control = (
        <select id={id} aria-describedby={described} disabled={disabled} value={String(value)} onChange={(e) => set(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;

    case "color":
      control = (
        <input id={id} type="color" aria-describedby={described} disabled={disabled} value={String(value)} onChange={(e) => set(e.target.value)} />
      );
      break;

    case "text":
      control = (
        <input
          id={id}
          type="text"
          aria-describedby={described}
          disabled={disabled}
          maxLength={def.maxLength}
          placeholder={def.placeholder}
          value={String(value)}
          onChange={(e) => set(e.target.value.slice(0, def.maxLength))}
        />
      );
      break;

    case "number": {
      const num = Number(value);
      if (def.control === "slider") {
        valueText = `${formatNumber(num, def.step)}${def.unit ?? ""}`;
        control = (
          <input
            id={id}
            type="range"
            aria-describedby={described}
            disabled={disabled}
            min={def.min}
            max={def.max}
            step={def.step}
            value={num}
            onChange={(e) => set(Number(e.target.value))}
          />
        );
      } else {
        // Campo numerico in cui si scrive soltanto (vedi ui/NumberField).
        control = <NumberField id={id} disabled={disabled} min={def.min} max={def.max} value={num} onCommit={set} live />;
      }
      break;
    }
  }

  return (
    <div className={`settings-field settings-field--${def.type}${disabled ? " is-disabled" : ""}`}>
      <div className="settings-field-text">
        <label htmlFor={id} className="settings-field-label">
          {def.label}
        </label>
        {def.description && (
          <p id={descId} className="settings-field-description">
            {def.description}
          </p>
        )}
      </div>
      <div className="settings-field-control">
        {valueText && <span className="settings-field-value">{valueText}</span>}
        {control}
      </div>
    </div>
  );
}

export default SettingsField;
