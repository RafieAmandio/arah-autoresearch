import { NextResponse } from "next/server";
import { runById } from "@/lib/runs";
import { fetchRun, type RunData } from "@/lib/github";
import snapshot from "@/snapshot.json";

export const dynamic = "force-dynamic";

/* Last good answer per run. Best-effort on serverless, where each instance
   keeps its own; the committed snapshot is the guaranteed floor underneath. */
const lastGood = new Map<string, RunData>();

const snap = (id: string): RunData | undefined =>
  (snapshot as Record<string, RunData>)[id];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = runById(id);
  if (!run) return NextResponse.json({ error: "unknown run" }, { status: 404 });

  /* The demo switch. ?offline=1 forces the committed snapshot so a venue's
     network is never a variable in front of a client. */
  if (new URL(req.url).searchParams.get("offline")) {
    const s = snap(id);
    if (s) return NextResponse.json({ ...s, source: "snapshot" });
  }

  try {
    const data: RunData = { ...(await fetchRun(run)), source: "github" };
    lastGood.set(id, data);
    return NextResponse.json(data);
  } catch {
    /* Stale beats blank in front of a client: last good answer, then the
       committed snapshot, then an honest empty run. */
    const cached = lastGood.get(id);
    if (cached) return NextResponse.json({ ...cached, source: "stale" });
    const s = snap(id);
    if (s) return NextResponse.json({ ...s, source: "snapshot" });
    return NextResponse.json({
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
