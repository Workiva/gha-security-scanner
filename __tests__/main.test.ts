// Modules used.
import { jest } from '@jest/globals'
import fs from 'fs'

// Modules to be mocked.
import * as core from '../__fixtures__/core.js'
import * as inputs from '../__fixtures__/inputs.js'
import * as scanner from '../__fixtures__/scanner.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/inputs', () => inputs)
jest.unstable_mockModule('../src/scanner', () => scanner)

// Modules under test.
const main = await import('../src/main.js')

describe('main', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should run semgrep scanner when input is semgrep', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    scanner.run.mockResolvedValue(undefined)

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).toHaveBeenCalledWith({
      command: 'semgrep',
      args: [
        '--quiet',
        '--config',
        'auto',
        '--sarif',
        '--sarif-output',
        'semgrep.sarif',
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
        'generic.secrets.security.detected-private-key.detected-private-key'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.140.0.tar.gz',
      version: 'v1.140.0',
      installType: scanner.InstallType.Pip
    })
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should call `core.setFailed` with error message when input is not supported', async () => {
    inputs.getScannerInput.mockReturnValue('unsupported-scanner')

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'unsupported-scanner is not supported'
    )
  })

  it('should call `core.setFailed` with error message when `scanner.run` throws an Error', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    const errorMessage = 'An error occurred'
    scanner.run.mockRejectedValue(new Error(errorMessage))

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).toHaveBeenCalledWith({
      command: 'semgrep',
      args: [
        '--quiet',
        '--config',
        'auto',
        '--sarif',
        '--sarif-output',
        'semgrep.sarif',
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
        'generic.secrets.security.detected-private-key.detected-private-key'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.140.0.tar.gz',
      version: 'v1.140.0',
      installType: scanner.InstallType.Pip
    })
    expect(core.setFailed).toHaveBeenCalledWith(errorMessage)
  })

  it('should call `core.setFailed` with stringified error when `scanner.run` throws a non-Error', async () => {
    inputs.getScannerInput.mockReturnValue('semgrep')
    const errorMessage = 'An error occurred'
    scanner.run.mockRejectedValue(new Error(errorMessage))

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).toHaveBeenCalledWith({
      command: 'semgrep',
      args: [
        '--quiet',
        '--config',
        'auto',
        '--sarif',
        '--sarif-output',
        'semgrep.sarif',
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
        'generic.secrets.security.detected-private-key.detected-private-key'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.140.0.tar.gz',
      version: 'v1.140.0',
      installType: scanner.InstallType.Pip
    })
    expect(core.setFailed).toHaveBeenCalledWith(errorMessage)
  })

  it('should generate .semgrepignore if it does not exist', async () => {
    // Make a broken symlink
    fs.symlinkSync('does-not-exist.txt', 'test-broken-symlink.txt')

    await main.run()

    // Expect that the .semgrepignore file contains the exclude entry from aviary.yaml
    const ignore = fs.readFileSync('.semgrepignore', 'utf8').split('\n')
    expect(ignore).toContain('__tests__/')

    // Clean up broken symlink
    fs.unlinkSync('test-broken-symlink.txt')
  })
})
