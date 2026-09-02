#!/usr/bin/env python3
"""Autoresearch loop. One experiment is one git commit.

After Andrej Karpathy's autoresearch: a human-written program.md sets the goal
and the constraints, an agent proposes a change under a fixed wall-clock budget,
a frozen eval scores it, and the result becomes a commit. The git history is the
experiment database. There is no other store.

Target-agnostic. Everything project-specific lives in the run config, and the
only interface to a target is the eval contract in CONTRACT.md: an executable
that prints one JSON object with `score`, `total` and `checks` to stdout.

    python3 runner/autoresearch.py runner/runs/alphaclimate.json
    python3 runner/autoresearch.py runner/runs/alphaclimate.json -n 1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

STATE = Path.home() / ".arah-autoresearch"

# The agent is given a real working environment. What protects the score is not
# this list but restore_frozen() below, which runs after the agent and before
# scoring. A deny-list is walked past by a shell heredoc; a forced git checkout
# is not.
TOOLS = "Read Grep Glob Edit Write Bash WebSearch WebFetch"

FINDINGS_BUDGET = 8000  # ponytail: newest-first truncation, summarise past ~30 experiments


def sh(cmd, cwd, timeout=120, check=True):
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError("{}: {}".format(" ".join(cmd), p.stderr.strip()[:400]))
    return p.stdout.strip()


def frozen_ref_path(cfg):
    STATE.mkdir(parents=True, exist_ok=True)
    return STATE / "{}.frozen_ref".format(cfg["id"])


def read_frozen_ref(cfg, target):
    """The ref the eval is restored from, held outside the repo.

    Anything inside the repo that names the frozen ref is editable by
    definition, which would make the whole mechanism decorative.
    """
    p = frozen_ref_path(cfg)
    if p.exists():
        return p.read_text().strip()
    ref = sh(["git", "rev-parse", "HEAD"], target)
    p.write_text(ref + "\n")
    print("frozen ref captured: {}".format(ref[:12]))
    return ref


def run_agent(cfg, target, prompt, budget):
    """claude -p under a hard wall clock. Returns (raw_text, timed_out)."""
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "json",
        "--permission-mode", "acceptEdits",
        "--allowedTools", TOOLS,
        "--model", cfg.get("model", "opus"),
        "--max-budget-usd", str(cfg.get("max_budget_usd", 6.0)),
        "--add-dir", str(target),
    ]
    # start_new_session so the timeout kills the whole process tree. claude
    # spawns children and subprocess's own timeout reaps only the direct parent,
    # which is how an unattended loop quietly stops making progress overnight.
    p = subprocess.Popen(cmd, cwd=str(target), stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, err = p.communicate(timeout=budget)
        timed_out = False
    except subprocess.TimeoutExpired:
        os.killpg(os.getpgid(p.pid), signal.SIGKILL)
        out, err = p.communicate()
        timed_out = True
    text = ""
    try:
        text = json.loads(out).get("result") or ""
    except Exception:
        text = (out or "")[:4000]
    return text.strip(), timed_out


def clean_subject(line, n):
    """One line of plain text, cut on a word boundary.

    The agent writes markdown, and a commit subject that ends mid-word reads
    as a truncation bug to anyone browsing the history.
    """
    s = re.sub(r"[`*_\r\n]", "", line).strip(" .:-")
    s = re.sub(r"\s+", " ", s)
    if len(s) > 72:
        cut = s[:72].rsplit(" ", 1)[0]
        s = (cut or s[:72]).rstrip(" ,;:") + "…"
    return s or "experiment {}".format(n)


def split_report(text, n):
    """Split the agent's final message into a commit subject and findings.

    Prefers an explicit `## Summary` block, because a free-form first line is
    as often "Done." as it is a description of the change. Falls back to the
    first meaningful line.
    """
    findings = ""
    m = re.search(r"^#{1,3}\s*Findings\s*$", text, re.M | re.I)
    if m:
        findings = text[m.end():].strip()
        text = text[:m.start()].strip()

    summary = ""
    m = re.search(r"^#{1,3}\s*Summary\s*$", text, re.M | re.I)
    if m:
        for line in text[m.end():].splitlines():
            if line.strip():
                summary = line
                break
        text = text[:m.start()].strip()

    if not summary:
        for line in text.splitlines():
            stripped = line.strip().lstrip("#").strip()
            if stripped and not stripped.startswith("```"):
                summary = stripped
                break

    return clean_subject(summary, n), findings


def restore_frozen(target, frozen, ref):
    """Force everything outside the editable set back to the frozen ref.

    This, not the permission system, is what makes the grader unreachable.
    The attempt is returned so it can be named in the commit: a tampering
    attempt recorded in a public log is worth more than one silently undone.
    """
    changed = sh(["git", "diff", "--name-only", ref], target, check=False).splitlines()
    tampered = sorted({f for f in changed if any(f.startswith(g) for g in frozen)})
    if tampered:
        sh(["git", "checkout", ref, "--"] + tampered, target)
    return tampered


def score(cfg, target, n):
    """Run the eval. Any failure is a score of zero, never a dead loop."""
    t0 = time.time()
    cmd = list(cfg["eval"]) + ["--experiment", str(n)]
    try:
        p = subprocess.run(cmd, cwd=str(target), capture_output=True, text=True,
                           timeout=cfg.get("eval_timeout_s", 120))
        return json.loads(p.stdout)
    except subprocess.TimeoutExpired:
        err = "eval timed out after {}s".format(cfg.get("eval_timeout_s", 120))
    except json.JSONDecodeError as e:
        err = "eval stdout was not JSON: {}".format(e)[:200]
    except Exception as e:
        err = "{}: {}".format(type(e).__name__, e)[:300]
    return {"score": 0, "total": None, "checks": [], "aborted": err,
            "duration_s": round(time.time() - t0, 2)}


def build_prompt(program, findings, n, prev):
    parts = [program, "\n---\n"]
    if findings:
        body = findings
        if len(body) > FINDINGS_BUDGET:
            body = "(earlier findings truncated)\n\n" + body[-FINDINGS_BUDGET:]
        parts.append("## What earlier experiments established\n\n" + body + "\n")
    if prev:
        failing = "\n".join(
            "  - {}: {}".format(c["name"], c.get("detail", ""))
            for c in prev.get("checks", []) if not c.get("held"))
        parts.append(
            "## Where the run stands\n\n"
            "You are experiment {}. Experiment {} scored {}/{} ({}): {}\n\n"
            "Checks still failing:\n{}\n".format(
                n, prev["n"], prev["score"], prev["total"], prev["result"],
                prev["subject"], failing or "  (none)"))
    else:
        parts.append("## Where the run stands\n\n"
                     "You are experiment {}. This is the first run.\n".format(n))
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("-n", "--experiments", type=int)
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text())
    target = Path(cfg["target"]).expanduser().resolve()
    runs = target / "research" / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    findings_file = target / "research" / "FINDINGS.md"
    program = (target / cfg["program"]).read_text()

    sh(["git", "checkout", "-B", cfg["branch"]], target)
    ref = read_frozen_ref(cfg, target)

    done = sorted(runs.glob("*.json"), key=lambda p: int(p.stem))
    n = len(done)
    prev = json.loads(done[-1].read_text()) if done else None
    if prev:
        print("resuming after experiment {} ({}/{})".format(n, prev["score"], prev["total"]))
    else:
        # Score the untouched tree first. Without this the first experiment has
        # nothing to diff against, so a real gain is recorded as a delta of zero
        # and the run reads as flat when it was not.
        base = score(cfg, target, 0)
        prev = {"n": 0, "subject": "baseline", "result": "baseline",
                "score": base.get("score", 0), "total": base.get("total") or 0,
                "checks": base.get("checks", [])}
        print("baseline {}/{}".format(prev["score"], prev["total"]))

    for _ in range(args.experiments or cfg["experiments"]):
        n += 1
        started = time.time()
        print("\n=== experiment {} ===".format(n), flush=True)

        findings = findings_file.read_text() if findings_file.exists() else ""
        prompt = build_prompt(program, findings, n, prev)
        text, timed_out = run_agent(cfg, target, prompt, cfg["budget_s"])
        subject, found = split_report(text, n)

        tampered = restore_frozen(target, cfg["frozen"], ref)
        res = score(cfg, target, n)

        total = res.get("total") or (prev or {}).get("total") or 0
        delta = res["score"] - prev["score"] if prev else 0
        dirty = bool(sh(["git", "status", "--porcelain"], target, check=False))
        result = ("crash" if res.get("aborted") else
                  "timeout" if timed_out and not dirty else
                  "no-change" if not dirty else
                  "improved" if delta > 0 else
                  "regressed" if delta < 0 else "flat")

        if found:
            with findings_file.open("a") as fh:
                fh.write("\n## Experiment {} - {} ({}/{})\n\n{}\n".format(
                    n, subject, res["score"], total, found.strip()))

        rec = {"n": n, "subject": subject, "score": res["score"], "total": total,
               "delta": delta, "result": result,
               "duration_s": round(time.time() - started),
               "tampered": tampered, "aborted": res.get("aborted"),
               "headline": res.get("headline"), "checks": res.get("checks", []),
               "at": datetime.now(timezone.utc).isoformat()}
        (runs / "{}.json".format(n)).write_text(json.dumps(rec, indent=2))

        body = "Eval aborted: {}\n\n".format(res["aborted"]) if res.get("aborted") else ""
        msg = ("{}\n\n{}"
               "Experiment: {}\n"
               "Score: {}/{}\n"
               "Delta: {:+d}\n"
               "Duration: {}s\n"
               "Result: {}\n"
               "Run: {}\n".format(subject, body, n, res["score"], total, delta,
                                  rec["duration_s"], result, cfg["id"]))
        if tampered:
            msg += "Tampered: {}\n".format(",".join(tampered))

        sh(["git", "add", "-A"], target)
        # --allow-empty: an experiment that changed nothing is still a datum.
        # Hiding it would make the curve lie about how many attempts a gain cost.
        sh(["git", "commit", "--allow-empty", "-m", msg], target)
        sh(["git", "push", "-u", "origin", cfg["branch"]], target, timeout=180)

        print("    {}  {}/{}  ({:+d})  {}s".format(
            result, res["score"], total, delta, rec["duration_s"]), flush=True)
        prev = rec


if __name__ == "__main__":
    main()
