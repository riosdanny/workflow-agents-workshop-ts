/**
 * filterDiff — a deterministic pipeline step that drops noise from a PR diff
 * before any agent (or any tokens) sees it.
 *
 * Lock files, minified bundles, and source maps are pure cost: they balloon the
 * prompt, add latency, and produce no useful review signal. Filtering them is the
 * cheap, in-process step that runs *before* the expensive agent fan-out.
 */
import { isNoise } from './helpers.js'
import type { Patch } from './prepareDiff.js'

export interface FilterDiffResult {
  /** The patches the reviewers will actually see. */
  patches: Patch[]
  /** Files removed as noise. */
  dropped: string[]
}

/**
 * Drop noise files from a set of patches. Returns the kept patches plus the list
 * of dropped files so the decision is visible in telemetry.
 */
export function filterDiff(patches: Patch[]): FilterDiffResult {
  const kept: Patch[] = []
  const dropped: string[] = []
  for (const patch of patches) {
    if (isNoise(patch.file)) {
      dropped.push(patch.file)
    } else {
      kept.push(patch)
    }
  }
  return { patches: kept, dropped }
}
