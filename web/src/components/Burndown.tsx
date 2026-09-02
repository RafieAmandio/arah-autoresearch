/* Invariants held, per experiment.

   Two decisions worth stating, because the obvious version of this chart lies.

   The y-axis does not start at zero. Every score sits in the top sixth of
   0..total, so a zero-based axis spends five sixths of the plot on empty space
   and flattens the only thing the chart exists to show. The floor is set just
   under the lowest score, and the ceiling is always `total`, so the remaining
   distance stays honest and visible.

   The shaded band is the GAP, not the score. Filling under a line whose axis
   does not start at zero draws an area that means nothing. Filling the space
   between the line and the ceiling means something exact: the invariants still
   failing. It shrinks as the research succeeds, which is the story.

   Step-after, because a score holds until the next experiment lands. Drawing a
   slope between two experiments would claim progress at moments no experiment
   ran. */

export function Burndown({
  data,
  total,
}: {
  data: { n: number; score: number }[];
  total: number;
}) {
  if (!data.length) return null;

  const W = 720;
  const H = 200;
  const PAD_T = 18;
  const PAD_B = 22;
  const PAD_L = 8;
  const PAD_R = 34;

  const scores = data.map((d) => d.score);
  // Show at least four units of range so a one-point move is not a cliff.
  const floor = Math.max(0, Math.min(...scores, total - 4) - 1);
  const span = Math.max(1, total - floor);

  const maxN = data[data.length - 1].n;
  const x = (n: number) =>
    PAD_L + (maxN === 1 ? 0 : (n - 1) / (maxN - 1)) * (W - PAD_L - PAD_R);
  const y = (s: number) =>
    PAD_T + (1 - (s - floor) / span) * (H - PAD_T - PAD_B);

  const last = data[data.length - 1];
  const first = data[0];
  const yCeil = y(total);

  // Step-after through the scores, then back along the ceiling: the enclosed
  // band is exactly what has not been fixed yet.
  const line = data
    .map((p, i) =>
      i === 0 ? `M${x(p.n)},${y(p.score)}` : `H${x(p.n)}V${y(p.score)}`,
    )
    .join("");
  const gap = `${line}H${x(maxN)}V${yCeil}H${x(first.n)}Z`;

  return (
    <figure className="burndown">
      {/* Uniform scaling on purpose: stretching the viewBox would turn the
          dots into ellipses and the stroke into a different weight per axis. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Invariants held rose from ${first.score} to ${last.score} of ${total} over ${data.length} experiments.`}
      >
        {/* what is still failing */}
        <path d={gap} className="burndown-gap" />

        {/* the ceiling: every invariant held */}
        <line x1={PAD_L} y1={yCeil} x2={W - PAD_R} y2={yCeil} className="burndown-ceil" />

        <path d={line} className="burndown-line" />

        {data.map((p, i) => (
          <circle
            key={p.n}
            cx={x(p.n)}
            cy={y(p.score)}
            r={i === data.length - 1 ? 5 : 3.5}
            className={i === data.length - 1 ? "burndown-dot-last" : "burndown-dot"}
          >
            <title>
              Experiment {p.n}: {p.score} of {total} held
            </title>
          </circle>
        ))}
      </svg>

      {/* Labels live outside the SVG. Baked-in <text> scaled with the viewBox
          and the ceiling label collided with the value label. */}
      <figcaption className="burndown-axis mono">
        <span>exp {first.n}</span>
        <span className="burndown-key">
          <i className="burndown-swatch" aria-hidden="true" />
          {total - last.score === 0
            ? "all held"
            : `${total - last.score} still failing`}
        </span>
        <span>exp {maxN}</span>
      </figcaption>
    </figure>
  );
}
