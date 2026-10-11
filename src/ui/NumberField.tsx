import { useState, type InputHTMLAttributes } from "react";

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> {
  value: number;
  /** Chiamata solo con un valore valido (intero nell'intervallo), a fine modifica. */
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Se true, il valore viene salvato a ogni tasto valido invece che a fine modifica. */
  live?: boolean;
}

/**
 * Campo numerico in cui si SCRIVE soltanto (niente frecce, niente cambio
 * con la rotella del mouse). Tiene una bozza locale: si può cancellare e
 * riscrivere senza che il valore scatti indietro; la bozza non valida
 * (vuota, 0 sotto il minimo) torna al valore precedente a fine modifica.
 */
function NumberField({ value, onCommit, min = 1, max = 999, live = false, onBlur, onKeyDown, onFocus, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const maxLength = String(max).length;

  // Allinea la bozza se il valore cambia dall'esterno (reset di stato
  // durante il render, il modo indicato da React per "derivare" stato da una prop).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  function parse(text: string): number | null {
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }

  function commit() {
    const parsed = parse(draft);
    if (parsed === null) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      maxLength={maxLength}
      value={draft}
      onFocus={(e) => {
        e.target.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, "");
        setDraft(next);
        if (live) {
          const parsed = parse(next);
          if (parsed !== null && parsed !== value) onCommit(parsed);
        }
      }}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        onKeyDown?.(e);
      }}
    />
  );
}

export default NumberField;
