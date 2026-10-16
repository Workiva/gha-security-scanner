// Modules used.
import { jest } from '@jest/globals'
import fs from 'fs'

// Modules to be mocked.
import * as core from '../__fixtures__/core.js'
import * as defectdojo from '../__fixtures__/defectdojo.js'
import * as inputs from '../__fixtures__/inputs.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/defectdojo', () => defectdojo)
jest.unstable_mockModule('../src/inputs', () => inputs)

// Module under test.
const defectdojoMain = await import('../src/defectdojo-main.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ddInputsEnabled = {
  url: 'https://dd.example.com',
  apiKey: 'test-api-key',
  productName: 'my-repo',
  productTypeName: 'owner',
  engagementName: 'GitHub Actions',
  closeOldFindings: true,
  onError: 'warn' as const
}

const ddInputsDisabled = {
  url: '',
  apiKey: '',
  productName: '',
  productTypeName: '',
  engagementName: 'GitHub Actions',
  closeOldFindings: true,
  onError: 'warn' as const
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('defectdojo-main', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    // Ensure semgrep.json exists for tests that expect it
    if (!fs.existsSync('semgrep.json')) {
      fs.writeFileSync('semgrep.json', '{}')
    }
  })

  afterEach(() => {
    if (fs.existsSync('semgrep.json')) {
      fs.unlinkSync('semgrep.json')
    }
  })

  it('should call defectdojo.upload when DD URL is provided and semgrep.json exists', async () => {
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsEnabled)
    defectdojo.upload.mockResolvedValue(undefined)

    await defectdojoMain.run()

    expect(defectdojo.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://dd.example.com',
        apiKey: 'test-api-key',
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
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsDisabled)

    await defectdojoMain.run()

    expect(defectdojo.upload).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'DefectDojo URL not configured (dd-url is empty); skipping DefectDojo upload.'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should NOT call defectdojo.upload when semgrep.json does not exist', async () => {
    if (fs.existsSync('semgrep.json')) {
      fs.unlinkSync('semgrep.json')
    }
    inputs.getDefectDojoInputs.mockReturnValue(ddInputsEnabled)

    await defectdojoMain.run()

    expect(defectdojo.upload).not.toHaveBeenCalled()
    expect(core.warning).toHaveBeenCalledWith(
      "Semgrep JSON file 'semgrep.json' not found; skipping DefectDojo upload."
    )
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

    inputs.getDefectDojoInputs.mockReturnValue(ddInputsEnabled)
    defectdojo.upload.mockResolvedValue(undefined)

    await defectdojoMain.run()

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
