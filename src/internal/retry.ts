import * as core from '@actions/core'

export interface RetryOptions {
  maxRetries?: number
  delay?: number
  refreshCreds?: () => Promise<void>
  shouldRetry?: (error: Error) => boolean
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_DELAY = 1000

export async function promiseRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    delay = DEFAULT_DELAY,
    refreshCreds,
    shouldRetry = () => true
  } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      core.info(lastError!.message)

      if (!shouldRetry(lastError!)) {
        throw lastError
      }

      if (refreshCreds) {
        await refreshCreds()
      }

      await new Promise(resolve => setTimeout(resolve, attempt ** 2 * delay))
    }

    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
    }
  }

  throw lastError
}
