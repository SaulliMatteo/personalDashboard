/** Attesa prima di riprovare quando il servizio non risponde: 5 s, 10 s, 20 s… fino a 5 minuti. */
export function retryDelayMs(failures: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, failures), 300_000);
}
