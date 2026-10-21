import { useEffect, useState } from "react";

/**
 * Ora corrente, aggiornata allo scoccare di ogni minuto (o ogni `stepMs`).
 * Si riallinea al passo così l'orologio cambia insieme a quello di sistema.
 */
export function useNow(stepMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, stepMs - (Date.now() % stepMs) + 20);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [stepMs]);
  return now;
}
