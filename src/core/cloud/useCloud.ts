import { createContext, useContext } from "react";

/* Contesto e hook separati dal provider (CloudContext.tsx), come per le impostazioni. */

/** Stato dei Gruppi visto dall'app. Tutto ciò che non è "ready" lascia l'app in solo locale. */
export type CloudStatus =
  /** mancano le variabili d'ambiente: "Gruppi non configurati" */
  | { kind: "unconfigured" }
  /** portachiavi assente (sistema non supportato, o fuori da Tauri) */
  | { kind: "unavailable" }
  | { kind: "loading" }
  | { kind: "signedOut" }
  /** accesso fatto, nome utente ancora da scegliere */
  | { kind: "needsUsername" }
  | { kind: "ready"; username: string }
  /** offline o servizio in pausa: nuovi tentativi da soli con attesa crescente */
  | { kind: "unreachable" };

export interface CloudContextValue {
  status: CloudStatus;
  /** id dell'utente con una sessione salvata (anche se ora il servizio non risponde) */
  userId: string | null;
  /** login aperto nel browser, in attesa del ritorno dal deep link */
  signingIn: boolean;
  /** ultimo errore del login, già in italiano */
  signInError: string | null;
  signIn: () => Promise<void>;
  cancelSignIn: () => void;
  /** Le azioni qui sotto lanciano un CloudError con un messaggio da mostrare. */
  setUsername: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** riprova subito (es. dal pulsante "Riprova") */
  retry: () => void;
}

export const CloudContext = createContext<CloudContextValue | undefined>(undefined);

export function useCloud() {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error("useCloud deve essere usato dentro <CloudProvider>");
  return ctx;
}
