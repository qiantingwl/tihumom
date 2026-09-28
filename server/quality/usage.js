const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null)
const amount = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
// Currency must be explicit. OpenRouter's documented usage.cost is denominated in USD.
export function readUsage(value, { openRouter = false } = {}) {
  if (!value || typeof value !== 'object') return {}
  const usage = value.usage || value.usageMetadata || {}
  let inputTokens = count(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount)
  // Anthropic reports uncached input separately; OpenAI's input_tokens already includes cached input.
  if (
    inputTokens !== null &&
    (usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined)
  ) {
    inputTokens +=
      (count(usage.cache_read_input_tokens) ?? 0) + (count(usage.cache_creation_input_tokens) ?? 0)
  }
  let outputTokens = count(
    usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount,
  )
  if (
    usage.candidatesTokenCount !== undefined &&
    count(usage.thoughtsTokenCount) !== null &&
    outputTokens !== null
  )
    outputTokens += usage.thoughtsTokenCount
  const totalTokens = count(usage.total_tokens ?? usage.totalTokenCount)
  const cachedTokens = count(
    usage.input_tokens_details?.cached_tokens ??
      usage.prompt_tokens_details?.cached_tokens ??
      usage.cache_read_input_tokens ??
      usage.cachedContentTokenCount,
  )
  const reasoningTokens = count(
    usage.output_tokens_details?.reasoning_tokens ??
      usage.completion_tokens_details?.reasoning_tokens ??
      usage.thoughtsTokenCount,
  )
  const rawCost = usage.cost
  const costAmount = amount(typeof rawCost === 'object' && rawCost ? rawCost.amount : rawCost)
  const currency =
    (typeof rawCost === 'object' && rawCost
      ? rawCost.currency
      : (usage.cost_currency ?? usage.currency)) ?? (openRouter ? 'USD' : null)
  const billing =
    costAmount !== null && typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)
      ? { amount: costAmount, currency, source: 'upstream_response' }
      : null
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    reasoningTokens,
    billing,
    responseModel:
      typeof value.model === 'string'
        ? value.model.slice(0, 200)
        : typeof value.modelVersion === 'string'
          ? value.modelVersion.slice(0, 200)
          : null,
  }
}
export function mergeUsage(previous, next) {
  for (const [key, value] of Object.entries(next))
    if (value !== null && value !== undefined) previous[key] = value
  return previous
}
