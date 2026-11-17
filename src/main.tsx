import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Font dei temi, inclusi nel bundle: nessuna risorsa scaricata a runtime.
import "@fontsource-variable/manrope";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree";
import "@fontsource-variable/caveat";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/doto";
// Vetro (Outfit per titoli e numeri, Plus Jakarta Sans per il testo) e Ombra (Spectral, con Figtree).
import "@fontsource-variable/outfit";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/spectral/300.css";
import "@fontsource/spectral/300-italic.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/400-italic.css";
import "@fontsource/spectral/500.css";
// Font "serif" del selettore delle Note.
import "@fontsource-variable/literata";

import "./styles/tailwind.css";
import "./styles/tokens.css";
// Dopo tokens.css: le varianti giorno/notte ridefiniscono i token dei temi (selettori con data-mode).
import "./styles/tokens-varianti.css";
import "./styles/base.css";

import App from "./app/App";
import BlockScreen from "./widgets/screentime/block/BlockScreen";
import { widgetPigment } from "./widgets/registry";
import { installAndroidInsets } from "./core/system/androidInsets";
import { installExternalLinks } from "./core/system/externalLinks";

// Su Android: barre di sistema e tastiera nelle variabili CSS (--safe-*, --keyboard), prima del primo render.
installAndroidInsets();
// Link esterni nel browser di sistema, non nella finestra dell'app.
installExternalLinks();

// La finestra "blocco" di Tempo allo schermo (Windows, src-tauri/src/screen_block.rs) carica lo stesso frontend con
// `?view=blocco` e mostra solo la schermata di blocco: niente DB, impostazioni o sync.
const blockView = new URLSearchParams(window.location.search).get("view") === "blocco";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{blockView ? <BlockScreen pigment={widgetPigment("screentime")} /> : <App />}</StrictMode>
);
