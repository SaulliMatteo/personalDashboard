/**
 * Lavori da finire prima che l'app esca da "Esci" nel menu dell'icona (es. Tempo al PC salva l'ultimo pezzo di
 * conteggio). `useAppWindowBridge` li aspetta tutti, ma al massimo `BEFORE_QUIT_MS`: poi esce comunque (e il Rust
 * esce da solo dopo 2 s anche se la pagina non risponde).
 */
export const BEFORE_QUIT_MS = 1500;

type Task = () => Promise<void>;

const tasks = new Set<Task>();

/** Registra un lavoro; restituisce la funzione per toglierlo. */
export function registerBeforeQuit(task: Task): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

export async function runBeforeQuit(timeoutMs: number = BEFORE_QUIT_MS): Promise<void> {
  const all = Promise.allSettled([...tasks].map((task) => task()));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
