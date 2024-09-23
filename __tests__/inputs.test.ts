// Module under test.
import * as inputs from '../src/inputs'

// Modules to be mocked.
import * as core from '@actions/core'

jest.mock('@actions/core')

describe('inputs', () => {
  let mockGetInput: jest.Mock

  beforeEach(() => {
    jest.resetAllMocks()
    mockGetInput = core.getInput as jest.Mock
  })

  it('`getScannerInput` should return the provided valid scanner input', () => {
    mockGetInput.mockReturnValueOnce('semgrep')

    const scanner = inputs.getScannerInput()
    expect(scanner).toBe('semgrep')
  })

  it('`getScannerInput` should throw an error for an invalid scanner input', () => {
    mockGetInput.mockReturnValueOnce('invalid-scanner')

    expect(() => inputs.getScannerInput()).toThrow('Invalid scanner: invalid-scanner. Valid options are: semgrep')
    expect(core.setFailed).toHaveBeenCalledWith('Invalid scanner: invalid-scanner. Valid options are: semgrep')
  })

  it('`getScannerInput` should handle case insensitive input', () => {
    mockGetInput.mockReturnValueOnce('SEMGREP')

    const scanner = inputs.getScannerInput()
    expect(scanner).toBe('semgrep')
  })
})
