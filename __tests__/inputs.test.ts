import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

// Module under test.
const inputs = await import('../src/inputs.js')

describe('inputs', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('`getScannerInput` should return the provided valid scanner input', () => {
    core.getInput.mockImplementation(() => 'semgrep')

    const scanner = inputs.getScannerInput()
    expect(scanner).toBe('semgrep')
  })

  it('`getScannerInput` should throw an error for an invalid scanner input', () => {
    core.getInput.mockImplementation(() => 'invalid-scanner')

    expect(() => inputs.getScannerInput()).toThrow(
      'Invalid scanner: invalid-scanner. Valid options are: semgrep'
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      'Invalid scanner: invalid-scanner. Valid options are: semgrep'
    )
  })

  it('`getScannerInput` should handle case insensitive input', () => {
    core.getInput.mockImplementation(() => 'SEMGREP')

    const scanner = inputs.getScannerInput()
    expect(scanner).toBe('semgrep')
  })
})
