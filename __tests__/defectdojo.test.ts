// Modules used.
import { jest } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Modules to be mocked.
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

// Module under test (dynamically imported AFTER mocks are registered).
const defectdojo = await import('../src/defectdojo.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid DefectDojoConfig. */
function makeConfig(
  overrides: Partial<Parameters<typeof defectdojo.upload>[0]> = {}
): Parameters<typeof defectdojo.upload>[0] {
  return {
    url: 'https://dd.example.com',
    apiKey: 'test-api-key',
    productName: 'owner/repo',
    productTypeName: 'TestOrg',
    engagementName: 'GitHub Actions',
    testTitle: 'Semgrep',
    jsonFile: 'semgrep.json',
    scanDate: '2026-10-01',
    branch: 'main',
    commitHash: 'abc123',
    buildId: '999',
    sourceCodeManagementUri: 'https://github.com/owner/repo',
    closeOldFindings: true,
    onError: 'warn',
    ...overrides
  }
}

/**
 * Create a temporary Semgrep JSON file in the OS temp directory and return
 * its path. The caller is responsible for deleting it.
 */
function makeTempJson(): string {
  const dir = os.tmpdir()
  const file = path.join(dir, `test-${Date.now()}.json`)
  // Minimal valid Semgrep JSON report structure.
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: '1.149.0',
      results: [],
      errors: [],
      paths: { scanned: [] }
    })
  )
  return file
}

// ---------------------------------------------------------------------------
// Tests: no-op conditions
// ---------------------------------------------------------------------------

describe('upload — no-op conditions', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('skips silently when url is empty', async () => {
    const config = makeConfig({ url: '' })
    await defectdojo.upload(config)

    expect(core.info).toHaveBeenCalledWith(
      'DefectDojo URL not provided — skipping DefectDojo upload.'
    )
    // No fetch calls — nothing thrown, no warning/failure.
    expect(core.warning).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('skips silently when apiKey is empty', async () => {
    const config = makeConfig({ apiKey: '' })
    await defectdojo.upload(config)

    expect(core.info).toHaveBeenCalledWith(
      'DefectDojo API key not provided — skipping DefectDojo upload.'
    )
    expect(core.warning).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('warns and skips when Semgrep JSON file does not exist', async () => {
    const config = makeConfig({ jsonFile: '/nonexistent/path/semgrep.json' })
    await defectdojo.upload(config)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Semgrep JSON file not found')
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: HTTP interactions (fetch is mocked at the global level)
// ---------------------------------------------------------------------------

describe('upload — HTTP interactions', () => {
  let tmpJsonFile: string

  beforeEach(() => {
    jest.resetAllMocks()
    tmpJsonFile = makeTempJson()
  })

  afterEach(() => {
    if (fs.existsSync(tmpJsonFile)) {
      fs.unlinkSync(tmpJsonFile)
    }
  })

  /** Helper: set up globalThis.fetch to return a mock response. */
  function mockFetch(status: number, body: unknown): void {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: async () => bodyText,
      headers: new Headers()
    } as Response)
  }

  it('makes a POST to /api/v2/reimport-scan/ on success', async () => {
    mockFetch(201, {
      test: 1,
      new_findings: 3,
      closed_findings: 1,
      reactivated_findings: 0,
      untouched_findings: 5
    })
    const config = makeConfig({ jsonFile: tmpJsonFile })

    await defectdojo.upload(config)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://dd.example.com/api/v2/reimport-scan/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Token test-api-key'
        })
      })
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('new: 3, closed: 1, reactivated: 0, untouched: 5')
    )
    expect(core.warning).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('includes correct form fields in the multipart request', async () => {
    let capturedBody: FormData | undefined
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        capturedBody = init?.body as FormData
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          text: async () => JSON.stringify({ new_findings: 0 }),
          headers: new Headers()
        } as Response
      })
    const config = makeConfig({ jsonFile: tmpJsonFile })

    await defectdojo.upload(config)

    expect(capturedBody).toBeDefined()
    // Verify the critical fields are present.
    expect(capturedBody!.get('scan_type')).toBe('Semgrep JSON Report')
    expect(capturedBody!.get('product_name')).toBe('owner/repo')
    expect(capturedBody!.get('product_type_name')).toBe('TestOrg')
    expect(capturedBody!.get('engagement_name')).toBe('GitHub Actions')
    expect(capturedBody!.get('test_title')).toBe('Semgrep')
    expect(capturedBody!.get('scan_date')).toBe('2026-10-01')
    expect(capturedBody!.get('close_old_findings')).toBe('true')
    expect(capturedBody!.get('auto_create_context')).toBe('true')
    expect(capturedBody!.get('verified')).toBe('false')
    expect(capturedBody!.get('active')).toBe('true')
    expect(capturedBody!.get('branch_tag')).toBe('main')
    expect(capturedBody!.get('commit_hash')).toBe('abc123')
    expect(capturedBody!.get('build_id')).toBe('999')
    expect(capturedBody!.get('source_code_management_uri')).toBe(
      'https://github.com/owner/repo'
    )
  })

  it('omits product_type_name from form when productTypeName is empty', async () => {
    let capturedBody: FormData | undefined
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        capturedBody = init?.body as FormData
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          text: async () => JSON.stringify({ new_findings: 0 }),
          headers: new Headers()
        } as Response
      })
    const config = makeConfig({ jsonFile: tmpJsonFile, productTypeName: '' })

    await defectdojo.upload(config)

    expect(capturedBody).toBeDefined()
    expect(capturedBody!.get('product_type_name')).toBeNull()
  })

  it('warns (and does not fail) on HTTP 401 when onError is warn', async () => {
    mockFetch(401, { detail: 'Invalid token.' })
    const config = makeConfig({ jsonFile: tmpJsonFile, onError: 'warn' })

    await defectdojo.upload(config)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 401')
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('calls setFailed on HTTP 401 when onError is fail', async () => {
    mockFetch(401, { detail: 'Invalid token.' })
    const config = makeConfig({ jsonFile: tmpJsonFile, onError: 'fail' })

    await defectdojo.upload(config)

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 401')
    )
  })

  it('warns on HTTP 4xx (bad payload) when onError is warn', async () => {
    mockFetch(400, { scan_type: ['This field is required.'] })
    const config = makeConfig({ jsonFile: tmpJsonFile, onError: 'warn' })

    await defectdojo.upload(config)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 400')
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('warns on HTTP 5xx (server error) when onError is warn', async () => {
    mockFetch(500, 'Internal Server Error')
    const config = makeConfig({ jsonFile: tmpJsonFile, onError: 'warn' })

    await defectdojo.upload(config)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 500')
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('warns on network failure (fetch throws) when onError is warn', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))
    const config = makeConfig({ jsonFile: tmpJsonFile, onError: 'warn' })

    await defectdojo.upload(config)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Network error')
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('calls setFailed on network failure when onError is fail', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))
    const config = makeConfig({ jsonFile: tmpJsonFile, onError: 'fail' })

    await defectdojo.upload(config)

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Network error')
    )
  })

  it('does not include branch_tag when branch is empty', async () => {
    let capturedBody: FormData | undefined
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        capturedBody = init?.body as FormData
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          text: async () => JSON.stringify({}),
          headers: new Headers()
        } as Response
      })
    const config = makeConfig({ jsonFile: tmpJsonFile, branch: '' })

    await defectdojo.upload(config)

    expect(capturedBody!.get('branch_tag')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: normalizeUrl
// ---------------------------------------------------------------------------

describe('normalizeUrl', () => {
  it('joins base without trailing slash', () => {
    expect(
      defectdojo.normalizeUrl('https://dd.example.com', '/api/v2/test/')
    ).toBe('https://dd.example.com/api/v2/test/')
  })

  it('strips trailing slash from base before joining', () => {
    expect(
      defectdojo.normalizeUrl('https://dd.example.com/', '/api/v2/test/')
    ).toBe('https://dd.example.com/api/v2/test/')
  })
})

// ---------------------------------------------------------------------------
// Tests: parseImportStats
// ---------------------------------------------------------------------------

describe('parseImportStats', () => {
  it('parses a complete response correctly', () => {
    const body = JSON.stringify({
      test: 42,
      new_findings: 5,
      closed_findings: 2,
      reactivated_findings: 1,
      untouched_findings: 10
    })
    const stats = defectdojo.parseImportStats(body)
    expect(stats).toEqual({
      newFindings: 5,
      closedFindings: 2,
      reactivatedFindings: 1,
      untouchedFindings: 10
    })
  })

  it('returns zeros for a non-JSON body', () => {
    const stats = defectdojo.parseImportStats('not json')
    expect(stats).toEqual({
      newFindings: 0,
      closedFindings: 0,
      reactivatedFindings: 0,
      untouchedFindings: 0
    })
  })

  it('returns zeros for missing fields', () => {
    const stats = defectdojo.parseImportStats(JSON.stringify({ test: 1 }))
    expect(stats).toEqual({
      newFindings: 0,
      closedFindings: 0,
      reactivatedFindings: 0,
      untouchedFindings: 0
    })
  })

  it('handles string-valued fields gracefully', () => {
    const body = JSON.stringify({
      new_findings: '3',
      closed_findings: '0',
      reactivated_findings: '0',
      untouched_findings: '7'
    })
    const stats = defectdojo.parseImportStats(body)
    expect(stats).toEqual({
      newFindings: 3,
      closedFindings: 0,
      reactivatedFindings: 0,
      untouchedFindings: 7
    })
  })
})
