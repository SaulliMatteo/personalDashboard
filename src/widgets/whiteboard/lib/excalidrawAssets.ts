/**
 * Da dove Excalidraw prende i font della lavagna: la cartella che
 * scripts/copy-excalidraw-assets.mjs copia in public/ (predev/prebuild).
 * Senza, in `vite dev` (modulo pre-bundlato) non li troverebbe accanto a sé e
 * li scaricherebbe da esm.sh. Il percorso assoluto vale sia con
 * tauri://localhost sia con http://localhost:14321 (macOS).
 * Va importato PRIMA di "@excalidraw/excalidraw" (vedi components/Board.tsx).
 */
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

export {};
