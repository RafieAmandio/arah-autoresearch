import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@/components/RunView";
import { fetchRun, type RunData } from "@/lib/github";
import { runById } from "@/lib/runs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  const { runId } = await params;
  const run = runById(runId);
  return run
    ? { title: run.label, description: run.goal }
    : { title: "Unknown run" };
}

/* Server component on purpose. The previous version gated the entire body on a
   client fetch, so the server HTML carried the goal and the constraints but not
   the score: the one fact the page exists to show was the one thing missing
   from first paint, and it arrived by pushing everything below it down.

   The score is rendered here; RunView takes it as its initial state and keeps
   polling for changes. */
export default async function Page({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = runById(runId);
  if (!run) notFound();

  let initial: RunData | null = null;
  try {
    initial = { ...(await fetchRun(run)), source: "github" };
  } catch {
    // The client poll will retry. A page that renders its frame beats an error.
    initial = null;
  }

  return <RunView run={run} initial={initial} />;
}
