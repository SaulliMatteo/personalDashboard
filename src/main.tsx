import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Font dei temi, inclusi nel bundle: nessuna risorsa scaricata a runtime.
import "@fontsource-variable/manrope";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree";
import "@fontsource-variable/caveat";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/doto";
// Font "serif" del selettore delle Note.
import "@fontsource-variable/literata";

import "./styles/tailwind.css";
import "./styles/tokens.css";
// Dopo tokens.css: le varianti giorno/notte ridefiniscono i token dei temi (selettori con data-mode).
import "./styles/tokens-varianti.css";
import "./styles/base.css";

import App from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
