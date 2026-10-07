// Modules used.
import { jest } from '@jest/globals'
import fs from 'fs'

// Modules to be mocked.
import * as core from '../__fixtures__/core.js'
import * as defectdojo from '../__fixtures__/defectdojo.js'
import * as inputs from '../__fixtures__/inputs.js'
import * as scanner from '../__fixtures__/scanner.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/defectdojo', () => defectdojo)
jest.unstable_mockModule('../src/inputs', () => inputs)
jest.unstable_mockModule('../src/scanner', () => scanner)

// Modules under test.
const main = await import('../src/main.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal semgrep scanner args (all org-wide exclusions included). */
const expectedSemgrepArgs = [
  '--quiet',
  '--config',
  'auto',
  '--sarif',
  '--sarif-output',
  'semgrep.sarif',
  '--json-output',
  'semgrep.json',
  '--output',
  '/dev/null',
  '--exclude-rule',
  'generic.secrets.security.detected-aws-access-key-id-value.detected-aws-access-key-id-value',
  '--exclude-rule',
  'generic.secrets.security.detected-jwt-token.detected-jwt-token',
  '--exclude-rule',
  'generic.secrets.security.detected-aws-account-id.detected-aws-account-id',
  '--exclude-rule',
  'yaml.docker-compose.security.no-new-privileges.no-new-privileges',
  '--exclude-rule',
  'yaml.docker-compose.security.writable-filesystem-service.writable-filesystem-service',
  '--exclude-rule',
  'yaml.kubernetes.security.run-as-non-root.run-as-non-root',
  '--exclude-rule',
  'yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag',
  '--exclude-rule',
  'package_managers.dependabot.dependabot-missing-cooldown.dependabot-missing-cooldown',
  '--exclude-rule',
  'generic.secrets.security.detected-private-key.detected-private-key',
  '--exclude-rule',
  'package_managers.pnpm.pnpm-block-exotic-sub-dependencies.pnpm-block-exotic-sub-dependencies',
  '--exclude-rule',
  'package_managers.pnpm.pnpm-missing-minimum-release-age.pnpm-minimum-release-age',
  '--exclude-rule',
  'package_managers.pnpm.pnpm-trust-policy.pnpm-trust-policy',
  '--exclude-rule',
  'package_managers.renovate.renovate-missing-minimum-release-age.renovate-missing-minimum-release-age'
]

const expectedScannerCall = {
  command: 'semgrep',
  args: expectedSemgrepArgs,
  url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.149.0.tar.gz',
  version: 'v1.149.0',
  installType: scanner.InstallType.Pip
}

/** Minimal DD inputs with url set (DD enabled). */
const ddInputsEnabled = {
  url: 'https://dd.example.com',
  token: 'test-token',
  productName: 'my-repo',
  productTypeName: 'owner',
  engagementName: 'GitHub Actions',
  closeOldFindings: true,
  onError: 'warn' as const
}

/** Minimal DD inputs with url unset (DD disabled). */
const ddInputsDisabled = {
  url: '',
  token: '',
  productName: '',
  productTypeName: '',
  engagementName: 'GitHub Actions',
  closeOldFindings: true,
  onError: 'warn' as const
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('main', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should run semgrep scanner when input is semgrep', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)
    scanner.run.mockResolvedValue(undefined)

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).toHaveBeenCalledWith(expectedScannerCall)
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should call `core.setFailed` with error message when input is not supported', async () => {
    inputs.getScannerInput.mockReturnValue('unsupported-scanner')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'unsupported-scanner is not supported'
    )
  })

  it('should call `core.setFailed` with error message when `scanner.run` throws an Error', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)
    const errorMessage = 'An error occurred'
    scanner.run.mockRejectedValue(new Error(errorMessage))

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).toHaveBeenCalledWith(expectedScannerCall)
    expect(core.setFailed).toHaveBeenCalledWith(errorMessage)
  })

  it('should call `core.setFailed` with stringified error when `scanner.run` throws a non-Error', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)
    const errorMessage = 'An error occurred'
    scanner.run.mockRejectedValue(new Error(errorMessage))

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).toHaveBeenCalledWith(expectedScannerCall)
    expect(core.setFailed).toHaveBeenCalledWith(errorMessage)
  })

  it('should generate .semgrepignore if it does not exist', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)
    scanner.run.mockResolvedValue(undefined)

    // Make a broken symlink if platform allows
    let symlinkCreated = false
    try {
      fs.symlinkSync('does-not-exist.txt', 'test-broken-symlink.txt')
      symlinkCreated = true
    } catch {
      // On Windows without Developer Mode, creating symlinks throws EPERM
    }

    await main.run()

    // Expect that the .semgrepignore file contains the exclude entry from aviary.yaml
    const ignore = fs.readFileSync('.semgrepignore', 'utf8').split('\n')
    expect(ignore).toContain('__tests__/')

    // Clean up broken symlink
    if (symlinkCreated && fs.existsSync('test-broken-symlink.txt')) {
      fs.unlinkSync('test-broken-symlink.txt')
    }
  })

  // ---------------------------------------------------------------------------
  // DefectDojo integration paths
  // ---------------------------------------------------------------------------

  it('should call defectdojo.upload when DD URL is provided and scanner succeeds', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsEnabled)
    scanner.run.mockResolvedValue(undefined)
    defectdojo.upload.mockResolvedValue(undefined)

    await main.run()

    expect(scanner.run).toHaveBeenCalled()
    expect(defectdojo.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://dd.example.com',
        token: 'test-token',
        productName: 'my-repo',
        productTypeName: 'owner',
        engagementName: 'GitHub Actions',
        testTitle: 'Semgrep',
        jsonFile: 'semgrep.json',
        closeOldFindings: true,
        onError: 'warn'
      })
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should NOT call defectdojo.upload when DD URL is empty', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)
    scanner.run.mockResolvedValue(undefined)

    await main.run()

    expect(defectdojo.upload).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should NOT call defectdojo.upload when scanner.run fails', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsEnabled)
    scanner.run.mockRejectedValue(new Error('Scanner crashed'))

    await main.run()

    expect(defectdojo.upload).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith('Scanner crashed')
  })

  it('should include GitHub environment metadata in the DD upload config', async () => {
    const originalEnv = process.env
    process.env = {
      ...originalEnv,
      GITHUB_REPOSITORY: 'myorg/myrepo',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REF_NAME: 'feature-branch',
      GITHUB_SHA: 'deadbeef1234',
      GITHUB_RUN_ID: '777'
    }

    inputs.getScannerInput.mockReturnValue('semgrep')
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsEnabled)
    scanner.run.mockResolvedValue(undefined)
    defectdojo.upload.mockResolvedValue(undefined)

    await main.run()

    expect(defectdojo.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'feature-branch',
        commitHash: 'deadbeef1234',
        buildId: '777',
        sourceCodeManagementUri: 'https://github.com/myorg/myrepo'
      })
    )

    process.env = originalEnv
  })
})
