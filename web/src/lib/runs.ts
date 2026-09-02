export type Run = {
  id: string;
  label: string;
  /** One sentence for the hero. program.md is the authority; this is the headline. */
  goal: string;
  /** Short lines. What the agent may not do. */
  constraints: string[];
  owner: string;
  repo: string;
  branch: string;
  /** Rendered verbatim on the page, straight from the target repo. */
  program: string;
  /** Accumulated knowledge, read by every later experiment. */
  findings: string;
  /** Per-experiment wall clock. Only used to decide whether a loop is running. */
  budgetSeconds: number;
  /** What is actually being edited, in one line. */
  target: string;
};

/* Adding a research run is five lines here plus a runner config. That is the
   entire multi-run mechanism: no registry, no loader, no plugin. */
export const RUNS: Run[] = [
  {
    id: "alphaclimate",
    label: "Catastrophe loss engine",
    goal:
      "Raise the number of physical and internal-consistency invariants that hold in an asset-level climate risk engine.",
    constraints: [
      "The agent may edit three files. Everything else is restored from a frozen ref before scoring.",
      "The eval cannot be reached, and any attempt is recorded in the commit.",
      "Weakening the model to satisfy a check is a failure, not a win.",
      "One fixed wall-clock budget per experiment. No extensions.",
      "Every experiment is one public commit, including the failures.",
    ],
    owner: "Arah-AI",
    repo: "alphaclimate",
    branch: "autoresearch",
    program: "research/program.md",
    findings: "research/FINDINGS.md",
    budgetSeconds: 900,
    target: "Arah-AI/alphaclimate · api/app/{engine,finance,compute}.py",
  },
];

export const runById = (id: string) => RUNS.find((r) => r.id === id);
