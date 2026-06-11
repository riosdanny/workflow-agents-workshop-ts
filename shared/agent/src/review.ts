/**
 * The code-review orchestration used by naive-agent and worker-agents.
 *
 *   prepareDiff → filterDiff → [security ‖ performance ‖ ux?] (Promise.all) → judge
 *
 * The UX reviewer is conditionally branched in only when the diff touches
 * frontend files. Substrate-agnostic: it doesn't know whether it runs in a web
 * request or a queue worker. Progress is surfaced via the `onEvent` callback so a
 * worker can stream it over pub/sub. workflow-agents expresses the same shape as
 * Render tasks.
 */
import { prepareDiff, type Patch } from './prepareDiff.js'
import { filterDiff } from './filterDiff.js'
import { selectReviewers, judge } from './agents.js'
import { parseDecision, toReviewSummary } from './helpers.js'
import type { ReviewDecision, ReviewFinding, ReviewSummary } from './helpers.js'
import type { RunContext, TokenUsage, Tracer } from './types.js'

export type { ReviewFinding, ReviewDecision, ReviewSummary } from './helpers.js'
export { sumUsage, parseDecision, toReviewSummary } from './helpers.js'

export interface ReviewResult {
  prUrl: string
  patches: Patch[]
  reviews: ReviewFinding[]
  decision: ReviewDecision
  usage: TokenUsage
  /**
   * The flat, persist-ready shape (verdict + reason + reviews + usage). Every
   * substrate persists *this* via `persistReview`, so the bookkeeping is shared
   * and only the fan-out differs between patterns.
   */
  summary: ReviewSummary
}

export type ReviewEvent =
  | { type: 'phase'; phase: 'prepare' | 'filter' | 'review' | 'judge' | 'done'; detail?: string }
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_done'; agent: string; note: string }
  | { type: 'error'; message: string }

export interface RunReviewOptions {
  onEvent?: (event: ReviewEvent) => void | Promise<void>
  signal?: AbortSignal
  tracer?: Tracer
  /** Ties telemetry spans together — typically the persisted review id. */
  runId?: string
}

export async function runReview(prUrl: string, options: RunReviewOptions = {}): Promise<ReviewResult> {
  const { onEvent, signal, tracer, runId } = options
  const emit = async (event: ReviewEvent) => {
    await onEvent?.(event)
  }
  const ctx: RunContext = {
    ...(signal ? { signal } : {}),
    ...(tracer ? { tracer } : {}),
    ...(runId ? { runId } : {}),
  }

  await emit({ type: 'phase', phase: 'prepare' })
  const allPatches = await prepareDiff({ url: prUrl, labels: [] })

  // Deterministic, in-process step: drop noise before the expensive fan-out.
  const filtered = filterDiff(allPatches)
  const patches = filtered.patches
  await emit({
    type: 'phase',
    phase: 'filter',
    detail: `${patches.length} files (${filtered.dropped.length} noise dropped)`,
  })

  // Conditional branching: UX reviewer joins only when the diff touches frontend.
  const reviewers = selectReviewers(patches)
  await emit({ type: 'phase', phase: 'review', detail: reviewers.map((r) => r.name).join(', ') })

  const reviews = await Promise.all(
    reviewers.map(async (agent) => {
      await emit({ type: 'agent_start', agent: agent.name })
      const result = await agent.run({ patches }, ctx)
      await emit({ type: 'agent_done', agent: agent.name, note: result.text })
      return { agent: agent.name, note: result.text, usage: result.usage }
    }),
  )

  await emit({ type: 'phase', phase: 'judge' })
  const judgeResult = await judge.run(
    { findings: reviews.map(({ agent, note }) => ({ agent, note })) },
    ctx,
  )

  await emit({ type: 'phase', phase: 'done' })

  // One summarization path, shared with the workflow pattern: parse the verdict,
  // flatten reviewer notes, and total the tokens.
  const summary = toReviewSummary(reviews, judgeResult)

  return {
    prUrl,
    patches,
    reviews: summary.reviews,
    decision: parseDecision(judgeResult.text),
    usage: summary.usage,
    summary,
  }
}
