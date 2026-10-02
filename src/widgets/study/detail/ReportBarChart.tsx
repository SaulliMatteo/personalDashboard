import type { Bucket } from "./report";

/**
 * Grafico a barre disegnato a mano in SVG: un solo tipo di grafico
 * semplice non giustifica una libreria di charting in più da compilare.
 */
function ReportBarChart({ buckets }: { buckets: Bucket[] }) {
  const chartHeight = 160;
  const barWidth = 34;
  const gap = 22;
  const width = buckets.length * (barWidth + gap) + gap;
  const maxSeconds = Math.max(1, ...buckets.map((b) => b.seconds));

  return (
    <svg
      className="study-report-chart"
      viewBox={`0 0 ${width} ${chartHeight + 24}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Minuti studiati per periodo"
    >
      {buckets.map((b, i) => {
        const h = Math.round((b.seconds / maxSeconds) * chartHeight);
        const x = gap + i * (barWidth + gap);
        const y = chartHeight - h;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, 2)}
              rx={6}
              fill="var(--accent)"
              opacity={b.seconds === 0 ? 0.18 : 1}
            />
            <text x={x + barWidth / 2} y={chartHeight + 18} textAnchor="middle" className="study-report-chart-label">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default ReportBarChart;
