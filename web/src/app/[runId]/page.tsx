"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import { Burndown } from "@/components/Burndown";
import { duration, relativeTime } from "@/lib/format";
import { runById } from "@/lib/runs";
import type { Experiment, RunData } from "@/lib/github";

function ResultCell({ e }: { e: Experiment }) {
  if (e.result === "crash" || e.result === "timeout")
    return <span className="chip chip-down">{e.result}</span>;
  if (e.result === "no-change")
    return <span className="chip chip-ghost">no change</span>;
  return (
    <span className="num">
      {e.score}/{e.total}
    </span>
  );
}

export default function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = React.use(params);
  const run = runById(runId);
  if (!run) notFound();

  const [d, setD] = React.useState<RunData | null>(null);

  /* Self-cancelling poll. A dropped tick is not a failure state: the server is
     already serving its last good answer, so the next tick simply retries. */
  React.useEffect(() => {
    let live = true;
    const tick = () =>
      fetch(`/api/runs/${runId}${location.search}`)
        .then((r) => r.json())
        .then((j) => {
          if (live) setD(j);
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [runId]);

  /* The run's identity, goal and constraints come from config, so they paint on
     the server. Only the data-dependent sections wait for the fetch: a client
     opening this link sees what the research is before it sees how it is going. */
  const rows = d ? [...d.experiments].reverse() : [];
  const total = d?.head?.total ?? 0;

  return (
    <main className="wrap stack">
      {/* 1. what is running right now */}
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--s-3)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">
            <a href="/" style={{ textDecoration: "none" }}>
              Arah · autoresearch
            </a>
          </p>
          <h1 style={{ fontSize: "var(--t-h2)", marginTop: 8 }}>{run.label}</h1>
          <p className="mono" style={{ color: "var(--mute)", marginTop: 10 }}>
            {run.target}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          {!d ? (
            <span className="chip chip-ghost">connecting</span>
          ) : d.status === "running" ? (
            <span className="chip chip-live">
              <span className="dot pulse" />
              running · experiment {(d.head?.n ?? 0) + 1} in progress
            </span>
          ) : d.status === "idle" ? (
            <span className="chip">idle</span>
          ) : (
            <span className="chip chip-ghost">not started</span>
          )}
          <span className="small">
            {d
              ? `${d.source === "github" ? "live" : d.source} · last experiment ${
                  d.head ? relativeTime(d.head.date) : "—"
                }`
              : "reading the commit log"}
          </span>
        </div>
      </header>

      {/* 4. is it getting better */}
      {d && (
      <section className="card">
        <div className="card-head">
          <p className="eyebrow">Invariants held</p>
          <div style={{ display: "flex", gap: 8 }}>
            {d.head && (
              <span
                className={
                  d.head.delta > 0
                    ? "chip chip-up"
                    : d.head.delta < 0
                      ? "chip chip-down"
                      : "chip"
                }
              >
                {d.head.delta >= 0 ? "+" : ""}
                {d.head.delta} last experiment
              </span>
            )}
            <span className="chip chip-ghost">
              {d.experiments.length} experiments
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <span className="figure">{d.head?.score ?? 0}</span>
          <span className="figure" style={{ color: "var(--mute)" }}>
            /{total || "—"}
          </span>
          {d.best && d.head && d.best.n !== d.head.n && (
            <span className="small" style={{ marginLeft: 8 }}>
              best {d.best.score}/{d.best.total} at #{d.best.n}
            </span>
          )}
        </div>
        <Burndown
          data={d.experiments.map((e) => ({ n: e.n, score: e.score }))}
          total={total || 1}
        />
      </section>
      )}

      {/* 2. what is it trying to do, under what constraints */}
      <div
        style={{
          display: "grid",
          gap: "var(--s-3)",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "start",
        }}
      >
        <section className="card">
          <p className="eyebrow">Goal</p>
          <p style={{ marginTop: 10 }}>{run.goal}</p>
        </section>
        <section className="card">
          <p className="eyebrow">Constraints</p>
          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
            {run.constraints.map((c) => (
              <li key={c} className="spine small" style={{ marginTop: 8, color: "var(--ink)" }}>
                {c}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 3. what has it tried, did it work */}
      {d && (
      <section className="card">
        <div className="card-head">
          <p className="eyebrow">Experiments</p>
          <span className="small">each row is one commit · click the hash for the diff</span>
        </div>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>What was tried</th>
                <th className="num">Result</th>
                <th className="num">Δ</th>
                <th className="num">Took</th>
                <th className="num">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.sha} className={i === 0 ? "row-new" : undefined}>
                  <td className="num" style={{ color: "var(--mute)" }}>
                    {e.n}
                  </td>
                  <td style={{ minWidth: 240 }}>
                    {e.subject}
                    <div className="small" style={{ marginTop: 2 }}>
                      {relativeTime(e.date)}
                      {e.tampered && (
                        <span className="chip chip-down" style={{ marginLeft: 8 }}>
                          reverted: {e.tampered}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num">
                    <ResultCell e={e} />
                  </td>
                  <td
                    className="num"
                    style={{
                      color:
                        e.delta > 0
                          ? "var(--signal-deep)"
                          : e.delta < 0
                            ? "var(--danger)"
                            : "var(--mute)",
                    }}
                  >
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}
                  </td>
                  <td className="num" style={{ color: "var(--mute)" }}>
                    {duration(e.durationSeconds)}
                  </td>
                  <td className="num">
                    <a className="sha" href={e.url} target="_blank" rel="noreferrer">
                      {e.short}
                    </a>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} style={{ padding: "2rem 0", textAlign: "center", color: "var(--mute)" }}>
                    No experiments yet. The first commit appears here within a minute of landing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* what the agents have learned */}
      {d?.findingsHtml && (
        <section className="card">
          <div className="card-head">
            <p className="eyebrow">What the agents have learned</p>
            <a
              className="sha"
              href={`https://github.com/${run.owner}/${run.repo}/blob/${run.branch}/${run.findings}`}
              target="_blank"
              rel="noreferrer"
            >
              {run.findings}
            </a>
          </div>
          <p className="small" style={{ marginBottom: 16, maxWidth: "var(--measure)" }}>
            Accumulated across experiments. Every later experiment reads this before it
            starts, so a dead end is only walked into once.
          </p>
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: d.findingsHtml }}
          />
        </section>
      )}

      {/* the steering document, verbatim */}
      {d?.programHtml && (
        <section className="card">
          <div className="card-head">
            <p className="eyebrow">The steering document</p>
            <a
              className="sha"
              href={`https://github.com/${run.owner}/${run.repo}/blob/${run.branch}/${run.program}`}
              target="_blank"
              rel="noreferrer"
            >
              {run.program}
            </a>
          </div>
          <p className="small" style={{ marginBottom: 16, maxWidth: "var(--measure)" }}>
            Human-written, committed to the target repository, and the only channel
            through which this research is steered. Rendered here exactly as committed.
          </p>
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: d.programHtml }}
          />
        </section>
      )}

      <footer className="small" style={{ maxWidth: "var(--measure)", paddingTop: "var(--s-3)" }}>
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
