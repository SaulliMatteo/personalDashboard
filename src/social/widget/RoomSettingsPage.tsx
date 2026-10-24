import { useEffect, useState } from "react";
import { useCloud } from "../../core/cloud/useCloud";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, type CloudGroup, type CloudGroupMember } from "../../core/cloud/groupsApi";
import { formatInviteCode } from "../../core/cloud/inviteCode";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import BackButton from "../../ui/BackButton";
import ConfirmButton from "../../ui/ConfirmButton";
import GroupsStatus from "../groups/components/GroupsStatus";
import { useGroupsState } from "../groups/groupsState";
import { CloseIcon, CopyIcon } from "../groups/components/icons";
import { messageOf } from "../groups/messages";
import { useGroups } from "../groups/useGroups";
import "../../core/settings/components/settingsFields.css";
import "../groups/components/groupsUi.css";
import "./RoomSettingsPage.css";

const DAY_MS = 86_400_000;

/** "da oggi", "da ieri", "dal 2 ottobre". */
function sinceText(joinedAt: number, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(joinedAt))) / DAY_MS);
  if (days <= 0) return "da oggi";
  if (days === 1) return "da ieri";
  return `dal ${new Date(joinedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;
}

/**
 * Nome e descrizione: il proprietario li cambia (salvati quando esce dal campo), gli altri li leggono.
 * La pagina lo monta con una key fatta dei valori salvati: un'altra lettura dal server riparte da quelli.
 */
function GroupSection({ group, members, isOwner }: { group: CloudGroup; members: number; isOwner: boolean }) {
  const { updateGroup } = useGroups();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const cleanName = name.trim();
    const cleanDescription = description.trim();
    if (cleanName === group.name && cleanDescription === group.description) return;
    if (!cleanName) {
      setError("Il nome non può essere vuoto.");
      return;
    }
    setError(null);
    try {
      await updateGroup(group.id, cleanName, cleanDescription);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="room-card" aria-labelledby="room-group">
      <div className="room-card-head">
        <h2 id="room-group">Gruppo</h2>
        <span className="grp-muted">
          {members} / {group.maxMembers} membri
        </span>
      </div>
      {isOwner ? (
        <>
          <label className="grp-label">
            Nome
            <input
              type="text"
              className="grp-field room-field"
              value={name}
              maxLength={GROUP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void save()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <label className="grp-label">
            Descrizione
            <textarea
              className="grp-field grp-field--area room-field"
              rows={2}
              value={description}
              maxLength={GROUP_DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => void save()}
            />
          </label>
          {error && (
            <p className="grp-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="room-readonly">
          <span className="room-readonly-name">{group.name}</span>
          {group.description && <span className="room-readonly-text">{group.description}</span>}
        </div>
      )}
    </section>
  );
}

function InviteSection({ group, isOwner }: { group: CloudGroup; isOwner: boolean }) {
  const { regenerateInviteCode } = useGroups();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = formatInviteCode(group.inviteCode);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setError("Non riesco a copiarlo: selezionalo e copialo a mano."));
  };

  const regenerate = async () => {
    setError(null);
    try {
      await regenerateInviteCode(group.id);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="room-card" aria-labelledby="room-code">
      <h2 id="room-code">Codice invito</h2>
      <div className="room-code">
        <span className="room-code-value">{code}</span>
        <button type="button" className="grp-btn room-copy" onClick={copy}>
          <CopyIcon />
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
      <div className="room-code-foot">
        <span className="grp-muted room-code-note">
          {isOwner
            ? "Chi ha il codice può entrare. Rigeneralo se è finito nelle mani sbagliate: il vecchio smette subito di funzionare."
            : "Chi ha il codice può entrare. Solo il proprietario può cambiarlo."}
        </span>
        {isOwner && (
          <ConfirmButton
            label="Rigenera"
            confirmLabel="Sicuro? Clicca di nuovo"
            className="grp-btn grp-btn--ghost room-btn-sm"
            onConfirm={regenerate}
          />
        )}
      </div>
      {error && (
        <p className="grp-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

type PrivacyKey = "groupsShowSubject" | "groupsSharePixy" | "groupsSharePixyBubbles" | "groupsShowOthersBubbles";

function SwitchRow({ setting, label, note, disabled = false }: { setting: PrivacyKey; label: string; note: string; disabled?: boolean }) {
  const { settings, updateSetting } = useSettings();
  return (
    <label className={`room-switch-row${disabled ? " is-disabled" : ""}`}>
      <span className="room-switch-text">
        <span>{label}</span>
        <span className="grp-muted">{note}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="settings-switch"
        checked={settings[setting]}
        disabled={disabled}
        onChange={(e) => updateSetting(setting, e.target.checked)}
      />
    </label>
  );
}

function PrivacySection() {
  const { settings } = useSettings();
  return (
    <section className="room-card" aria-labelledby="room-privacy">
      <h2 id="room-privacy">Cosa vedono gli altri</h2>
      <SwitchRow setting="groupsShowSubject" label="Mostra la materia che sto studiando" note="Vale per tutti i tuoi gruppi" />
      <SwitchRow
        setting="groupsSharePixy"
        label="Condividi le espressioni di Pixy"
        note="Le pose rivelano che tipo di app hai in primo piano"
      />
      <SwitchRow
        setting="groupsSharePixyBubbles"
        label="Condividi anche i fumetti"
        note="Possono contenere il tuo nome e il nome delle app"
        disabled={!settings.groupsSharePixy}
      />
      <SwitchRow setting="groupsShowOthersBubbles" label="Mostra i fumetti degli altri" note="Solo per te, nella Stanza comune" />
      <div className="room-info">
        Gli altri membri vedono solo il tuo <strong>nome utente</strong>, se stai studiando o sei in pausa, e il tempo di{" "}
        <strong>oggi</strong> e della <strong>settimana</strong>. Il tuo Pixy, nella Stanza comune, mostra solo se studi o
        sei in pausa, a meno che tu non condivida le sue espressioni. Email e nome Google non vengono mai mostrati.
      </div>
    </section>
  );
}

function MemberRow({
  member,
  isMe,
  canRemove,
  onRemove,
}: {
  member: CloudGroupMember;
  isMe: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const since = sinceText(member.joinedAt);
  return (
    <li className={`room-member${isMe ? " is-me" : ""}`}>
      <span className="room-avatar" aria-hidden="true">
        {member.username.charAt(0).toUpperCase()}
      </span>
      <span className="room-member-text">
        <span className="room-member-name">{member.username}</span>
        <span className="grp-muted">{isMe ? `tu, ${since}` : since}</span>
      </span>
      {member.role === "owner" && <span className="room-chip">Proprietario</span>}
      {canRemove && (
        <button
          type="button"
          className={`room-remove${armed ? " is-armed" : ""}`}
          aria-label={armed ? `Conferma: rimuovi ${member.username}` : `Rimuovi ${member.username}`}
          title={armed ? "Clicca di nuovo per rimuovere" : undefined}
          onClick={() => {
            if (armed) {
              setArmed(false);
              onRemove();
            } else setArmed(true);
          }}
        >
          {armed ? <span className="room-remove-confirm">Rimuovi?</span> : <CloseIcon />}
        </button>
      )}
    </li>
  );
}

function MembersSection({ group, members, meId, isOwner }: { group: CloudGroup; members: CloudGroupMember[]; meId: string | null; isOwner: boolean }) {
  const { removeMember } = useGroups();
  const [error, setError] = useState<string | null>(null);
  const remove = async (userId: string) => {
    setError(null);
    try {
      await removeMember(group.id, userId);
    } catch (err) {
      setError(messageOf(err));
    }
  };
  return (
    <section className="room-card room-card--members" aria-labelledby="room-members">
      <h2 id="room-members">Membri</h2>
      <ul className="room-members">
        {members.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            isMe={m.userId === meId}
            canRemove={isOwner && m.userId !== meId}
            onRemove={() => void remove(m.userId)}
          />
        ))}
      </ul>
      {error && (
        <p className="grp-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function LeaveSection({ group, members, meId, isOwner }: { group: CloudGroup; members: CloudGroupMember[]; meId: string | null; isOwner: boolean }) {
  const { leaveGroup } = useGroups();
  const [error, setError] = useState<string | null>(null);
  // l'erede è il membro entrato per primo (members è già in ordine di ingresso), come fa il server
  const heir = members.find((m) => m.userId !== meId) ?? null;

  const leave = async () => {
    setError(null);
    try {
      await leaveGroup(group.id);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  let text;
  if (!isOwner) text = <>Non vedrai più i compagni di questo gruppo. Il tuo studio resta sul tuo computer.</>;
  else if (heir)
    text = (
      <>
        Sei il proprietario: il gruppo passerà a <strong>{heir.username}</strong>, il membro più anziano. Il tuo studio
        resta sul tuo computer.
      </>
    );
  else text = <>Sei l'unico membro: il gruppo verrà eliminato. Il tuo studio resta sul tuo computer.</>;

  return (
    <section className="room-card room-card--danger" aria-labelledby="room-leave">
      <div className="room-leave-text">
        <h2 id="room-leave">Abbandona il gruppo</h2>
        <span className="room-leave-note">{text}</span>
        {error && (
          <p className="grp-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <ConfirmButton label="Abbandona" className="grp-btn grp-btn--danger room-btn-leave" onConfirm={leave} />
    </section>
  );
}

/** Impostazioni della stanza (impostazioni-stanza.html): la pagina di dettaglio del widget Gruppi. */
function RoomSettingsPage() {
  const { goToDashboard } = useNav();
  const { userId } = useCloud();
  const state = useGroupsState();
  const { selectedGroup, members } = useGroups();
  const group = state === "ok" ? selectedGroup : null;
  const list = group ? (members[group.id] ?? []) : [];
  const isOwner = group !== null && group.ownerId === userId;

  return (
    <div className="room-settings">
      <header className="room-settings-header">
        <BackButton onClick={goToDashboard} label="Dashboard" />
        <div className="room-settings-titles">
          <h1>Impostazioni della stanza</h1>
          {group && (
            <span className="room-settings-sub">
              {group.name}, {isOwner ? "sei il proprietario" : `${list.length} membri`}
            </span>
          )}
        </div>
      </header>

      {!group ? (
        <section className="room-card room-card--state">
          <GroupsStatus state={state === "ok" ? "loading" : state} />
        </section>
      ) : (
        <div className="room-settings-grid">
          <div className="room-settings-col">
            <GroupSection key={`${group.id}:${group.name}:${group.description}`} group={group} members={list.length} isOwner={isOwner} />
            <InviteSection group={group} isOwner={isOwner} />
            <PrivacySection />
          </div>
          <div className="room-settings-col">
            <MembersSection group={group} members={list} meId={userId} isOwner={isOwner} />
            <LeaveSection group={group} members={list} meId={userId} isOwner={isOwner} />
          </div>
        </div>
      )}
    </div>
  );
}

export default RoomSettingsPage;
