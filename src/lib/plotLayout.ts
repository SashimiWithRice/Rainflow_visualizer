export const PLOT_BASE = {
  width: 1000,
  height: 340,
  margin: { l: 68, r: 28, t: 28, b: 50 }
};

export function getYDomain(raw: number[]): [number, number] {
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of raw) {
    yMin = Math.min(yMin, v);
    yMax = Math.max(yMax, v);
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return [0, 1];
  if (yMin === yMax) return [yMin - 1, yMax + 1];
  const range = yMax - yMin;
  const pad = Math.max(0.6, 0.06 * range);
  return [yMin - pad, yMax + pad];
}
