import type { SavedVideo, VideoFolder } from "../data/youtubeRepository";

/**
 * Logica pura della libreria (niente DB, niente React): albero delle cartelle,
 * riepiloghi, scelta del video da riprendere, ricerca. Testabile da sola.
 */

// ---------------------------------------------------------------------
// Testo
// ---------------------------------------------------------------------

/** Minuscolo e senza accenti ("Derivàte" -> "derivate"), per la ricerca. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const byName = (a: VideoFolder, b: VideoFolder) =>
  a.name.localeCompare(b.name, "it", { sensitivity: "base", numeric: true }) || a.id - b.id;

// ---------------------------------------------------------------------
// Albero delle cartelle
// ---------------------------------------------------------------------

export interface FolderNode {
  folder: VideoFolder;
  depth: number;
  children: FolderNode[];
}

/**
 * Albero ordinato per nome. Una cartella con un genitore inesistente (dati
 * incoerenti) non si perde: la si tratta come di primo livello.
 */
export function buildFolderTree(folders: readonly VideoFolder[]): FolderNode[] {
  const ids = new Set(folders.map((f) => f.id));
  const childrenOf = new Map<number | null, VideoFolder[]>();
  for (const f of folders) {
    const key = f.parentId !== null && ids.has(f.parentId) && f.parentId !== f.id ? f.parentId : null;
    const list = childrenOf.get(key) ?? [];
    list.push(f);
    childrenOf.set(key, list);
  }
  const seen = new Set<number>();
  const build = (parent: number | null, depth: number): FolderNode[] =>
    (childrenOf.get(parent) ?? [])
      .slice()
      .sort(byName)
      .filter((f) => !seen.has(f.id)) // difesa da cicli nei dati
      .map((folder) => {
        seen.add(folder.id);
        return { folder, depth, children: build(folder.id, depth + 1) };
      });
  return build(null, 0);
}

/** Le sottocartelle dirette di `parentId` (null = primo livello), per nome. Coerente con buildFolderTree per i dati incoerenti. */
export function childFolders(folders: readonly VideoFolder[], parentId: number | null): VideoFolder[] {
  const tree = buildFolderTree(folders);
  if (parentId === null) return tree.map((n) => n.folder);
  const find = (nodes: readonly FolderNode[]): FolderNode | null => {
    for (const n of nodes) {
      if (n.folder.id === parentId) return n;
      const inner = find(n.children);
      if (inner) return inner;
    }
    return null;
  };
  return (find(tree)?.children ?? []).map((n) => n.folder);
}

/** L'albero in lista piatta (ordine di visita), per le tendine con rientro. */
export function flattenFolderTree(nodes: readonly FolderNode[]): { folder: VideoFolder; depth: number }[] {
  const out: { folder: VideoFolder; depth: number }[] = [];
  const walk = (list: readonly FolderNode[]) => {
    for (const n of list) {
      out.push({ folder: n.folder, depth: n.depth });
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Dalla cartella di primo livello fino a quella indicata (inclusa). Vuoto se l'id non esiste. */
export function folderPath(folders: readonly VideoFolder[], id: number | null): VideoFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: VideoFolder[] = [];
  const guard = new Set<number>();
  let current = id === null ? undefined : byId.get(id);
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

/** La cartella di primo livello che contiene `id` (o `id` stessa se è di primo livello). Null se non esiste. */
export function rootFolderOf(folders: readonly VideoFolder[], id: number | null): VideoFolder | null {
  return folderPath(folders, id)[0] ?? null;
}

/** Id della cartella e di tutte le sue discendenti. */
export function descendantIds(folders: readonly VideoFolder[], id: number): Set<number> {
  const result = new Set<number>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId !== null && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        grew = true;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Riepiloghi
// ---------------------------------------------------------------------

export interface FolderSummary {
  /** Sottocartelle dirette. */
  subfolders: number;
  /** Video direttamente nella cartella. */
  directVideos: number;
  /** Video in tutta la gerarchia sotto la cartella (inclusa). */
  totalVideos: number;
  /** Di questi, quelli non ancora guardati. */
  toWatch: number;
  /** Fino a 3 video della gerarchia, per il mosaico di miniature (prima i diretti). */
  preview: SavedVideo[];
}

export function summarizeFolder(
  folders: readonly VideoFolder[],
  videos: readonly SavedVideo[],
  folderId: number
): FolderSummary {
  const subtree = descendantIds(folders, folderId);
  const inTree = videos.filter((v) => v.folderId !== null && subtree.has(v.folderId));
  const direct = inTree.filter((v) => v.folderId === folderId).sort(byPosition);
  const deeper = inTree.filter((v) => v.folderId !== folderId).sort(byPosition);
  return {
    subfolders: folders.filter((f) => f.parentId === folderId).length,
    directVideos: direct.length,
    totalVideos: inTree.length,
    toWatch: inTree.filter((v) => !v.watched).length,
    preview: [...direct, ...deeper].slice(0, 3),
  };
}

function byPosition(a: SavedVideo, b: SavedVideo): number {
  return a.position - b.position || a.id - b.id;
}

/** I video direttamente in una cartella (null = "Senza cartella"), nell'ordine scelto. */
export function videosDirectlyIn(videos: readonly SavedVideo[], folderId: number | null): SavedVideo[] {
  return videos.filter((v) => v.folderId === folderId).sort(byPosition);
}

// ---------------------------------------------------------------------
// Cosa guardare
// ---------------------------------------------------------------------

/**
 * Il video da riprendere. STESSA regola di `getVideoToContinue` nel repository (SQL):
 * l'ultimo aperto tra quelli iniziati e non finiti; altrimenti il più vecchio non guardato.
 * Un test casuale controlla che le due versioni non divergano.
 */
export function pickVideoToContinue(videos: readonly SavedVideo[]): SavedVideo | null {
  let started: SavedVideo | null = null;
  for (const v of videos) {
    if (v.watched || v.positionSeconds <= 0) continue;
    if (!started) {
      started = v;
      continue;
    }
    const a = v.lastWatchedAt ?? Number.NEGATIVE_INFINITY; // in SQLite i NULL vengono dopo, con DESC
    const b = started.lastWatchedAt ?? Number.NEGATIVE_INFINITY;
    if (a > b || (a === b && v.id > started.id)) started = v;
  }
  if (started) return started;
  let next: SavedVideo | null = null;
  for (const v of videos) {
    if (v.watched) continue;
    if (!next || v.createdAt < next.createdAt || (v.createdAt === next.createdAt && v.id < next.id)) next = v;
  }
  return next;
}

/**
 * Il video successivo per la riproduzione automatica: nella stessa cartella, dopo quello
 * corrente nell'ordine della lista, il primo non ancora guardato. Niente giro completo:
 * a fine cartella si ferma.
 */
export function nextVideoInFolder(videos: readonly SavedVideo[], current: SavedVideo): SavedVideo | null {
  const siblings = videosDirectlyIn(videos, current.folderId);
  const index = siblings.findIndex((v) => v.id === current.id);
  if (index < 0) return null;
  return siblings.slice(index + 1).find((v) => !v.watched) ?? null;
}

/** "Video x di n" nella cartella del video (posizione 1-based); null se il video non c'è. */
export function positionInFolder(videos: readonly SavedVideo[], current: SavedVideo): { index: number; total: number } | null {
  const siblings = videosDirectlyIn(videos, current.folderId);
  const index = siblings.findIndex((v) => v.id === current.id);
  return index < 0 ? null : { index: index + 1, total: siblings.length };
}

/** Avanzamento 0..1 di un video (1 se guardato; 0 se la durata non si conosce). */
export function videoProgress(video: Pick<SavedVideo, "watched" | "positionSeconds" | "durationSeconds">): number {
  if (video.watched) return 1;
  if (!video.durationSeconds || video.durationSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, video.positionSeconds / video.durationSeconds));
}

// ---------------------------------------------------------------------
// Ricerca
// ---------------------------------------------------------------------

export interface SearchHit {
  video: SavedVideo;
  /** Percorso della cartella, es. "Elettronica / Pratica"; vuoto se senza cartella. */
  folderLabel: string;
}

/** Cerca in titolo, canale e nome delle cartelle del percorso; ogni parola deve comparire. Senza accenti né maiuscole. */
export function searchVideos(
  videos: readonly SavedVideo[],
  folders: readonly VideoFolder[],
  query: string
): SearchHit[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const video of videos) {
    const folderLabel = folderPath(folders, video.folderId)
      .map((f) => f.name)
      .join(" / ");
    const haystack = normalizeText(`${video.title} ${video.channel} ${folderLabel}`);
    if (words.every((w) => haystack.includes(w))) hits.push({ video, folderLabel });
  }
  return hits;
}

// ---------------------------------------------------------------------
// Formati
// ---------------------------------------------------------------------

/** Secondi -> "1h 05m" / "12 min" / "45 s", per durate e tempi di visione. */
export function formatWatchTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe < 60) return `${safe} s`;
  const totalMinutes = Math.round(safe / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Colori di riserva per le cartelle senza colore scelto (stessa palette delle materie). */
export const FOLDER_FALLBACK_COLORS = ["#6c8dff", "#f472b6", "#38bdf8", "#f5a35c", "#34d399", "#c084fc"] as const;

/** Colore effettivo di una cartella: quello scelto, altrimenti uno di palette stabile in base all'id. */
export function colorForFolder(folder: Pick<VideoFolder, "id" | "color"> | null | undefined): string {
  if (!folder) return "var(--text-muted)";
  return folder.color || FOLDER_FALLBACK_COLORS[Math.abs(folder.id) % FOLDER_FALLBACK_COLORS.length];
}
