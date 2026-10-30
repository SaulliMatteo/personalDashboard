import { useCloud } from "../../core/cloud/useCloud";
import { useGroups } from "./useGroups";

/** In che punto è l'utente: tutto ciò che non è "ok" si mostra al posto dei dati dei gruppi. */
export type GroupsState =
  | "unconfigured"
  | "unavailable"
  | "loading"
  | "signedOut"
  | "signingIn"
  | "needsUsername"
  | "unreachable"
  | "noGroups"
  | "ok";

export function useGroupsState(): GroupsState {
  const { status, signingIn } = useCloud();
  const { loaded, stale, groups } = useGroups();
  switch (status.kind) {
    case "unconfigured":
    case "unavailable":
    case "loading":
    case "needsUsername":
    case "unreachable":
      return status.kind;
    case "signedOut":
      return signingIn ? "signingIn" : "signedOut";
    case "ready":
      if (stale) return "unreachable";
      if (!loaded) return "loading";
      return groups.length === 0 ? "noGroups" : "ok";
  }
}

/** Didascalia breve per la taglia 1×1. */
export const SHORT_LABELS: Record<Exclude<GroupsState, "ok">, string> = {
  unconfigured: "Gruppi non configurati",
  unavailable: "Non disponibili qui",
  loading: "Carico…",
  signedOut: "Accedi per studiare insieme",
  signingIn: "Accesso nel browser…",
  needsUsername: "Scegli il tuo nome",
  unreachable: "Non raggiungibili",
  noGroups: "Crea o entra in un gruppo",
};
