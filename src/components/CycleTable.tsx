import type { Cycle } from "../lib/rainflow";

export function CycleTable({ cycles }: { cycles: Cycle[] }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>range</th>
            <th>mean</th>
            <th>count</th>
            <th>B(i,x)</th>
            <th>C(i,x)</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c, idx) => (
            <tr key={idx}>
              <td className="mono">{idx}</td>
              <td className="mono">{c.range.toFixed(3)}</td>
              <td className="mono">{c.mean.toFixed(3)}</td>
              <td className="mono">{c.count}</td>
              <td className="mono">({c.b.i},{c.b.x})</td>
              <td className="mono">({c.c.i},{c.c.x})</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
