import { useEffect, useState } from "react";
import { MdOutlinePictureAsPdf } from "react-icons/md";
import { attachmentUrl } from "../../lib/attachmentUrls";
import { pdfThumbName, type PdfSummary } from "../../lib/pdf/pdfData";
import "./PdfThumb.css";

interface PdfThumbProps {
  /** Cartella della nota su disco (lì c'è la miniatura salvata all'importazione). */
  noteDir: string | null;
  pdf: PdfSummary;
}

/**
 * Anteprima di una nota PDF nell'elenco: la miniatura della prima pagina (salvata accanto al PDF
 * quando è stato importato); se non c'è, l'icona del PDF con le pagine.
 */
function PdfThumb({ noteDir, pdf }: PdfThumbProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!noteDir) return;
    let alive = true;
    attachmentUrl(noteDir, pdfThumbName(pdf.file))
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [noteDir, pdf.file]);

  return (
    <div className="nq-pdf-thumb">
      {url ? <img src={url} alt="" draggable={false} /> : <MdOutlinePictureAsPdf aria-hidden="true" />}
      <span className="nq-pdf-thumb-badge">PDF{pdf.pages > 0 ? ` · ${pdf.pages} pag.` : ""}</span>
    </div>
  );
}

export default PdfThumb;
