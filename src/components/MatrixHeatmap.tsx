import { useMemo } from "react";
import type { Matrix } from "../lib/rainflow";

export function MatrixHeatmap({ matrix, width = 420, height = 320 }: { matrix: Matrix; width?: number; height?: number }) {
  const { counts, rangeEdges, meanEdges } = matrix;

  const maxVal = useMemo(() => {
    let m = 0;
    for (const row of counts) for (const v of row) m = Math.max(m, v);
    return m;
  }, [counts]);

  const binsR = counts.length;
  const binsM = binsR ? counts[0].length : 0;

  const cellW = binsM ? width / binsM : width;
  const cellH = binsR ? height / binsR : height;

  const shade = (v: number) => {
    if (maxVal <= 0) return 0.05;
    const t = v / maxVal;
    return 0.05 + 0.85 * t;
  };

  return (
    <div>
      <div className="small mono">range bins={binsR}, mean bins={binsM}, max={maxVal.toFixed(2)}</div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
        {counts.map((row, ri) => {
          const y = (binsR - 1 - ri) * cellH;
          return row.map((v, mi) => {
            const x = mi * cellW;
            const a = shade(v);
            return (
              <rect
                key={`${ri}-${mi}`}
                x={x}
                y={y}
                width={cellW}
                height={cellH}
                fill="currentColor"
                opacity={a}
              />
            );
          });
        })}
      </svg>
      <div className="small">
        <div className="mono">range: [{rangeEdges[0]?.toFixed(2)} .. {rangeEdges[rangeEdges.length - 1]?.toFixed(2)}]</div>
        <div className="mono">mean:  [{meanEdges[0]?.toFixed(2)} .. {meanEdges[meanEdges.length - 1]?.toFixed(2)}]</div>
      </div>
    </div>
  );
}
