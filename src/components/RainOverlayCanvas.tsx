import { useEffect, useMemo, useRef } from "react";
import type { Cycle, TurningPoint } from "../lib/rainflow";

export type RainMode = "cinematic" | "pagoda";

export type RainGraphics = {
  mode: RainMode;

  enabled: boolean;
  spawnFromClosedCycles: boolean; // (cinematic only)
  intensity: number;              // ~0.5..12
  spawnProb: number;              // 0..1
  gravity: number;                // px/s^2
  baseSpeed: number;              // px/s
  size: number;                   // px
  stretch: number;                // 0..3
  trail: number;                  // 0..1 (0 = no trail)
  showRoofPath: boolean;          // pagoda helper polyline
  pagodaMaxDrops: number;         // max concurrent drops
};

type Drop = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;

  // pagoda mode
  targetY?: number;
  stop?: boolean;
};

type Props = {
  widthPx: number;
  heightPx: number;

  raw: number[];
  turningPoints: TurningPoint[];
  closedNow: Cycle[];

  playing: boolean;
  graphics: RainGraphics;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function RainOverlayCanvas({
  widthPx,
  heightPx,
  raw,
  turningPoints,
  closedNow,
  playing,
  graphics
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropsRef = useRef<Drop[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  // data->pixel mapping aligned with the SVG plot (viewBox 900x260 margins)
  const chart = useMemo(() => {
    const w = widthPx;
    const h = heightPx;
    const m = { l: 52, r: 22, t: 18, b: 34 };

    const xMin = 0;
    const xMax = Math.max(1, raw.length - 1);

    let yMin = Infinity, yMax = -Infinity;
    for (const v of raw) {
      yMin = Math.min(yMin, v);
      yMax = Math.max(yMax, v);
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { yMin = 0; yMax = 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    else {
      const pad = 0.02 * (yMax - yMin);
      yMin -= pad;
      yMax += pad;
    }

    const x = (i: number) => {
      const t = (i - xMin) / (xMax - xMin);
      return m.l + t * (w - m.l - m.r);
    };
    const y = (v: number) => {
      const t = (v - yMin) / (yMax - yMin);
      return (h - m.b) - t * (h - m.t - m.b);
    };

    return { w, h, m, x, y };
  }, [widthPx, heightPx, raw]);

  const spawnPoints = useMemo(() => {
    if (graphics.mode !== "cinematic") return [];

    if (!graphics.spawnFromClosedCycles) {
      return turningPoints.map(tp => ({
        x: chart.x(tp.i),
        y: chart.y(tp.x),
        intensity: graphics.intensity * 0.25
      }));
    }

    const pts: { x: number; y: number; intensity: number }[] = [];
    for (const c of closedNow) {
      const scale = Math.max(0.6, Math.min(8, graphics.intensity * (c.range + 1) / 6));
      pts.push({ x: chart.x(c.b.i), y: chart.y(c.b.x), intensity: scale });
      pts.push({ x: chart.x(c.c.i), y: chart.y(c.c.x), intensity: scale });
    }
    return pts;
  }, [graphics.mode, graphics.spawnFromClosedCycles, turningPoints, closedNow, chart, graphics.intensity]);

  // pagoda geometry (approx): rotate turning points into (u=value, v=index)
  const pagoda = useMemo(() => {
    if (turningPoints.length < 2) return null;

    const pts = turningPoints.map(tp => ({ u: tp.x, v: tp.i }));

    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of pts) {
      uMin = Math.min(uMin, p.u);
      uMax = Math.max(uMax, p.u);
      vMin = Math.min(vMin, p.v);
      vMax = Math.max(vMax, p.v);
    }
    if (uMin === uMax) { uMin -= 1; uMax += 1; }
    if (vMin === vMax) { vMin = Math.max(0, vMin - 1); vMax = vMax + 1; }

    const x = (u: number) => {
      const t = (u - uMin) / (uMax - uMin);
      return chart.m.l + t * (chart.w - chart.m.l - chart.m.r);
    };
    const y = (v: number) => {
      const t = (v - vMin) / (vMax - vMin);
      return chart.m.t + t * (chart.h - chart.m.t - chart.m.b);
    };

    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1] });

    const findDropTargetV = (u0: number, v0: number) => {
      let bestV = Infinity;

      for (const s of segs) {
        const { a, b } = s;
        const u1 = a.u, u2 = b.u;
        if (u0 < Math.min(u1, u2) || u0 > Math.max(u1, u2)) continue;
        if (u1 === u2) continue;

        const t = (u0 - u1) / (u2 - u1);
        if (t < 0 || t > 1) continue;

        const vI = a.v + t * (b.v - a.v);
        if (vI > v0 && vI < bestV) bestV = vI;
      }

      return Number.isFinite(bestV) ? bestV : null;
    };

    return { pts, x, y, findDropTargetV };
  }, [turningPoints, chart]);

  const spawnCinematic = (x: number, y: number, intensity: number) => {
    const n = Math.max(1, Math.round(intensity));
    for (let i = 0; i < n; i++) {
      dropsRef.current.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 18,
        vy: graphics.baseSpeed + Math.random() * (0.7 * graphics.baseSpeed),
        r: Math.max(1.2, graphics.size * (0.8 + Math.random() * 0.6)),
        life: 1.2 + Math.random() * 0.9,
        age: 0
      });
    }
  };

  const spawnPagoda = (u: number, v: number) => {
    if (!pagoda) return;
    if (dropsRef.current.length > graphics.pagodaMaxDrops) return;

    const targetV = pagoda.findDropTargetV(u, v);
    if (targetV == null) return;

    dropsRef.current.push({
      x: pagoda.x(u),
      y: pagoda.y(v),
      vx: 0,
      vy: graphics.baseSpeed * 0.9,
      r: Math.max(1.1, graphics.size * 0.75),
      life: 2.0,
      age: 0,
      targetY: pagoda.y(targetV),
      stop: false
    });
  };

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    c.width = Math.floor(widthPx * dpr);
    c.height = Math.floor(heightPx * dpr);
    c.style.width = `${widthPx}px`;
    c.style.height = `${heightPx}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const loop = (t: number) => {
      if (!graphics.enabled) return;

      // if paused: render static helpers only
      if (!playing) {
        ctx.clearRect(0, 0, widthPx, heightPx);
        if (graphics.mode === "pagoda" && graphics.showRoofPath && pagoda) drawPagodaPath(ctx, pagoda);
        return;
      }

      const last = lastRef.current ?? t;
      const dt = Math.min(0.033, (t - last) / 1000);
      lastRef.current = t;

      // clear / trail
      if (graphics.trail <= 0) {
        ctx.clearRect(0, 0, widthPx, heightPx);
      } else {
        const a = clamp01(1 - graphics.trail);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.clearRect(0, 0, widthPx, heightPx);
        ctx.restore();
      }

      if (graphics.mode === "pagoda" && graphics.showRoofPath && pagoda) drawPagodaPath(ctx, pagoda);

      // spawn
      const p = clamp01(graphics.spawnProb);
      if (graphics.mode === "cinematic") {
        for (const sp of spawnPoints) {
          if (Math.random() < p) spawnCinematic(sp.x, sp.y, sp.intensity);
        }
      } else if (graphics.mode === "pagoda" && pagoda) {
        // pick random local maxima turning point (simple peak heuristic)
        const tps = turningPoints;
        if (tps.length >= 3 && Math.random() < p) {
          const idx = 1 + Math.floor(Math.random() * (tps.length - 2));
          const prev = tps[idx - 1], cur = tps[idx], next = tps[idx + 1];
          if (cur.x >= prev.x && cur.x >= next.x) spawnPagoda(cur.x, cur.i);
        }
      }

      const g = graphics.gravity;
      const drops = dropsRef.current;
      const next: Drop[] = [];

      for (const d of drops) {
        d.age += dt;

        if (graphics.mode === "cinematic") {
          d.vy += g * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;

          if (d.y > heightPx - 6) {
            splash(ctx, d.x, heightPx - 6);
            continue;
          }
          if (d.age < d.life) next.push(d);
        } else {
          if (!d.stop) {
            d.vy += (0.5 * g) * dt;
            d.y += d.vy * dt;
            if (d.targetY != null && d.y >= d.targetY) {
              d.y = d.targetY;
              d.stop = true;
              d.vy = 0;
            }
          }
          if (d.age < d.life) next.push(d);
        }
      }

      for (const d of next) {
        if (graphics.mode === "cinematic") drawDrop(ctx, d, graphics);
        else drawPagodaDrop(ctx, d);
      }

      dropsRef.current = next;
      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [widthPx, heightPx, spawnPoints, playing, graphics, pagoda, turningPoints]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}

function drawDrop(ctx: CanvasRenderingContext2D, d: Drop, g: RainGraphics) {
  const a = 1 - d.age / d.life;
  const alpha = 0.15 + 0.75 * a;

  const speed = Math.max(0, d.vy);
  const stretch = Math.min(22, (g.stretch * 0.06) * speed);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.translate(d.x, d.y);
  ctx.scale(1, 1 + stretch / 20);

  ctx.beginPath();
  ctx.ellipse(0, 0, d.r * 0.75, d.r * 1.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = "currentColor";
  ctx.fill();

  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  ctx.ellipse(-d.r * 0.2, -d.r * 0.5, d.r * 0.25, d.r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();

  ctx.restore();
}

function splash(ctx: CanvasRenderingContext2D, x: number, y: number) {
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 5, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "currentColor";
    ctx.fill();
    ctx.restore();
  }
}

function drawPagodaPath(ctx: CanvasRenderingContext2D, pagoda: { pts: { u: number; v: number }[]; x: (u: number) => number; y: (v: number) => number }) {
  const pts = pagoda.pts;
  if (pts.length < 2) return;

  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "currentColor";
  ctx.beginPath();
  ctx.moveTo(pagoda.x(pts[0].u), pagoda.y(pts[0].v));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pagoda.x(pts[i].u), pagoda.y(pts[i].v));
  ctx.stroke();
  ctx.restore();
}

function drawPagodaDrop(ctx: CanvasRenderingContext2D, d: Drop) {
  const a = 1 - d.age / d.life;
  const alpha = d.stop ? (0.08 + 0.45 * a) : (0.12 + 0.65 * a);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
  ctx.fillStyle = "currentColor";
  ctx.fill();

  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  ctx.arc(d.x - d.r * 0.25, d.y - d.r * 0.35, d.r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();

  ctx.restore();
}
