import { useState } from "react";
import { MdAdd, MdChevronLeft, MdChevronRight, MdClose, MdDeleteOutline } from "react-icons/md";
import { CHOICE_COLORS, FIELD_TYPES, type Choice, type Field, type FieldType, type ValueContext } from "../lib/collections";
import { changeFieldType, deleteField, moveField, newChoiceId, nextChoiceColor, renameField, setFieldChoices } from "../lib/collectionsStore";
import ChoiceChip from "./ChoiceChip";
import "./FieldMenu.css";

interface FieldMenuProps {
  field: Field;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  ctx: ValueContext;
  onClose: () => void;
  onNotice: (message: string) => void;
}

/** Menu di un campo (dall'intestazione della colonna): nome, tipo, scelte, posizione, elimina. */
function FieldMenu({ field, isFirst, isLast, canDelete, ctx, onClose, onNotice }: FieldMenuProps) {
  const [name, setName] = useState(field.name);
  const [choices, setChoices] = useState<Choice[]>(field.options.choices ?? []);
  const [armed, setArmed] = useState(false);

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
    } catch (error) {
      console.error(failure, error);
      onNotice(error instanceof Error && error.message.startsWith("Una raccolta") ? error.message : failure);
    }
  }

  function saveChoices(next: Choice[]) {
    setChoices(next);
    void run(() => setFieldChoices(field.id, next), "Impossibile salvare le scelte");
  }

  const hasChoices = field.type === "select" || field.type === "multi";

  return (
    <>
      <div className="nq-fmenu-backdrop" onClick={onClose} />
      <div
        className="nq-fmenu"
        role="dialog"
        aria-label={`Campo ${field.name}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <label className="nq-fmenu-row">
          <span>Nome</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== field.name && void run(() => renameField(field.id, name), "Impossibile rinominare il campo")}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <label className="nq-fmenu-row">
          <span>Tipo</span>
          <select
            value={field.type}
            onChange={(e) => void run(() => changeFieldType(field.id, e.target.value as FieldType, ctx), "Impossibile cambiare il tipo")}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <p className="nq-fmenu-hint">Cambiando tipo, i valori che non si possono convertire si perdono.</p>

        {hasChoices && (
          <div className="nq-fmenu-choices" role="group" aria-label="Scelte">
            <span className="nq-fmenu-label">Scelte</span>
            {choices.map((c, i) => (
              <div key={c.id} className="nq-fmenu-choice">
                <ChoiceChip label="" color={c.color} />
                <input
                  value={c.label}
                  aria-label={`Scelta ${i + 1}`}
                  placeholder="Nome della scelta"
                  onChange={(e) => setChoices(choices.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))}
                  onBlur={() => saveChoices(choices)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
                <select
                  aria-label={`Colore della scelta ${c.label || i + 1}`}
                  value={c.color}
                  onChange={(e) => saveChoices(choices.map((x) => (x.id === c.id ? { ...x, color: e.target.value as Choice["color"] } : x)))}
                >
                  {CHOICE_COLORS.map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="nq-fmenu-x" aria-label={`Togli la scelta ${c.label}`} onClick={() => saveChoices(choices.filter((x) => x.id !== c.id))}>
                  <MdClose />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="nq-fmenu-btn"
              onClick={() => saveChoices([...choices, { id: newChoiceId(), label: `Scelta ${choices.length + 1}`, color: nextChoiceColor(choices) }])}
            >
              <MdAdd aria-hidden="true" /> Aggiungi scelta
            </button>
          </div>
        )}

        <div className="nq-fmenu-actions">
          <button type="button" className="nq-fmenu-btn" disabled={isFirst} onClick={() => void run(() => moveField(field.id, -1), "Impossibile spostare il campo")}>
            <MdChevronLeft aria-hidden="true" /> Sposta a sinistra
          </button>
          <button type="button" className="nq-fmenu-btn" disabled={isLast} onClick={() => void run(() => moveField(field.id, 1), "Impossibile spostare il campo")}>
            Sposta a destra <MdChevronRight aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={`nq-fmenu-btn nq-fmenu-danger${armed ? " is-armed" : ""}`}
          disabled={!canDelete}
          title={canDelete ? undefined : "Una raccolta ha almeno un campo"}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            onClose();
            void run(() => deleteField(field.id), "Impossibile eliminare il campo");
          }}
        >
          <MdDeleteOutline aria-hidden="true" /> {armed ? "Clicca ancora per eliminare" : "Elimina campo"}
        </button>
      </div>
    </>
  );
}

export default FieldMenu;
