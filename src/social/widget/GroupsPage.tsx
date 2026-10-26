import { useRef, useState, type KeyboardEvent } from "react";
import { useCloud } from "../../core/cloud/useCloud";
import type { CloudGroup } from "../../core/cloud/groupsApi";
import { useNav } from "../../core/nav/useNav";
import BackButton from "../../ui/BackButton";
import CreateGroupDialog from "../groups/components/CreateGroupDialog";
import GroupsStatus from "../groups/components/GroupsStatus";
import JoinGroupDialog from "../groups/components/JoinGroupDialog";
import { useGroupsState } from "../groups/groupsState";
import { useGroups } from "../groups/useGroups";
import GroupInfoTab from "./GroupInfoTab";
import GroupRankingTab from "./GroupRankingTab";
import GroupsSharing from "./GroupsSharing";
import "../groups/components/groupsUi.css";
import "./GroupsPage.css";

type Tab = "group" | "ranking" | "report";

const TABS: { id: Tab; label: string }[] = [
  { id: "group", label: "Gruppo" },
  { id: "ranking", label: "Classifica" },
  { id: "report", label: "Report" },
];

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Schede del gruppo (pattern ARIA tabs): frecce, Home e Fine spostano la scheda e il fuoco. */
function GroupTabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const onKeyDown = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(TABS[next].id);
    refs.current[TABS[next].id]?.focus();
  };
  return (
    <div className="gp-tabs" role="tablist" aria-label="Sezioni del gruppo" onKeyDown={onKeyDown}>
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`gp-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls="gp-tabpanel"
          tabIndex={tab === t.id ? 0 : -1}
          className={`gp-tab${tab === t.id ? " is-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Il gruppo scelto: nome, ruolo e le tre schede. */
function GroupCard({ group, tab, onTab }: { group: CloudGroup; tab: Tab; onTab: (tab: Tab) => void }) {
  const { userId } = useCloud();
  const { members } = useGroups();
  const list = members[group.id] ?? [];
  const isOwner = group.ownerId === userId;
  const owner = list.find((m) => m.userId === group.ownerId);

  return (
    <section className="gp-card gp-group" aria-labelledby="gp-group-name">
      <div className="gp-group-head">
        <h2 id="gp-group-name">{group.name}</h2>
        <span className="gp-role">{isOwner ? "Sei il proprietario" : owner ? `Proprietario: ${owner.username}` : ""}</span>
      </div>
      <GroupTabs tab={tab} onChange={onTab} />
      <div id="gp-tabpanel" role="tabpanel" aria-labelledby={`gp-tab-${tab}`} className="gp-panel">
        {/* key: il codice torna nascosto e i campi ripartono da capo a ogni cambio di gruppo */}
        {tab === "group" && <GroupInfoTab key={group.id} group={group} members={list} meId={userId} isOwner={isOwner} />}
        {tab === "ranking" && <GroupRankingTab groupId={group.id} />}
        {tab === "report" && (
          <div className="gp-soon">
            <span className="gp-soon-title">Report per materie</span>
            <span className="grp-muted">
              Il tempo del gruppo per giorno e per materia, con le tue materie abbinate a quelle del gruppo. In arrivo.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * La pagina Gruppi (impostazioni-stanza.html), dettaglio del widget Gruppi: a sinistra "Cosa vedono gli altri", i
 * propri gruppi e Crea / Entra; a destra la vista scelta. Si apre sul gruppo selezionato (quello di widget e stanza).
 */
function GroupsPage() {
  const { goToDashboard } = useNav();
  const { userId } = useCloud();
  const state = useGroupsState();
  const { groups, members, selectedGroup, selectGroup } = useGroups();
  const [general, setGeneral] = useState(false);
  const [tab, setTab] = useState<Tab>("group");
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);

  // Un gruppo appena creato o raggiunto diventa quello selezionato: lo si mostra subito.
  const group = state === "ok" ? selectedGroup : null;
  const [shownId, setShownId] = useState(group?.id ?? null);
  if ((group?.id ?? null) !== shownId) {
    setShownId(group?.id ?? null);
    setGeneral(false);
  }

  return (
    // In Opaco il mockup ha le card neutre, non il pigmento del widget: "carta" ne ha esattamente i colori.
    <div className="gp" data-pigment="carta">
      <header className="gp-header">
        <BackButton onClick={goToDashboard} label="Dashboard" />
        <h1>Gruppi</h1>
      </header>

      {!group ? (
        <section className="gp-card gp-card--state">
          <GroupsStatus state={state === "ok" ? "loading" : state} />
        </section>
      ) : (
        <div className="gp-layout">
          <nav className="gp-card gp-nav" aria-label="Gruppi e impostazioni">
            <button
              type="button"
              className={`gp-nav-item${general ? " is-current" : ""}`}
              aria-current={general ? "page" : undefined}
              onClick={() => setGeneral(true)}
            >
              <EyeIcon />
              <span>Cosa vedono gli altri</span>
            </button>
            <span className="gp-nav-label">I tuoi gruppi</span>
            {groups.map((g) => {
              const current = !general && g.id === group.id;
              const count = members[g.id]?.length ?? 0;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`gp-nav-item gp-nav-group${current ? " is-current" : ""}`}
                  aria-current={current ? "page" : undefined}
                  onClick={() => {
                    setGeneral(false);
                    selectGroup(g.id);
                  }}
                >
                  <span className="gp-nav-icon" aria-hidden="true">
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="gp-nav-text">
                    <span className="gp-nav-name">{g.name}</span>
                    <span className="gp-nav-sub">
                      {count === 1 ? "1 membro" : `${count} membri`}
                      {g.ownerId === userId ? ", proprietario" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="gp-nav-actions">
              <button type="button" className="grp-btn gp-nav-btn" onClick={() => setDialog("create")}>
                Crea
              </button>
              <button type="button" className="grp-btn grp-btn--ghost gp-nav-btn" onClick={() => setDialog("join")}>
                Entra
              </button>
            </div>
          </nav>

          <div className="gp-content">{general ? <GroupsSharing /> : <GroupCard group={group} tab={tab} onTab={setTab} />}</div>
        </div>
      )}

      {dialog === "create" && <CreateGroupDialog onClose={() => setDialog(null)} />}
      {dialog === "join" && <JoinGroupDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

export default GroupsPage;
