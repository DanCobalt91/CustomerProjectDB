const NETWORK_ERROR_PATTERNS = [
  'fetch failed',
  'failed to fetch',
  'network request failed',
  'network error',
  'getaddrinfo',
  'enotfound',
  'etimedout',
  'econnreset',
  'econnrefused',
  'ehostunreachable',
  'ssl connect error',
  'certificate',
  'temporarily unreachable',
  'edge function',
  'functionsfetcherror',
]

const EDGE_FUNCTION_PATTERNS = ['edge function', 'functionsfetcherror']

type WithMessage = { message?: unknown; name?: unknown }

export function extractSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || ''
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const withMessage = error as WithMessage
    if (typeof withMessage.message === 'string') {
      return withMessage.message
    }
  }

  return ''
}

function getErrorName(error: unknown): string {
  if (error instanceof Error && typeof error.name === 'string') {
    return error.name
  }

  if (error && typeof error === 'object' && typeof (error as WithMessage).name === 'string') {
    return String((error as WithMessage).name)
  }

  return ''
}

export function isSupabaseUnavailableError(error: unknown): boolean {
  const message = extractSupabaseErrorMessage(error).toLowerCase()
  const name = getErrorName(error).toLowerCase()

  if (name && NETWORK_ERROR_PATTERNS.some(pattern => name.includes(pattern))) {
    return true
  }

  if (!message) {
    return false
  }

  return NETWORK_ERROR_PATTERNS.some(pattern => message.includes(pattern))
}

export function isSupabaseEdgeFunctionUnavailable(error: unknown): boolean {
  const message = extractSupabaseErrorMessage(error).toLowerCase()
  const name = getErrorName(error).toLowerCase()

  if (EDGE_FUNCTION_PATTERNS.some(pattern => name.includes(pattern))) {
    return true
  }

  if (!message) {
    return false
  }

  return EDGE_FUNCTION_PATTERNS.some(pattern => message.includes(pattern))
}
