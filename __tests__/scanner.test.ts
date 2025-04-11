// Module under test.
import * as scanner from '../src/scanner'

// Modules to be mocked.
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'

jest.mock('@actions/core')
jest.mock('@actions/exec')
jest.mock('@actions/io')
jest.mock('@actions/tool-cache')

describe('install', () => {
  let mockWhich: jest.Mock
  let mockFind: jest.Mock
  let mockDownloadTool: jest.Mock
  let mockExtractTar: jest.Mock
  let mockCacheDir: jest.Mock
  let mockExec: jest.Mock

  const someScanner: scanner.Scanner = {
    command: 'some-scanner',
    args: [],
    url: 'https://github.com/BigScanner/some-scanner/archive/refs/tags/v1.0.0.tar.gz',
    version: 'v1.0.0',
    installType: scanner.InstallType.Bin
  }

  const semgrep: scanner.Scanner = {
    command: 'semgrep',
    args: [],
    url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
    version: 'v1.84.1',
    installType: scanner.InstallType.Pip
  }

  const unsupportedScanner: scanner.Scanner = {
    command: 'unsupported-scanner',
    args: [],
    url: 'https://github.com/BigScanner/unsupported-scanner/archive/refs/tags/v1.0.0.tar.gz',
    version: 'v1.0.0',
    installType: 'unsupported' as scanner.InstallType
  }

  beforeEach(() => {
    jest.resetAllMocks()
    mockWhich = io.which as jest.Mock
    mockFind = tc.find as jest.Mock
    mockDownloadTool = tc.downloadTool as jest.Mock
    mockExtractTar = tc.extractTar as jest.Mock
    mockCacheDir = tc.cacheDir as jest.Mock
    mockExec = exec.exec as jest.Mock
  })

  it('should find the scanner on PATH and not install', async () => {
    mockWhich.mockResolvedValue(`/usr/local/bin/${someScanner.command}`)

    await scanner.install(someScanner)

    expect(io.which).toHaveBeenCalledWith(someScanner.command, false)
    expect(core.info).toHaveBeenCalledWith(
      `Scanner ${someScanner.command} found at /usr/local/bin/${someScanner.command}`
    )
    expect(tc.find).not.toHaveBeenCalled()
    expect(tc.downloadTool).not.toHaveBeenCalled()
  })

  it('should find the scanner in tool cache and not install', async () => {
    mockWhich.mockResolvedValue(null)
    mockFind.mockReturnValue(
      `/cache/${someScanner.command}/${someScanner.version}`
    )

    await scanner.install(someScanner)

    expect(io.which).toHaveBeenCalledWith(someScanner.command, false)
    expect(tc.find).toHaveBeenCalledWith(
      someScanner.command,
      someScanner.version
    )
    expect(core.addPath).toHaveBeenCalledWith(
      `/cache/${someScanner.command}/${someScanner.version}`
    )
    expect(core.info).toHaveBeenCalledWith(
      `Scanner ${someScanner.command} found in tool cache at /cache/${someScanner.command}/${someScanner.version}`
    )
    expect(tc.downloadTool).not.toHaveBeenCalled()
  })

  it('should download and install the scanner (binary) when not found on PATH or in tool cache', async () => {
    mockWhich.mockResolvedValue(null)
    mockFind.mockReturnValue(null)
    mockDownloadTool.mockResolvedValue(
      `/tmp/${someScanner.command}-${someScanner.version}.tar.gz`
    )
    mockExtractTar.mockResolvedValue(`/tmp/${someScanner.command}`)
    mockCacheDir.mockResolvedValue(
      `/cache/${someScanner.command}/${someScanner.version}`
    )

    await scanner.install(someScanner)

    expect(io.which).toHaveBeenCalledWith(someScanner.command, false)
    expect(tc.find).toHaveBeenCalledWith(
      someScanner.command,
      someScanner.version
    )
    expect(core.info).toHaveBeenCalledWith(
      `Scanner ${someScanner.command} not found, downloading from ${someScanner.url}`
    )
    expect(tc.downloadTool).toHaveBeenCalledWith(
      someScanner.url,
      expect.stringContaining(
        `/tmp/${someScanner.command}-${someScanner.version}.tar.gz`
      )
    )
    expect(core.info).toHaveBeenCalledWith(
      `Installing ${someScanner.command} ${someScanner.version} from /tmp/${someScanner.command}-${someScanner.version}.tar.gz`
    )
    expect(tc.extractTar).toHaveBeenCalledWith(
      `/tmp/${someScanner.command}-${someScanner.version}.tar.gz`
    )
    expect(tc.cacheDir).toHaveBeenCalledWith(
      `/tmp/${someScanner.command}`,
      someScanner.command,
      someScanner.version
    )
    expect(core.addPath).toHaveBeenCalledWith(
      `/cache/${someScanner.command}/${someScanner.version}`
    )
  })

  it('should download and install the scanner (Python package) when not found on PATH or in tool cache', async () => {
    mockWhich.mockResolvedValueOnce(null)
    mockFind.mockReturnValueOnce(null)
    mockDownloadTool.mockResolvedValue(
      `/tmp/${semgrep.command}-${semgrep.version}.tar.gz`
    )
    mockFind.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    mockWhich.mockResolvedValueOnce('/cache/Python/3.12.2/x64/bin/pip3')
    mockExec.mockResolvedValue(0)
    mockWhich.mockResolvedValueOnce(
      `/cache/Python/3.12.2/x64/bin/${semgrep.command}`
    )

    await scanner.install(semgrep)

    expect(io.which).toHaveBeenCalledWith(semgrep.command, false)
    expect(tc.find).toHaveBeenCalledWith(semgrep.command, semgrep.version)
    expect(core.info).toHaveBeenCalledWith(
      `Scanner ${semgrep.command} not found, downloading from ${semgrep.url}`
    )
    expect(tc.downloadTool).toHaveBeenCalledWith(
      semgrep.url,
      expect.stringContaining(
        `/tmp/${semgrep.command}-${semgrep.version}.tar.gz`
      )
    )
    expect(core.info).toHaveBeenCalledWith(
      `Installing ${semgrep.command} from /tmp/${semgrep.command}-${semgrep.version}.tar.gz`
    )
    expect(tc.find).toHaveBeenCalledWith('Python', '3', 'x64')
    expect(core.info).toHaveBeenCalledWith(
      'Python found in tool cache at /cache/Python/3.12.2/x64'
    )
    expect(core.addPath).toHaveBeenCalledWith('/cache/Python/3.12.2/x64/bin')
    expect(io.which).toHaveBeenCalledWith(
      '/cache/Python/3.12.2/x64/bin/pip3',
      false
    )
    expect(core.info).toHaveBeenCalledWith(
      'pip3 found in tool cache at /cache/Python/3.12.2/x64/bin/pip3'
    )
    expect(exec.exec).toHaveBeenCalledWith(
      '/cache/Python/3.12.2/x64/bin/pip3',
      expect.arrayContaining([
        'install',
        '-qqq',
        `/tmp/${semgrep.command}-${semgrep.version}.tar.gz`
      ])
    )
    expect(core.info).toHaveBeenCalledWith(
      `${semgrep.command} found in tool cache at /cache/Python/3.12.2/x64/bin/${semgrep.command}`
    )
  })

  it('should throw an error when unsupported install type is provided', async () => {
    mockWhich.mockResolvedValue(null)
    mockFind.mockReturnValue(null)
    mockDownloadTool.mockResolvedValue(
      `/tmp/${unsupportedScanner.command}-${unsupportedScanner.version}.tar.gz`
    )

    await expect(scanner.install(unsupportedScanner)).rejects.toThrow(
      'Unsupported install type for unsupported'
    )
  })
})

describe('installBin', () => {
  let mockExtractTar: jest.Mock
  let mockCacheDir: jest.Mock

  beforeEach(() => {
    jest.resetAllMocks()
    mockExtractTar = tc.extractTar as jest.Mock
    mockCacheDir = tc.cacheDir as jest.Mock
  })

  it('should install a binary scanner', async () => {
    const file = 'file.tar.gz'
    const tool = 'tool'
    const version = 'version'

    mockExtractTar.mockResolvedValue(`directory`)
    mockCacheDir.mockResolvedValue(`/cache/${tool}/${version}`)

    await scanner.installBin(file, tool, version)

    expect(core.info).toHaveBeenCalledWith(
      `Installing ${tool} ${version} from ${file}`
    )
    expect(tc.extractTar).toHaveBeenCalledWith(file)
    expect(tc.cacheDir).toHaveBeenCalledWith('directory', tool, version)
    expect(core.addPath).toHaveBeenCalledWith(`/cache/${tool}/${version}`)
    expect(core.info).toHaveBeenCalledWith(
      `${tool} installed and cached at /cache/${tool}/${version}`
    )
  })
})

describe('installPip', () => {
  let mockWhich: jest.Mock
  let mockFind: jest.Mock
  let mockExec: jest.Mock

  beforeEach(() => {
    jest.resetAllMocks()
    mockWhich = io.which as jest.Mock
    mockFind = tc.find as jest.Mock
    mockExec = exec.exec as jest.Mock
  })

  it('should install a Python package via pip', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    mockFind.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    mockWhich.mockResolvedValueOnce('/cache/Python/3.12.2/x64/bin/pip3')
    mockExec.mockResolvedValue(0)
    mockWhich.mockResolvedValueOnce(`/cache/Python/3.12.2/x64/bin/${tool}`)

    await scanner.installPip(file, tool)

    expect(core.info).toHaveBeenCalledWith(`Installing ${tool} from ${file}`)
    expect(tc.find).toHaveBeenCalledWith('Python', '3', 'x64')
    expect(core.info).toHaveBeenCalledWith(
      'Python found in tool cache at /cache/Python/3.12.2/x64'
    )
    expect(core.addPath).toHaveBeenCalledWith('/cache/Python/3.12.2/x64/bin')
    expect(io.which).toHaveBeenCalledWith(
      '/cache/Python/3.12.2/x64/bin/pip3',
      false
    )
    expect(core.info).toHaveBeenCalledWith(
      'pip3 found in tool cache at /cache/Python/3.12.2/x64/bin/pip3'
    )
    expect(exec.exec).toHaveBeenCalledWith(
      '/cache/Python/3.12.2/x64/bin/pip3',
      expect.arrayContaining(['install', '-qqq', file])
    )
    expect(core.info).toHaveBeenCalledWith(
      `${tool} found in tool cache at /cache/Python/3.12.2/x64/bin/${tool}`
    )
  })

  it('should throw an error if Python is not found in tool cache', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    mockFind.mockReturnValue(null)

    await expect(scanner.installPip(file, tool)).rejects.toThrow(
      'Python not found in tool cache'
    )
  })

  it('should throw an error if pip3 is not found in tool cache', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    mockFind.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    mockWhich.mockResolvedValueOnce(null)

    await expect(scanner.installPip(file, tool)).rejects.toThrow(
      'pip3 not found in tool cache'
    )
  })

  it('should throw an error if pip installation fails', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    mockFind.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    mockWhich.mockResolvedValueOnce('/cache/Python/3.12.2/x64/bin/pip3')
    mockExec.mockRejectedValue(new Error('Installation failed!'))

    await expect(scanner.installPip(file, tool)).rejects.toThrow(
      'Failed to install tool: Installation failed!'
    )
  })
})

describe('run', () => {
  let mockWhich: jest.Mock
  let mockExec: jest.Mock

  const semgrep: scanner.Scanner = {
    command: 'semgrep',
    args: ['--config', 'auto'],
    url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
    version: 'v1.84.1',
    installType: scanner.InstallType.Pip
  }

  beforeEach(() => {
    jest.resetAllMocks()
    mockWhich = io.which as jest.Mock
    mockExec = exec.exec as jest.Mock
  })

  it('should run the scanner successfully', async () => {
    mockWhich.mockResolvedValue(`/usr/local/bin/${semgrep.command}`)
    mockExec.mockResolvedValue(0)

    await scanner.run(semgrep)

    expect(core.info).toHaveBeenCalledWith('Running scanner')
    expect(core.info).toHaveBeenCalledWith(
      `${semgrep.command} ${semgrep.args.join(' ')}`
    )
    expect(exec.exec).toHaveBeenCalledWith(semgrep.command, semgrep.args)
  })

  it('should throw an error if the scanner command returns a non-zero exit code', async () => {
    mockWhich.mockResolvedValue(`/usr/local/bin/${semgrep.command}`)
    mockExec.mockResolvedValue(1)

    await expect(scanner.run(semgrep)).rejects.toThrow(
      `Scanner ${semgrep.command} exited with code 1`
    )
  })

  it('should throw an error if the scanner command fails', async () => {
    mockWhich.mockResolvedValue(`/usr/local/bin/${semgrep.command}`)
    mockExec.mockRejectedValue(new Error('Execution failed!'))

    await expect(scanner.run(semgrep)).rejects.toThrow(
      'Failed to run scanner semgrep: Execution failed!'
    )
  })
})
