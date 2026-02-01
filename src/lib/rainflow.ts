export type ResidueHandling = "discard" | "half" | "close";

export type Options = {
  useEndpointsAsReversals: boolean;
  residue: ResidueHandling;
  binsRange: number;
  binsMean: number;
};

export type TurningPoint = {
  i: number; // original index
  x: number; // value
};

export type Cycle = {
  range: number;
  mean: number;
  count: number; // 1.0 or 0.5
  b: TurningPoint;
  c: TurningPoint;
};

export type StepEvent = {
  k: number;
  appended: TurningPoint;
  stackBefore: TurningPoint[];
  stackAfter: TurningPoint[];
  windowABCD?: [TurningPoint, TurningPoint, TurningPoint, TurningPoint];
  closed: Cycle[];
};

function sign(v: number): number {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function compressDuplicates(x: number[]): { i: number; x: number }[] {
  const out: { i: number; x: number }[] = [];
  for (let i = 0; i < x.length; i++) {
    if (i === 0 || x[i] !== x[i - 1]) out.push({ i, x: x[i] });
  }
  return out;
}

export function extractTurningPoints(raw: number[], useEndpoints: boolean): TurningPoint[] {
  if (raw.length < 2) return raw.map((v, i) => ({ i, x: v }));

  const compressed = compressDuplicates(raw);
  if (compressed.length === 1) return [{ i: compressed[0].i, x: compressed[0].x }];

  const tp: TurningPoint[] = [];
  const first = compressed[0];
  const last = compressed[compressed.length - 1];

  if (useEndpoints) tp.push({ i: first.i, x: first.x });

  for (let k = 1; k < compressed.length - 1; k++) {
    const prev = compressed[k - 1];
    const cur = compressed[k];
    const next = compressed[k + 1];

    const d1 = cur.x - prev.x;
    const d2 = next.x - cur.x;

    if (sign(d1) !== sign(d2)) {
      tp.push({ i: cur.i, x: cur.x });
    }
  }

  if (useEndpoints) {
    if (tp.length === 0 || tp[tp.length - 1].i !== last.i) tp.push({ i: last.i, x: last.x });
  } else {
    if (tp.length === 0) {
      const mid = compressed[Math.floor(compressed.length / 2)];
      tp.push({ i: mid.i, x: mid.x });
    }
  }

  return tp;
}

/**
 * Four-point stack method (learning oriented):
 * last four points A,B,C,D
 * if |B-C| <= |A-B| and |B-C| <= |C-D|, close cycle B-C and remove B,C
 */
function tryCloseFourPoint(stack: TurningPoint[]): {
  closed: Cycle[];
  stack: TurningPoint[];
  window?: [TurningPoint, TurningPoint, TurningPoint, TurningPoint];
} {
  const closed: Cycle[] = [];
  let s = stack.slice();

  while (s.length >= 4) {
    const A = s[s.length - 4];
    const B = s[s.length - 3];
    const C = s[s.length - 2];
    const D = s[s.length - 1];

    const rBC = Math.abs(B.x - C.x);
    const rAB = Math.abs(A.x - B.x);
    const rCD = Math.abs(C.x - D.x);

    const window: [TurningPoint, TurningPoint, TurningPoint, TurningPoint] = [A, B, C, D];

    if (rBC <= rAB && rBC <= rCD) {
      closed.push({
        range: rBC,
        mean: 0.5 * (B.x + C.x),
        count: 1.0,
        b: B,
        c: C
      });

      const kept = s.slice(0, s.length - 4).concat([A, D]);
      s = kept;
      continue;
    }

    return { closed, stack: s, window };
  }

  return { closed, stack: s };
}

function residualCycles(stack: TurningPoint[], mode: ResidueHandling): Cycle[] {
  const s = stack.slice();
  const out: Cycle[] = [];
  if (mode === "discard") return out;

  for (let i = 0; i < s.length - 1; i++) {
    const b = s[i];
    const c = s[i + 1];
    out.push({
      range: Math.abs(b.x - c.x),
      mean: 0.5 * (b.x + c.x),
      count: 0.5,
      b,
      c
    });
  }

  if (mode === "close" && s.length >= 2) {
    const b = s[s.length - 1];
    const c = s[0];
    out.push({
      range: Math.abs(b.x - c.x),
      mean: 0.5 * (b.x + c.x),
      count: 0.5,
      b,
      c
    });
  }

  return out;
}

export function rainflowCount(raw: number[], options: Options): {
  turningPoints: TurningPoint[];
  events: StepEvent[];
  cycles: Cycle[];
  residualStack: TurningPoint[];
} {
  const turningPoints = extractTurningPoints(raw, options.useEndpointsAsReversals);

  const events: StepEvent[] = [];
  const cycles: Cycle[] = [];

  let stack: TurningPoint[] = [];

  for (let k = 0; k < turningPoints.length; k++) {
    const appended = turningPoints[k];
    const before = stack.slice();

    stack = stack.concat([appended]);

    const result = tryCloseFourPoint(stack);
    stack = result.stack;

    const ev: StepEvent = {
      k,
      appended,
      stackBefore: before,
      stackAfter: stack.slice(),
      closed: result.closed,
      windowABCD: result.window
    };

    events.push(ev);
    cycles.push(...result.closed);
  }

  const residual = residualCycles(stack, options.residue);
  cycles.push(...residual);

  return { turningPoints, events, cycles, residualStack: stack.slice() };
}

export type Matrix = {
  rangeEdges: number[];
  meanEdges: number[];
  counts: number[][];
};

function linspace(min: number, max: number, bins: number): number[] {
  const edges: number[] = [];
  if (bins <= 0) return edges;
  for (let i = 0; i <= bins; i++) edges.push(min + (max - min) * (i / bins));
  return edges;
}

function findBin(edges: number[], v: number): number {
  if (edges.length < 2) return -1;
  const bins = edges.length - 1;
  if (v <= edges[0]) return 0;
  if (v >= edges[bins]) return bins - 1;
  for (let i = 0; i < bins; i++) {
    if (v >= edges[i] && v < edges[i + 1]) return i;
  }
  return bins - 1;
}

export function buildMatrix(cycles: Cycle[], binsRange: number, binsMean: number): Matrix {
  const ranges = cycles.map(c => c.range);
  const means = cycles.map(c => c.mean);

  const rMin = ranges.length ? Math.min(...ranges) : 0;
  const rMax = ranges.length ? Math.max(...ranges) : 1;
  const mMin = means.length ? Math.min(...means) : 0;
  const mMax = means.length ? Math.max(...means) : 1;

  const rangeEdges = linspace(rMin, rMax === rMin ? rMin + 1 : rMax, binsRange);
  const meanEdges = linspace(mMin, mMax === mMin ? mMin + 1 : mMax, binsMean);

  const counts = Array.from({ length: binsRange }, () => Array.from({ length: binsMean }, () => 0));

  for (const c of cycles) {
    const ri = findBin(rangeEdges, c.range);
    const mi = findBin(meanEdges, c.mean);
    if (ri >= 0 && mi >= 0) counts[ri][mi] += c.count;
  }

  return { rangeEdges, meanEdges, counts };
}
