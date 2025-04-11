// Modules used.
import { jest } from '@jest/globals'

// Modules to be mocked.
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'
import * as io from '../__fixtures__/io.js'
import * as tc from '../__fixtures__/tool-cache.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('@actions/io', () => io)
jest.unstable_mockModule('@actions/tool-cache', () => tc)

// Module under test.
const scanner = await import('../src/scanner.js')
import {Scanner, InstallType} from '../src/scanner.js' // Types cannot be dynamically imported

describe('install', () => {
  const someScanner: Scanner = {
    command: 'some-scanner',
    args: [],
    url: 'https://github.com/BigScanner/some-scanner/archive/refs/tags/v1.0.0.tar.gz',
    version: 'v1.0.0',
    installType: scanner.InstallType.Bin
  }

  const semgrep: Scanner = {
    command: 'semgrep',
    args: [],
    url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
    version: 'v1.84.1',
    installType: scanner.InstallType.Pip
  }

  const unsupportedScanner: Scanner = {
    command: 'unsupported-scanner',
    args: [],
    url: 'https://github.com/BigScanner/unsupported-scanner/archive/refs/tags/v1.0.0.tar.gz',
    version: 'v1.0.0',
    installType: 'unsupported' as InstallType
  }

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should find the scanner on PATH and not install', async () => {
    io.which.mockResolvedValue(`/usr/local/bin/${someScanner.command}`)

    await scanner.install(someScanner)

    expect(io.which).toHaveBeenCalledWith(someScanner.command, false)
    expect(core.info).toHaveBeenCalledWith(
      `Scanner ${someScanner.command} found at /usr/local/bin/${someScanner.command}`
    )
    expect(tc.find).not.toHaveBeenCalled()
    expect(tc.downloadTool).not.toHaveBeenCalled()
  })

  it('should find the scanner in tool cache and not install', async () => {
    io.which.mockResolvedValue("")
    tc.find.mockReturnValue(
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
    io.which.mockResolvedValue("")
    tc.find.mockReturnValue("")
    tc.downloadTool.mockResolvedValue(
      `/tmp/${someScanner.command}-${someScanner.version}.tar.gz`
    )
    tc.extractTar.mockResolvedValue(`/tmp/${someScanner.command}`)
    tc.cacheDir.mockResolvedValue(
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
    io.which.mockResolvedValueOnce("")
    tc.find.mockReturnValueOnce("")
    tc.downloadTool.mockResolvedValue(
      `/tmp/${semgrep.command}-${semgrep.version}.tar.gz`
    )
    tc.find.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    io.which.mockResolvedValueOnce('/cache/Python/3.12.2/x64/bin/pip3')
    exec.exec.mockResolvedValue(0)
    io.which.mockResolvedValueOnce(
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
    io.which.mockResolvedValue("")
    tc.find.mockReturnValue("")
    tc.downloadTool.mockResolvedValue(
      `/tmp/${unsupportedScanner.command}-${unsupportedScanner.version}.tar.gz`
    )

    await expect(scanner.install(unsupportedScanner)).rejects.toThrow(
      'Unsupported install type for unsupported'
    )
  })
})

describe('installBin', () => {
  beforeEach(() => {
  })

  it('should install a binary scanner', async () => {
    const file = 'file.tar.gz'
    const tool = 'tool'
    const version = 'version'

    tc.extractTar.mockResolvedValue(`directory`)
    tc.cacheDir.mockResolvedValue(`/cache/${tool}/${version}`)

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
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should install a Python package via pip', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    tc.find.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    io.which.mockResolvedValueOnce('/cache/Python/3.12.2/x64/bin/pip3')
    exec.exec.mockResolvedValue(0)
    io.which.mockResolvedValueOnce(`/cache/Python/3.12.2/x64/bin/${tool}`)

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

    tc.find.mockReturnValue("")

    await expect(scanner.installPip(file, tool)).rejects.toThrow(
      'Python not found in tool cache'
    )
  })

  it('should throw an error if pip3 is not found in tool cache', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    tc.find.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    io.which.mockResolvedValueOnce("")

    await expect(scanner.installPip(file, tool)).rejects.toThrow(
      'pip3 not found in tool cache'
    )
  })

  it('should throw an error if pip installation fails', async () => {
    const file = 'package.tar.gz'
    const tool = 'tool'

    tc.find.mockReturnValueOnce('/cache/Python/3.12.2/x64')
    io.which.mockResolvedValueOnce('/cache/Python/3.12.2/x64/bin/pip3')
    exec.exec.mockRejectedValue(new Error('Installation failed!'))

    await expect(scanner.installPip(file, tool)).rejects.toThrow(
      'Failed to install tool: Installation failed!'
    )
  })
})

describe('run', () => {
  const semgrep: Scanner = {
    command: 'semgrep',
    args: ['--config', 'auto'],
    url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
    version: 'v1.84.1',
    installType: scanner.InstallType.Pip
  }

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should run the scanner successfully', async () => {
    io.which.mockResolvedValue(`/usr/local/bin/${semgrep.command}`)
    exec.exec.mockResolvedValue(0)

    await scanner.run(semgrep)

    expect(core.info).toHaveBeenCalledWith('Running scanner')
    expect(core.info).toHaveBeenCalledWith(
      `${semgrep.command} ${semgrep.args.join(' ')}`
    )
    expect(exec.exec).toHaveBeenCalledWith(semgrep.command, semgrep.args)
  })

  it('should throw an error if the scanner command returns a non-zero exit code', async () => {
    io.which.mockResolvedValue(`/usr/local/bin/${semgrep.command}`)
    exec.exec.mockResolvedValue(1)

    await expect(scanner.run(semgrep)).rejects.toThrow(
      `Scanner ${semgrep.command} exited with code 1`
    )
  })

  it('should throw an error if the scanner command fails', async () => {
    io.which.mockResolvedValue(`/usr/local/bin/${semgrep.command}`)
    exec.exec.mockRejectedValue(new Error('Execution failed!'))

    await expect(scanner.run(semgrep)).rejects.toThrow(
      'Failed to run scanner semgrep: Execution failed!'
    )
  })
})
