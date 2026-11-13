import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { APP_CATEGORIES } from "../../../core/system/appCategory";
import { CATEGORY_LABEL } from "../lib/categories";
import type { LimitKind, ScreenLimit } from "../lib/limits";

export interface LimitOption {
  target: string;
  label: string;
}

export interface LimitDraft {
  kind: LimitKind;
  target: string;
  label: string;
  minutes: number;
  warn: boolean;
}

interface LimitDialogProps {
  /** Valori di partenza (limite esistente, o voce scelta dal menu ⋯). */
  initial: LimitDraft | null;
  /** Il limite che si sta modificando (mostra "Togli il limite"). */
  editing: ScreenLimit | null;
  apps: LimitOption[];
  sites: LimitOption[];
  onSave: (draft: LimitDraft) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<LimitKind, string> = { app: "App", site: "Sito", category: "Categoria" };
const PRESETS = [15, 30, 60, 120];
const presetLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);
const CATEGORY_OPTIONS: LimitOption[] = APP_CATEGORIES.map((c) => ({ target: c, label: CATEGORY_LABEL[c] }));

/** Le scelte possibili, con quella di partenza anche se oggi non compare tra quelle usate. */
function withCurrent(list: LimitOption[], draft: LimitDraft | null, kind: LimitKind): LimitOption[] {
  if (!draft || draft.kind !== kind || list.some((o) => o.target === draft.target)) return list;
  return [{ target: draft.target, label: draft.label }, ...list];
}

/**
 * "Aggiungi un limite" (docs/design/temi/tempo-pc.html): app, sito o categoria, minuti al giorno, avviso all'80 %.
 * Lo stesso dialog modifica un limite esistente (stessa app/sito/categoria = stesso limite).
 */
function LimitDialog({ initial, editing, apps, sites, onSave, onDelete, onClose }: LimitDialogProps) {
  const [kind, setKind] = useState<LimitKind>(initial?.kind ?? "app");
  const lists: Record<LimitKind, LimitOption[]> = {
    app: withCurrent(apps, initial, "app"),
    site: withCurrent(sites, initial, "site"),
    category: CATEGORY_OPTIONS,
  };
  const [targets, setTargets] = useState<Record<LimitKind, string>>(() => ({
    app: initial?.kind === "app" ? initial.target : (lists.app[0]?.target ?? ""),
    site: initial?.kind === "site" ? initial.target : (lists.site[0]?.target ?? ""),
    category: initial?.kind === "category" ? initial.target : "video",
  }));
  const [minutes, setMinutes] = useState(initial?.minutes ?? 60);
  const [warn, setWarn] = useState(initial?.warn ?? true);
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button[aria-pressed='true']")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const options = lists[kind];
  const target = targets[kind];
  const chosen = options.find((o) => o.target === target);
  const valid = Boolean(chosen) && minutes >= 1 && minutes <= 24 * 60;

  function save() {
    if (!chosen || !valid) return;
    onSave({ kind, target: chosen.target, label: chosen.label, minutes: Math.round(minutes), warn });
  }

  return createPortal(
    <div
      className="std-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="std" role="dialog" aria-modal="true" aria-labelledby="std-title">
        <header className="std-head">
          <h2 id="std-title">{editing ? "Modifica il limite" : "Aggiungi un limite"}</h2>
          <p>Ti avviso quando ti avvicini e quando lo superi. Si azzera a mezzanotte.</p>
        </header>
        <div className="std-body">
          <div className="std-field">
            Cosa
            <div className="stp-tabs" role="group" aria-label="Tipo di limite">
              {(Object.keys(KIND_LABEL) as LimitKind[]).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <label className="std-field">
            {KIND_LABEL[kind]}
            {options.length > 0 ? (
              <select value={target} onChange={(e) => setTargets((t) => ({ ...t, [kind]: e.target.value }))}>
                {options.map((o) => (
                  <option key={o.target} value={o.target}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="std-none">{kind === "site" ? "Ancora nessun sito contato negli ultimi giorni." : "Ancora nessuna app contata negli ultimi giorni."}</span>
            )}
          </label>
          <div className="std-field">
            Al giorno
            <div className="std-mins">
              {PRESETS.map((m) => (
                <button key={m} type="button" className={`std-btn ${minutes === m ? "std-btn--primary" : "std-btn--ghost"} std-btn--small`} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                  {presetLabel(m)}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={1440}
                step={5}
                value={minutes}
                aria-label="Minuti al giorno"
                onChange={(e) => setMinutes(Number(e.target.value) || 0)}
              />
              <span>min</span>
            </div>
          </div>
          <label className="std-check">
            <input type="checkbox" checked={warn} onChange={(e) => setWarn(e.target.checked)} /> Avvisami anche all'80 %
          </label>
        </div>
        <footer className="std-actions">
          {editing && (
            <button type="button" className="std-btn std-btn--danger" onClick={() => onDelete(editing.id)}>
              Togli il limite
            </button>
          )}
          <span className="std-spacer" />
          <button type="button" className="std-btn std-btn--ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className="std-btn std-btn--primary" aria-disabled={!valid} onClick={save}>
            Salva
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export default LimitDialog;
