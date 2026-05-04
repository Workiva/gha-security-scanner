import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as zlib from 'zlib'
import { promisify } from 'util'

import { promiseRetry } from './retry.js'

type GitHubApiError = Error & { status?: number }

function isSarifUploadRetryable(error: GitHubApiError): boolean {
  if (error.status === 401 || error.status === 403) {
    return false
  }

  return !error.message.includes('Resource not accessible by integration')
}

export async function uploadVulnScansToGHAS(
  filePath: string,
  tool: string,
  token: string
): Promise<string> {
  const octokit = github.getOctokit(token)
  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') || ['', '']
  const gzip = promisify(zlib.gzip)

  if (!filePath.endsWith('.sarif')) {
    core.warning(`Skipping non-SARIF file: ${filePath}`)
    throw new Error(
      `Failed to upload SARIF file: ${filePath} is not a SARIF file`
    )
  }

  core.debug(
    `Uploading SARIF file ${filePath} - Owner: ${owner}, Repo: ${repo}, Ref: ${process.env.GITHUB_REF}, SHA: ${process.env.GITHUB_SHA}`
  )

  const sarifContent = await fs.promises.readFile(filePath, 'utf8')
  const gzippedContent = await gzip(sarifContent)
  const sarifBase64 = gzippedContent.toString('base64')

  const response = await promiseRetry(
    () =>
      octokit.rest.codeScanning.uploadSarif({
        owner,
        repo,
        sarif: sarifBase64,
        tool_name: tool,
        ref: process.env.GITHUB_REF || '',
        commit_sha: process.env.GITHUB_SHA || ''
      }),
    { shouldRetry: isSarifUploadRetryable }
  )

  if (!response.data.id) {
    throw new Error(
      `SARIF upload succeeded but no ID was returned for ${filePath}`
    )
  }

  core.info(
    `✅ Successfully uploaded SARIF file ${filePath}.\n` +
      `   API endpoint: https://api.github.com/repos/${owner}/${repo}/code-scanning/analyses?sarif_id=${response.data.id}`
  )

  return response.data.id
}
