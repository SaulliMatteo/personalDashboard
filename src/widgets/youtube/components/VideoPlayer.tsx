import { useEffect, useRef, useState, type RefObject } from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { DEFAULT_PLAYBACK_RATES, loadYouTubeApi, type YTPlayerInstance } from "../lib/youtube";
import { WatchTracker } from "../lib/watchTracker";

/** Comandi che la pagina può dare al player una volta pronto. */
export interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  /** Velocità offerte da questo video (di solito 0.25–2). */
  getAvailablePlaybackRates: () => number[];
}

interface VideoPlayerProps {
  youtubeId: string;
  /** Punto da cui partire. Letto UNA volta per montaggio: cambiarlo dopo non ricarica il video. */
  startSeconds: number;
  /** Partire subito in riproduzione. Letto UNA volta per montaggio. */
  autoplay?: boolean;
  /** Riempito quando il player è pronto, svuotato allo smontaggio. */
  handleRef: RefObject<PlayerHandle | null>;
  onDuration: (seconds: number) => void;
  /** Posizione corrente: ogni 5 s, in pausa e alla chiusura. */
  onProgress: (seconds: number) => void;
  /** Un intervallo di riproduzione effettiva da registrare per il report (vedi WatchTracker). */
  onWatchSegment: (startedAt: number, endedAt: number, seconds: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onRateChange?: (rate: number) => void;
  onReady?: () => void;
  onEnded: () => void;
  onError: (code: number | string) => void;
}

const PROGRESS_INTERVAL_MS = 5000;
const TRACK_INTERVAL_MS = 2000;

/**
 * Un iframe di YouTube controllato con la IFrame Player API. Il genitore lo
 * monta con key={id del video}: cambiare video = nuovo iframe da zero.
 * `referrerPolicy` e il parametro `origin` servono a evitare l'errore 153
 * (YouTube rifiuta le richieste senza referrer): vedi il test di embed.
 */
function VideoPlayer({
  youtubeId,
  startSeconds,
  autoplay = false,
  handleRef,
  onDuration,
  onProgress,
  onWatchSegment,
  onPlayingChange,
  onRateChange,
  onReady,
  onEnded,
  onError,
}: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const callbacks = useLatestRef({
    onDuration,
    onProgress,
    onWatchSegment,
    onPlayingChange,
    onRateChange,
    onReady,
    onEnded,
    onError,
  });

  const [src] = useState(() => {
    const params = new URLSearchParams({
      enablejsapi: "1",
      origin: window.location.origin,
      start: String(Math.max(0, Math.floor(startSeconds))),
      rel: "0",
    });
    if (autoplay) params.set("autoplay", "1");
    return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  });

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayerInstance | null = null;
    let progressTimer: number | undefined;
    let trackTimer: number | undefined;
    let lastTime = 0;
    let ended = false;

    const tracker = new WatchTracker({
      now: () => Date.now(),
      onSegment: (startedAt, endedAt, seconds) => callbacks.current.onWatchSegment(startedAt, endedAt, seconds),
    });

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
                setPlaybackRate: (rate) => p.setPlaybackRate(rate),
                getPlaybackRate: () => {
                  try {
                    return p.getPlaybackRate() || 1;
                  } catch {
                    return 1;
                  }
                },
                getAvailablePlaybackRates: () => {
                  try {
                    const rates = p.getAvailablePlaybackRates();
                    return rates.length > 0 ? rates : DEFAULT_PLAYBACK_RATES;
                  } catch {
                    return DEFAULT_PLAYBACK_RATES;
                  }
                },
              };
              const duration = p.getDuration();
              if (duration > 0) callbacks.current.onDuration(duration);
              progressTimer = window.setInterval(report, PROGRESS_INTERVAL_MS);
              trackTimer = window.setInterval(() => {
                tracker.tick();
                // Solo lettura locale (niente scrittura sul DB): serve a non perdere più di ~2 s se lo smontaggio non riesce a rileggere il tempo.
                const t = readTime();
                if (t !== null) lastTime = t;
              }, TRACK_INTERVAL_MS);
              callbacks.current.onReady?.();
              // `autoplay=1` nell'URL può essere bloccato dalla politica del WebView: si chiede anche a mano.
              if (autoplay) {
                try {
                  p.playVideo();
                } catch {
                  /* il giocatore resta in pausa: l'utente preme play */
                }
              }
            },
            onStateChange: (e) => {
              // 1 = in riproduzione. Tutto il resto (pausa, buffering, fine, non avviato) non conta come visione.
              const playing = e.data === 1;
              tracker.setPlaying(playing);
              callbacks.current.onPlayingChange?.(playing);
              if (e.data === 0) {
                ended = true;
                callbacks.current.onEnded();
              } else if (e.data === 2) {
                report();
              } else if (e.data === 1) {
                ended = false; // l'utente ha ricominciato dopo la fine
              }
            },
            onPlaybackRateChange: (e) => callbacks.current.onRateChange?.(e.data),
            onError: (e) => callbacks.current.onError(e.data),
          },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) callbacks.current.onError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      window.clearInterval(progressTimer);
      window.clearInterval(trackTimer);
      handleRef.current = null;
      // Consegna il tempo di visione ancora in sospeso.
      tracker.dispose();
      // Salvataggio finale. A smontaggio l'iframe può essere già fuori dal
      // DOM: se la lettura fallisce si usa l'ultimo valore noto.
      if (!ended) {
        const t = readTime() ?? lastTime;
        // Voluto: `callbacks` è un "ultimo valore" (useLatestRef), qui serve proprio quello più recente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (t > 0) callbacks.current.onProgress(t);
      }
    };
    // handleRef, callbacks e autoplay (letto una volta) sono stabili; youtubeId identifica il video.
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
