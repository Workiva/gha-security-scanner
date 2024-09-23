import * as core from '@actions/core'

import * as inputs from './inputs'
import * as scanner from './scanner'

/**
 * Main function for the action. Runs scanner based on inputs.
 *
 * @returns `Promise` that resolves when the operation is complete.
 */
export async function run(): Promise<void> {
  const scannerInput = inputs.getScannerInput()

  let scannerInstance: scanner.Scanner
  if (scannerInput === 'semgrep') {
    scannerInstance = {
      command: 'semgrep',
      args: ['--quiet', '--config', 'auto', '--sarif', '--sarif-output', 'semgrep.sarif', '--output', '/dev/null'],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
      version: 'v1.84.1',
      installType: scanner.InstallType.Pip,
      ignoreFile: '.semgrepignore'
    }
  } else {
    core.setFailed(`${scannerInput} is not supported`)
    return
  }

  try {
    await scanner.run(scannerInstance)
  } catch (error) {
    core.setFailed(`${error instanceof Error ? error.message : String(error)}`)
  }
}
