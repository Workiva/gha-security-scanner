import * as core from '@actions/core'

const validScanners = ['semgrep']

/**
 * Get and validate the value of the 'scanner' input.
 *
 * @returns Name of the scanner to be used.
 */
export function getScannerInput(): string {
  const scanner = core.getInput('scanner').toLowerCase()

  if (!validScanners.includes(scanner)) {
    const errorMessage = `Invalid scanner: ${scanner}. Valid options are: ${validScanners.join(', ')}`
    core.setFailed(errorMessage)
    throw new Error(errorMessage)
  }

  return scanner
}
