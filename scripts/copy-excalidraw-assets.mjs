// Copia i font della Lavagna (Excalidraw) in public/excalidraw-assets/fonts/, da dove l'app li serve.
// Senza, Excalidraw li scaricherebbe da esm.sh (vedi src/widgets/whiteboard/lib/excalidrawAssets.ts).
// Lanciato dagli script npm "predev" e "prebuild"; la cartella copiata è in .gitignore.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "fonts");
const to = join(root, "public", "excalidraw-assets", "fonts");

if (!existsSync(from)) {
  console.error(`[excalidraw-assets] cartella dei font non trovata: ${from}. Hai fatto npm install?`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log("[excalidraw-assets] font copiati in public/excalidraw-assets/fonts/");
