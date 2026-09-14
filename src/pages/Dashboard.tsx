import { useState, useEffect } from "react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { calcGridItemPosition } from "react-grid-layout/core";
import Sidebar from "../components/sideBar/Sidebar";
import WeatherWidget from "../components/widgets/WeatherWidget";
import TasksWidget from "../components/widgets/TasksWidget";
import CalendarWidget from "../components/widgets/CalendarWidget";
import NotesWidget from "../components/widgets/NotesWidget";
import { freeMovePushCompactor, setActiveItem } from "../compactors/freeMovePushCompactor";
import "react-grid-layout/css/styles.css"; // CSS base della libreria: SEMPRE prima del nostro Dashboard.css
import "../css/Dashboard.css"; // Il nostro CSS custom, sovrascrive/estende i default della libreria
import { MdOutlineLockReset } from "react-icons/md";

import {
  saveLayout,
  loadLayout,
  type LayoutItem,
} from "../database/layoutRepository";

/**
 * Mappa id-widget -> componente React corrispondente.
 * Usata in due punti:
 * 1. per renderizzare il vero widget dentro la griglia (vedi JSX in fondo)
 * 2. per clonare lo stesso componente dentro il "ghost" durante il drag
 *    (vedi sezione Ghost preview più sotto)
 */
const WIDGETS: Record<string, () => React.ReactElement> = {
  weather: () => <WeatherWidget />,
  tasks: () => <TasksWidget />,
  calendar: () => <CalendarWidget />,
  notes: () => <NotesWidget />,
};

/**
 * Dimensioni minime per widget, in unità di griglia (non pixel).
 * Impediscono all'utente di rimpicciolire un widget fino a renderlo inutilizzabile
 * (es. Calendar sotto una certa dimensione non mostra più gli eventi).
 * Questi valori NON vengono salvati nel database: sono una proprietà del "tipo"
 * di widget, non dello stato utente, quindi vivono solo qui nel codice.
 */
const WIDGET_CONSTRAINTS: Record<string, { minW?: number; minH?: number }> = {
  weather: { minW: 3, minH: 2 },
  tasks: { minW: 2, minH: 2 },
  calendar: { minW: 3, minH: 3 },
  notes: { minW: 2, minH: 2 },
};

/**
 * Layout iniziale usato SOLO se non esiste ancora nulla nel database
 * (es. primo avvio dell'app, utente nuovo). Viene sovrascritto da
 * loadLayout() non appena i dati salvati sono disponibili (vedi useEffect).
 */
const DefaultLayout: LayoutItem[] = [
  { i: "weather", x: 0, y: 0, w: 4, h: 4 },
  { i: "tasks", x: 4, y: 0, w: 4, h: 4 },
  { i: "calendar", x: 4, y: 0, w: 4, h: 2 },
  { i: "notes", x: 0, y: 2, w: 4, h: 4 },
];

// Parametri della griglia: DEVONO combaciare esattamente con quelli passati
// a gridConfig su <GridLayout>, altrimenti i calcoli pixel del ghost
// (vedi calcGridItemPosition più sotto) risulterebbero disallineati.
const cols = 12;
const rowHeight = 40;
const marginX = 10;
const marginY = 10;

/**
 * Parametri "statici" richiesti da calcGridItemPosition (funzione ESPORTATA
 * dalla libreria stessa, la usiamo per calcolare dove piazzare in pixel
 * il nostro overlay "ghost" durante il drag/resize).
 * containerWidth manca qui perché cambia dinamicamente (dipende dalla
 * larghezza reale del contenitore, misurata da useContainerWidth) e viene
 * aggiunto al momento del calcolo, vedi ghostPos più sotto.
 * containerPadding è impostato uguale a margin perché quello è il default
 * della libreria quando containerPadding non viene passato esplicitamente
 * a GridLayout (comportamento confermato nei tipi della libreria).
 */
const positionParams = {
  margin: [marginX, marginY] as const,
  containerPadding: [marginX, marginY] as const,
  cols,
  rowHeight,
  maxRows: Infinity,
};

function Dashboard() {
  // width: larghezza attuale del contenitore (px), ricalcolata automaticamente
  //        al resize della finestra (fornita dalla libreria).
  // containerRef: da agganciare al div che contiene la griglia, serve alla
  //        libreria per misurare width.
  // mounted: true solo dopo il primo render lato client (evita mismatch SSR/
  //        larghezza 0 al primissimo frame).
  const { width, containerRef, mounted } = useContainerWidth();

  // Layout "vero", quello che viene salvato/caricato dal database.
  // Contiene SOLO i dati essenziali (i, x, y, w, h), niente vincoli minW/minH.
  const [layout, setLayout] = useState<LayoutItem[]>(DefaultLayout);

  // Durante un drag o resize, contiene la posizione/dimensione (in unità di
  // griglia) verso cui il widget sta per atterrare. È null quando non si
  // sta trascinando/ridimensionando nulla.
  const [dragTarget, setDragTarget] = useState<LayoutItem | null>(null);

  /**
   * Layout "arricchito" con i vincoli minW/minH, calcolato ad ogni render
   * a partire da `layout`. Questo è quello che passiamo davvero a
   * <GridLayout>, perché la libreria legge minW/minH direttamente dai
   * singoli LayoutItem (non è una prop globale).
   * `layout` invece resta "pulito" perché è quello che salviamo nel DB:
   * i vincoli non devono finire nella tabella dashboard_layout.
   */
  const layoutWithConstraints = layout.map((item) => ({
    ...item,
    ...WIDGET_CONSTRAINTS[item.i],
  }));

  // Al primo montaggio del componente, prova a caricare il layout salvato
  // in precedenza dall'utente. Se non c'è nulla salvato (savedLayout vuoto,
  // es. primo avvio), resta il DefaultLayout impostato inizialmente.
  useEffect(() => {
    async function initializeLayout() {
      try {
        const savedLayout = await loadLayout();
        if (savedLayout.length > 0) setLayout(savedLayout);
      } catch (error) {
        console.error("Errore nel caricamento del layout:", error);
      }
    }
    initializeLayout();
  }, []);

  // Bugfix: se l'utente perde il focus della finestra (alt-tab, altra app)
  // mentre sta trascinando un widget, e rilascia il mouse FUORI dalla pagina,
  // il browser non consegna mai il vero evento "mouseup" al nostro document.
  // react-grid-layout (via react-draggable) resta quindi bloccato in stato
  // "drag attivo" per sempre, e con lui anche il nostro ghost.
  //
  // Soluzione: al blur della finestra, simuliamo noi un mouseup sul document,
  // lo stesso identico evento che la libreria sta già ascoltando — la libreria
  // crede che il drag sia terminato normalmente e chiude tutto da sola
  // (chiamando anche onDragStop, quindi il layout risulta comunque salvato).
  useEffect(() => {
    const forceEndDrag = () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      clearGhost();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) forceEndDrag();
    };

    window.addEventListener("blur", forceEndDrag);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", forceEndDrag);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  /**
   * === GHOST PREVIEW DURANTE DRAG/RESIZE ===
   *
   * Contesto: react-grid-layout mostra di suo un "placeholder" (un box vuoto)
   * nella cella dove il widget atterrerà se rilasciato in quel momento.
   * Noi vogliamo che al posto di quel box vuoto compaia una copia sfocata
   * e semi-trasparente del widget reale (stesso contenuto, stesso aspetto,
   * solo più "eterea") — vedi CSS .widget-ghost in Dashboard.css.
   *
   * Per farlo nascondiamo il placeholder originale via CSS (opacity: 0,
   * resta comunque nel DOM/nel flusso) e disegniamo noi un div assoluto
   * sopra la griglia, riposizionato ad ogni evento di drag/resize.
   *
   * captureGhost viene collegata sia a onDragStart/onDrag sia (potenzialmente)
   * a onResizeStart/onResize: la firma della callback è quella standard
   * della libreria (EventCallback):
   *   (layout, oldItem, newItem, placeholder, event, element)
   * Qui usiamo solo i primi 4 parametri.
   *
   * IMPORTANTE: usiamo `placeholder` (4° parametro) e non `newItem` (3°)
   * come sorgente principale della posizione. `newItem` è la posizione
   * "grezza" sotto il cursore, che può essere invalida (es. sovrapposta a
   * un altro widget); `placeholder` è invece la posizione REALE calcolata
   * dalla libreria dopo l'algoritmo di compattazione/collisione — cioè
   * dove il widget atterrerà davvero se rilasci in quel momento. È nullo
   * solo nel primissimo istante di onDragStart, da cui il fallback a newItem.
   */
  const captureGhost = (
    _layout: readonly LayoutItem[],
    _oldItem: LayoutItem | null,
    newItem: LayoutItem | null,
    placeholder: LayoutItem | null
  ) => {
    const target = placeholder ?? newItem;
    if (!target) return;

    // Ottimizzazione: onDrag scatta MOLTO spesso (decine di volte al secondo).
    // Se la posizione/dimensione calcolata è identica a quella già in stato,
    // evitiamo un setState (e quindi un re-render) inutile.
    setDragTarget((prev) => {
      if (
        prev &&
        prev.i === target.i &&
        prev.x === target.x &&
        prev.y === target.y &&
        prev.w === target.w &&
        prev.h === target.h
      ) {
        return prev;
      }
      return { i: target.i, x: target.x, y: target.y, w: target.w, h: target.h };
    });
  };

  // Da chiamare quando il drag/resize termina (o viene annullato): nasconde
  // il ghost rimuovendo lo stato.
  const clearGhost = () => setDragTarget(null);
  const resetLayout = async () => {
    setLayout(DefaultLayout);
    await saveLayout(DefaultLayout);
  };

  /**
   * Calcola la posizione in pixel (left/top/width/height) del ghost a
   * partire dalla sua posizione in unità di griglia (dragTarget).
   *
   * Usiamo calcGridItemPosition, funzione ESPORTATA da react-grid-layout/core:
   * è la stessa identica funzione che la libreria usa internamente per
   * posizionare ogni .react-grid-item. Usarla invece di reinventare la
   * formula a mano garantisce che il ghost sia SEMPRE pixel-perfect
   * allineato al vero placeholder della libreria, senza rischio di
   * arrotondamenti o differenze di margine/padding.
   *
   * containerWidth viene aggiunto qui (non è nei positionParams statici
   * definiti sopra) perché è un valore dinamico, misurato da
   * useContainerWidth e soggetto a cambiare col resize della finestra.
   */
  const ghostPos = (() => {
    if (!dragTarget || !width) return null;
    return calcGridItemPosition(
      { ...positionParams, containerWidth: width },
      dragTarget.x,
      dragTarget.y,
      dragTarget.w,
      dragTarget.h
    );
  })();

  return (
    <div className="app">
      <Sidebar setLayout={setLayout} />
      <main className="main">
        <header className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>Welcome back.</p>
            {/* <button onClick={resetLayout}><MdOutlineLockReset /></button> */}
          </div>
        </header>

        {/*
          position relative impostata via CSS (.grid-container), necessaria
          perché il ghost (.widget-ghost, position: absolute) si posiziona
          rispetto a QUESTO contenitore.
        */}
        <div ref={containerRef} className="grid-container">
          {/* mounted evita di renderizzare GridLayout prima che width sia
              stata misurata correttamente (altrimenti width sarebbe 0 al
              primo render e la griglia apparirebbe schiacciata). */}
          {mounted && (
            <GridLayout
              className="widget-grid"

              layout={layoutWithConstraints}
              gridConfig={{ cols, rowHeight, margin: [marginX, marginY] }}
              // Handle di resize su tutti i lati/angoli (default libreria: solo 'se').
              resizeConfig={{ handles: ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] }}
              // Impedisce alla libreria di ridimensionare il contenitore
              // della griglia solo quanto basta per i widget attuali:
              // altrimenti "bounded" (sopra) vincola il drag a
              // quell'area ridotta invece che a tutta la finestra
              // disponibile, ed è per questo che prima non riuscivi a
              // rilasciare un widget nello spazio vuoto sotto gli altri.
              autoSize={false}
              // Impedisce di trascinare/ridimensionare un widget fuori
              // dall'area della griglia.
              dragConfig={{ bounded: true }}
              width={width}
              compactor={freeMovePushCompactor}
              // Aggiorna la posizione del ghost sia all'inizio del drag
              // sia ad ogni movimento successivo del mouse.
              onDragStart={(layout, oldItem, newItem, placeholder) => {
                setActiveItem(newItem?.i ?? oldItem?.i ?? null);   // AGGIUNTA
                captureGhost(layout, oldItem, newItem, placeholder);
              }}
              onDrag={captureGhost}

              onDragStop={async (newLayout) => {
                const newLayoutItems = newLayout as LayoutItem[];
                setLayout(newLayoutItems);
                clearGhost();
                setActiveItem(null);   // AGGIUNTA — fondamentale, altrimenti resta "bloccato" sul prossimo drag
                await saveLayout(newLayoutItems);
              }}

              onResizeStart={(_layout, oldItem, newItem) => {   // AGGIUNTA — prop nuova
                setActiveItem(newItem?.i ?? oldItem?.i ?? null);
              }}
              onResizeStop={async (newLayout) => {
                const newLayoutItems = newLayout as LayoutItem[];
                setLayout(newLayoutItems);
                setActiveItem(null);   // AGGIUNTA
                await saveLayout(newLayoutItems);
              }}
              // Scatta anche per cambi di layout non causati direttamente
              // da drag/resize (es. compattazione automatica quando un
              // widget viene rimosso). Tiene lo stato React sincronizzato
              // con quello che la libreria calcola internamente.
              onLayoutChange={(newLayout) => {
                setLayout(newLayout as LayoutItem[]);
              }}
            >
              {/* I widget veri. La key deve corrispondere esattamente
                  all'id (i) usato in layout/DefaultLayout/WIDGET_CONSTRAINTS. */}
              <div key="weather"><WeatherWidget /></div>
              <div key="tasks"><TasksWidget /> </div>
              <div key="calendar"><CalendarWidget /></div>
              <div key="notes"><NotesWidget /></div>
            </GridLayout>
          )}

          {/*
            Overlay "ghost": renderizzato SOLO mentre dragTarget/ghostPos
            sono valorizzati (cioè durante un drag attivo). Contiene una
            seconda istanza dello stesso componente widget (tramite la
            mappa WIDGETS), resa semi-trasparente/sfocata via CSS
            (.widget-ghost), posizionata con transform: translate3d(...)
            invece di left/top per sfruttare l'accelerazione GPU e ottenere
            un'animazione più fluida quando si muove da una cella all'altra.
          */}
          {dragTarget && ghostPos && (
            <div
              className="widget-ghost"
              style={{
                width: ghostPos.width,
                height: ghostPos.height,
                transform: `translate3d(${ghostPos.left}px, ${ghostPos.top}px, 0)`,
              }}
            >
              {WIDGETS[dragTarget.i]?.()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;