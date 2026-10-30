import { useEffect, useState } from "react";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, type CloudGroup, type CloudGroupMember } from "../../core/cloud/groupsApi";
import { formatInviteCode } from "../../core/cloud/inviteCode";
import ConfirmButton from "../../ui/ConfirmButton";
import { CloseIcon } from "../groups/components/icons";
import { messageOf } from "../groups/messages";
import { useGroups } from "../groups/useGroups";
import "./GroupInfoTab.css";

const DAY_MS = 86_400_000;
const HIDDEN_CODE = "••••-••••";

/** "da oggi", "da ieri", "dal 2 ottobre". */
function sinceText(joinedAt: number, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(joinedAt))) / DAY_MS);
  if (days <= 0) return "da oggi";
  if (days === 1) return "da ieri";
  return `dal ${new Date(joinedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {crossed ? (
        <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/**
 * Codice invito, nascosto finché non si preme l'occhio (lo stato non si salva: a ogni apertura torna nascosto).
 * "Copia" funziona anche da nascosto.
 */
function InviteCode({ group, isOwner }: { group: CloudGroup; isOwner: boolean }) {
  const { regenerateInviteCode } = useGroups();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = formatInviteCode(group.inviteCode);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = () => {
    setError(null);
    navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setError("Non riesco a copiarlo: mostralo e copialo a mano."));
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
    <div className="gi-block">
      <h3>Codice invito</h3>
      <div className="gi-code">
        {shown ? (
          <span className="gi-code-value">{code}</span>
        ) : (
          <span className="gi-code-value">
            <span aria-hidden="true">{HIDDEN_CODE}</span>
            <span className="gi-sr">Codice nascosto</span>
          </span>
        )}
        <button
          type="button"
          className="grp-btn grp-btn--ghost gi-eye"
          aria-label={shown ? "Nascondi il codice" : "Mostra il codice"}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          <EyeIcon crossed={shown} />
        </button>
        <button type="button" className="grp-btn gp-fill gi-copy" onClick={copy}>
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
      <span className="gi-sr" role="status">
        {copied ? "Codice copiato" : ""}
      </span>
      {isOwner && (
        <div className="gi-code-foot">
          <span className="gi-note">Rigenerandolo, il vecchio codice smette subito di funzionare.</span>
          <ConfirmButton
            label="Rigenera"
            confirmLabel="Sicuro? Clicca di nuovo"
            className="grp-btn grp-btn--ghost gi-btn-sm"
            onConfirm={regenerate}
          />
        </div>
      )}
      {error && (
        <p className="grp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Nome e descrizione: il proprietario li cambia (salvati quando esce dal campo), gli altri li vedono in sola lettura.
 * Si monta con una key fatta dei valori salvati: un'altra lettura dal server riparte da quelli.
 */
function GroupFields({ group, isOwner }: { group: CloudGroup; isOwner: boolean }) {
  const { updateGroup } = useGroups();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!isOwner) return;
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
    <div className="gi-block">
      <h3>Informazioni</h3>
      <label className="gi-field-label">
        Nome
        <input
          type="text"
          className="grp-field gi-field"
          value={name}
          maxLength={GROUP_NAME_MAX}
          readOnly={!isOwner}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      <label className="gi-field-label">
        Descrizione
        <textarea
          className="grp-field grp-field--area gi-field"
          rows={2}
          value={description}
          maxLength={GROUP_DESCRIPTION_MAX}
          readOnly={!isOwner}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void save()}
        />
      </label>
      {!isOwner && <span className="gi-note">Solo il proprietario può modificarle.</span>}
      {error && (
        <p className="grp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function MemberRow({ member, isMe, canRemove, onRemove }: { member: CloudGroupMember; isMe: boolean; canRemove: boolean; onRemove: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const since = sinceText(member.joinedAt);
  return (
    <li className={`gi-member${isMe ? " is-me" : ""}`}>
      <span className="gi-avatar" aria-hidden="true">
        {member.username.charAt(0).toUpperCase()}
      </span>
      <span className="gi-member-text">
        <span className="gi-member-name">{member.username}</span>
        <span className="gi-note">{isMe ? `tu, ${since}` : since}</span>
      </span>
      {member.role === "owner" && <span className="gi-chip">Proprietario</span>}
      {canRemove && (
        <button
          type="button"
          className={`gi-remove${armed ? " is-armed" : ""}`}
          aria-label={armed ? `Conferma: rimuovi ${member.username}` : `Rimuovi ${member.username}`}
          title={armed ? "Clicca di nuovo per rimuovere" : undefined}
          onClick={() => {
            if (armed) {
              setArmed(false);
              onRemove();
            } else setArmed(true);
          }}
        >
          {armed ? <span className="gi-remove-confirm">Rimuovi?</span> : <CloseIcon />}
        </button>
      )}
    </li>
  );
}

function Members({ group, members, meId, isOwner }: { group: CloudGroup; members: CloudGroupMember[]; meId: string | null; isOwner: boolean }) {
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
    <div className="gi-block">
      <h3>
        Membri ({members.length} / {group.maxMembers})
      </h3>
      <ul className="gi-members">
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
    </div>
  );
}

function Leave({ group, members, meId, isOwner }: { group: CloudGroup; members: CloudGroupMember[]; meId: string | null; isOwner: boolean }) {
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
  if (!isOwner) text = <>Per rientrare ti servirà di nuovo un codice invito. Il tuo studio resta sul tuo computer.</>;
  else if (heir)
    text = (
      <>
        Sei il proprietario: il gruppo passerà a <strong>{heir.username}</strong>, il membro più anziano. Il tuo studio
        resta sul tuo computer.
      </>
    );
  else text = <>Sei l'unico membro: il gruppo verrà eliminato. Il tuo studio resta sul tuo computer.</>;

  return (
    <div className="gi-leave">
      <span className="gi-leave-text">
        <span className="gi-leave-title">Abbandona il gruppo</span>
        <span className="gi-leave-note">{text}</span>
        {error && (
          <span className="grp-error" role="alert">
            {error}
          </span>
        )}
      </span>
      <ConfirmButton label="Abbandona" className="grp-btn grp-btn--danger gi-btn-leave" onConfirm={leave} />
    </div>
  );
}

/** Scheda "Gruppo": codice invito, informazioni, membri e "Abbandona il gruppo". */
function GroupInfoTab({ group, members, meId, isOwner }: { group: CloudGroup; members: CloudGroupMember[]; meId: string | null; isOwner: boolean }) {
  return (
    <div className="gi">
      <div className="gi-col">
        <InviteCode group={group} isOwner={isOwner} />
        <GroupFields key={`${group.name}:${group.description}`} group={group} isOwner={isOwner} />
      </div>
      <Members group={group} members={members} meId={meId} isOwner={isOwner} />
      <Leave group={group} members={members} meId={meId} isOwner={isOwner} />
    </div>
  );
}

export default GroupInfoTab;
