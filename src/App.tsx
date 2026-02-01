import { useEffect, useMemo, useRef, useState } from "react";
import type { Options, ResidueHandling } from "./lib/rainflow";
import { buildMatrix, rainflowCount } from "./lib/rainflow";

import { SignalPlot, type PlotStyle } from "./components/SignalPlot";
import { RainOverlayCanvas, type RainGraphics, type RainMode } from "./components/RainOverlayCanvas";
import { StackView } from "./components/StackView";
import { CycleTable } from "./components/CycleTable";
import { MatrixHeatmap } from "./components/MatrixHeatmap";

const demoRaw = [-2, 1, -3, 5, -1, 3, -4, 4, -2];

type Tab = "analysis" | "graphics";

export default function App() {
  const [tab, setTab] = useState<Tab>("analysis");

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
  const [gfx, setGfx] = useState<RainGraphics>({
    mode: "cinematic",
    enabled: true,
    spawnFromClosedCycles: true,
    intensity: 4.0,
    spawnProb: 0.35,
    gravity: 900,
    baseSpeed: 120,
    size: 2.4,
    stretch: 1.0,
    trail: 0.0,
    showRoofPath: true,
    pagodaMaxDrops: 40
  });

  const [plotStyle, setPlotStyle] = useState<PlotStyle>({
    theme: "neon",
    showGrid: true,
    showAreaFill: true,
    smooth: true,
    glow: 0.6
  });

  // plot container size for canvas overlay
  const plotWrapRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(900);
  const plotHeight = 260;

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

      <div className="tabs">
        <button className={`tab ${tab === "analysis" ? "tabActive" : ""}`} onClick={() => setTab("analysis")}>
          Analysis
        </button>
        <button className={`tab ${tab === "graphics" ? "tabActive" : ""}`} onClick={() => setTab("graphics")}>
          Graphics
        </button>
      </div>

      {tab === "analysis" && (
        <>
          <div className="card">
            <div className="row">
              <label>
                Residue
                <select value={residue} onChange={(e) => setResidue(e.target.value as ResidueHandling)}>
                  <option value="discard">discard</option>
                  <option value="half">half</option>
                  <option value="close">close (wrap half)</option>
                </select>
              </label>

              <label>
                Endpoints as reversals
                <select value={useEndpoints ? "on" : "off"} onChange={(e) => setUseEndpoints(e.target.value === "on")}>
                  <option value="on">on</option>
                  <option value="off">off</option>
                </select>
              </label>

              <label>
                bins(range)
                <input
                  type="number"
                  min={4}
                  max={80}
                  value={binsRange}
                  onChange={(e) => setBinsRange(Math.max(4, Math.min(80, Number(e.target.value))))}
                  style={{ width: 80 }}
                />
              </label>

              <label>
                bins(mean)
                <input
                  type="number"
                  min={4}
                  max={80}
                  value={binsMean}
                  onChange={(e) => setBinsMean(Math.max(4, Math.min(80, Number(e.target.value))))}
                  style={{ width: 80 }}
                />
              </label>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => setCursor(c => Math.max(0, c - 1))} disabled={cursor <= 0}>Back</button>
              <button onClick={() => setCursor(c => Math.min(maxCursor, c + 1))} disabled={cursor >= maxCursor}>Step</button>
              <button onClick={() => setPlaying(p => !p)} disabled={computed.events.length === 0}>{playing ? "Pause" : "Play"}</button>
              <button onClick={() => { setPlaying(false); setCursor(0); }}>Reset</button>
              <span className="mono">cursor: {cursor}/{maxCursor}</span>
              <span className="small">TP={computed.turningPoints.length} cycles(total)={computed.cycles.length}</span>
            </div>

            <div className="small" style={{ marginTop: 10 }}>Raw input (comma-separated):</div>
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
              style={{ width: "100%", minHeight: 60, borderRadius: 10, padding: 10 }}
            />
            <div className="small">Tip: <span className="mono">-2, 1, -3, 5, -1, 3, -4, 4, -2</span></div>
          </div>

          <div className="card" style={{ marginTop: 12, position: "relative" }} ref={plotWrapRef}>
            <SignalPlot
              raw={raw}
              turningPoints={computed.turningPoints}
              currentTPIndex={cursor}
              heightPx={plotHeight}
              style={plotStyle}
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
        </>
      )}

      {tab === "graphics" && (
        <div className="card">
          <h3>Rain</h3>
          <div className="row">
            <label>
              enabled
              <select value={gfx.enabled ? "on" : "off"} onChange={(e) => setGfx(s => ({ ...s, enabled: e.target.value === "on" }))}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>

            <label>
              mode
              <select value={gfx.mode} onChange={(e) => setGfx(s => ({ ...s, mode: e.target.value as RainMode }))}>
                <option value="cinematic">Cinematic Rain</option>
                <option value="pagoda">Pagoda Roof (approx)</option>
              </select>
            </label>

            <label>
              spawn source
              <select
                value={gfx.spawnFromClosedCycles ? "closed" : "turning"}
                onChange={(e) => setGfx(s => ({ ...s, spawnFromClosedCycles: e.target.value === "closed" }))}
                disabled={gfx.mode === "pagoda"}
              >
                <option value="closed">Closed cycles (B/C)</option>
                <option value="turning">Turning points</option>
              </select>
            </label>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <label>
              intensity
              <input type="number" min={0.5} max={12} step={0.5} value={gfx.intensity}
                onChange={(e) => setGfx(s => ({ ...s, intensity: Number(e.target.value) }))} style={{ width: 90 }} />
            </label>

            <label>
              spawnProb
              <input type="number" min={0} max={1} step={0.05} value={gfx.spawnProb}
                onChange={(e) => setGfx(s => ({ ...s, spawnProb: Number(e.target.value) }))} style={{ width: 90 }} />
            </label>

            <label>
              gravity
              <input type="number" min={100} max={4000} step={50} value={gfx.gravity}
                onChange={(e) => setGfx(s => ({ ...s, gravity: Number(e.target.value) }))} style={{ width: 100 }} />
            </label>

            <label>
              baseSpeed
              <input type="number" min={20} max={600} step={10} value={gfx.baseSpeed}
                onChange={(e) => setGfx(s => ({ ...s, baseSpeed: Number(e.target.value) }))} style={{ width: 100 }} />
            </label>

            <label>
              size
              <input type="number" min={1} max={8} step={0.2} value={gfx.size}
                onChange={(e) => setGfx(s => ({ ...s, size: Number(e.target.value) }))} style={{ width: 90 }} />
            </label>

            <label>
              stretch
              <input type="number" min={0} max={3} step={0.1} value={gfx.stretch}
                onChange={(e) => setGfx(s => ({ ...s, stretch: Number(e.target.value) }))} style={{ width: 90 }} />
            </label>

            <label>
              trail
              <input type="number" min={0} max={1} step={0.05} value={gfx.trail}
                onChange={(e) => setGfx(s => ({ ...s, trail: Number(e.target.value) }))} style={{ width: 90 }} />
            </label>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <label>
              showRoofPath
              <select value={gfx.showRoofPath ? "on" : "off"} onChange={(e) => setGfx(s => ({ ...s, showRoofPath: e.target.value === "on" }))}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>

            <label>
              pagodaMaxDrops
              <input type="number" min={5} max={200} step={5} value={gfx.pagodaMaxDrops}
                onChange={(e) => setGfx(s => ({ ...s, pagodaMaxDrops: Number(e.target.value) }))} style={{ width: 100 }} />
            </label>
          </div>

          <hr style={{ opacity: 0.2, margin: "14px 0" }} />

          <h3>Plot</h3>
          <div className="row">
            <label>
              theme
              <select value={plotStyle.theme} onChange={(e) => setPlotStyle(s => ({ ...s, theme: e.target.value as any }))}>
                <option value="clean">clean</option>
                <option value="neon">neon</option>
                <option value="ink">ink</option>
              </select>
            </label>

            <label>
              grid
              <select value={plotStyle.showGrid ? "on" : "off"} onChange={(e) => setPlotStyle(s => ({ ...s, showGrid: e.target.value === "on" }))}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>

            <label>
              area fill
              <select value={plotStyle.showAreaFill ? "on" : "off"} onChange={(e) => setPlotStyle(s => ({ ...s, showAreaFill: e.target.value === "on" }))}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>

            <label>
              smooth
              <select value={plotStyle.smooth ? "on" : "off"} onChange={(e) => setPlotStyle(s => ({ ...s, smooth: e.target.value === "on" }))}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>

            <label>
              glow
              <input type="number" min={0} max={1} step={0.05} value={plotStyle.glow}
                onChange={(e) => setPlotStyle(s => ({ ...s, glow: Number(e.target.value) }))} style={{ width: 90 }} />
            </label>
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Notes:
            <ul>
              <li><b>Cinematic Rain</b> = 見た目優先（雨粒パーティクル）</li>
              <li><b>Pagoda Roof (approx)</b> = turning points を回転座標に投影して縦落下→交差で停止</li>
              <li>Matrixは意図通り“おまけ”で簡易ヒートマップ</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
