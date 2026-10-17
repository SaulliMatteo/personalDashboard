import { useCallback, useEffect, useState } from "react";
import { listAllVideos, listFolders, type SavedVideo, type VideoFolder } from "../data/youtubeRepository";

/**
 * Cartelle e video, tutti in memoria: la libreria di una persona è piccola (decine o
 * poche centinaia di righe), quindi albero, riepiloghi e ricerca si calcolano nel frontend.
 * `reload()` rilegge dal DB dopo ogni modifica.
 */
export function useYoutubeData() {
  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFolders(), listAllVideos()])
      .then(([f, v]) => {
        if (cancelled) return;
        setFolders(f);
        setVideos(v);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { folders, videos, loaded, error, setError, reload };
}
