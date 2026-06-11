/**
 * Shared helpers used across the agent package.
 */
import type { AgentResult, TokenUsage } from './types.js'
import type { Patch } from './prepareDiff.js'
import type { ModelTier } from './model-tiers.js'

// ── Review ──────────────────────────────────────────────────────────────────

export interface ReviewFinding {
  agent: string
  note: string
}

export interface ReviewDecision {
  verdict: string
  reason: string
  findings: Array<Record<string, unknown>>
  raw: string
}

export interface ReviewSummary {
  verdict: string
  reason: string
  reviews: ReviewFinding[]
  usage: TokenUsage
}

/** Add up the token usage across a set of agent results. */
export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  )
}

export function parseDecision(raw: string): ReviewDecision {
  const json = extractJson(raw)
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    return {
      verdict: typeof obj.verdict === 'string' ? obj.verdict : 'unknown',
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      findings: Array.isArray(obj.findings) ? (obj.findings as Array<Record<string, unknown>>) : [],
      raw,
    }
  }
  return { verdict: 'unknown', reason: raw, findings: [], raw }
}

export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Shape the reviewer results and the judge's output into a `ReviewSummary`:
 * parse the verdict/reason, strip per-reviewer usage down to `{ agent, note }`,
 * and total the tokens. This is the boilerplate every substrate would otherwise
 * copy after its own fan-out.
 */
export function toReviewSummary(
  reviews: Array<{ agent: string; note: string; usage: TokenUsage }>,
  judgeResult: AgentResult,
): ReviewSummary {
  const decision = parseDecision(judgeResult.text)
  return {
    verdict: decision.verdict,
    reason: decision.reason,
    reviews: reviews.map(({ agent, note }) => ({ agent, note })),
    usage: sumUsage([...reviews.map((r) => r.usage), judgeResult.usage]),
  }
}

// ── Patches / diffs ─────────────────────────────────────────────────────────

const PR_URL_RE = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/

export function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const match = PR_URL_RE.exec(url)
  if (!match) {
    throw new Error(
      `cannot parse PR URL: "${url}" (expected https://github.com/{owner}/{repo}/pull/{number})`,
    )
  }
  return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) }
}

const NOISE_FILES = new Set([
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
  'Gemfile.lock',
])

const NOISE_EXTENSIONS = ['.min.js', '.min.css', '.bundle.js', '.map']

export function isNoise(filename: string): boolean {
  const basename = filename.split('/').pop() ?? filename
  if (NOISE_FILES.has(basename)) return true
  return NOISE_EXTENSIONS.some((ext) => filename.endsWith(ext))
}

/** File extensions that signal a frontend change and warrant the UX reviewer. */
const FRONTEND_EXTENSIONS = /\.(tsx|jsx|vue|svelte|css|scss|less|html)$/

export function hasFrontendFiles(patches: Patch[]): boolean {
  return patches.some((p) => FRONTEND_EXTENSIONS.test(p.file))
}

export function overview(patches: Patch[]) {
  const totalDiffLines = patches.reduce((n, p) => n + p.diff.split('\n').length, 0)
  return {
    fileCount: patches.length,
    totalDiffLines,
    largestFiles: [...patches]
      .sort((a, b) => b.diff.length - a.diff.length)
      .slice(0, 5)
      .map((p) => ({ file: p.file, diffLines: p.diff.split('\n').length })),
  }
}

export function extensions(patches: Patch[]) {
  const counts = new Map<string, number>()
  for (const { file } of patches) {
    const ext = file.includes('.') ? (file.split('.').pop() ?? '(none)') : '(none)'
    counts.set(ext, (counts.get(ext) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]))
}

// ── Model tiers ─────────────────────────────────────────────────────────────

export function isTier(value: string): value is ModelTier {
  return value === 'small' || value === 'medium' || value === 'large'
}

export function inferProvider(model: string): 'anthropic' | 'openai' {
  if (/^(gpt-|o[13]|dall-e|chatgpt)/.test(model)) return 'openai'
  return 'anthropic'
}
