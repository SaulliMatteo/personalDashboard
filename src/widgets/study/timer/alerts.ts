import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

/**
 * Avvisi di fine fase: suono e notifica di sistema. Tenuti fuori dal
 * TimerContext perché non dipendono dallo stato del timer: per cambiare
 * suono o formato delle notifiche si tocca solo questo file.
 */

/**
 * Breve suono a due note generato via Web Audio, invece di un file audio
 * da distribuire: zero asset, zero dipendenze.
 */
export function playChime(volumePercent: number) {
  // 100% = ampiezza massima 0.4 (il vecchio valore fisso 0.2 corrisponde a 50%).
  const peak = 0.4 * (volumePercent / 100);
  if (peak <= 0) return;
  try {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1108.73].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
    // Chiude il contesto audio a suono finito: altrimenti ne resterebbe
    // uno aperto per ogni avviso (il browser ne consente un numero limitato).
    window.setTimeout(() => void ctx.close(), 1000);
  } catch (error) {
    console.error("Impossibile riprodurre il suono di notifica:", error);
  }
}

/**
 * Notifica di sistema (visibile anche con l'app minimizzata). Il permesso
 * viene chiesto solo al bisogno, la prima volta che serve davvero — non
 * all'avvio, per non mostrare un popup prima ancora di avviare un timer.
 */
export async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch (error) {
    console.error("Impossibile inviare la notifica di sistema:", error);
  }
}
