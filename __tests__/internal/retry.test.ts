import { jest, describe, it, expect, beforeEach } from '@jest/globals'

import * as core from '../../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { promiseRetry } = await import('../../src/internal/retry.js')

describe('promiseRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  it('resolves on first attempt if fn succeeds', async () => {
    const fn = jest.fn<() => Promise<string>>().mockResolvedValue('ok')
    const result = await promiseRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and resolves on subsequent success', async () => {
    const fn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')

    const promise = promiseRetry(fn, { delay: 100 })
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(core.info).toHaveBeenCalledWith('fail')
  })

  it('throws after exhausting all retries', async () => {
    jest.useRealTimers()
    const error = new Error('always fails')
    const fn = jest.fn<() => Promise<string>>().mockRejectedValue(error)

    await expect(promiseRetry(fn, { maxRetries: 2, delay: 1 })).rejects.toThrow(
      'always fails'
    )
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should call refreshCreds before retrying', async () => {
    const refreshCreds = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    const fn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')

    const promise = promiseRetry(fn, { delay: 100, refreshCreds })
    await jest.runAllTimersAsync()
    await promise

    expect(refreshCreds).toHaveBeenCalledTimes(1)
  })

  it('stops retrying when shouldRetry returns false', async () => {
    const error = new Error('do not retry')
    const fn = jest.fn<() => Promise<string>>().mockRejectedValue(error)
    const shouldRetry = jest.fn<(e: Error) => boolean>().mockReturnValue(false)

    const promise = promiseRetry(fn, { maxRetries: 3, delay: 100, shouldRetry })

    await expect(promise).rejects.toThrow('do not retry')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(shouldRetry).toHaveBeenCalledWith(error)
  })

  it('should uses exponential backoff for delays', async () => {
    const fn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok')

    const spy = jest.spyOn(global, 'setTimeout')

    const promise = promiseRetry(fn, { delay: 1000 })
    await jest.runAllTimersAsync()
    await promise

    const delays = spy.mock.calls.map(c => c[1]).filter(d => d !== undefined)
    expect(delays).toContain(1000)
    expect(delays).toContain(4000)

    spy.mockRestore()
  })
})
