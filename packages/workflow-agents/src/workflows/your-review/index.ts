/**
 * YOUR REVIEW — a sandbox workflow.
 *
 * This folder is *yours* to experiment with. Drop it under `workflows/<name>/`
 * and `loader.ts` auto-discovers it as the `your-review` workflow — no
 * registration step. Run it, break it, extend it, compare traces against the
 * finished `code-review` workflow next door.
 *
 * The starter below fetches a PR diff and returns a lightweight overview. From
 * here, go wherever curiosity takes you — compose agents, fan out reviewers,
 * add filtering, wire a judge, throw on purpose to watch retries. See
 * docs/04-author-a-task.md for ideas and a worked example.
 */
import { task } from "@renderinc/sdk/workflows";
import { extensions, filterDiff, overview, prepareDiff } from "@workshop/agent";

interface YourReviewInput {
  url: string;
}

export default task(
  {
    name: "your-review",
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 },
  },
  async function yourReview(input: YourReviewInput) {
    const allPatches = await prepareDiff({ url: input.url, labels: [] });
    const filtered = filterDiff(allPatches);

    // Everything below is a starting point — replace, extend, or delete freely.
    return {
      url: input.url,
      overview: overview(filtered.patches),
      extensions: extensions(filtered.patches),
      dropped: filtered.dropped,
    };
  },
);

// ── Ideas to explore ────────────────────────────────────────────────────────
//
// Compose a single agent as its own task (inline — no wrapper needed):
//
//   import { task } from "@renderinc/sdk/workflows";
//   import { securityReviewer } from "@workshop/agent";
//   import { storeTracer } from "@workshop/db";
//
//   const securityTask = task(
//     { name: "security", timeoutSeconds: 120 },
//     async (input: { patches: Patch[] }, runId?: string) => {
//       return securityReviewer.run(input, { tracer: storeTracer(), runId });
//     },
//   );
//   const review = await securityTask({ patches: filtered.patches });
//
// Fan out all always-on reviewers:
//
//   import { REVIEWERS } from "@workshop/agent";
//   const reviews = await Promise.all(
//     REVIEWERS.map((agent) =>
//       task(
//         { name: agent.name },
//         async (input: { patches: Patch[] }) => agent.run(input, { tracer: storeTracer() }),
//       )({ patches: filtered.patches }),
//     ),
//   );
//
// Add a verdict with the judge (see code-review/index.ts for the full pipeline).
//
// Force a flaky failure to watch Render retry in a fresh instance:
//
//   if (Math.random() < 0.5) throw new Error("flaky!");
//
// Drop a new tool in shared/agent/src/tools/ and give an agent access to it.
// ───────────────────────────────────────────────────────────────────────────
