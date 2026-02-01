import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { Cycle, TurningPoint } from "../lib/rainflow";
import { PLOT_BASE, getYDomain } from "../lib/plotLayout";

export type PlotStyle = {
  theme: "clean" | "neon" | "ink";
  showGrid: boolean;
  showAreaFill: boolean;
  smooth: boolean;
  glow: number; // 0..1
};

export type PlotElement =
  | { kind: "raw" }
  | { kind: "turning"; index: number; value: number }
  | { kind: "cycle"; b: TurningPoint; c: TurningPoint; range: number; mean: number; count: number }
  | { kind: "abcd"; a: TurningPoint; b: TurningPoint; c: TurningPoint; d: TurningPoint };

type Props = {
  raw: number[];
  turningPoints: TurningPoint[];
  currentTPIndex: number;
  heightPx?: number;
  style?: PlotStyle;
  cycles?: Cycle[];
  windowABCD?: [TurningPoint, TurningPoint, TurningPoint, TurningPoint] | null;
  xDomain?: [number, number] | null;
  onZoom?: (domain: [number, number]) => void;
  onResetZoom?: () => void;
  onSelectElement?: (el: PlotElement) => void;
};

const defaultStyle: PlotStyle = {
  theme: "neon",
  showGrid: true,
  showAreaFill: true,
  smooth: true,
  glow: 0.6
};

export function SignalPlot({
  raw,
  turningPoints,
  currentTPIndex,
  heightPx = PLOT_BASE.height,
  style = defaultStyle,
  cycles = [],
  windowABCD = null,
  xDomain = null,
  onZoom,
  onResetZoom,
  onSelectElement
}: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  const ids = useMemo(() => {
    const s = Math.random().toString(36).slice(2);
    return {
      bg: `bg-${s}`,
      area: `area-${s}`,
      glow: `glow-${s}`,
      dot: `dot-${s}`,
      vignette: `vig-${s}`
    };
  }, []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    const W = PLOT_BASE.width, H = PLOT_BASE.height;
    const m = PLOT_BASE.margin;
    const innerW = W - m.l - m.r;
    const innerH = H - m.t - m.b;

    svg.attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();

    const theme = style.theme;
    const gridAlpha = theme === "ink" ? 0.14 : 0.10;
    const axisAlpha = theme === "ink" ? 0.40 : 0.30;
    const areaAlpha = theme === "clean" ? 0.18 : theme === "ink" ? 0.12 : 0.22;

    const xMax = Math.max(1, raw.length - 1);
    const xMin = Math.max(0, Math.min(xDomain?.[0] ?? 0, xMax));
    const xMaxClamped = Math.max(xMin + 1e-6, Math.min(xDomain?.[1] ?? xMax, xMax));

    const x = d3.scaleLinear()
      .domain([xMin, xMaxClamped])
      .range([m.l, W - m.r]);

    const extent = getYDomain(raw);
    const y = d3.scaleLinear()
      .domain(extent)
      .nice()
      .range([H - m.b, m.t]);

    const defs = svg.append("defs");

    const bg = defs.append("linearGradient")
      .attr("id", ids.bg)
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    bg.append("stop").attr("offset", "0%").attr("stop-color", "currentColor").attr("stop-opacity", theme === "clean" ? 0.06 : 0.10);
    bg.append("stop").attr("offset", "100%").attr("stop-color", "currentColor").attr("stop-opacity", theme === "clean" ? 0.02 : 0.04);

    const vig = defs.append("radialGradient")
      .attr("id", ids.vignette)
      .attr("cx", "50%").attr("cy", "45%").attr("r", "70%");
    vig.append("stop").attr("offset", "0%").attr("stop-color", "black").attr("stop-opacity", 0.0);
    vig.append("stop").attr("offset", "100%").attr("stop-color", "black").attr("stop-opacity", theme === "clean" ? 0.10 : 0.18);

    const area = defs.append("linearGradient")
      .attr("id", ids.area)
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    area.append("stop").attr("offset", "0%").attr("stop-color", "currentColor").attr("stop-opacity", areaAlpha);
    area.append("stop").attr("offset", "100%").attr("stop-color", "currentColor").attr("stop-opacity", 0.0);

    const glow = defs.append("filter")
      .attr("id", ids.glow)
      .attr("x", "-40%").attr("y", "-40%")
      .attr("width", "180%").attr("height", "180%");
    glow.append("feGaussianBlur")
      .attr("stdDeviation", 3 + 6 * style.glow)
      .attr("result", "blur");
    glow.append("feMerge")
      .selectAll("feMergeNode")
      .data<string>(["blur", "SourceGraphic"])
      .enter()
      .append("feMergeNode")
      .attr("in", d => d);

    const dot = defs.append("filter")
      .attr("id", ids.dot)
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    dot.append("feGaussianBlur").attr("stdDeviation", 1.2).attr("result", "b");
    dot.append("feMerge")
      .selectAll("feMergeNode")
      .data<string>(["b", "SourceGraphic"])
      .enter()
      .append("feMergeNode")
      .attr("in", d => d);

    const cycleGrad = defs.append("linearGradient")
      .attr("id", `cycle-${ids.bg}`)
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "100%").attr("y2", "0%");
    cycleGrad.append("stop").attr("offset", "0%").attr("stop-color", "currentColor").attr("stop-opacity", 0.08);
    cycleGrad.append("stop").attr("offset", "50%").attr("stop-color", "currentColor").attr("stop-opacity", 0.35);
    cycleGrad.append("stop").attr("offset", "100%").attr("stop-color", "currentColor").attr("stop-opacity", 0.08);

    svg.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", W).attr("height", H)
      .attr("fill", `url(#${ids.bg})`);

    svg.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", W).attr("height", H)
      .attr("fill", `url(#${ids.vignette})`);

    if (style.showGrid) {
      const gx = d3.axisBottom(x).ticks(12).tickSize(-innerH).tickFormat(() => "");
      const gy = d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(() => "");

      svg.append("g")
        .attr("transform", `translate(0,${H - m.b})`)
        .call(gx as any)
        .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
          g.selectAll("line").attr("stroke", "currentColor").attr("stroke-opacity", gridAlpha)
        )
        .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
          g.selectAll("path").attr("stroke-opacity", 0)
        );

      svg.append("g")
        .attr("transform", `translate(${m.l},0)`)
        .call(gy as any)
        .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
          g.selectAll("line").attr("stroke", "currentColor").attr("stroke-opacity", gridAlpha)
        )
        .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
          g.selectAll("path").attr("stroke-opacity", 0)
        );
    }

    const ax = d3.axisBottom(x).ticks(10);
    const ay = d3.axisLeft(y).ticks(6);

    svg.append("g")
      .attr("transform", `translate(0,${H - m.b})`)
      .call(ax as any)
      .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        g.selectAll("path,line").attr("stroke", "currentColor").attr("stroke-opacity", axisAlpha)
      )
      .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        g.selectAll("text").attr("fill", "currentColor").attr("opacity", 0.65).attr("font-size", 11)
      );

    svg.append("g")
      .attr("transform", `translate(${m.l},0)`)
      .call(ay as any)
      .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        g.selectAll("path,line").attr("stroke", "currentColor").attr("stroke-opacity", axisAlpha)
      )
      .call((g: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        g.selectAll("text").attr("fill", "currentColor").attr("opacity", 0.65).attr("font-size", 11)
      );

    const curve = style.smooth ? d3.curveCatmullRom.alpha(0.9) : d3.curveLinear;

    const line = d3.line<number>()
      .x((_, i) => x(i))
      .y(d => y(d))
      .curve(curve);

    const areaGen = d3.area<number>()
      .x((_, i) => x(i))
      .y0(y(d3.min(raw) ?? 0))
      .y1(d => y(d))
      .curve(curve);

    if (style.showAreaFill) {
      svg.append("path")
        .datum(raw)
        .attr("d", areaGen)
        .attr("fill", `url(#${ids.area})`);
    }

    if (style.glow > 0.01 && theme !== "clean") {
      svg.append("path")
        .datum(raw)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.25 + 0.35 * style.glow)
        .attr("stroke-width", 5 + 6 * style.glow)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("filter", `url(#${ids.glow})`);
    }

    svg.append("path")
      .datum(raw)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", theme === "clean" ? 0.85 : 0.92)
      .attr("stroke-width", theme === "ink" ? 2.2 : 2.6)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    const dotR = theme === "clean" ? 3.8 : 4.2;

    const k = Math.min(Math.max(currentTPIndex, 0), turningPoints.length - 1);
    if (turningPoints.length > 0) {
      const cur = turningPoints[k];
      svg.append("line")
        .attr("x1", x(cur.i))
        .attr("x2", x(cur.i))
        .attr("y1", m.t)
        .attr("y2", H - m.b)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.2)
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "3 6");
    }

    const cyclesToDraw = cycles.length > 80 ? cycles.slice(cycles.length - 80) : cycles;
    if (cyclesToDraw.length) {
      const cg = svg.append("g").attr("class", "cycles");
      for (const c of cyclesToDraw) {
        const xb = x(c.b.i), yb = y(c.b.x);
        const xc = x(c.c.i), yc = y(c.c.x);
        const midX = (xb + xc) * 0.5;
        const midY = Math.min(yb, yc) - 18 - Math.min(46, Math.abs(yb - yc) * 0.35);

        cg.append("path")
          .attr("d", `M ${xb} ${yb} Q ${midX} ${midY} ${xc} ${yc}`)
          .attr("fill", "none")
          .attr("stroke", `url(#cycle-${ids.bg})`)
          .attr("stroke-width", 2.4)
          .attr("stroke-opacity", 0.8)
          .attr("filter", `url(#${ids.glow})`)
          .style("cursor", "pointer")
          .on("click", () => onSelectElement?.({ kind: "cycle", b: c.b, c: c.c, range: c.range, mean: c.mean, count: c.count }));

        cg.append("circle")
          .attr("cx", midX)
          .attr("cy", midY + 4)
          .attr("r", 3.4 + Math.min(6, c.range * 0.35))
          .attr("fill", "currentColor")
          .attr("opacity", 0.14 + 0.18 * c.count);
      }
    }

    const tpG = svg.append("g");
    tpG.selectAll<SVGGElement, TurningPoint>("g.tp")
      .data(turningPoints)
      .enter()
      .append("g")
      .attr("class", "tp")
      .attr("transform", d => `translate(${x(d.i)},${y(d.x)})`)
      .each(function () {
        const g = d3.select(this);
        g.append("circle")
          .attr("r", dotR)
          .attr("fill", "currentColor")
          .attr("opacity", 0.75)
          .attr("filter", `url(#${ids.dot})`);

        g.append("circle")
          .attr("r", dotR * 0.45)
          .attr("cx", -dotR * 0.25)
          .attr("cy", -dotR * 0.35)
          .attr("fill", "white")
          .attr("opacity", 0.65);

        g.style("cursor", "pointer").on("click", (_event, d: TurningPoint) => {
          onSelectElement?.({ kind: "turning", index: d.i, value: d.x });
        });
      });

    if (turningPoints.length > 0) {
      const cur = turningPoints[k];

      const cg = svg.append("g")
        .attr("transform", `translate(${x(cur.i)},${y(cur.x)})`);

      cg.append("circle")
        .attr("r", 10)
        .attr("fill", "currentColor")
        .attr("opacity", theme === "clean" ? 0.12 : 0.18);

      cg.append("circle")
        .attr("r", 6.2)
        .attr("fill", "currentColor")
        .attr("opacity", 0.95)
        .attr("filter", `url(#${ids.glow})`);

      cg.append("circle")
        .attr("r", 2.4)
        .attr("cx", -1.4)
        .attr("cy", -2.0)
        .attr("fill", "white")
        .attr("opacity", 0.75);
    }

    if (windowABCD) {
      const [A, B, C, D] = windowABCD;
      const pts = [A, B, C, D].map(p => [x(p.i), y(p.x)]);
      svg.append("path")
        .attr("d", `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]}`)
        .attr("fill", "none")
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.5)
        .attr("stroke-width", 2.6)
        .attr("stroke-dasharray", "4 6")
        .style("cursor", "pointer")
        .on("click", () => onSelectElement?.({ kind: "abcd", a: A, b: B, c: C, d: D }));

      const labels = ["A", "B", "C", "D"];
      labels.forEach((label, i) => {
        svg.append("text")
          .attr("x", pts[i][0] + 8)
          .attr("y", pts[i][1] - 8)
          .attr("fill", "currentColor")
          .attr("opacity", 0.7)
          .attr("font-size", 12)
          .text(label);
      });
    }

    const brush = d3.brushX()
      .extent([[m.l, m.t], [W - m.r, H - m.b]])
      .on("end", (event) => {
        if (!event.selection) return;
        const [sx, ex] = event.selection as [number, number];
        if (Math.abs(ex - sx) < 4) return;
        const d0 = x.invert(sx);
        const d1 = x.invert(ex);
        onZoom?.([Math.min(d0, d1), Math.max(d0, d1)]);
      });

    const gBrush = svg.append("g")
      .attr("class", "brush")
      .call(brush);

    gBrush.selectAll<SVGRectElement, unknown>(".overlay")
      .style("cursor", "crosshair")
      .on("click", (event) => {
        const [mx] = d3.pointer(event);
        const xVal = x.invert(mx);
        let best: TurningPoint | null = null;
        let bestDx = Infinity;
        for (const tp of turningPoints) {
          const dx = Math.abs(tp.i - xVal);
          if (dx < bestDx) { bestDx = dx; best = tp; }
        }
        if (best && bestDx <= 0.8) {
          onSelectElement?.({ kind: "turning", index: best.i, value: best.x });
        } else {
          onSelectElement?.({ kind: "raw" });
        }
      });

    svg.on("dblclick", () => onResetZoom?.());
    svg.on("click", () => onSelectElement?.({ kind: "raw" }));

  }, [raw, turningPoints, currentTPIndex, heightPx, style, ids, cycles, windowABCD, xDomain, onZoom, onResetZoom, onSelectElement]);

  return <svg ref={ref} style={{ width: "100%", height: `${heightPx}px` }} />;
}
