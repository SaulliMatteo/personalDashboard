import { useState, useEffect, useRef } from "react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { calcGridItemPosition, calcGridColWidth } from "react-grid-layout/core";
import { freeMovePushCompactor, setActiveItem, finalizeLayout, clampToBounds, hasPendingCollision } from "../compactors/freeMovePushCompactor";
import "react-grid-layout/css/styles.css"; // CSS base della libreria: SEMPRE prima del nostro Dashboard.css
import "../css/Dashboard.css"; // Il nostro CSS custom, sovrascrive/estende i default della libreria
import { useSettings } from "../context/SettingContext";
import { useLayout } from "../context/LayoutContext";
import { WIDGET_MAP } from "../components/setting/widgets/registry";
import { GRID_COLS, GRID_MAX_ROWS, ROW_HEIGHT_RATIO } from "../config/gridConfig";

import { saveLayout, type LayoutItem } from "../database/layoutRepository";

function Dashboard() {
  // width: larghezza attuale del contenitore (px), ricalcolata automaticamente
  //        al resize della finestra (fornita dalla libreria).
  // containerRef: da agganciare al div che contiene la griglia, serve alla
  //        libreria per misurare width.
  // mounted: true solo dopo il primo render lato client (evita mismatch SSR/
  //        larghezza 0 al primissimo frame).
  const { width, containerRef, mounted } = useContainerWidth();

  // Impostazioni condivise dell'app (tema, margine griglia, glow, ecc.),
  // lette dal context così si aggiornano in automatico quando l'utente
  // le cambia nel SettingsModal, senza bisogno di ricaricare la pagina.
  const { settings } = useSettings();

  // Layout condiviso: caricato/salvato/migrato centralmente in
  // LayoutContext, così anche WidgetCatalog vede sempre lo stesso stato.
  const { layout, setLayout, ready } = useLayout();

  // Margine della griglia: preso dai settings se già caricati, altrimenti
  // fallback a 10px finché settings è null (primissimo render).
  const marginX = settings?.gridMargin ?? 10;
  const marginY = settings?.gridMargin ?? 10;

  // Altezza di riga PROPORZIONALE alla larghezza di una colonna, invece
  // di un valore fisso in pixel: usiamo calcGridColWidth (la stessa
  // funzione con cui react-grid-layout calcola la larghezza di colonna al
  // suo interno) per essere certi che il rapporto usato qui sia coerente
  // con quello che la libreria applicherà davvero, senza dover indovinare
  // a mano la formula (margini, padding, ecc.).
  const colWidth = width
    ? calcGridColWidth({
        containerWidth: width,
        cols: GRID_COLS,
        margin: [marginX, marginY],
        containerPadding: [marginX, marginY],
        rowHeight: 1,
        maxRows: GRID_MAX_ROWS,
      })
    : 0;
  const rowHeight = Math.max(40, colWidth * ROW_HEIGHT_RATIO);

  /**
   * Parametri "statici" richiesti da calcGridItemPosition (funzione ESPORTATA
   * dalla libreria stessa, la usiamo per calcolare dove piazzare in pixel
   * il nostro overlay "ghost" durante il drag).
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
    cols: GRID_COLS,
    rowHeight,
    maxRows: GRID_MAX_ROWS,
  };

  // Durante un drag, contiene la posizione (in unità di griglia) verso cui
  // il widget sta per atterrare. È null quando non si sta trascinando
  // nulla. Le dimensioni non cambiano più durante l'interazione (niente
  // resize), solo x/y si muovono.
  const [dragTarget, setDragTarget] = useState<LayoutItem | null>(null);
  const dragOriginRef = useRef<{ id: string; layout: LayoutItem[] } | null>(null);
  const suppressLayoutChangeRef = useRef(false);

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
   * === GHOST PREVIEW DURANTE IL DRAG ===
   *
   * Contesto: react-grid-layout mostra di suo un "placeholder" (un box vuoto)
   * nella cella dove il widget atterrerà se rilasciato in quel momento.
   * Noi vogliamo che al posto di quel box vuoto compaia una copia sfocata
   * e semi-trasparente del widget reale (stesso contenuto, stesso aspetto,
   * solo più "eterea") — vedi CSS .widget-ghost in Dashboard.css.
   *
   * Per farlo nascondiamo il placeholder originale via CSS (opacity: 0,
   * resta comunque nel DOM/nel flusso) e disegniamo noi un div assoluto
   * sopra la griglia, riposizionato ad ogni evento di drag.
   *
   * captureGhost è collegata a onDragStart/onDrag: la firma della callback
   * è quella standard della libreria (EventCallback):
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

  // Da chiamare quando il drag termina (o viene annullato): nasconde il
  // ghost rimuovendo lo stato.
  const clearGhost = () => setDragTarget(null);

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
    <>
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back.</p>
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
            primo render e la griglia apparirebbe schiacciata). ready
            evita di renderizzarla con un layout vuoto per una frazione di
            secondo, prima che LayoutContext abbia finito di caricare/
            migrare i dati dal DB. */}
        {mounted && ready && (
          <GridLayout
            className="widget-grid"
            layout={layout}
            gridConfig={{ cols: GRID_COLS, rowHeight, margin: [marginX, marginY], maxRows: GRID_MAX_ROWS }}
            // Dimensioni fisse per taglia: niente resize da parte
            // dell'utente, si cambia taglia togliendo e riaggiungendo il
            // widget dal catalogo.
            resizeConfig={{ enabled: false }}
            // Impedisce alla libreria di ridimensionare il contenitore
            // della griglia solo quanto basta per i widget attuali:
            // altrimenti "bounded" (sopra) vincola il drag a
            // quell'area ridotta invece che a tutta la finestra
            // disponibile, ed è per questo che prima non riuscivi a
            // rilasciare un widget nello spazio vuoto sotto gli altri.
            autoSize={false}
            // Impedisce di trascinare un widget fuori dall'area della griglia.
            dragConfig={{ bounded: true }}
            width={width}
            compactor={freeMovePushCompactor}
            // Aggiorna la posizione del ghost sia all'inizio del drag
            // sia ad ogni movimento successivo del mouse.
            onDragStart={(evLayout, oldItem, newItem, placeholder) => {
              const id = newItem?.i ?? oldItem?.i ?? null;
              dragOriginRef.current = id
                ? { id, layout: layout.map((it) => ({ ...it })) }
                : null;
              setActiveItem(
                id,
                oldItem ? { x: oldItem.x, y: oldItem.y, w: oldItem.w, h: oldItem.h } : undefined
              );
              captureGhost(evLayout, oldItem, newItem, placeholder);
            }}
            onDrag={captureGhost}
            onDragStop={async (newLayout) => {
              const dropped = newLayout as LayoutItem[];
              const origin = dragOriginRef.current;

              const pending = origin ? hasPendingCollision(dropped, origin.id) : false;

              let finalItems: LayoutItem[];
              if (origin && pending) {
                finalItems = finalizeLayout(origin.layout, GRID_COLS) as LayoutItem[];
              } else {
                finalItems = finalizeLayout(dropped, GRID_COLS) as LayoutItem[];
              }

              suppressLayoutChangeRef.current = true;
              setLayout(finalItems);
              clearGhost();
              setActiveItem(null);
              dragOriginRef.current = null;
              await saveLayout(finalItems);
              setTimeout(() => { suppressLayoutChangeRef.current = false; }, 150);
            }}
            // Scatta anche per cambi di layout non causati direttamente
            // dal drag (es. compattazione automatica quando un widget
            // viene rimosso dal catalogo). Tiene lo stato React
            // sincronizzato con quello che la libreria calcola
            // internamente.
            onLayoutChange={(newLayout) => {
              if (suppressLayoutChangeRef.current) return;
              setLayout(clampToBounds(newLayout as LayoutItem[], GRID_COLS) as LayoutItem[]);
            }}
          >
            {layout.map((item) => {
              const widget = WIDGET_MAP[item.i];
              if (!widget) return null;
              return <div key={item.i}>{widget.component()}</div>;
            })}
          </GridLayout>
        )}

        {/*
          Overlay "ghost": renderizzato SOLO mentre dragTarget/ghostPos
          sono valorizzati (cioè durante un drag attivo). Contiene una
          seconda istanza dello stesso componente widget (dal registro),
          resa semi-trasparente/sfocata via CSS (.widget-ghost),
          posizionata con transform: translate3d(...) invece di left/top
          per sfruttare l'accelerazione GPU e ottenere un'animazione più
          fluida quando si muove da una cella all'altra.
        */}
        {dragTarget && ghostPos && WIDGET_MAP[dragTarget.i] && (
          <div
            className="widget-ghost"
            style={{
              width: ghostPos.width,
              height: ghostPos.height,
              transform: `translate3d(${ghostPos.left}px, ${ghostPos.top}px, 0)`,
            }}
          >
            {WIDGET_MAP[dragTarget.i].component()}
          </div>
        )}
      </div>
    </>
  );
}

export default Dashboard;
