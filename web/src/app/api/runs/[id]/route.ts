import { NextResponse } from "next/server";
import { runById } from "@/lib/runs";
import { fetchRun, type RunData } from "@/lib/github";
import snapshot from "@/snapshot.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* `force-dynamic` governs how the route renders, not what happens to the
   response afterwards. Without an explicit no-store the edge cached the JSON
   and served the same `fetchedAt` for as long as it liked, so the page froze
   at two experiments while five were live on GitHub. The TTL that bounds
   upstream calls has to live in this process, not in a CDN we cannot see. */
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

/* Last good answer per run. Best-effort on serverless, where each instance
   keeps its own; the committed snapshot is the guaranteed floor underneath.

   This is an explicit TTL rather than `next: { revalidate }` alone, for two
   reasons: it bounds upstream calls whatever the framework's cache is doing
   under `force-dynamic`, and it is the thing that can serve a stale answer
   through a 403, which `revalidate` cannot. Serving the last good answer
   through a rate limit is the single most valuable property this route has. */
const lastGood = new Map<string, RunData>();

/* Without a token GitHub allows 60 requests an hour per IP, and serverless
   egress addresses are shared, so the budget may be partly spent before we
   arrive. 90 seconds keeps the commit poll near 40/hr. */
const TTL_MS = (process.env.GITHUB_TOKEN ? 20 : 90) * 1000;

const fresh = (d: RunData | undefined): d is RunData =>
  !!d && Date.now() - Date.parse(d.fetchedAt) < TTL_MS;

/* Through `unknown` on purpose. A populated snapshot infers literal string
   types for the union fields (`result`, `status`), which do not overlap the
   declared ones, so a direct assertion fails to compile the moment the file
   stops being empty. That is a build break discovered at refresh time, which
   is the worst possible time to discover it. */
const snap = (id: string): RunData | undefined =>
  (snapshot as unknown as Record<string, RunData>)[id];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = runById(id);
  if (!run) return json({ error: "unknown run" }, 404);

  /* The demo switch. ?offline=1 forces the committed snapshot so a venue's
     network is never a variable in front of a client. */
  if (new URL(req.url).searchParams.get("offline")) {
    const s = snap(id);
    if (s) return json({ ...s, source: "snapshot" });
  }

  const cachedFresh = lastGood.get(id);
  if (fresh(cachedFresh)) return json(cachedFresh);

  try {
    const data: RunData = { ...(await fetchRun(run)), source: "github" };
    lastGood.set(id, data);
    return json(data);
  } catch {
    /* Stale beats blank in front of a client: last good answer, then the
       committed snapshot, then an honest empty run. */
    const cached = lastGood.get(id);
    if (cached) return json({ ...cached, source: "stale" });
    const s = snap(id);
    if (s) return json({ ...s, source: "snapshot" });
    return json({
      run,
      experiments: [],
      head: null,
      best: null,
      status: "never-started",
      programHtml: null,
      findingsHtml: null,
      source: "snapshot",
      fetchedAt: new Date().toISOString(),
    } satisfies RunData);
  }
}
