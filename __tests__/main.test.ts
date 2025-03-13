// Module under test.
import * as main from '../src/main'

// Modules used
import fs from 'fs'

// Modules to be mocked.
import * as core from '@actions/core'
import * as inputs from '../src/inputs'
import * as scanner from '../src/scanner'

jest.mock('@actions/core')
jest.mock('../src/inputs')
jest.mock('../src/scanner')

describe('main', () => {
  let mockGetScannerInput: jest.Mock
  let mockRun: jest.Mock
  let mockSetFailed: jest.Mock

  beforeEach(() => {
    jest.resetAllMocks()
    mockGetScannerInput = inputs.getScannerInput as jest.Mock
    mockRun = scanner.run as jest.Mock
    mockSetFailed = core.setFailed as jest.Mock
  })

  it('should run semgrep scanner when input is semgrep', async () => {
    mockGetScannerInput.mockReturnValue('semgrep')
    mockRun.mockResolvedValue(undefined)

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
        '/dev/null'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
      version: 'v1.84.1',
      installType: scanner.InstallType.Pip
    })
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should call `core.setFailed` with error message when input is not supported', async () => {
    mockGetScannerInput.mockReturnValue('unsupported-scanner')

    await main.run()

    expect(inputs.getScannerInput).toHaveBeenCalled()
    expect(scanner.run).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'unsupported-scanner is not supported'
    )
  })

  it('should call `core.setFailed` with error message when `scanner.run` throws an Error', async () => {
    mockGetScannerInput.mockReturnValue('semgrep')
    const errorMessage = 'An error occurred'
    mockRun.mockRejectedValue(new Error(errorMessage))

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
        '/dev/null'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
      version: 'v1.84.1',
      installType: scanner.InstallType.Pip
    })
    expect(core.setFailed).toHaveBeenCalledWith(errorMessage)
  })

  it('should call `core.setFailed` with stringified error when `scanner.run` throws a non-Error', async () => {
    mockGetScannerInput.mockReturnValue('semgrep')
    const errorMessage = 'An error occurred'
    mockRun.mockRejectedValue(new Error(errorMessage))

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
        '/dev/null'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
      version: 'v1.84.1',
      installType: scanner.InstallType.Pip
    })
    expect(mockSetFailed).toHaveBeenCalledWith(errorMessage)
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
