import { createContext, useContext } from "react";
import type { CloudGroup, CloudGroupMember, JoinGroupResult } from "../../core/cloud/groupsApi";

/* Contesto e hook separati dal provider (GroupsContext.tsx), come per le impostazioni. */

export interface GroupsValue {
  /** I propri gruppi; restano gli ultimi letti anche se il server non risponde. */
  groups: CloudGroup[];
  /** gruppo → membri, dal più vecchio. */
  members: Record<string, CloudGroupMember[]>;
  /** utente → ultima volta connesso (ms, ora del server). */
  lastSeen: Record<string, number>;
  /** false finché non arriva la prima lettura (per non mostrare "nessun gruppo" mentre si carica). */
  loaded: boolean;
  /** L'ultima lettura è fallita: i dati sono quelli di `loadedAt`. */
  stale: boolean;
  /** Ora (locale) dell'ultima lettura riuscita. */
  loadedAt: number | null;
  /** Il gruppo mostrato da widget e stanza comune (il primo, se quello scelto non c'è più). */
  selectedGroup: CloudGroup | null;
  selectGroup: (groupId: string) => void;
  reload: () => void;
  /** Le azioni lanciano un CloudError con un messaggio da mostrare; dopo, i dati si rileggono da soli. */
  createGroup: (name: string, description: string) => Promise<void>;
  /** Con "ok" il gruppo appena raggiunto diventa quello selezionato. */
  joinGroup: (code: string) => Promise<JoinGroupResult>;
  leaveGroup: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  regenerateInviteCode: (groupId: string) => Promise<void>;
  updateGroup: (groupId: string, name: string, description: string) => Promise<void>;
}

export const GroupsContext = createContext<GroupsValue | undefined>(undefined);

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error("useGroups deve essere usato dentro <GroupsProvider>");
  return ctx;
}
