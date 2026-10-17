import { useEffect, useRef, useState, type RefObject } from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { loadYouTubeApi, type YTPlayerInstance } from "../lib/youtube";

/** Comandi che la pagina può dare al player una volta pronto. */
export interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
}

interface VideoPlayerProps {
  youtubeId: string;
  /** Punto da cui partire. Letto UNA volta per montaggio: cambiarlo dopo non ricarica il video. */
  startSeconds: number;
  /** Riempito quando il player è pronto, svuotato allo smontaggio. */
  handleRef: RefObject<PlayerHandle | null>;
  onDuration: (seconds: number) => void;
  /** Posizione corrente: ogni 5 s, in pausa e alla chiusura. */
  onProgress: (seconds: number) => void;
  onEnded: () => void;
  onError: (code: number | string) => void;
}

const PROGRESS_INTERVAL_MS = 5000;

/**
 * Un iframe di YouTube controllato con la IFrame Player API. Il genitore lo
 * monta con key={id del video}: cambiare video = nuovo iframe da zero.
 * `referrerPolicy` e il parametro `origin` servono a evitare l'errore 153
 * (YouTube rifiuta le richieste senza referrer): vedi il test di embed.
 */
function VideoPlayer({ youtubeId, startSeconds, handleRef, onDuration, onProgress, onEnded, onError }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const callbacks = useLatestRef({ onDuration, onProgress, onEnded, onError });

  const [src] = useState(() => {
    const params = new URLSearchParams({
      enablejsapi: "1",
      origin: window.location.origin,
      start: String(Math.max(0, Math.floor(startSeconds))),
      rel: "0",
    });
    return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  });

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayerInstance | null = null;
    let timer: number | undefined;
    let lastTime = 0;
    let ended = false;

    const readTime = (): number | null => {
      if (!player) return null;
      try {
        return player.getCurrentTime();
      } catch {
        return null;
      }
    };

    const report = () => {
      // A video finito la posizione la azzera il genitore: non sovrascriverla.
      if (ended) return;
      const t = readTime();
      if (t === null) return;
      lastTime = t;
      callbacks.current.onProgress(t);
    };

    loadYouTubeApi()
      .then((YT) => {
        const iframe = iframeRef.current;
        if (cancelled || !iframe) return;
        player = new YT.Player(iframe, {
          events: {
            onReady: () => {
              const p = player;
              if (cancelled || !p) return;
              handleRef.current = {
                getCurrentTime: () => p.getCurrentTime(),
                seekTo: (seconds) => p.seekTo(seconds, true),
              };
              const duration = p.getDuration();
              if (duration > 0) callbacks.current.onDuration(duration);
              timer = window.setInterval(report, PROGRESS_INTERVAL_MS);
            },
            onStateChange: (e) => {
              if (e.data === 0) {
                ended = true;
                callbacks.current.onEnded();
              } else if (e.data === 2) {
                report();
              } else if (e.data === 1) {
                ended = false; // l'utente ha ricominciato dopo la fine
              }
            },
            onError: (e) => callbacks.current.onError(e.data),
          },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) callbacks.current.onError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      handleRef.current = null;
      // Salvataggio finale. A smontaggio l'iframe può essere già fuori dal
      // DOM: se la lettura fallisce si usa l'ultimo valore noto.
      if (!ended) {
        const t = readTime() ?? lastTime;
        // Voluto: `callbacks` è un "ultimo valore" (useLatestRef), qui serve proprio quello più recente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (t > 0) callbacks.current.onProgress(t);
      }
    };
    // handleRef e callbacks sono ref stabili; youtubeId identifica il video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  return (
    <iframe
      ref={iframeRef}
      className="yt-player-iframe"
      src={src}
      title="Player YouTube"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; fullscreen"
    />
  );
}

export default VideoPlayer;
