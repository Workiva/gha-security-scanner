import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals'

import * as core from '../../__fixtures__/core.js'

const mockUploadSarif = jest.fn<() => Promise<{ data: { id: string } }>>()

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      codeScanning: {
        uploadSarif: mockUploadSarif
      }
    }
  })
}))
jest.unstable_mockModule('fs', () => ({
  promises: {
    readFile: jest.fn<() => Promise<string>>().mockResolvedValue('{"runs":[]}')
  }
}))

const { uploadVulnScansToGHAS } =
  await import('../../src/internal/advancedSecurity.js')

describe('uploadVulnScansToGHAS', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    process.env.GITHUB_REF = 'refs/heads/main'
    process.env.GITHUB_SHA = 'abc123'
    mockUploadSarif.mockResolvedValue({ data: { id: 'sarif-id-123' } })
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_REF
    delete process.env.GITHUB_SHA
  })

  it('should upload a valid SARIF file', async () => {
    const result = await uploadVulnScansToGHAS(
      '/tmp/results.sarif',
      'trivy',
      'fake-token'
    )

    expect(result).toBe('sarif-id-123')
    expect(mockUploadSarif).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner',
        repo: 'repo',
        tool_name: 'trivy',
        ref: 'refs/heads/main',
        commit_sha: 'abc123'
      })
    )

    expect(core.info).toHaveBeenCalledWith(
      '✅ Successfully uploaded SARIF file /tmp/results.sarif.\n' +
        '   API endpoint: https://api.github.com/repos/owner/repo/code-scanning/analyses?sarif_id=sarif-id-123'
    )
  })

  it('should reject non-SARIF files with a warning and error', async () => {
    await expect(
      uploadVulnScansToGHAS('/tmp/results.json', 'trivy', 'fake-token')
    ).rejects.toThrow(
      'Failed to upload SARIF file: /tmp/results.json is not a SARIF file'
    )

    expect(mockUploadSarif).not.toHaveBeenCalled()
    expect(core.warning).toHaveBeenCalledWith(
      'Skipping non-SARIF file: /tmp/results.json'
    )
  })

  it('should throw when SARIF upload returns no ID', async () => {
    mockUploadSarif.mockResolvedValue({ data: { id: '' } } as {
      data: { id: string }
    })

    await expect(
      uploadVulnScansToGHAS('/tmp/results.sarif', 'trivy', 'fake-token')
    ).rejects.toThrow(
      'SARIF upload succeeded but no ID was returned for /tmp/results.sarif'
    )
  })

  it('does not retry on 403 errors', async () => {
    const error = new Error('Forbidden') as Error & { status?: number }
    error.status = 403
    mockUploadSarif.mockRejectedValue(error)

    await expect(
      uploadVulnScansToGHAS('/tmp/results.sarif', 'trivy', 'fake-token')
    ).rejects.toThrow('Forbidden')

    expect(mockUploadSarif).toHaveBeenCalledTimes(1)
  })
})
