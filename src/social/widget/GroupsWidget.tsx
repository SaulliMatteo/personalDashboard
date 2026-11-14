import { useState } from "react";
import { useSingleClick } from "../../core/hooks/useSingleClick";
import { useNav } from "../../core/nav/useNav";
import { sizeKey } from "../../core/widgets/sizes";
import type { WidgetProps } from "../../core/widgets/types";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import GroupsStatus from "../groups/components/GroupsStatus";
import { useGroupsState } from "../groups/groupsState";
import { useGroups } from "../groups/useGroups";
import {
  formatStudyTime,
  KIND_LABELS,
  previewFaces,
  studyingCount,
  visibleRows,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from "../modules/study/leaderboard";
import { useLeaderboard } from "../modules/study/useLeaderboard";
import "../groups/components/groupsUi.css";
import "./GroupsWidget.css";

/** Righe della classifica nelle taglie M e L (widget.html). */
const LEADERBOARD_ROWS = 5;

function rankClass(rank: number): string {
  return rank <= 3 ? `groupsw-rank groupsw-rank--${rank}` : "groupsw-rank";
}

/** `bars`: nella taglia L ogni riga ha la barra del suo tempo, rispetto al primo (decorativa: il tempo è scritto). */
function Leaderboard({ rows, bars = false }: { rows: LeaderboardRow[]; bars?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.seconds));
  return (
    <ol className={`groupsw-rows${bars ? " groupsw-rows--bars" : ""}`}>
      {rows.map((r) => (
        <li
          key={r.userId}
          className={`groupsw-row${r.isMe ? " is-me" : ""}`}
          aria-label={`${r.rank}°, ${r.username}${r.isMe ? " (tu)" : ""}: ${formatStudyTime(r.seconds)}, ${KIND_LABELS[r.kind]}`}
        >
          <span className={rankClass(r.rank)} aria-hidden="true">
            {r.rank}
          </span>
          <span className={`grp-dot grp-dot--${r.kind}`} aria-hidden="true" />
          <span className="groupsw-name" aria-hidden="true">
            {r.isMe ? `${r.username} (tu)` : r.username}
          </span>
          {bars && (
            <span className="groupsw-bar" aria-hidden="true">
              <span style={{ width: `${(r.seconds / max) * 100}%` }} />
            </span>
          )}
          <span className="groupsw-time" aria-hidden="true">
            {formatStudyTime(r.seconds)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PeriodSwitch({ period, onChange }: { period: LeaderboardPeriod; onChange: (p: LeaderboardPeriod) => void }) {
  const option = (value: LeaderboardPeriod, label: string) => (
    <button
      type="button"
      aria-pressed={period === value}
      className={period === value ? "is-on" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onChange(value);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="groupsw-period" role="group" aria-label="Periodo">
      {option("today", "Oggi")}
      {option("week", "Settimana")}
    </div>
  );
}

/** Facce nel widget largo: oltre, "+N". */
const WIDE_FACES = 5;

/**
 * 2×1, solo sul telefono (docs/mockup/mobile/novita.html): quanti studiano ora, il gruppo e le facce dei compagni col
 * loro stato. Tutta la cella apre la Stanza comune (il doppio tocco apre il dettaglio, come le altre celle).
 */
function WideGroups({ groupName, rows, studying }: { groupName: string; rows: LeaderboardRow[]; studying: number }) {
  const { openRoom } = useNav();
  const onClick = useSingleClick(openRoom);
  const { faces, more } = previewFaces(rows, WIDE_FACES);
  const label = `${groupName}: ${studying} ${studying === 1 ? "studia" : "studiano"} ora. Apri la Stanza comune`;
  return (
    <button type="button" data-cell-action className="groupsw-wide" onClick={onClick} aria-label={label} title={label}>
      <span className="groupsw-big" aria-hidden="true">
        {studying}
      </span>
      <span className="groupsw-wide-info" aria-hidden="true">
        <span className="groupsw-wide-title">
          {studying === 1 ? "studia ora" : "studiano ora"} · {groupName}
        </span>
        <span className="groupsw-faces">
          {faces.map((r) => (
            <span key={r.userId} className={`groupsw-face${r.isMe ? " is-me" : ""}`} title={`${r.username}: ${KIND_LABELS[r.kind]}`}>
              {r.username.slice(0, 1).toUpperCase()}
              <span className={`grp-dot grp-dot--${r.kind}`} />
            </span>
          ))}
          {more > 0 && <span className="groupsw-more">+{more}</span>}
        </span>
      </span>
      <svg className="groupsw-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M10 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/**
 * Widget Gruppi: 1×1 quanti studiano ora; M la classifica di oggi o della settimana; L la stessa classifica con le
 * barre. Senza account, senza gruppi o senza rete mostra lo stato al posto dei dati.
 */
function GroupsWidget({ w, h }: WidgetProps) {
  const size = sizeKey(w, h);
  const state = useGroupsState();
  const { selectedGroup } = useGroups();
  const [period, setPeriod] = useState<LeaderboardPeriod>("today");
  const rows = useLeaderboard(state === "ok" ? (selectedGroup?.id ?? null) : null, period);

  if (state !== "ok" || !selectedGroup) {
    return (
      <WidgetFrame>
        <article className={`widget groupsw groupsw--${size} groupsw--state`} aria-label="Gruppi">
          <GroupsStatus state={state === "ok" ? "loading" : state} compact={size === "S" || size === "W"} staleRows={size === "L" ? 4 : 3} />
        </article>
      </WidgetFrame>
    );
  }

  const studying = studyingCount(rows);

  if (size === "S") {
    return (
      <WidgetFrame>
        <article className="widget groupsw groupsw--S" aria-label={`${selectedGroup.name}: ${studying} studiano ora`}>
          <span className="groupsw-big" aria-hidden="true">
            {studying}
          </span>
          <span className="groupsw-cap" aria-hidden="true">
            studiano ora
          </span>
          <span className="groupsw-dots" aria-hidden="true">
            {rows.map((r) => (
              <span key={r.userId} className={`grp-dot grp-dot--${r.kind}`} />
            ))}
          </span>
        </article>
      </WidgetFrame>
    );
  }

  if (size === "W") {
    return (
      <WidgetFrame>
        <article className="widget groupsw groupsw--W">
          <WideGroups groupName={selectedGroup.name} rows={rows} studying={studying} />
        </article>
      </WidgetFrame>
    );
  }

  const shown = visibleRows(rows, LEADERBOARD_ROWS);

  if (size === "L") {
    return (
      <WidgetFrame>
        <article className="widget groupsw groupsw--L" aria-label={`Gruppi: classifica di ${selectedGroup.name}`}>
          <header className="groupsw-head">
            <div className="groupsw-titles">
              <h2>Classifica di {period === "today" ? "oggi" : "settimana"}</h2>
              <span className="groupsw-sub">
                {selectedGroup.name}, {studying} studiano ora
              </span>
            </div>
            <PeriodSwitch period={period} onChange={setPeriod} />
          </header>
          <Leaderboard rows={shown} bars />
        </article>
      </WidgetFrame>
    );
  }

  return (
    <WidgetFrame>
      <article className={`widget groupsw groupsw--${size}`} aria-label={`Gruppi: classifica di ${selectedGroup.name}`}>
        <header className="groupsw-head">
          <div className="groupsw-titles">
            <h2>Classifica</h2>
            <span className="groupsw-sub">{selectedGroup.name}</span>
          </div>
          <PeriodSwitch period={period} onChange={setPeriod} />
        </header>
        <Leaderboard rows={shown} />
      </article>
    </WidgetFrame>
  );
}

export default GroupsWidget;
