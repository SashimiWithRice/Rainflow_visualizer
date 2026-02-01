import { useEffect, useMemo, useRef, useState } from "react";
import type { Options, ResidueHandling } from "./lib/rainflow";
import { buildMatrix, rainflowCount } from "./lib/rainflow";
import { PLOT_BASE } from "./lib/plotLayout";

import { SignalPlot, type PlotStyle } from "./components/SignalPlot";
import { RainOverlayCanvas, type RainGraphics } from "./components/RainOverlayCanvas";
import { StackView } from "./components/StackView";
import { CycleTable } from "./components/CycleTable";
import { MatrixHeatmap } from "./components/MatrixHeatmap";

const demoRaw = [
  -1, 2, -3, 5, -2, 4, -5, 6, -2, 3, -4, 5, -1, 2, -3, 4, -6, 5, -2, 3,
  -1, 4, -5, 6, -3, 4, -2, 5, -4, 3, -1, 2, -3, 4, -2, 3
];

export default function App() {
  // --- analysis inputs
  const [raw, setRaw] = useState<number[]>(demoRaw);
  const [useEndpoints, setUseEndpoints] = useState(true);
  const [residue, setResidue] = useState<ResidueHandling>("half");
  const [binsRange, setBinsRange] = useState(12);
  const [binsMean, setBinsMean] = useState(12);

  const options: Options = useMemo(() => ({
    useEndpointsAsReversals: useEndpoints,
    residue,
    binsRange,
    binsMean
  }), [useEndpoints, residue, binsRange, binsMean]);

  const computed = useMemo(() => rainflowCount(raw, options), [raw, options]);
  const matrix = useMemo(() => buildMatrix(computed.cycles, binsRange, binsMean), [computed.cycles, binsRange, binsMean]);

  // --- playback
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const maxCursor = Math.max(0, computed.events.length - 1);

  useEffect(() => {
    setPlaying(false);
    setCursor(0);
  }, [useEndpoints, residue, binsRange, binsMean, raw]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor(c => (c >= maxCursor ? maxCursor : c + 1));
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, maxCursor]);

  const ev = computed.events.length ? computed.events[Math.min(cursor, maxCursor)] : null;
  const closedNow = ev?.closed ?? [];

  const cyclesUpToCursor = useMemo(() => {
    if (!computed.events.length) return [];
    const out = [];
    for (let k = 0; k <= cursor && k < computed.events.length; k++) out.push(...computed.events[k].closed);
    if (cursor >= maxCursor) {
      const already = out.length;
      if (computed.cycles.length > already) out.push(...computed.cycles.slice(already));
    }
    return out;
  }, [computed, cursor, maxCursor]);

  // --- graphics settings
  const gfx: RainGraphics = {
    mode: "cinematic",
    enabled: true,
    spawnFromClosedCycles: true,
    intensity: 4.6,
    spawnProb: 0.4,
    gravity: 900,
    baseSpeed: 120,
    size: 2.4,
    stretch: 1.0,
    trail: 0.2,
    showRoofPath: true,
    pagodaMaxDrops: 40
  };

  const plotStyle: PlotStyle = {
    theme: "neon",
    showGrid: true,
    showAreaFill: true,
    smooth: true,
    glow: 0.85
  };

  // plot container size for canvas overlay
  const plotWrapRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(PLOT_BASE.width);
  const plotHeight = PLOT_BASE.height;

  useEffect(() => {
    const el = plotWrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setPlotWidth(Math.max(300, Math.floor(rect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rawText = raw.join(", ");

  return (
    <div className="container">
      <h2>Rainflow Learning UI</h2>

      <div className="card plotStage">
        <div className="plotRow">
          <div className="plotArea" ref={plotWrapRef}>
            <SignalPlot
              raw={raw}
              turningPoints={computed.turningPoints}
              currentTPIndex={cursor}
              heightPx={plotHeight}
              style={plotStyle}
              cycles={cyclesUpToCursor}
              windowABCD={ev?.windowABCD ?? null}
            />
            <RainOverlayCanvas
              widthPx={plotWidth}
              heightPx={plotHeight}
              raw={raw}
              turningPoints={computed.turningPoints}
              closedNow={closedNow}
              playing={playing}
              graphics={gfx}
            />
          </div>

          <div className="plotControls">
            <div className="controlGroup">
              <div className="controlTitle">Playback</div>
              <div className="buttonStack">
                <button onClick={() => setCursor(c => Math.max(0, c - 1))} disabled={cursor <= 0}>Back</button>
                <button onClick={() => setCursor(c => Math.min(maxCursor, c + 1))} disabled={cursor >= maxCursor}>Step</button>
                <button onClick={() => setPlaying(p => !p)} disabled={computed.events.length === 0}>{playing ? "Pause" : "Play"}</button>
                <button onClick={() => { setPlaying(false); setCursor(0); }}>Reset</button>
              </div>
              <div className="statRow">
                <span className="mono statPill">cursor {cursor}/{maxCursor}</span>
                <span className="mono statPill">TP {computed.turningPoints.length}</span>
                <span className="mono statPill">cycles {computed.cycles.length}</span>
              </div>
            </div>

            <div className="controlGroup">
              <div className="controlTitle">Analysis</div>
              <label className="controlField">
                Residue
                <select value={residue} onChange={(e) => setResidue(e.target.value as ResidueHandling)}>
                  <option value="discard">discard</option>
                  <option value="half">half</option>
                  <option value="close">close (wrap half)</option>
                </select>
              </label>

              <label className="controlField">
                Endpoints
                <select value={useEndpoints ? "on" : "off"} onChange={(e) => setUseEndpoints(e.target.value === "on")}>
                  <option value="on">on</option>
                  <option value="off">off</option>
                </select>
              </label>

              <label className="controlField">
                bins(range)
                <input
                  type="number"
                  min={4}
                  max={80}
                  value={binsRange}
                  onChange={(e) => setBinsRange(Math.max(4, Math.min(80, Number(e.target.value))))}
                />
              </label>

              <label className="controlField">
                bins(mean)
                <input
                  type="number"
                  min={4}
                  max={80}
                  value={binsMean}
                  onChange={(e) => setBinsMean(Math.max(4, Math.min(80, Number(e.target.value))))}
                />
              </label>
            </div>

            <div className="controlGroup legendGroup">
              <div className="controlTitle">Legend</div>
              <div className="legendItem"><span className="legendDot legendDotA" />Turning points</div>
              <div className="legendItem"><span className="legendDot legendDotB" />Closed cycles (B–C)</div>
              <div className="legendItem"><span className="legendDot legendDotC" />Window A‑B‑C‑D</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="small">Raw input (comma-separated):</div>
        <textarea
          value={rawText}
          onChange={(e) => {
            const nums = e.target.value
              .split(/[, \n\t]+/)
              .map(s => s.trim())
              .filter(s => s.length > 0)
              .map(s => Number(s))
              .filter(n => Number.isFinite(n));
            if (nums.length >= 2) setRaw(nums);
          }}
        />
        <div className="small">Tip: <span className="mono">{demoRaw.join(", ")}</span></div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card">
          <h3>Stack (after step)</h3>
          <StackView ev={ev} />
        </div>

        <div className="card">
          <h3>Matrix (range × mean)</h3>
          <div className="small">Frequency matrix is secondary (“おまけ”).</div>
          <MatrixHeatmap matrix={matrix} />
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h3>Cycles (incremental)</h3>
          <div className="small">Closed cycles up to cursor; residual cycles appear at last step.</div>
          <CycleTable cycles={cyclesUpToCursor} />
        </div>
      </div>
    </div>
  );
}
