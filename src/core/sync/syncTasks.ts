/*
 * Lavori da fare dopo ogni giro di sync riuscito, registrati da chi li conosce: oggi i file delle Note
 * (widgets/notes/sync/fileSync.ts), che non stanno nel DB. Girano uno dopo l'altro; un errore di rete fa ritentare il
 * giro con l'attesa crescente, gli altri problemi li gestisce il lavoro stesso (un file alla volta).
 */

export interface SyncTaskContext {
  userId: string;
}

/** `retryInMs`: c'è ancora qualcosa da fare tra poco (es. un file che l'altro dispositivo sta caricando). */
export type SyncTaskResult = { retryInMs: number } | undefined;

export type SyncTask = (ctx: SyncTaskContext) => Promise<SyncTaskResult>;

const tasks = new Set<SyncTask>();

/** Registra un lavoro; restituisce la funzione per toglierlo. */
export function registerSyncTask(task: SyncTask): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

/** Esegue i lavori; restituisce il più vicino dei "riprova tra poco", o null. */
export async function runSyncTasks(ctx: SyncTaskContext): Promise<number | null> {
  let retry: number | null = null;
  for (const task of [...tasks]) {
    const result = await task(ctx);
    if (result) retry = retry === null ? result.retryInMs : Math.min(retry, result.retryInMs);
  }
  return retry;
}
