import { getActivity } from "../../../core/activity/activityBus";
import { getMeta, setMeta } from "../../../core/db/meta";
import { listAllVideos, setDuration, type SavedVideo } from "../data/youtubeRepository";
import { loadYouTubeApi } from "./youtube";

/**
 * Durate mancanti. oEmbed non dà la durata, e il player la legge solo quando un video si apre, quindi manca
 * proprio sui video dimenticati. Qui un iframe del player NASCOSTO e MUTO, senza autoplay, legge
 * `getDuration()` appena è pronto (provato in tauri dev: arriva in onReady, il player non parte mai). Viene
 * chiuso subito dopo. Un video alla volta, con una pausa tra l'uno e l'altro, solo a app aperta e mai mentre
 * il player vero è in uso. Non blocca nulla: ogni errore si registra e si va avanti.
 *
 * Dopo un errore un video si riprova a UN avvio successivo, poi si lascia stare (meta `youtube.durationFailures`:
 * id → tentativi falliti). Se il player di YouTube non si carica affatto (niente rete) ci si ferma senza contare
 * il tentativo.
 */

const FAILURES_KEY = "youtube.durationFailures";
const MAX_ATTEMPTS = 2;
const START_DELAY_MS = 30_000;
const PAUSE_MS = 20_000;
const PROBE_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------
// Player in uso
// ---------------------------------------------------------------------

let playerClaims = 0;

/** La pagina Guarda lo chiama al montaggio; la funzione restituita va chiamata allo smontaggio. */
export function claimPlayer(): () => void {
  playerClaims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    playerClaims -= 1;
  };
}

function playerInUse(): boolean {
  return playerClaims > 0 || getActivity().watchingVideo;
}

// ---------------------------------------------------------------------
// Coda
// ---------------------------------------------------------------------

type Failures = Record<string, number>;

function parseFailures(text: string | null): Failures {
  if (!text) return {};
  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object") return {};
    const out: Failures = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (typeof v === "number") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Il prossimo video senza durata da provare in questo avvio (null = finito). */
export function nextCandidate(videos: readonly SavedVideo[], failures: Failures, tried: ReadonlySet<number>): SavedVideo | null {
  return (
    videos.find((v) => v.durationSeconds === null && !tried.has(v.id) && (failures[String(v.id)] ?? 0) < MAX_ATTEMPTS) ?? null
  );
}

// ---------------------------------------------------------------------
// Lettura della durata
// ---------------------------------------------------------------------

class PlayerUnavailable extends Error {}

/** La durata in secondi, letta da un player nascosto e muto che non parte. Lancia in caso di errore o timeout. */
async function probeDuration(youtubeId: string): Promise<number> {
  let YT;
  try {
    YT = await loadYouTubeApi();
  } catch (e) {
    throw new PlayerUnavailable(String(e));
  }
  const iframe = document.createElement("iframe");
  const params = new URLSearchParams({ enablejsapi: "1", origin: window.location.origin, mute: "1", rel: "0" });
  iframe.src = `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allow = "encrypted-media";
  iframe.tabIndex = -1;
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "";
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;border:0";
  document.body.appendChild(iframe);
  try {
    return await new Promise<number>((resolve, reject) => {
      let poll: number | undefined;
      const timeout = window.setTimeout(() => {
        window.clearInterval(poll);
        reject(new Error("tempo scaduto"));
      }, PROBE_TIMEOUT_MS);
      const done = (fn: () => void) => {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        fn();
      };
      const player = new YT.Player(iframe, {
        events: {
          onReady: () => {
            // Di solito c'è già in onReady; altrimenti si riprova per qualche istante.
            const read = () => {
              let d = 0;
              try {
                d = player.getDuration();
              } catch {
                d = 0;
              }
              if (d > 0) done(() => resolve(d));
            };
            read();
            poll = window.setInterval(read, 250);
          },
          // Non dovrebbe mai partire (niente autoplay): se succede, lo si mette in pausa.
          onStateChange: (e) => {
            if (e.data === 1) {
              try {
                player.pauseVideo();
              } catch {
                /* l'iframe si chiude comunque tra poco */
              }
            }
          },
          onError: (e) => done(() => reject(new Error(`errore del player ${e.data}`))),
        },
      });
    });
  } finally {
    iframe.remove();
  }
}

// ---------------------------------------------------------------------
// Ciclo
// ---------------------------------------------------------------------

/**
 * Riempie le durate mancanti finché ce ne sono o finché `signal` non viene annullato. `onFilled` dopo ogni
 * durata salvata (per rileggere il consiglio).
 */
export async function fillMissingDurations(signal: AbortSignal, onFilled: () => void): Promise<void> {
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    });

  const tried = new Set<number>();
  await wait(START_DELAY_MS);
  while (!signal.aborted) {
    if (playerInUse()) {
      await wait(PAUSE_MS);
      continue;
    }
    const [videos, failuresText] = await Promise.all([listAllVideos(), getMeta(FAILURES_KEY)]);
    const failures = parseFailures(failuresText);
    const video = nextCandidate(videos, failures, tried);
    if (!video || signal.aborted) return;
    tried.add(video.id);
    try {
      const seconds = await probeDuration(video.youtubeId);
      if (signal.aborted) return;
      await setDuration(video.id, seconds);
      if (failures[String(video.id)] !== undefined) {
        delete failures[String(video.id)];
        await setMeta(FAILURES_KEY, JSON.stringify(failures));
      }
      onFilled();
    } catch (e) {
      if (e instanceof PlayerUnavailable) return; // niente rete: si riprova al prossimo avvio, senza contarlo
      console.error(`Durata non letta per il video ${video.youtubeId}:`, e);
      failures[String(video.id)] = (failures[String(video.id)] ?? 0) + 1;
      await setMeta(FAILURES_KEY, JSON.stringify(failures));
    }
    await wait(PAUSE_MS);
  }
}
