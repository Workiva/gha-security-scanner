import * as core from '@actions/core'
import * as fs from 'fs'
import * as defectdojo from './defectdojo.js'
import * as inputs from './inputs.js'

/**
 * Runs the DefectDojo upload step after GHAS upload.
 *
 * Sourced secrets:
 * - DEFECTDOJO_URL
 * - DEFECTDOJO_API_KEY
 * - DEFECTDOJO_ORG_NAME
 *
 * @returns `Promise` that resolves when the operation is complete.
 */
export async function run(): Promise<void> {
  const ddInputs = inputs.getDefectDojoInputs()

  if (!ddInputs.url) {
    core.info(
      'DefectDojo URL not configured (DEFECTDOJO_URL is empty); skipping DefectDojo upload.'
    )
    return
  }

  const jsonFile = 'semgrep.json'
  if (!fs.existsSync(jsonFile)) {
    core.warning(
      `Semgrep JSON file '${jsonFile}' not found; skipping DefectDojo upload.`
    )
    return
  }

  const repo = process.env.GITHUB_REPOSITORY ?? ''
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com'
  const repoUrl = repo ? `${serverUrl}/${repo}` : ''
  const branch = process.env.GITHUB_REF_NAME ?? ''
  const commitHash = process.env.GITHUB_SHA ?? ''
  const buildId = process.env.GITHUB_RUN_ID ?? ''
  const scanDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  await defectdojo.upload({
    url: ddInputs.url,
    apiKey: ddInputs.apiKey,
    productName: ddInputs.productName,
    productTypeName: ddInputs.productTypeName,
    engagementName: ddInputs.engagementName,
    testTitle: 'Semgrep',
    jsonFile,
    scanDate,
    branch,
    commitHash,
    buildId,
    sourceCodeManagementUri: repoUrl,
    closeOldFindings: ddInputs.closeOldFindings,
    onError: ddInputs.onError
  })
}
