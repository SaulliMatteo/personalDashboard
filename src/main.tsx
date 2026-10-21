import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Font dei temi, inclusi nel bundle: nessuna risorsa scaricata a runtime.
import "@fontsource-variable/manrope";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree";
import "@fontsource-variable/caveat";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/doto";

import "./styles/tailwind.css";
import "./styles/tokens.css";
import "./styles/base.css";

import App from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
