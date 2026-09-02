# The eval contract

This is the entire framework surface. There is no base class to inherit, nothing
to register, and no SDK.

An eval is **any executable**, run from the target repository root. It writes
**one JSON object to stdout** and nothing else:

```json
{
  "score": 25,
  "total": 35,
  "duration_s": 0.65,
  "checks": [
    {
      "name": "INT-DOMAIN",
      "held": false,
      "detail": "fixture: eal 25,000,000 vs reference 37,500,000 (-33.33%)"
    }
  ]
}
```

## Rules

- `score` must equal the count of checks with `held: true`.
- Exit status is ignored.
- Unparseable stdout, a crash, or a timeout scores `0` against the last known
  `total`, and the experiment is still committed. A crash is a result.
- Extra top-level fields are permitted and ignored. The dashboard opportunistically
  renders a `headline` object if one is present, which is how a run shows the
  numbers moving underneath the score.
- `--experiment N` is passed to the eval. Use it or ignore it.

## What makes an eval worth running

The contract is easy to satisfy and easy to satisfy badly. Three properties
separate a real eval from a progress bar:

**It must be cheap.** Karpathy's loop works because a training run is five
minutes and `val_bpb` falls out of it. If scoring takes longer than the agent's
thinking, the loop stops being a loop.

**It must be honest.** The number has to be something the agent cannot argue
with. Where there is ground truth, use it. Where there is none, score
*invariants*: properties the system must satisfy regardless of what the right
answer is. Never score a quantity the agent can define its own way.

**It must be ungameable.** Every bound is satisfiable by clamping to zero, so
pair each bound with an anchor that a degenerate solution violates. The strongest
version of this is structural: choose invariants whose fixes push the underlying
quantities in opposite directions, so there is no single scalar to push.

## Freezing

The eval is restored from a fixed git ref before every scoring run, so edits to
it are reverted and named in the commit under a `Tampered:` trailer. The frozen
ref is stored in `~/.arah-autoresearch/<id>.frozen_ref`, outside the target repo,
because anything inside the repo that names the frozen ref is editable by
definition.

Freeze the eval, the tests, the input data, and any module the eval imports for
its own reference maths. Leave editable only what the research is actually about.

One trap worth stating: if a target's assertions live inside the files the agent
may edit, restoring the test directory protects nothing, because the tests
delegate to code the agent controls. The eval must carry its own copies.
