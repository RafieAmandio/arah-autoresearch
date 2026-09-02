import type { Run } from "./runs";

/* A zero-scope token. Unauthenticated GitHub is 60 requests an hour per IP,
   and serverless functions egress from shared rotating addresses, so the
   budget may already be spent by another tenant before we arrive. A classic
   PAT with no scopes gets 5000/hr on public repos and grants nothing if it
   leaks. */
const headers = (accept: string): Record<string, string> => ({
  Accept: accept,
  "User-Agent": "arah-autoresearch",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
});

export type Experiment = {
  n: number;
  sha: string;
  short: string;
  /** The agent's own one-line report. Karpathy's "what was tried". */
  subject: string;
  score: number;
  total: number;
  delta: number;
  result:
    | "improved"
    | "regressed"
    | "flat"
    | "no-change"
    | "crash"
    | "timeout"
    | "unknown";
  durationSeconds: number;
  date: string;
  /** The real diff on github.com. Every row links here. */
  url: string;
  tampered: string | null;
};

export type RunData = {
  run: Run;
  experiments: Experiment[];
  head: Experiment | null;
  best: Experiment | null;
  status: "running" | "idle" | "never-started";
  programHtml: string | null;
  findingsHtml: string | null;
  source: "github" | "stale" | "snapshot";
  fetchedAt: string;
};

/** Git trailers: `Key: value` lines. The whole score transport. */
function trailers(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of message.split("\n")) {
    const m = /^([A-Z][A-Za-z-]*):[ \t]*(.+)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function toExperiment(c: {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } };
}): Experiment | null {
  const t = trailers(c.commit.message);
  // Commits made before the loop existed carry no Experiment trailer.
  if (!t.Experiment) return null;
  const [score, total] = (t.Score ?? "0/0").split("/").map(Number);
  return {
    n: Number(t.Experiment),
    sha: c.sha,
    short: c.sha.slice(0, 7),
    subject: c.commit.message.split("\n")[0],
    score: Number.isFinite(score) ? score : 0,
    total: Number.isFinite(total) ? total : 0,
    delta: Number(t.Delta ?? 0),
    result: (t.Result as Experiment["result"]) ?? "unknown",
    durationSeconds: Number((t.Duration ?? "0").replace("s", "")),
    date: c.commit.author.date,
    url: c.html_url,
    tampered: t.Tampered ?? null,
  };
}

async function gh(url: string, accept: string, revalidate: number) {
  const r = await fetch(url, { headers: headers(accept), next: { revalidate } });
  if (!r.ok) throw new Error(`github ${r.status} ${url}`);
  return r;
}

/** GitHub renders the markdown. That is why this app has no markdown library. */
async function markdown(run: Run, path: string): Promise<string | null> {
  try {
    const r = await gh(
      `https://api.github.com/repos/${run.owner}/${run.repo}/contents/${path}?ref=${run.branch}`,
      "application/vnd.github.html",
      MARKDOWN_TTL,
    );
    return await r.text();
  } catch {
    return null;
  }
}

/* Upstream calls per refresh: one for the commits, two for the markdown. The
   markdown is a steering document and a findings log, which change at most
   once per experiment, so they get a long window. Unauthenticated GitHub
   allows 60 requests an hour per IP, and this keeps the whole page well
   inside that even with no token. */
export const COMMITS_TTL = 20;
export const MARKDOWN_TTL = 900;

export async function fetchRun(run: Run): Promise<Omit<RunData, "source">> {
  // One call for the whole curve: the trailers make every score parseable from
  // the commit list alone, so there is no per-commit request.
  const commits = (await gh(
    `https://api.github.com/repos/${run.owner}/${run.repo}/commits?sha=${run.branch}&per_page=100`,
    "application/vnd.github+json",
    COMMITS_TTL,
  ).then((r) => r.json())) as Parameters<typeof toExperiment>[0][];

  const experiments = commits
    .map(toExperiment)
    .filter((e): e is Experiment => e !== null)
    .sort((a, b) => a.n - b.n);

  const [programHtml, findingsHtml] = await Promise.all([
    markdown(run, run.program),
    markdown(run, run.findings),
  ]);

  const head = experiments.at(-1) ?? null;
  /* ponytail: "running" is inferred from commit recency, not a heartbeat. A
     crashed loop reads as running for one budget window. The upgrade path is a
     status commit per heartbeat, which pollutes the log to fix a cosmetic
     edge, so it is not worth it. The page also states the raw age next to it,
     which is what makes the inference honest. */
  const ageSeconds = head
    ? (Date.now() - Date.parse(head.date)) / 1000
    : Infinity;

  return {
    run,
    experiments,
    head,
    best: experiments.reduce<Experiment | null>(
      (b, e) => (!b || e.score > b.score ? e : b),
      null,
    ),
    status: !head
      ? "never-started"
      : ageSeconds < run.budgetSeconds * 1.5
        ? "running"
        : "idle",
    programHtml,
    findingsHtml,
    fetchedAt: new Date().toISOString(),
  };
}
