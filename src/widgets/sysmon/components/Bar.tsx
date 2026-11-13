import type { CSSProperties } from "react";

/**
 * Barra di riempimento (memoria, disco, batteria). La forma la decide il tema nel CSS (SysmonWidget.css): sottile in
 * Notte, spessa in Opaco, a matita in Quaderno, a punti in Fosforo. `value` 0-100; null = barra vuota.
 */
function Bar({ value, hot = false, label }: { value: number | null; hot?: boolean; label?: string }) {
  const v = value == null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div
      className={`smw-bar${hot ? " is-hot" : ""}`}
      style={{ "--v": `${v}%` } as CSSProperties}
      role={label ? "meter" : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label && value != null ? Math.round(v) : undefined}
      aria-hidden={label ? undefined : true}
    >
      <i />
    </div>
  );
}

export default Bar;
