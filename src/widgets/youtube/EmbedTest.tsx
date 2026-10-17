import { useEffect, useRef, useState } from "react";
import { hideSplash } from "../../app/splash";

/**
 * TEST USA-E-GETTA: verifica se l'embed di YouTube funziona nella webview di
 * Tauri (errore 153 = YouTube non riceve un referrer valido). Da cancellare
 * dopo il test. Non tocca registry, DB o layout.
 */

interface YTPlayer {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLIFrameElement,
    opts: {
      events: {
        onReady: () => void;
        onError: (e: { data: number }) => void;
        onStateChange: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<YTNamespace> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => (window.YT ? resolve(window.YT) : reject(new Error("YT non definito")));
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => reject(new Error("Impossibile caricare iframe_api (rete o blocco)"));
    document.head.appendChild(script);
  });
}

const TEST_VIDEO_ID = "dQw4w9WgXcQ"; // qualunque video embeddabile va bene
const HOSTS = ["www.youtube.com", "www.youtube-nocookie.com"] as const;
const REFERRER_POLICIES = ["strict-origin-when-cross-origin", "strict-origin", "no-referrer"] as const;

function EmbedTest() {
  const [host, setHost] = useState<(typeof HOSTS)[number]>("www.youtube.com");
  const [policy, setPolicy] = useState<(typeof REFERRER_POLICIES)[number]>("strict-origin-when-cross-origin");
  const [withOrigin, setWithOrigin] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  // Questa pagina sostituisce App: la splash di index.html non verrebbe mai tolta.
  useEffect(() => {
    hideSplash();
  }, []);

  const log = (msg: string) =>
    setLines((prev) => [`${new Date().toLocaleTimeString("it-IT")}  ${msg}`, ...prev].slice(0, 40));

  const params = new URLSearchParams({ enablejsapi: "1" });
  if (withOrigin) params.set("origin", window.location.origin);
  const src = `https://${host}/embed/${TEST_VIDEO_ID}?${params.toString()}`;
  // Cambiare una qualunque opzione rimonta l'iframe da zero.
  const iframeKey = `${host}|${policy}|${withOrigin}`;

  useEffect(() => {
    let cancelled = false;
    playerRef.current = null;
    log(`Origine della pagina: ${window.location.origin}`);
    log(`Carico: ${src} (referrerpolicy=${policy})`);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !iframeRef.current) return;
        playerRef.current = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => log("API: onReady (il player risponde)"),
            onError: (e) => log(`API: onError codice ${e.data}  (153 = referrer mancante)`),
            onStateChange: (e) => log(`API: stato ${e.data}  (1=play, 2=pausa, 0=fine)`),
          },
        });
      })
      .catch((err) => log(`ERRORE API: ${String(err)}`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeKey]);

  async function testOembed() {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`)}&format=json`;
    try {
      const res = await fetch(url);
      const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      log(`oEmbed OK: "${data.title}" di ${data.author_name}`);
      log(`miniatura: ${data.thumbnail_url}`);
    } catch (err) {
      log(`oEmbed FALLITO (probabile CORS): ${String(err)}`);
    }
  }

  function testTime() {
    const p = playerRef.current;
    if (!p) return log("Player non pronto");
    log(`Tempo corrente: ${p.getCurrentTime().toFixed(1)} s`);
  }

  function testSeek() {
    const p = playerRef.current;
    if (!p) return log("Player non pronto");
    p.seekTo(30, true);
    log("seekTo(30) inviato");
  }

  const btn = { padding: "6px 12px", marginRight: 8, cursor: "pointer" } as const;

  return (
    <div style={{ padding: 20, color: "#f2f2f4", fontFamily: "system-ui", fontSize: 13, overflow: "auto", height: "100%", userSelect: "text" }}>
      <h1 style={{ fontSize: 18, marginTop: 0 }}>Test embed YouTube</h1>

      <div style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Host{" "}
          <select value={host} onChange={(e) => setHost(e.target.value as (typeof HOSTS)[number])}>
            {HOSTS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </label>
        <label>
          referrerpolicy{" "}
          <select value={policy} onChange={(e) => setPolicy(e.target.value as (typeof REFERRER_POLICIES)[number])}>
            {REFERRER_POLICIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={withOrigin} onChange={(e) => setWithOrigin(e.target.checked)} /> parametro origin
        </label>
      </div>

      <iframe
        key={iframeKey}
        ref={iframeRef}
        width={640}
        height={360}
        src={src}
        referrerPolicy={policy}
        allow="autoplay; encrypted-media; fullscreen"
        style={{ border: 0, background: "#000", display: "block", marginBottom: 12 }}
      />

      <div style={{ marginBottom: 12 }}>
        <button style={btn} onClick={testTime}>Leggi tempo corrente</button>
        <button style={btn} onClick={testSeek}>Salta a 0:30</button>
        <button style={btn} onClick={() => void testOembed()}>Test oEmbed (titolo/canale)</button>
      </div>

      <pre style={{ background: "#131318", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap", margin: 0 }}>
        {lines.join("\n")}
      </pre>
    </div>
  );
}

export default EmbedTest;