/* Invariants held, per experiment.

   Step-after, because a score holds until the next experiment lands: drawing a
   slope between two experiments would claim progress at moments no experiment
   ran.

   No chart library. One series, at most a few dozen points, and the experiment
   table directly below carries every value a tooltip would have shown, so the
   table is the tooltip. */
export function Burndown({
  data,
  total,
}: {
  data: { n: number; score: number }[];
  total: number;
}) {
  if (data.length < 2)
    return (
      <div
        style={{
          height: 190,
          display: "grid",
          placeItems: "center",
          color: "var(--mute)",
          fontSize: "var(--t-small)",
        }}
      >
        Waiting for the second experiment.
      </div>
    );

  const W = 640;
  const H = 190;
  const P = 16;
  const maxN = data[data.length - 1].n;
  const x = (n: number) => P + ((n - 1) / Math.max(1, maxN - 1)) * (W - 2 * P);
  const y = (s: number) => H - P - (s / Math.max(1, total)) * (H - 2 * P);

  const line = data
    .map((p, i) =>
      i === 0 ? `M${x(p.n)},${y(p.score)}` : `H${x(p.n)}V${y(p.score)}`,
    )
    .join("");
  const area = `${line}V${H - P}H${x(data[0].n)}Z`;
  const last = data[data.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 190 }}
      role="img"
      aria-label={`Invariants held: ${last.score} of ${total} after ${maxN} experiments`}
    >
      <defs>
        <linearGradient id="burn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--signal)" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* The ceiling: every invariant held. A set out line, not a gridline. */}
      <line
        x1={P}
        y1={y(total)}
        x2={W - P}
        y2={y(total)}
        stroke="var(--line-strong)"
        strokeDasharray="3 4"
      />
      <text
        x={W - P}
        y={y(total) - 6}
        textAnchor="end"
        fill="var(--mute)"
        fontSize="11"
      >
        all {total} held
      </text>

      <path d={area} fill="url(#burn)" />
      <path
        d={line}
        fill="none"
        stroke="var(--signal-deep)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {data.map((p) => (
        <circle
          key={p.n}
          cx={x(p.n)}
          cy={y(p.score)}
          r="3"
          fill="var(--surface)"
          stroke="var(--signal-deep)"
          strokeWidth="2"
        >
          <title>
            Experiment {p.n}: {p.score}/{total} held
          </title>
        </circle>
      ))}

      <text
        x={x(last.n)}
        y={y(last.score) - 10}
        textAnchor="end"
        fill="var(--ink)"
        fontSize="12"
        fontWeight="600"
      >
        {last.score}
      </text>
    </svg>
  );
}
