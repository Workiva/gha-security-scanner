import { jest } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Modules to be mocked
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

// Modules under test
const defectdojo = await import('../src/defectdojo.js')
const inputs = await import('../src/inputs.js')

describe('Multi-Repository Auto Asset Creation', () => {
  let tmpJsonFile: string
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    core.getInput.mockReturnValue('')
    process.env = { ...originalEnv }
    const dir = os.tmpdir()
    tmpJsonFile = path.join(dir, `semgrep-test-${Date.now()}.json`)
    fs.writeFileSync(
      tmpJsonFile,
      JSON.stringify({
        version: '1.149.0',
        results: [],
        errors: [],
        paths: { scanned: [] }
      })
    )
  })

  afterEach(() => {
    process.env = originalEnv
    if (fs.existsSync(tmpJsonFile)) {
      fs.unlinkSync(tmpJsonFile)
    }
  })

  it('dynamically maps and uploads for two separate repositories without hardcoding', async () => {
    const capturedRequests: { url: string; body: FormData }[] = []

    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        capturedRequests.push({
          url: String(url),
          body: init?.body as FormData
        })
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          text: async () => JSON.stringify({ test: 101, new_findings: 1 }),
          headers: new Headers()
        } as Response
      })

    // Simulate Repository 1: sample-repo-auth-service
    process.env.GITHUB_REPOSITORY = 'Workiva/sample-repo-auth-service'
    process.env.GITHUB_REPOSITORY_OWNER = 'Workiva'

    const repo1Inputs = inputs.getDefectDojoInputs()
    expect(repo1Inputs.productName).toBe('sample-repo-auth-service')
    expect(repo1Inputs.productTypeName).toBe('Workiva')

    await defectdojo.upload({
      url: 'https://defectdojo.example.com',
      token: 'test-token',
      productName: repo1Inputs.productName,
      productTypeName: repo1Inputs.productTypeName,
      engagementName: 'Semgrep CI',
      testTitle: 'Semgrep',
      jsonFile: tmpJsonFile,
      scanDate: '2026-10-07',
      branch: 'main',
      commitHash: 'sha-repo-1',
      buildId: '101',
      sourceCodeManagementUri:
        'https://github.com/Workiva/sample-repo-auth-service',
      closeOldFindings: true,
      onError: 'warn'
    })

    // Simulate Repository 2: sample-repo-payment-service
    process.env.GITHUB_REPOSITORY = 'Workiva/sample-repo-payment-service'
    process.env.GITHUB_REPOSITORY_OWNER = 'Workiva'

    const repo2Inputs = inputs.getDefectDojoInputs()
    expect(repo2Inputs.productName).toBe('sample-repo-payment-service')
    expect(repo2Inputs.productTypeName).toBe('Workiva')

    await defectdojo.upload({
      url: 'https://defectdojo.example.com',
      token: 'test-token',
      productName: repo2Inputs.productName,
      productTypeName: repo2Inputs.productTypeName,
      engagementName: 'Semgrep CI',
      testTitle: 'Semgrep',
      jsonFile: tmpJsonFile,
      scanDate: '2026-10-07',
      branch: 'main',
      commitHash: 'sha-repo-2',
      buildId: '102',
      sourceCodeManagementUri:
        'https://github.com/Workiva/sample-repo-payment-service',
      closeOldFindings: true,
      onError: 'warn'
    })

    // Assert that two independent uploads were made to DefectDojo
    expect(capturedRequests).toHaveLength(2)

    // Verify Repository 1 payload
    const form1 = capturedRequests[0].body
    expect(form1.get('scan_type')).toBe('Semgrep JSON Report')
    expect(form1.get('product_name')).toBe('sample-repo-auth-service')
    expect(form1.get('product_type_name')).toBe('Workiva')
    expect(form1.get('engagement_name')).toBe('Semgrep CI')
    expect(form1.get('auto_create_context')).toBe('true')
    expect(form1.get('commit_hash')).toBe('sha-repo-1')

    // Verify Repository 2 payload
    const form2 = capturedRequests[1].body
    expect(form2.get('scan_type')).toBe('Semgrep JSON Report')
    expect(form2.get('product_name')).toBe('sample-repo-payment-service')
    expect(form2.get('product_type_name')).toBe('Workiva')
    expect(form2.get('engagement_name')).toBe('Semgrep CI')
    expect(form2.get('auto_create_context')).toBe('true')
    expect(form2.get('commit_hash')).toBe('sha-repo-2')
  })
})
