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

/**
 * Extract repository name from a 'owner/repo' string or standalone repo name.
 * e.g. 'Workiva/xyz' -> 'xyz', 'xyz' -> 'xyz'.
 *
 * @param githubRepository Value of GITHUB_REPOSITORY (e.g. 'owner/repo').
 * @returns Extracted repository name.
 */
export function getRepoName(githubRepository?: string): string {
  if (!githubRepository) return ''
  const parts = githubRepository.split('/')
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

/**
 * Extract repository owner / organization name.
 * Checks githubRepositoryOwner first, then owner component of githubRepository.
 * e.g. 'Workiva/xyz' -> 'Workiva'.
 *
 * @param githubRepository Value of GITHUB_REPOSITORY (e.g. 'owner/repo').
 * @param githubRepositoryOwner Value of GITHUB_REPOSITORY_OWNER.
 * @returns Extracted repository owner / organization.
 */
export function getRepoOwner(
  githubRepository?: string,
  githubRepositoryOwner?: string
): string {
  if (githubRepositoryOwner && githubRepositoryOwner.trim()) {
    return githubRepositoryOwner.trim()
  }
  if (!githubRepository) return ''
  const parts = githubRepository.split('/')
  return parts.length > 1 ? parts[0] : ''
}

/**
 * Configuration inputs for the optional DefectDojo integration.
 */
export interface DefectDojoInputs {
  /** DefectDojo instance base URL. Empty string means DD is disabled. */
  url: string
  /** DefectDojo API key / token. */
  apiKey: string
  /**
   * Product name (asset name) in DefectDojo. Always the GitHub repository
   * name extracted from `GITHUB_REPOSITORY` (e.g. 'xyz').
   */
  productName: string
  /**
   * Product type name (target organization) in DefectDojo.
   * Defaults to `GITHUB_REPOSITORY_OWNER` or the owner part of `GITHUB_REPOSITORY`.
   * Required for automatic asset creation when the asset does not exist yet.
   */
  productTypeName: string
  /**
   * Engagement name in DefectDojo.
   * Defaults to 'GitHub Actions'.
   */
  engagementName: string
  /** When true, close findings absent from the latest scan. */
  closeOldFindings: boolean
  /**
   * Error behaviour when the DefectDojo upload fails.
   * 'warn' -> log a warning and continue (default).
   * 'fail' -> call core.setFailed() and stop the action.
   */
  onError: 'warn' | 'fail'
}

/**
 * Read and validate all DefectDojo-related action inputs.
 *
 * - url, apiKey, productTypeName: from the dd-url, dd-api-key and dd-org-name
 *   inputs (populated by the calling workflow from the secrets context).
 *   productTypeName falls back to the repo owner if not set.
 * - productName: always the GitHub repository name.
 * - engagementName, closeOldFindings, onError: from action inputs.
 *
 * @returns Validated DefectDojo inputs.
 */
export function getDefectDojoInputs(): DefectDojoInputs {
  const url = core.getInput('dd-url').trim()
  const apiKey = core.getInput('dd-api-key').trim()

  const productName = getRepoName(process.env.GITHUB_REPOSITORY) || 'unknown'

  const productTypeName =
    core.getInput('dd-org-name').trim() ||
    getRepoOwner(
      process.env.GITHUB_REPOSITORY,
      process.env.GITHUB_REPOSITORY_OWNER
    )

  const engagementName =
    core.getInput('dd-engagement-name').trim() || 'GitHub Actions'

  const closeOldFindingsInput = core.getInput('dd-close-old-findings').trim()
  const closeOldFindings = closeOldFindingsInput.toLowerCase() !== 'false'

  const onErrorInput = core.getInput('dd-on-error').trim().toLowerCase()
  const onError: 'warn' | 'fail' = onErrorInput === 'fail' ? 'fail' : 'warn'

  return {
    url,
    apiKey,
    productName,
    productTypeName,
    engagementName,
    closeOldFindings,
    onError
  }
}
