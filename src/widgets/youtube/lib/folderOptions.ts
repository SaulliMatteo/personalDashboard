import type { VideoFolder } from "../data/youtubeRepository";
import { buildFolderTree, descendantIds, flattenFolderTree, folderPath } from "./library";

export interface FolderOption {
  id: number;
  depth: number;
  /** "Elettronica / Pratica": per le tendine. */
  label: string;
}

/** Cartelle in ordine ad albero, con percorso. `excludeSubtreeOf`: toglie quella cartella e le sue discendenti (per "sposta dentro…"). */
export function folderOptions(folders: readonly VideoFolder[], excludeSubtreeOf: number | null = null): FolderOption[] {
  const excluded = excludeSubtreeOf === null ? new Set<number>() : descendantIds(folders, excludeSubtreeOf);
  return flattenFolderTree(buildFolderTree(folders))
    .filter(({ folder }) => !excluded.has(folder.id))
    .map(({ folder, depth }) => ({
      id: folder.id,
      depth,
      label: folderPath(folders, folder.id)
        .map((f) => f.name)
        .join(" / "),
    }));
}
