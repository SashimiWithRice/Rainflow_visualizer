import type { StepEvent } from "../lib/rainflow";

export function StackView({ ev }: { ev: StepEvent | null }) {
  if (!ev) return <div className="small">No events yet.</div>;

  const stack = ev.stackAfter;
  const abcd = ev.windowABCD;

  const mark = (pI: number) => {
    if (!abcd) return "";
    const [A, B, C, D] = abcd;
    if (pI === A.i) return "A";
    if (pI === B.i) return "B";
    if (pI === C.i) return "C";
    if (pI === D.i) return "D";
    return "";
  };

  return (
    <div>
      <div className="small mono">step k={ev.k} appended (i={ev.appended.i}, x={ev.appended.x})</div>
      <div className="small">stack size: {stack.length}</div>
      <ol className="mono">
        {stack.map((p, idx) => (
          <li key={`${p.i}-${idx}`}>
            i={p.i}, x={p.x} {mark(p.i) ? <b> [{mark(p.i)}]</b> : null}
          </li>
        ))}
      </ol>
      <div className="small">closed cycles this step: <b>{ev.closed.length}</b></div>
    </div>
  );
}
