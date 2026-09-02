import { RUNS } from "@/lib/runs";

/* The front door. It explains the idea before it lists anything, because a
   visitor who does not know what an autoresearch loop is cannot read the run
   page. Not an index for a single row. */

const STEPS: [string, string][] = [
  [
    "Program",
    "A human writes the goal and the constraints in one markdown file. That is the only steering the agent gets.",
  ],
  [
    "Experiment",
    "An agent gets a fixed wall-clock budget, a narrow set of files it may edit, and tools to go find things out.",
  ],
  [
    "Eval",
    "A frozen scorer, restored from git before every run, reports how many invariants hold. The agent cannot reach it.",
  ],
  [
    "Commit",
    "The result becomes one commit, including the failures. The git history is the experiment database.",
  ],
];

export default function Home() {
  return (
    <main className="wrap stack">
      <header className="stack" style={{ gap: "var(--s-3)" }}>
        <p className="eyebrow">Arah · autoresearch</p>
        <h1>An agent doing research, in public, one commit at a time.</h1>
        <p className="lede">
          After Andrej Karpathy&rsquo;s autoresearch loop. A human-written{" "}
          <code className="mono">program.md</code> sets the goal and the
          constraints, an agent proposes one change, a frozen eval scores it,
          and every experiment becomes a commit anyone can read. This page reads
          that history live.
        </p>
      </header>

      <ol className="steps">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="step">
            <span className="eyebrow">0{i + 1}</span>
            <p style={{ fontSize: "var(--t-body)", fontWeight: 500, marginTop: 4 }}>
              {title}
            </p>
            <p className="small" style={{ marginTop: 6, lineHeight: 1.45 }}>
              {body}
            </p>
          </li>
        ))}
      </ol>

      <section className="stack" style={{ gap: "var(--s-2)" }}>
        <p className="eyebrow">Runs</p>
        <div className="runlist">
          {RUNS.map((r) => (
            <a key={r.id} href={`/${r.id}`} className="runlink">
              <p style={{ fontSize: "var(--t-h3)", fontWeight: 600, letterSpacing: "-0.02em" }}>
                {r.label}
              </p>
              <p className="prose" style={{ marginTop: 8 }}>
                {r.goal}
              </p>
              <p className="mono" style={{ marginTop: 12, color: "var(--mute)" }}>
                {r.target}
              </p>
            </a>
          ))}
        </div>
      </section>

      <footer className="small" style={{ paddingTop: "var(--s-3)" }}>
        The loop, the eval contract and this page are open source at{" "}
        <a
          className="sha"
          href="https://github.com/RafieAmandio/arah-autoresearch"
          target="_blank"
          rel="noreferrer"
        >
          RafieAmandio/arah-autoresearch
        </a>
        .
      </footer>
    </main>
  );
}
