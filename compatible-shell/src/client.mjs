const DEFAULT_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:8787'
const DEFAULT_API_KEY = process.env.ANTHROPIC_API_KEY || 'dummy'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-compatible'
const DEFAULT_MAX_TOKENS = Number.parseInt(
  process.env.COMPAT_SHELL_MAX_TOKENS || '1024',
  10,
)

export function getClientConfig(overrides = {}) {
  return {
    baseUrl: overrides.baseUrl || DEFAULT_BASE_URL,
    apiKey: overrides.apiKey || DEFAULT_API_KEY,
    model: overrides.model || DEFAULT_MODEL,
    maxTokens:
      overrides.maxTokens ||
      (Number.isFinite(DEFAULT_MAX_TOKENS) ? DEFAULT_MAX_TOKENS : 1024),
  }
}

export async function sendMessages({
  baseUrl,
  apiKey,
  model,
  system,
  messages,
  tools,
  maxTokens,
  temperature = 0.1,
}) {
  const response = await fetch(joinUrl(baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system,
      messages,
      tools,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `Messages API ${response.status}: ${text.slice(0, 1200) || response.statusText}`,
    )
  }

  return text ? JSON.parse(text) : {}
}

function joinUrl(base, maybePath) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedPath = maybePath.startsWith('/') ? maybePath : `/${maybePath}`
  return `${normalizedBase}${normalizedPath}`
}
