import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import * as path from 'path'
import { uploadVulnScansToGHAS } from './internal/advancedSecurity.js'

/**
 * Supported install types.
 *
 * Bin: A binary executable that is compiled and directly executable.
 * Pip: A Python package (ex. package.tar.gz) that can be installed via pip.
 */
export enum InstallType {
  Bin = 'bin',
  Pip = 'pip'
}

/**
 * Interface for a scanner (static code analysis tool).
 */
export interface Scanner {
  command: string
  args: string[]
  url: string
  version: string
  installType: InstallType
}

/**
 * Download and install a scanner if it is not already installed.
 *
 * @param scanner Scanner to be installed.
 * @returns `Promise` that resolves when the operation is complete.
 * @throws `Error` if the install type is unsupported.
 */
export async function install(scanner: Scanner): Promise<void> {
  // Check if the scanner exists on path.
  const toolPath = await io.which(scanner.command, false)
  if (toolPath) {
    core.info(`Scanner ${scanner.command} found at ${toolPath}`)
    return
  }

  // Check if the scanner exists in the tool cache.
  const cachedToolPath = tc.find(scanner.command, scanner.version)
  if (cachedToolPath) {
    core.addPath(cachedToolPath)
    core.info(
      `Scanner ${scanner.command} found in tool cache at ${cachedToolPath}`
    )
    return
  }

  // If the scanner is not found, download it using its URL.
  //
  // The file is downloaded to the /tmp directory and given a filename that
  // preserves the file extension, which is used when extracting its contents.
  core.info(
    `Scanner ${scanner.command} not found, downloading from ${scanner.url}`
  )
  // Extract everything after the last '/'.
  const filename = scanner.url.substring(scanner.url.lastIndexOf('/') + 1)
  const destPath = path.join('/tmp', `${scanner.command}-${filename}`)
  const downloadPath = await tc.downloadTool(scanner.url, destPath)

  // Install scanner.
  if (scanner.installType === InstallType.Bin) {
    await installBin(downloadPath, scanner.command, scanner.version)
  } else if (scanner.installType === InstallType.Pip) {
    await installPip(downloadPath, scanner.command)
  } else {
    throw new Error(`Unsupported install type for ${scanner.installType}`)
  }
}

/**
 * Install a scanner (binary) by extracting it and adding it to the tool cache.
 * The binary is made directly executable by adding the path to the cache dir
 * to the PATH environment variable:
 *
 *   /opt/hostedtoolcache/<tool>/<version>/x64/<tool>
 *
 * @param file Path to the file to install.
 * @param tool Name of the tool to install.
 * @param version Version of the tool to install.
 * @returns `Promise` that resolves when the operation is complete.
 */
export async function installBin(
  file: string,
  tool: string,
  version: string
): Promise<void> {
  core.info(`Installing ${tool} ${version} from ${file}`)
  const extractedPath = await extract(file)
  const cachedDir = await tc.cacheDir(extractedPath, tool, version)
  core.addPath(cachedDir)
  core.info(`${tool} installed and cached at ${cachedDir}`)
}

/**
 * Install a scanner (Python package) by installing it via pip and adding it to
 * the tool cache. The Python package is installed under the Python
 * installation:
 *
 *   /opt/hostedtoolcache/Python/<version>/x64/bin/<tool>
 *
 * The binary is made directly executable by adding the path to the Python
 * cache dir to the PATH environment variable.
 *
 * @param file Path to the file to install.
 * @param tool Name of the tool to install.
 * @returns `Promise` that resolves when the operation is complete.
 * @throws `Error` if the install fails.
 */
export async function installPip(file: string, tool: string): Promise<void> {
  core.info(`Installing ${tool} from ${file}`)
  // Get the path to the Python installation from the tool cache.
  const cachedPythonPath = tc.find('Python', '3', 'x64')
  if (!cachedPythonPath) {
    throw new Error(`Python not found in tool cache`)
  }
  core.info(`Python found in tool cache at ${cachedPythonPath}`)
  core.addPath(`${cachedPythonPath}/bin`)
  // Ensure pip3 is installed.
  const cachedPipPath = await io.which(`${cachedPythonPath}/bin/pip3`, false)
  if (!cachedPipPath) {
    throw new Error(`pip3 not found in tool cache`)
  }
  core.info(`pip3 found in tool cache at ${cachedPipPath}`)
  try {
    await exec.exec(cachedPipPath, ['install', '-qqq', file])
    core.info(`Successfully installed ${tool}`)
  } catch (error) {
    throw new Error(
      `Failed to install ${tool}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  // Ensure the scanner exists and is available via the PATH environment
  // variable after installation.
  const cachedToolPath = await io.which(tool, false)
  if (!cachedToolPath) {
    throw new Error(`${tool} not found in tool cache after installation`)
  }
  core.info(`${tool} found in tool cache at ${cachedToolPath}`)
}

/**
 * Extract a file. Supported types include: 7z, tar, and zip
 *
 * @param file Path to the file to extract.
 * @returns Path to the destination directory.
 * @throws `Error` if the file extension is unsupported.
 */
async function extract(file: string): Promise<string> {
  const filename = path.basename(file)

  if (filename.endsWith('.7z')) {
    return await tc.extract7z(file)
  } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
    return await tc.extractTar(file)
  } else if (filename.endsWith('.zip')) {
    return await tc.extractZip(file)
  } else {
    throw new Error(`Unsupported file extension for ${filename}`)
  }
}

/**
 * Install and run the scanner.
 *
 * @param scanner Scanner to be run.
 * @returns `Promise` that resolves when the operation is complete.
 * @throws `Error` if the scanner fails.
 */
export async function run(scanner: Scanner): Promise<void> {
  await install(scanner)

  try {
    core.info(`Running scanner`)
    core.info(`${scanner.command} ${scanner.args.join(' ')}`)
    const exitCode = await exec.exec(scanner.command, scanner.args)
    if (exitCode !== 0) {
      throw new Error(`Scanner ${scanner.command} exited with code ${exitCode}`)
    }
  } catch (error) {
    throw new Error(
      `Failed to run scanner ${scanner.command}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  core.setOutput(
    'sarif-id',
    await uploadVulnScansToGHAS(
      'semgrep.sarif',
      'semgrep',
      core.getInput('github-token', { required: true })
    )
  )
}
