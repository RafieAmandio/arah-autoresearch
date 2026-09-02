"use client";

import * as React from "react";
import { Burndown } from "@/components/Burndown";
import { duration, relativeTime } from "@/lib/format";
import type { Experiment, RunData } from "@/lib/github";
import type { Run } from "@/lib/runs";

/* Reading order, deliberately: what this is and what it may not do, then how it
   is going, then what it tried, then the evidence. A first-time viewer needs
   the frame before the number; a returning one still gets the number without
   scrolling. */

function StatusChip({ d }: { d: RunData | null }) {
  if (!d) return <span className="chip chip-ghost">connecting</span>;
  if (d.source === "snapshot")
    /* A snapshot carries whatever status was true when it was taken. Replaying
       that as "running" would be a live claim about a dead loop. */
    return <span className="chip chip-ghost">offline snapshot</span>;
  if (d.status === "running")
    return (
      <span className="chip chip-live">
        <span className="dot pulse" />
        running · experiment {(d.head?.n ?? 0) + 1}
      </span>
    );
  return (
    <span className="chip">{d.status === "idle" ? "idle" : "not started"}</span>
  );
}

function ScoreCell({ e }: { e: Experiment }) {
  if (e.result === "crash" || e.result === "timeout")
    return <span className="chip chip-down">{e.result}</span>;
  if (e.result === "no-change")
    return <span className="chip chip-ghost">no change</span>;
  return (
    <>
      <span className="tnum">{e.score}</span>
      <span
        className={
          e.delta > 0 ? "delta delta-up" : e.delta < 0 ? "delta delta-down" : "delta"
        }
      >
        {e.delta > 0 ? "+" : ""}
        {e.delta}
      </span>
    </>
  );
}

export function RunView({ run, initial }: { run: Run; initial: RunData | null }) {
  const [d, setD] = React.useState<RunData | null>(initial);

  /* Self-cancelling poll. A dropped tick is not a failure state: the server is
     already serving its last good answer, so the next tick simply retries. */
  React.useEffect(() => {
    let live = true;
    const tick = () =>
      fetch(`/api/runs/${run.id}${location.search}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (live) setD(j);
        })
        .catch(() => {});
    const t = setInterval(tick, 15_000);
    if (!initial) tick();
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [run.id, initial]);

  const rows = d ? [...d.experiments].reverse() : [];
  const total = d?.head?.total ?? 0;
  const first = d?.experiments[0] ?? null;
  const head = d?.head ?? null;
  const climb = first && head ? head.score - first.score : 0;
  const budgetMinutes = Math.round(run.budgetSeconds / 60);

  return (
    <main className="wrap run">
      {/* what this is */}
      <header className="run-head">
        <a className="backlink mono" href="/">
          ← Arah autoresearch
        </a>
        <div className="run-title">
          <h1>{run.label}</h1>
          <StatusChip d={d} />
        </div>
        <p className="mono run-target">{run.target}</p>
      </header>

      {/* what it is trying to do, and what it may not do */}
      <section className="brief">
        <div>
          <h2 className="brief-goal">{run.goal}</h2>
          <p className="small brief-note">
            The agent is steered only by a committed markdown file. Everything below
            is read live from the commit history.
          </p>
        </div>
        <ul className="spine constraints">
          {run.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      {/* how it is going */}
      <section className="scoreboard">
        <div className="score">
          <p className="score-figure">
            <span className="figure">{head?.score ?? "—"}</span>
            <span className="figure score-total">/{total || "—"}</span>
          </p>
          <h3 className="score-label">invariants held</h3>
          <p className="small score-def">
            Properties the engine must satisfy whatever the right answer is: bounds,
            monotonicity, determinism, internal coherence. There is no ground truth in
            this codebase, so this is what can honestly be scored.
          </p>
          {first && head && d && d.experiments.length > 1 && (
            <p className="score-climb">
              <span className="tnum">{first.score}</span>
              <span aria-hidden="true"> → </span>
              <span className="tnum">{head.score}</span> across{" "}
              {d.experiments.length} experiments
              {climb > 0 && <span className="delta delta-up">+{climb}</span>}
            </p>
          )}
        </div>
        <div className="scorechart">
          {d && d.experiments.length > 0 ? (
            <Burndown
              data={d.experiments.map((e) => ({ n: e.n, score: e.score }))}
              total={total || 1}
            />
          ) : (
            <p className="small">No experiments yet.</p>
          )}
        </div>
      </section>

      {/* what it tried */}
      <section className="card">
        <div className="card-head">
          <h3>Experiments</h3>
          <span className="small">
            {d?.head ? `last ${relativeTime(d.head.date)} · ` : ""}each row is one
            commit
          </span>
        </div>
        <div className="scroll-x">
          <table className="exp table-wide">
            <colgroup>
              <col />
              <col style={{ width: "12ch" }} />
              <col style={{ width: "11ch" }} />
              <col style={{ width: "10ch" }} />
            </colgroup>
            <thead>
              <tr>
                <th>What was tried</th>
                <th className="num">Score /{total || "—"}</th>
                <th className="num">Took /{budgetMinutes}m</th>
                <th className="num">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.sha} className={e.tampered ? "row-flag" : undefined}>
                  <td className="c-subject">
                    <span className="expn tnum">{e.n}</span>
                    {e.subject}
                    {e.tampered && (
                      <span className="chip chip-down chip-wrap">
                        reverted: {e.tampered}
                      </span>
                    )}
                  </td>
                  <td className="c-score num">
                    <ScoreCell e={e} />
                  </td>
                  <td className="c-took num">{duration(e.durationSeconds)}</td>
                  <td className="c-diff num">
                    <a className="sha" href={e.url} target="_blank" rel="noreferrer">
                      {e.short}
                    </a>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="empty">
                    No experiments yet. The first commit appears here within a minute
                    of landing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* the evidence */}
      <section className="docs">
        {d?.findingsHtml && (
          <details className="doc">
            <summary>
              <span className="doc-title">What the agents have learned</span>
              <span className="small doc-meta">
                {d.experiments.length} entries · read by every later experiment
              </span>
            </summary>
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: d.findingsHtml }}
            />
            <a
              className="sha"
              href={`https://github.com/${run.owner}/${run.repo}/blob/${run.branch}/${run.findings}`}
              target="_blank"
              rel="noreferrer"
            >
              {run.findings}
            </a>
          </details>
        )}
        {d?.programHtml && (
          <details className="doc">
            <summary>
              <span className="doc-title">The steering document</span>
              <span className="small doc-meta">
                human-written · the only channel into this research
              </span>
            </summary>
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: d.programHtml }}
            />
            <a
              className="sha"
              href={`https://github.com/${run.owner}/${run.repo}/blob/${run.branch}/${run.program}`}
              target="_blank"
              rel="noreferrer"
            >
              {run.program}
            </a>
          </details>
        )}
      </section>

      <footer className="run-foot small">
        Every row above is a commit on{" "}
        <a
          className="sha"
          href={`https://github.com/${run.owner}/${run.repo}/commits/${run.branch}`}
          target="_blank"
          rel="noreferrer"
        >
          {run.owner}/{run.repo}@{run.branch}
        </a>
        . The score is written into the commit message by the eval, before the commit
        exists. Nothing on this page is a number this server invented.
      </footer>
    </main>
  );
}
