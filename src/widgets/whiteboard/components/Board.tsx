// Prima di Excalidraw: imposta da dove prende i font (niente rete).
import "../lib/excalidrawAssets";
import { useCallback, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { Excalidraw, MainMenu, THEME, isElementLink } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawProps, UIOptions } from "@excalidraw/excalidraw/types";
// CSS della libreria: è tutto sotto .excalidraw (l'unica eccezione a "niente CSS globale").
import "@excalidraw/excalidraw/index.css";
import { useTheme } from "../../../core/theme/useTheme";
import "./Board.css";

/** Niente file, esportazioni o cambio di tema: il disegno non si salva e il tema lo decide l'app. */
const UI_OPTIONS: UIOptions = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    saveAsImage: false,
    toggleTheme: false,
    clearCanvas: true,
    changeViewBackgroundColor: true,
  },
};

/** Nessun contenuto incorporato (YouTube, Figma…): caricherebbe pagine da internet dentro la lavagna. */
const NO_EMBEDS = () => false;

type OnLinkOpen = NonNullable<ExcalidrawProps["onLinkOpen"]>;
type OnChange = NonNullable<ExcalidrawProps["onChange"]>;

interface BoardProps {
  /** Chiamata solo quando la lavagna passa da vuota a "con un disegno" o viceversa. */
  onHasDrawingChange: (hasDrawing: boolean) => void;
  /** La lavagna è a schermo intero (lo decide la pagina). */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * La lavagna vera e propria: Excalidraw così com'è, in memoria e senza
 * salvataggio (ogni apertura parte vuota). È l'unico file che importa
 * Excalidraw ed è caricato in lazy dalla pagina di dettaglio.
 */
function Board({ onHasDrawingChange, fullscreen, onToggleFullscreen }: BoardProps) {
  const { scheme } = useTheme();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const hasDrawingRef = useRef(false);

  const setApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  // onChange scatta a ogni tratto e movimento: si avvisa la pagina solo quando il booleano cambia.
  const onChange = useCallback<OnChange>(
    (elements) => {
      const hasDrawing = elements.some((el) => !el.isDeleted);
      if (hasDrawing === hasDrawingRef.current) return;
      hasDrawingRef.current = hasDrawing;
      onHasDrawingChange(hasDrawing);
    },
    [onHasDrawingChange],
  );

  // Mai navigare la webview: i link verso un'altra forma restano nella lavagna,
  // quelli web si aprono nel browser di sistema (come fa Notes).
  const onLinkOpen = useCallback<OnLinkOpen>((element, event) => {
    event.preventDefault();
    const link = element.link;
    if (!link) return;
    if (isElementLink(link)) {
      apiRef.current?.scrollToContent(link);
    } else if (/^(https?:|mailto:)/i.test(link)) {
      void openUrl(link).catch(() => apiRef.current?.setToast({ message: "Impossibile aprire il link", closable: true }));
    }
  }, []);

  // Pulsante dello schermo intero in alto a destra, accanto a "Libreria" e con il suo stesso aspetto.
  const renderTopRightUI = useCallback(() => {
    const label = fullscreen ? "Esci da schermo intero" : "Schermo intero";
    return (
      <button
        type="button"
        className="sidebar-trigger wb-fs-btn"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFullscreen();
        }}
      >
        {fullscreen ? <MdFullscreenExit /> : <MdFullscreen />}
      </button>
    );
  }, [fullscreen, onToggleFullscreen]);

  return (
    <div className="wb-excalidraw">
      <Excalidraw
        excalidrawAPI={setApi}
        theme={scheme === "dark" ? THEME.DARK : THEME.LIGHT}
        langCode="it-IT"
        UIOptions={UI_OPTIONS}
        validateEmbeddable={NO_EMBEDS}
        onChange={onChange}
        onLinkOpen={onLinkOpen}
        renderTopRightUI={renderTopRightUI}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

export default Board;
