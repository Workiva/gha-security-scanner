import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

// Module under test.
const inputs = await import('../src/inputs.js')

describe('inputs', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  // ---------------------------------------------------------------------------
  // getScannerInput
  // ---------------------------------------------------------------------------

  describe('getScannerInput', () => {
    it('should return the provided valid scanner input', () => {
      core.getInput.mockImplementation(() => 'semgrep')

      const scanner = inputs.getScannerInput()
      expect(scanner).toBe('semgrep')
    })

    it('should throw an error for an invalid scanner input', () => {
      core.getInput.mockImplementation(() => 'invalid-scanner')

      expect(() => inputs.getScannerInput()).toThrow(
        'Invalid scanner: invalid-scanner. Valid options are: semgrep'
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        'Invalid scanner: invalid-scanner. Valid options are: semgrep'
      )
    })

    it('should handle case insensitive input', () => {
      core.getInput.mockImplementation(() => 'SEMGREP')

      const scanner = inputs.getScannerInput()
      expect(scanner).toBe('semgrep')
    })
  })

  // ---------------------------------------------------------------------------
  // getRepoName
  // ---------------------------------------------------------------------------

  describe('getRepoName', () => {
    it('extracts repo name from "owner/repo"', () => {
      expect(inputs.getRepoName('Workiva/xyz')).toBe('xyz')
    })

    it('returns standalone name if no slash is present', () => {
      expect(inputs.getRepoName('xyz')).toBe('xyz')
    })

    it('extracts last segment if multiple slashes are present', () => {
      expect(inputs.getRepoName('org/team/project')).toBe('project')
    })

    it('returns empty string when input is undefined or empty', () => {
      expect(inputs.getRepoName(undefined)).toBe('')
      expect(inputs.getRepoName('')).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // getRepoOwner
  // ---------------------------------------------------------------------------

  describe('getRepoOwner', () => {
    it('prefers githubRepositoryOwner when provided', () => {
      expect(inputs.getRepoOwner('owner/repo', 'TargetOrg')).toBe('TargetOrg')
    })

    it('falls back to owner segment of githubRepository', () => {
      expect(inputs.getRepoOwner('Workiva/xyz', undefined)).toBe('Workiva')
    })

    it('returns empty string when no owner can be determined', () => {
      expect(inputs.getRepoOwner('xyz', undefined)).toBe('')
      expect(inputs.getRepoOwner(undefined, undefined)).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // getDefectDojoInputs
  // ---------------------------------------------------------------------------

  describe('getDefectDojoInputs', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('returns all provided values when explicitly set via inputs', () => {
      process.env.GITHUB_REPOSITORY = 'Workiva/xyz'

      core.getInput.mockImplementation((name: string) => {
        const map: Record<string, string> = {
          'dd-url': 'https://dd.example.com',
          'dd-api-key': 'my-api-key',
          'dd-org-name': 'My Org',
          'dd-engagement-name': 'My Engagement',
          'dd-close-old-findings': 'true',
          'dd-on-error': 'fail'
        }
        return map[name] ?? ''
      })

      const result = inputs.getDefectDojoInputs()

      expect(result.url).toBe('https://dd.example.com')
      expect(result.apiKey).toBe('my-api-key')
      expect(result.productName).toBe('xyz')
      expect(result.productTypeName).toBe('My Org')
      expect(result.engagementName).toBe('My Engagement')
      expect(result.closeOldFindings).toBe(true)
      expect(result.onError).toBe('fail')
    })

    it('sets productName to the repo name extracted from GITHUB_REPOSITORY', () => {
      process.env.GITHUB_REPOSITORY = 'Workiva/xyz'
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.productName).toBe('xyz')
    })

    it('defaults productTypeName to GITHUB_REPOSITORY_OWNER when not provided and no secret set', () => {
      process.env.GITHUB_REPOSITORY = 'Workiva/xyz'
      process.env.GITHUB_REPOSITORY_OWNER = 'Workiva'
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.productTypeName).toBe('Workiva')
    })

    it('defaults productTypeName to owner segment of GITHUB_REPOSITORY when GITHUB_REPOSITORY_OWNER is unset', () => {
      process.env.GITHUB_REPOSITORY = 'CustomOrg/xyz'
      delete process.env.GITHUB_REPOSITORY_OWNER
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.productTypeName).toBe('CustomOrg')
    })

    it('defaults engagementName to "GitHub Actions" when not provided', () => {
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.engagementName).toBe('GitHub Actions')
    })

    it('defaults closeOldFindings to true when not provided', () => {
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.closeOldFindings).toBe(true)
    })

    it('sets closeOldFindings to false when input is "false"', () => {
      core.getInput.mockImplementation((name: string) =>
        name === 'dd-close-old-findings' ? 'false' : ''
      )

      const result = inputs.getDefectDojoInputs()

      expect(result.closeOldFindings).toBe(false)
    })

    it('defaults onError to "warn" when not provided', () => {
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.onError).toBe('warn')
    })

    it('sets onError to "warn" for unrecognised values', () => {
      core.getInput.mockImplementation((name: string) =>
        name === 'dd-on-error' ? 'unknown-value' : ''
      )

      const result = inputs.getDefectDojoInputs()

      expect(result.onError).toBe('warn')
    })

    it('returns empty url and apiKey when DD secrets are not configured', () => {
      core.getInput.mockReturnValue('')

      const result = inputs.getDefectDojoInputs()

      expect(result.url).toBe('')
      expect(result.apiKey).toBe('')
    })

    it('always uses the repo name as productName, ignoring any dd-product-name input', () => {
      process.env.GITHUB_REPOSITORY = 'Workiva/test-repo'
      core.getInput.mockImplementation((name: string) =>
        name === 'dd-product-name' ? 'custom-product' : ''
      )

      const result = inputs.getDefectDojoInputs()

      expect(result.productName).toBe('test-repo')
    })

    it('does NOT read URL, API key, or org name from environment variables', () => {
      core.getInput.mockReturnValue('')
      process.env.GITHUB_REPOSITORY = 'Workiva/xyz'
      process.env.DEFECTDOJO_URL = 'https://env.example.com'
      process.env.DEFECTDOJO_API_KEY = 'env-key'
      process.env.DEFECTDOJO_ORG_NAME = 'Env-Org'

      const result = inputs.getDefectDojoInputs()

      expect(result.url).toBe('')
      expect(result.apiKey).toBe('')
      expect(result.productTypeName).toBe('Workiva')
    })
  })
})
