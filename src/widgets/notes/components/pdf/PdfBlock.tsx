import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  MdInvertColors,
  MdOpenInNew,
  MdOutlineFitScreen,
  MdOutlineLock,
  MdOutlinePictureAsPdf,
  MdOutlineReportProblem,
  MdUndo,
} from "react-icons/md";
import { useLatestRef } from "../../../../core/hooks/useLatestRef";
import { useThemeVariant } from "../../../../core/theme/variants";
import type { InkStroke, NotePage } from "../../data/notesRepository";
import { attachmentAbsolutePath } from "../../lib/vault";
import { pagesLabel, pdfPageCount, pdfPageNumbers, type PdfBlockInfo } from "../../lib/pdf/pdfData";
import { PdfOpenError, acquireNotePdf, loadPdfJs, pageSizes, pdfErrorMessage, type PdfErrorKind, type PdfJs } from "../../lib/pdf/pdfDocument";
import type { InkTool } from "../InkLayer";
import PdfFind from "./PdfFind";
import PdfPageView, { type PdfLinkTarget } from "./PdfPageView";
import { PDF_PAGE_COUNTER } from "./pdfVariants";
import "./PdfBlock.css";

/** Zoom delle pagine PDF: 100 = adatta larghezza. */
export const PDF_ZOOM_MIN = 50;
export const PDF_ZOOM_MAX = 300;

interface PdfBlockProps {
  page: NotePage;
  info: PdfBlockInfo;
  noteDir: string | null;
  /** Titolo e proprietà della nota (se il blocco è la prima pagina). */
  header?: ReactNode;
  /** Il contenitore che scorre (.nq-scroll): serve al disegno pigro e al contatore delle pagine. */
  scrollEl: HTMLElement | null;
  zoom: number;
  onZoom: (zoom: number) => void;
  mode: "text" | "ink";
  tool: InkTool;
  color: string;
  size: number;
  shapes: boolean;
  onInk: (pageNumber: number, strokes: InkStroke[]) => void;
  /** Dati del blocco da salvare (dimensioni lette dal PDF, colori invertiti). */
  onInfo: (info: PdfBlockInfo) => void;
  findOpen: boolean;
  onCloseFind: () => void;
  onNotice: (message: string) => void;
  /** Fase 2: torna al collegamento nel testo. */
  onBackToLink?: () => void;
}

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "password"; wrong: boolean } | { kind: "error"; error: PdfErrorKind };

const EMPTY: InkStroke[] = [];

/**
 * Un blocco PDF: le pagine del PDF una sotto l'altra, ognuna con il suo inchiostro. Il PDF è quello
 * copiato in allegati/ e non viene mai modificato. Si disegnano solo le pagine vicine allo schermo.
 */
function PdfBlock(props: PdfBlockProps) {
  const { info, noteDir, scrollEl, zoom } = props;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [lib, setLib] = useState<PdfJs | null>(null);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [avail, setAvail] = useState(0);
  const [currentPage, setCurrentPage] = useState(info.from);
  const [textVersion, setTextVersion] = useState(0);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const counter = useThemeVariant(PDF_PAGE_COUNTER);
  const onInfoRef = useLatestRef(props.onInfo);
  const infoRef = useLatestRef(info);

  // Il PDF (aperto una volta e condiviso, vedi acquireNotePdf).
  useEffect(() => {
    let cancelled = false;
    const handle = acquireNotePdf(noteDir, info.file, password);
    handle.doc
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setStatus({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const kind = error instanceof PdfOpenError ? error.kind : "other";
        if (kind === "password" || kind === "wrongPassword") setStatus({ kind: "password", wrong: kind === "wrongPassword" });
        else {
          console.error("PDF non aperto:", error);
          setStatus({ kind: "error", error: kind });
        }
      });
    loadPdfJs()
      .then((l) => !cancelled && setLib(l))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      handle.release();
    };
  }, [noteDir, info.file, password]);

  // Dimensioni delle pagine non ancora note (PDF con password, dati vecchi): si leggono e si salvano.
  useEffect(() => {
    if (!doc) return;
    const current = infoRef.current;
    const to = current.to === 0 ? doc.numPages : Math.min(current.to, doc.numPages);
    const from = Math.min(current.from, to);
    if (current.to === to && current.from === from && current.sizes.length === to - from + 1) return;
    let cancelled = false;
    pageSizes(doc, from, to)
      .then((sizes) => {
        if (!cancelled) onInfoRef.current({ ...infoRef.current, from, to, sizes });
      })
      .catch((error) => console.error("Dimensioni delle pagine non lette:", error));
    return () => {
      cancelled = true;
    };
  }, [doc, infoRef, onInfoRef]);

  // Larghezza disponibile: al 100% la pagina più larga la riempie.
  useLayoutEffect(() => {
    if (!root) return;
    const update = () => setAvail(root.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  const pages = useMemo(() => pdfPageNumbers(info), [info]);
  const sizesReady = info.sizes.length === pages.length && pages.length > 0;
  const maxWidth = sizesReady ? Math.max(...info.sizes.map(([w]) => w)) : 0;
  const scale = avail > 0 && maxWidth > 0 ? (avail / maxWidth) * (zoom / 100) : 0;

  // Pagina corrente (per il contatore) e punto di lettura, tenuto fermo quando cambia lo zoom.
  const anchor = useRef<{ page: number; ratio: number } | null>(null);
  useEffect(() => {
    if (!scrollEl || !root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = scrollEl.getBoundingClientRect();
      const line = box.top + box.height * 0.3;
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-page]"))) {
        const r = el.getBoundingClientRect();
        if (r.bottom > line) {
          const n = Number(el.dataset.pdfPage);
          setCurrentPage(n);
          anchor.current = { page: n, ratio: r.height > 0 ? (line - r.top) / r.height : 0 };
          return;
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrollEl, root, sizesReady]);

  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a || !scrollEl || !root) return;
    const el = root.querySelector<HTMLElement>(`[data-pdf-page="${a.page}"]`);
    if (!el) return;
    const box = scrollEl.getBoundingClientRect();
    const line = box.top + box.height * 0.3;
    const r = el.getBoundingClientRect();
    scrollEl.scrollBy({ top: r.top + a.ratio * r.height - line });
  }, [scale, scrollEl, root]);

  // Ctrl+rotella: zoom (senza far zoomare la finestra).
  const zoomRef = useLatestRef(zoom);
  const onZoomRef = useLatestRef(props.onZoom);
  useEffect(() => {
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const next = Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoomRef.current + (e.deltaY < 0 ? 10 : -10)));
      if (next !== zoomRef.current) onZoomRef.current(next);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [root, zoomRef, onZoomRef]);

  const goToPage = useCallback((n: number) => {
    root?.querySelector<HTMLElement>(`[data-pdf-page="${n}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [root]);

  /** Link del PDF: interno = si va alla pagina; esterno = si chiede prima di aprirlo nel browser. */
  async function followLink(target: PdfLinkTarget) {
    if ("url" in target) {
      setPendingUrl(target.url);
      return;
    }
    if (!doc) return;
    try {
      const dest = typeof target.dest === "string" ? await doc.getDestination(target.dest) : target.dest;
      const ref = Array.isArray(dest) ? dest[0] : null;
      const index =
        ref && typeof ref === "object" ? await doc.getPageIndex(ref as { num: number; gen: number }) : typeof ref === "number" ? ref : -1;
      const n = index + 1;
      if (n >= info.from && n <= info.to) goToPage(n);
      else props.onNotice(n > 0 ? `Il link porta alla pagina ${n}, che non è in questo blocco` : "Link non valido");
    } catch {
      props.onNotice("Link non valido");
    }
  }

  async function openOriginal() {
    if (!noteDir) return;
    try {
      await openPath(await attachmentAbsolutePath(noteDir, info.file));
    } catch (error) {
      console.error("PDF non aperto:", error);
      props.onNotice("Impossibile aprire il file");
    }
  }

  const total = pdfPageCount(info);

  return (
    <div ref={setRoot} className="nq-pdf" data-pdf-block={info.id}>
      <div className="nq-pdf-bar" role="toolbar" aria-label="PDF">
        <span className="nq-pdf-title">
          <MdOutlinePictureAsPdf aria-hidden="true" />
          <strong title={info.name}>{info.name}</strong>
          <em>{pagesLabel(info)}</em>
        </span>
        {total > 0 && (
          <span className="nq-pdf-counter" aria-label={`Pagina ${currentPage} di ${info.to}`}>
            {counter(currentPage, info.to)}
          </span>
        )}
        <span className="nq-pdf-tools">
          {props.onBackToLink && (
            <button type="button" className="nq-icon-btn" onClick={props.onBackToLink} title="Torna al punto del testo" aria-label="Torna al punto del testo">
              <MdUndo />
            </button>
          )}
          <button
            type="button"
            className="nq-icon-btn"
            disabled={zoom === 100}
            onClick={() => props.onZoom(100)}
            title="Adatta alla larghezza"
            aria-label="Adatta alla larghezza"
          >
            <MdOutlineFitScreen />
          </button>
          <button
            type="button"
            className={`nq-icon-btn${info.invert ? " is-on" : ""}`}
            aria-pressed={Boolean(info.invert)}
            onClick={() => props.onInfo({ ...info, invert: !info.invert })}
            title="Inverti i colori (per leggere di notte)"
            aria-label="Inverti i colori"
          >
            <MdInvertColors />
          </button>
          <button type="button" className="nq-icon-btn" onClick={() => void openOriginal()} title="Apri il PDF con l'app di sistema" aria-label="Apri il PDF con l'app di sistema">
            <MdOpenInNew />
          </button>
        </span>
      </div>

      {pendingUrl && (
        <div className="nq-pdf-confirm" role="alertdialog" aria-label="Aprire il link?">
          <span>
            Aprire nel browser <b>{pendingUrl}</b>?
          </span>
          <button
            type="button"
            className="nq-btn nq-btn--small"
            onClick={() => {
              const url = pendingUrl;
              setPendingUrl(null);
              if (/^(https?:|mailto:)/i.test(url)) void openUrl(url).catch(() => props.onNotice("Impossibile aprire il link"));
              else props.onNotice("Questo tipo di link non si apre");
            }}
          >
            Apri
          </button>
          <button type="button" className="nq-btn nq-btn--small" onClick={() => setPendingUrl(null)}>
            Annulla
          </button>
        </div>
      )}

      {props.findOpen && doc && (
        <PdfFind doc={doc} pages={pages} container={root} textVersion={textVersion} onGoToPage={goToPage} onClose={props.onCloseFind} />
      )}

      {props.header && (
        <div className="nq-paper nq-pdf-titlecard">
          <div className="nq-page-head">{props.header}</div>
        </div>
      )}

      {status.kind === "loading" && <p className="nq-pdf-status">Apro il PDF…</p>}

      {status.kind === "error" && (
        <div className="nq-pdf-problem" role="alert">
          <MdOutlineReportProblem aria-hidden="true" />
          <p>{pdfErrorMessage(status.error)}</p>
          {status.error !== "missing" && (
            <button type="button" className="nq-btn nq-btn--small" onClick={() => void openOriginal()}>
              Apri il file originale
            </button>
          )}
        </div>
      )}

      {status.kind === "password" && (
        <form
          className="nq-pdf-problem"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft) return;
            setStatus({ kind: "loading" });
            setPassword(draft);
            setDraft("");
          }}
        >
          <MdOutlineLock aria-hidden="true" />
          <p>{status.wrong ? "Password sbagliata: riprova." : "Questo PDF è protetto da password."}</p>
          <span className="nq-pdf-password">
            <input
              type="password"
              value={draft}
              autoComplete="off"
              placeholder="Password del PDF"
              aria-label="Password del PDF"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="nq-btn nq-btn--small" disabled={!draft}>
              Apri
            </button>
          </span>
          <small>La password non viene salvata: si chiede a ogni apertura.</small>
        </form>
      )}

      {status.kind === "ready" && !sizesReady && <p className="nq-pdf-status">Leggo le pagine…</p>}

      {status.kind === "ready" && doc && lib && sizesReady && scale > 0 && (
        <div className="nq-pdf-pages">
          {pages.map((n, i) => (
            <PdfPageView
              key={n}
              lib={lib}
              doc={doc}
              pageNumber={n}
              size={info.sizes[i]}
              scale={scale}
              invert={Boolean(info.invert)}
              root={scrollEl}
              mode={props.mode}
              tool={props.tool}
              color={props.color}
              inkSize={props.size}
              shapes={props.shapes}
              strokes={props.page.pdfInk[String(n)] ?? EMPTY}
              onInk={(strokes) => props.onInk(n, strokes)}
              onTextReady={() => setTextVersion((v) => v + 1)}
              onLink={(target) => void followLink(target)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PdfBlock;
