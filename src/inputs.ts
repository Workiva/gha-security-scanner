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
 * Configuration inputs and secrets for the optional DefectDojo integration.
 */
export interface DefectDojoInputs {
  /**
   * DefectDojo instance base URL. Sourced exclusively from the DEFECTDOJO_URL
   * organization secret. Empty string means DD is disabled.
   */
  url: string
  /**
   * DefectDojo API key. Sourced exclusively from the DEFECTDOJO_API_KEY
   * organization secret.
   */
  apiKey: string
  /**
   * Product name (asset name) in DefectDojo.
   * Defaults to repository name extracted from `GITHUB_REPOSITORY` (e.g. 'xyz').
   */
  productName: string
  /**
   * Product type name (target organization) in DefectDojo.
   * Sourced from the DEFECTDOJO_ORG_NAME organization secret.
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
   * 'warn' → log a warning and continue (default).
   * 'fail' → call core.setFailed() and stop the action.
   */
  onError: 'warn' | 'fail'
}

/**
 * Read and validate all DefectDojo-related secrets and action inputs.
 *
 * Sourcing rules:
 * - url: exclusively from DEFECTDOJO_URL organization secret
 * - apiKey: exclusively from DEFECTDOJO_API_KEY organization secret
 * - productTypeName: exclusively from DEFECTDOJO_ORG_NAME organization secret
 *   (falls back to repo owner if not set)
 * - productName, engagementName, closeOldFindings, onError: from action inputs
 *   without environment variable fallbacks
 *
 * @returns Validated DefectDojo inputs.
 */
export function getDefectDojoInputs(): DefectDojoInputs {
  const url = process.env.DEFECTDOJO_URL?.trim() || ''

  const apiKey = process.env.DEFECTDOJO_API_KEY?.trim() || ''

  const productNameInput = core.getInput('dd-product-name').trim()
  const productName =
    productNameInput || getRepoName(process.env.GITHUB_REPOSITORY) || 'unknown'

  const productTypeName =
    process.env.DEFECTDOJO_ORG_NAME?.trim() ||
    getRepoOwner(
      process.env.GITHUB_REPOSITORY,
      process.env.GITHUB_REPOSITORY_OWNER
    )

  const engagementNameInput = core.getInput('dd-engagement-name').trim()
  const engagementName = engagementNameInput || 'GitHub Actions'

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
