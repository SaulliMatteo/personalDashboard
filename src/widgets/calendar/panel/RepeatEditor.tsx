import { addDays, dayKey, parseDayKey, startOfDay, weekdayIndex } from "../lib/dates";
import { WEEKDAYS_SHORT } from "../lib/format";
import type { RepeatFreq, RepeatRule } from "../lib/types";

/*
 * "Ripeti" del pannello: Mai / ogni giorno, settimana, mese, anno; ogni N; i giorni della settimana; la fine
 * (mai, il giorno…, dopo N volte). Ogni cambio consegna la regola intera (null = non si ripete).
 */

interface RepeatEditorProps {
  rule: RepeatRule | null;
  start: number;
  onChange: (rule: RepeatRule | null) => void;
}

const FREQ_LABEL: Record<RepeatFreq, [string, string]> = {
  day: ["Ogni giorno", "giorni"],
  week: ["Ogni settimana", "settimane"],
  month: ["Ogni mese", "mesi"],
  year: ["Ogni anno", "anni"],
};

type EndMode = "never" | "until" | "count";

function RepeatEditor({ rule, start, onChange }: RepeatEditorProps) {
  const ownDay = 1 << weekdayIndex(start);

  function setFreq(value: string) {
    if (value === "none") return onChange(null);
    const freq = value as RepeatFreq;
    onChange({
      freq,
      interval: rule?.interval ?? 1,
      weekdays: freq === "week" ? (rule?.weekdays || ownDay) : 0,
      until: rule?.until ?? null,
      count: rule?.count ?? null,
      exdates: rule?.exdates ?? [],
    });
  }

  if (!rule) {
    return (
      <select className="cal-field cal-field--select" aria-label="Ripeti" value="none" onChange={(e) => setFreq(e.target.value)}>
        <option value="none">Mai</option>
        {(Object.keys(FREQ_LABEL) as RepeatFreq[]).map((f) => (
          <option key={f} value={f}>
            {FREQ_LABEL[f][0]}
          </option>
        ))}
      </select>
    );
  }

  const endMode: EndMode = rule.count !== null ? "count" : rule.until !== null ? "until" : "never";
  const mask = rule.weekdays || ownDay;

  function setEnd(mode: EndMode) {
    if (mode === "never") onChange({ ...rule!, until: null, count: null });
    else if (mode === "count") onChange({ ...rule!, until: null, count: rule!.count ?? 10 });
    // fino al giorno scelto compreso: un mese dopo l'inizio, per cominciare
    else onChange({ ...rule!, count: null, until: rule!.until ?? addDays(startOfDay(start), 31).getTime() - 1 });
  }

  return (
    <div className="cal-repeat">
      <div className="cal-repeat-line">
        <select className="cal-field cal-field--select" aria-label="Ripeti" value={rule.freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="none">Mai</option>
          {(Object.keys(FREQ_LABEL) as RepeatFreq[]).map((f) => (
            <option key={f} value={f}>
              {FREQ_LABEL[f][0]}
            </option>
          ))}
        </select>
        <label className="cal-repeat-every">
          ogni
          <input
            type="number"
            min={1}
            max={99}
            className="cal-field cal-field--num"
            aria-label="Ogni quanti"
            value={rule.interval}
            onChange={(e) => onChange({ ...rule, interval: Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))) })}
          />
          {FREQ_LABEL[rule.freq][1]}
        </label>
      </div>

      {rule.freq === "week" && (
        <div className="cal-repeat-days" role="group" aria-label="Giorni della settimana">
          {WEEKDAYS_SHORT.map((name, i) => {
            const on = (mask & (1 << i)) !== 0;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                aria-label={name}
                className={on ? "active" : ""}
                onClick={() => {
                  const next = mask ^ (1 << i);
                  if (next !== 0) onChange({ ...rule, weekdays: next });
                }}
              >
                {name.charAt(0)}
              </button>
            );
          })}
        </div>
      )}

      <div className="cal-repeat-line">
        <select className="cal-field cal-field--select" aria-label="Fine della ripetizione" value={endMode} onChange={(e) => setEnd(e.target.value as EndMode)}>
          <option value="never">Per sempre</option>
          <option value="until">Fino al</option>
          <option value="count">Per</option>
        </select>
        {endMode === "until" && rule.until !== null && (
          <input
            type="date"
            className="cal-field cal-field--date"
            aria-label="Ultimo giorno"
            value={dayKey(rule.until)}
            min={dayKey(start)}
            onChange={(e) => {
              const d = parseDayKey(e.target.value);
              if (d) onChange({ ...rule, until: addDays(d, 1).getTime() - 1 });
            }}
          />
        )}
        {endMode === "count" && rule.count !== null && (
          <label className="cal-repeat-every">
            <input
              type="number"
              min={1}
              max={999}
              className="cal-field cal-field--num"
              aria-label="Quante volte"
              value={rule.count}
              onChange={(e) => onChange({ ...rule, count: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))) })}
            />
            volte
          </label>
        )}
      </div>
    </div>
  );
}

export default RepeatEditor;
