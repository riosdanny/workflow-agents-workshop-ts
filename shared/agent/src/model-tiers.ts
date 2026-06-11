/**
 * Model tier mapping. One place to update when new models ship.
 *
 *   medium → resolved via MODEL_TIERS
 *   gpt-4o → raw passthrough, provider inferred
 */
import { inferProvider, isTier } from './helpers.js'
import type { ModelSpec } from './types.js'

export type ModelTier = 'small' | 'medium' | 'large'

export const MODEL_TIERS: Record<ModelTier, ModelSpec> = {
  small: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  medium: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  large: { provider: 'anthropic', model: 'claude-opus-4-6' },
}

export function resolveModelSpec(model?: string, provider?: string): ModelSpec {
  const modelName = model ?? 'medium'
  if (isTier(modelName)) return { ...MODEL_TIERS[modelName] }
  return {
    provider: (provider as ModelSpec['provider']) ?? inferProvider(modelName),
    model: modelName,
  }
}
