# arah-autoresearch

An agent doing research, in public, one commit at a time.

After [Andrej Karpathy's autoresearch](https://github.com/karpathy/autoresearch):
a human-written `program.md` sets the goal and the constraints, an agent proposes
a change under a fixed wall-clock budget, a frozen eval scores it, and every
experiment, including the failures, becomes one git commit.

The git history is the experiment database. There is no other store.

Live at **[research.workwitharah.ai](https://research.workwitharah.ai)**.

## Why the eval is the whole thing

Karpathy's loop works because of one property: a cheap, honest scalar metric.
Fixed budget plus one number means the agent cannot fool itself and the loop can
run unattended. Copy the skeleton without that and you get an agent generating a
hundred plausible artifacts overnight with no way to tell which are slop.

So the framework is not a runner and a website. It is a contract, and the runner
and the website are what fall out of taking it seriously. See
[CONTRACT.md](CONTRACT.md).

## Running one

```sh
python3 runner/autoresearch.py runner/runs/alphaclimate.json        # a full run
python3 runner/autoresearch.py runner/runs/alphaclimate.json -n 1   # one experiment
```

Requires the `claude` CLI on PATH and push access to the target repository. Each
experiment pushes one commit to the run's branch, so the site updates as the loop
goes. Kill it at any time and re-run the same command: it resumes at the next
experiment, because the run records are committed.

## Adding a research run

Two files, no code.

1. In the target repository, add `research/program.md` (the steering document)
   and an eval satisfying [CONTRACT.md](CONTRACT.md).
2. Here, add `runner/runs/<id>.json`:

```json
{
  "id": "myproject",
  "target": "~/Projects/myproject",
  "program": "research/program.md",
  "eval": ["python3", "-B", "research/invariants.py"],
  "editable": ["src/thing.py"],
  "frozen": ["research/", "tests/", "data/"],
  "branch": "autoresearch",
  "budget_s": 900,
  "eval_timeout_s": 120,
  "experiments": 12,
  "model": "opus",
  "max_budget_usd": 6.0
}
```

Then add five lines to `web/src/lib/runs.ts` so the site can display it.

## What the runner guarantees

**The agent cannot grade itself.** Everything under `frozen` is hard-restored
from a fixed git ref after the agent finishes and before scoring. The attempt is
recorded in the commit under a `Tampered:` trailer, so cheating shows up in the
public log rather than being silently undone.

**A crash is a score, never a dead loop.** Timeout, non-zero exit, non-JSON
stdout, any exception: all become a score of zero with `Result: crash`. The loop
always commits and always advances.

**No change is still a datum.** An experiment that changed nothing commits empty.
The x-axis is experiments run, and hiding a failed attempt would make the curve
lie about how many tries a gain cost.

**The budget is wall clock**, enforced by killing the process group. The Claude
CLI has no `--max-turns`, and wall clock is Karpathy's property anyway.

## Knowledge between experiments

`research/FINDINGS.md` in the target repo accumulates what each experiment
learned, and every later experiment reads it before starting.

The runner owns that file; the agent never writes it. The agent ends its final
message with a `## Findings` block, the runner extracts it and appends it under
a heading carrying the experiment number and score. Append-only by construction,
so there is no merge handling, no tamper vector, and every finding is traceable
to the experiment that produced it.

## Score transport

Each experiment's commit carries git trailers:

```
Experiment: 7
Score: 26/35
Delta: +1
Duration: 143s
Result: improved
Run: alphaclimate
```

So the whole curve parses from the commit list in a single API call, and anyone
can verify it with `git log` instead of trusting this repository.
