import { useState } from "react";
import { useCloud } from "../../../core/cloud/useCloud";
import { CloudError } from "../../../core/cloud/errors";
import type { CloudGroupMember } from "../../../core/cloud/groupsApi";
import { SHORT_LABELS, type GroupsState } from "../groupsState";
import { useGroups } from "../useGroups";
import CreateGroupDialog from "./CreateGroupDialog";
import GroupsDialog from "./GroupsDialog";
import JoinGroupDialog from "./JoinGroupDialog";
import UsernameDialog from "./UsernameDialog";
import { EnterIcon, ExternalIcon, OfflineIcon, PlusIcon, Spinner } from "./icons";

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

type DialogKind = "username" | "create" | "join" | "choose" | null;

/** Le due strade del primo gruppo (stati.html, "nessun gruppo ancora"). */
function GroupChoices({ onPick }: { onPick: (kind: "create" | "join") => void }) {
  return (
    <>
      <button type="button" className="grp-choice" onClick={() => onPick("create")}>
        <span className="grp-choice-icon">
          <PlusIcon />
        </span>
        <span className="grp-choice-text">
          <span className="grp-choice-title">Crea un gruppo</span>
          <span className="grp-muted">Ricevi un codice invito</span>
        </span>
      </button>
      <button type="button" className="grp-choice" onClick={() => onPick("join")}>
        <span className="grp-choice-icon grp-choice-icon--soft">
          <EnterIcon />
        </span>
        <span className="grp-choice-text">
          <span className="grp-choice-title">Entra con codice</span>
          <span className="grp-muted">Te lo dà un membro del gruppo</span>
        </span>
      </button>
    </>
  );
}

function StaleMembers({ members, loadedAt }: { members: CloudGroupMember[]; loadedAt: number | null }) {
  if (members.length === 0) return null;
  return (
    <ul className="grp-stale-list">
      {members.map((m) => (
        <li key={m.userId} className="grp-stale-row">
          <span className="grp-dot grp-dot--off" aria-hidden="true" />
          <span className="grp-stale-name">{m.username}</span>
          {loadedAt !== null && <span className="grp-muted">ultimo dato {timeOf(loadedAt)}</span>}
        </li>
      ))}
    </ul>
  );
}

interface GroupsStatusProps {
  state: Exclude<GroupsState, "ok">;
  /** Taglia 1×1: solo una didascalia, e tutta la cella fa l'azione. */
  compact?: boolean;
  /** Quante righe di membri "vecchi" mostrare quando il server non risponde. */
  staleRows?: number;
}

/** Il pannello di uno stato (stati.html e primo-accesso.html), con le sue finestre. */
function GroupsStatus({ state, compact = false, staleRows = 3 }: GroupsStatusProps) {
  const cloud = useCloud();
  const groups = useGroups();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const close = () => setDialog(null);
  const username = cloud.status.kind === "ready" ? cloud.status.username : "";

  const retry = () => {
    if (cloud.status.kind === "unreachable") cloud.retry();
    else groups.reload();
  };

  const dialogs = (
    <>
      {dialog === "username" && <UsernameDialog onClose={close} />}
      {dialog === "create" && <CreateGroupDialog onClose={close} />}
      {dialog === "join" && <JoinGroupDialog onClose={close} />}
      {dialog === "choose" && (
        <GroupsDialog
          title={`Ciao ${username}, nessun gruppo ancora`}
          intro="Crea una stanza e manda il codice agli amici, oppure entra in quella di qualcun altro."
          onClose={close}
        >
          <div className="grp-choices">
            <GroupChoices onPick={setDialog} />
          </div>
        </GroupsDialog>
      )}
    </>
  );

  if (compact) {
    const action: Partial<Record<GroupsState, () => void>> = {
      signedOut: () => void cloud.signIn(),
      needsUsername: () => setDialog("username"),
      unreachable: retry,
      noGroups: () => setDialog("choose"),
    };
    const run = action[state];
    return (
      <>
        {run ? (
          <button
            type="button"
            className="grp-compact"
            data-cell-action
            onClick={(e) => {
              e.stopPropagation();
              run();
            }}
          >
            {SHORT_LABELS[state]}
          </button>
        ) : (
          <span className="grp-compact" role="status">
            {SHORT_LABELS[state]}
          </span>
        )}
        {dialogs}
      </>
    );
  }

  let body;
  switch (state) {
    case "unconfigured":
      body = (
        <div className="grp-state grp-state--center">
          <h2 className="grp-state-title">Gruppi non configurati</h2>
          <p className="grp-state-text">Questa versione dell'app non è collegata ai Gruppi: tutto il resto funziona come sempre.</p>
        </div>
      );
      break;
    case "unavailable":
      body = (
        <div className="grp-state grp-state--center">
          <h2 className="grp-state-title">Gruppi non disponibili</h2>
          <p className="grp-state-text">{new CloudError("unavailable").message}</p>
        </div>
      );
      break;
    case "loading":
      body = (
        <div className="grp-state grp-state--center" role="status">
          <p className="grp-state-text">Carico i gruppi…</p>
        </div>
      );
      break;
    case "signingIn":
      body = (
        <div className="grp-state grp-state--center">
          <Spinner />
          <div className="grp-state-head">
            <h2 className="grp-state-title">Completa l'accesso nel browser</h2>
            <p className="grp-state-text">Si è aperta una pagina di Google. Quando hai finito, l'app si aggiorna da sola.</p>
          </div>
          <div className="grp-actions grp-actions--center">
            <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => void cloud.signIn()}>
              Riapri il browser
            </button>
            <button type="button" className="grp-btn grp-btn--plain grp-btn--sm" onClick={cloud.cancelSignIn}>
              Annulla
            </button>
          </div>
        </div>
      );
      break;
    case "signedOut":
      body = (
        <div className="grp-state grp-state--center">
          <div className="grp-state-head">
            <h2 className="grp-state-title">Studia insieme ai tuoi amici</h2>
            <p className="grp-state-text">
              Crea un gruppo o entra con un codice, e guarda chi sta studiando in questo momento. Senza account l'app
              funziona come sempre.
            </p>
          </div>
          <button type="button" className="grp-btn grp-btn--sign-in" onClick={() => void cloud.signIn()}>
            Accedi con Google
            <ExternalIcon />
          </button>
          <span className="grp-muted grp-sign-in-note">L'accesso si apre nel browser, poi torni qui.</span>
          {cloud.signInError && (
            <p className="grp-error" role="alert">
              {cloud.signInError}
            </p>
          )}
        </div>
      );
      break;
    case "needsUsername":
      body = (
        <div className="grp-state grp-state--center">
          <div className="grp-state-head">
            <h2 className="grp-state-title">Scegli il tuo nome</h2>
            <p className="grp-state-text">È l'unica cosa di te che vedranno gli altri. Email e nome Google restano privati.</p>
          </div>
          <button type="button" className="grp-btn" onClick={() => setDialog("username")}>
            Scegli il nome
          </button>
        </div>
      );
      break;
    case "noGroups":
      body = (
        <div className="grp-state">
          <div className="grp-state-head">
            <h2 className="grp-state-title">Ciao {username}, nessun gruppo ancora</h2>
            <p className="grp-state-text">Crea una stanza e manda il codice agli amici, oppure entra in quella di qualcun altro.</p>
          </div>
          <GroupChoices onPick={setDialog} />
        </div>
      );
      break;
    case "unreachable": {
      const selected = groups.selectedGroup;
      const members = selected ? (groups.members[selected.id] ?? []).slice(0, staleRows) : [];
      body = (
        <div className="grp-state">
          <div className="grp-warn" role="status">
            <OfflineIcon />
            <span>
              <strong>Gruppi non raggiungibili.</strong> Lo studio continua a essere salvato qui e si sincronizza appena
              torni online.
            </span>
          </div>
          <StaleMembers members={members} loadedAt={groups.loadedAt} />
          <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm grp-retry" onClick={retry}>
            Riprova ora
          </button>
        </div>
      );
      break;
    }
  }

  return (
    <>
      {body}
      {dialogs}
    </>
  );
}

export default GroupsStatus;
