import { useMemo, useState } from "react";
import { MdExpandMore } from "react-icons/md";
import type { ProcessInfo } from "../data/sysmonApi";
import { NA, bytes, percent, rate } from "../lib/format";

type SortKey = "name" | "pid" | "cpu" | "memory" | "gpu" | "diskBps";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Nome", numeric: false },
  { key: "pid", label: "PID", numeric: true },
  { key: "cpu", label: "CPU", numeric: true },
  { key: "memory", label: "Memoria", numeric: true },
  { key: "gpu", label: "GPU", numeric: true },
  { key: "diskBps", label: "Disco", numeric: true },
];

/** Righe visibili prima di "Mostra tutti". */
const COLLAPSED_ROWS = 10;

/** Confronto con i valori mancanti sempre in fondo, in entrambe le direzioni. */
function compare(a: ProcessInfo, b: ProcessInfo, key: SortKey, desc: boolean): number {
  if (key === "name") {
    const r = a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    return desc ? -r : r;
  }
  const va = a[key];
  const vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return desc ? vb - va : va - vb;
}

/** Tabella dei processi della pagina di dettaglio: ricerca per nome o PID, ordinamento per colonna. */
function ProcessTable({ processes, count }: { processes: ProcessInfo[] | null; count: number | null }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [desc, setDesc] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    if (!processes) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? processes.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).startsWith(q)) : processes;
    return [...filtered].sort((a, b) => compare(a, b, sortKey, desc));
  }, [processes, query, sortKey, desc]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      // i numeri si guardano dal più grande, i nomi in ordine alfabetico
      setDesc(key !== "name");
    }
  }

  return (
    <section className="smp-card">
      <div className="smp-card-head">
        <h2>Processi{count != null ? ` · ${count} attivi` : ""}</h2>
        <label className="smp-search">
          Cerca
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="nome o PID" />
        </label>
      </div>
      {processes == null ? (
        <p className="smp-fine">In attesa della prima misura…</p>
      ) : (
        <div className="smp-table-wrap">
          <table className="smp-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const active = col.key === sortKey;
                  return (
                    <th
                      key={col.key}
                      className={col.numeric ? "num" : undefined}
                      aria-sort={active ? (desc ? "descending" : "ascending") : undefined}
                    >
                      <button type="button" onClick={() => sortBy(col.key)}>
                        {col.label}
                        {active && (desc ? " ↓" : " ↑")}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(expanded ? rows : rows.slice(0, COLLAPSED_ROWS)).map((p) => (
                <tr key={p.pid}>
                  <td className="smp-proc-name">{p.name}</td>
                  <td className="num dim smw-mono">{p.pid}</td>
                  <td className="num smw-mono">{percent(p.cpu, 1)}</td>
                  <td className="num smw-mono">{bytes(p.memory)}</td>
                  <td className="num dim smw-mono">{p.gpu == null ? NA : percent(p.gpu)}</td>
                  <td className="num dim smw-mono">{rate(p.diskBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="smp-fine">Nessun processo trovato.</p>}
          {rows.length > COLLAPSED_ROWS && (
            <button type="button" className="smp-expand" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
              <MdExpandMore className={expanded ? "is-open" : undefined} aria-hidden="true" />
              {expanded ? "Mostra solo i primi 10" : `Mostra tutti (${rows.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default ProcessTable;
