import * as core from '@actions/core'
import * as fs from 'fs'

/**
 * Configuration for the DefectDojo upload.
 */
export interface DefectDojoConfig {
  /** DefectDojo instance base URL (e.g. https://defectdojo.example.com). */
  url: string
  /** DefectDojo API key. */
  apiKey: string
  /** DefectDojo API token (alias for apiKey). */
  token?: string
  /** Product name in DefectDojo. */
  productName: string
  /** Product type name (target organization) in DefectDojo. Required when auto-creating assets. */
  productTypeName?: string
  /** Engagement name in DefectDojo. */
  engagementName: string
  /** Title for the test object in DefectDojo. */
  testTitle: string
  /** Path to the Semgrep JSON output file to upload. */
  jsonFile: string
  /** ISO-8601 date string for the scan. */
  scanDate: string
  /** Git branch name. */
  branch: string
  /** Git commit SHA. */
  commitHash: string
  /** GitHub Actions workflow run ID. */
  buildId: string
  /** Full repository URL. */
  sourceCodeManagementUri: string
  /** When true, close findings absent from the new scan. */
  closeOldFindings: boolean
  /**
   * What to do when upload fails.
   * 'warn'  → log a warning; action still succeeds.
   * 'fail'  → call core.setFailed(); action exits non-zero.
   */
  onError: 'warn' | 'fail'
}

/**
 * Statistics returned by DefectDojo after a successful reimport.
 */
export interface ImportStats {
  /** Number of new findings added. */
  newFindings: number
  /** Number of findings closed (no longer present in scan). */
  closedFindings: number
  /** Number of findings reactivated (reappeared after being closed). */
  reactivatedFindings: number
  /** Number of findings that are unchanged from the previous scan. */
  untouchedFindings: number
}

/**
 * Upload a Semgrep JSON report to DefectDojo using the reimport-scan API
 * endpoint with scan_type 'Semgrep JSON Report'.
 *
 * The function is a no-op (returns immediately) if either `config.url` or
 * `config.apiKey` (or `config.token`) is an empty string, ensuring that existing
 * workflows that do not provide DefectDojo credentials are completely unaffected.
 *
 * @param config DefectDojo upload configuration.
 * @returns `Promise` that resolves when the upload is complete (or skipped).
 */
export async function upload(config: DefectDojoConfig): Promise<void> {
  // Skip silently when DD is not configured.
  if (!config.url) {
    core.info('DefectDojo URL not provided — skipping DefectDojo upload.')
    return
  }
  const apiKey = config.apiKey || config.token || ''
  if (!apiKey) {
    core.info('DefectDojo API key not provided — skipping DefectDojo upload.')
    return
  }

  // Guard: Semgrep JSON file must exist before attempting upload.
  if (!fs.existsSync(config.jsonFile)) {
    core.warning(
      `DefectDojo upload skipped: Semgrep JSON file not found at '${config.jsonFile}'.`
    )
    return
  }

  if (!config.productTypeName) {
    core.info(
      'DefectDojo product_type_name not provided. If the product does not already exist in DefectDojo, automatic asset creation may fail.'
    )
  }

  core.info(
    `Uploading '${config.jsonFile}' to DefectDojo at ${config.url} ` +
      `(product: '${config.productName}', product_type: '${config.productTypeName || 'none'}', engagement: '${config.engagementName}')`
  )

  try {
    const stats = await doUpload(config)
    core.info(
      `DefectDojo reimport complete — ` +
        `new: ${stats.newFindings}, ` +
        `closed: ${stats.closedFindings}, ` +
        `reactivated: ${stats.reactivatedFindings}, ` +
        `untouched: ${stats.untouchedFindings}`
    )
  } catch (error) {
    const message = `DefectDojo upload failed: ${error instanceof Error ? error.message : String(error)}`
    handleUploadError(message, config.onError)
  }
}

/**
 * Perform the actual HTTP multipart upload to DefectDojo's reimport-scan
 * endpoint.
 *
 * Uses `reimport-scan` rather than `import-scan` so that repeated scans on
 * the same product + engagement + test_title do not create an unbounded number
 * of Test objects. DefectDojo matches by
 * `product_name + engagement_name + scan_type + test_title` and updates the
 * existing Test in place, applying `close_old_findings` logic to findings that
 * have disappeared.
 *
 * @param config DefectDojo upload configuration.
 * @returns Import statistics reported by DefectDojo.
 * @throws `Error` on HTTP errors or network failures.
 */
async function doUpload(config: DefectDojoConfig): Promise<ImportStats> {
  const endpoint = normalizeUrl(config.url, '/api/v2/reimport-scan/')

  const form = buildFormData(config)

  // AbortController to enforce a generous but bounded timeout (2 minutes).
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  const apiKey = config.apiKey || config.token || ''

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`
        // Do NOT set Content-Type manually — fetch sets the correct
        // multipart/form-data boundary automatically when given a FormData body.
      },
      body: form,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Request timed out after 120 s while contacting ${endpoint}`
      )
    }
    throw new Error(
      `Network error contacting DefectDojo at ${endpoint}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    clearTimeout(timeoutId)
  }

  // Parse response body for diagnostics regardless of status.
  const body = await safeReadBody(response)

  if (!response.ok) {
    throw new Error(
      `DefectDojo returned HTTP ${response.status} (${response.statusText}) ` +
        `for ${endpoint} [product_name: '${config.productName}', product_type_name: '${config.productTypeName || ''}', engagement_name: '${config.engagementName}']. Response: ${body}`
    )
  }

  return parseImportStats(body)
}

/**
 * Build the multipart/form-data payload for the reimport-scan endpoint.
 *
 * scan_type is 'Semgrep JSON Report' — the exact string registered in
 * DefectDojo's parser registry (dojo/tools/semgrep/parser.py). This must
 * match precisely; any deviation will cause a 400 error or a test-type
 * mismatch on reimport.
 *
 * @param config DefectDojo upload configuration.
 * @returns Populated FormData object.
 */
function buildFormData(config: DefectDojoConfig): FormData {
  const jsonContent = fs.readFileSync(config.jsonFile)
  const form = new FormData()

  // Core scan identification fields.
  form.append(
    'file',
    new Blob([jsonContent], { type: 'application/json' }),
    config.jsonFile
  )
  // 'Semgrep JSON Report' is the exact scan_type string registered in
  // DefectDojo's tool registry for the native Semgrep JSON parser.
  form.append('scan_type', 'Semgrep JSON Report')
  form.append('product_name', config.productName)
  if (config.productTypeName) {
    form.append('product_type_name', config.productTypeName)
  }
  form.append('engagement_name', config.engagementName)
  form.append('test_title', config.testTitle)

  // Scan metadata.
  form.append('scan_date', config.scanDate)
  form.append('minimum_severity', 'Info')
  form.append('active', 'true')
  // Findings are not auto-verified — they require human triage.
  form.append('verified', 'false')

  // Deduplication: close findings absent from this scan.
  form.append('close_old_findings', String(config.closeOldFindings))
  // Allow reactivation if a previously closed finding reappears.
  form.append('do_not_reactivate', 'false')

  // Auto-create product/engagement/test hierarchy if missing.
  // Requires the DD user to have Product Creator permissions.
  form.append('auto_create_context', 'true')

  // SCM metadata — enriches finding context in DefectDojo.
  if (config.branch) {
    form.append('branch_tag', config.branch)
  }
  if (config.commitHash) {
    form.append('commit_hash', config.commitHash)
  }
  if (config.buildId) {
    form.append('build_id', config.buildId)
  }
  if (config.sourceCodeManagementUri) {
    form.append('source_code_management_uri', config.sourceCodeManagementUri)
  }

  return form
}

/**
 * Construct a full endpoint URL from a base URL and a path, avoiding double
 * slashes.
 *
 * @param base Base URL (may or may not have a trailing slash).
 * @param path Endpoint path (must start with '/').
 * @returns Full URL string.
 */
export function normalizeUrl(base: string, path: string): string {
  return base.replace(/\/$/, '') + path
}

/**
 * Safely read a response body as text. Returns an empty string on failure
 * rather than throwing, so the caller always has something useful to log.
 *
 * @param response Fetch Response object.
 * @returns Body text or an empty string.
 */
async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/**
 * Parse import statistics from the DefectDojo reimport-scan response body.
 *
 * DefectDojo returns a JSON object that includes `finding_count` and related
 * fields. The exact shape varies by version; this function uses safe property
 * access so that unknown versions degrade gracefully.
 *
 * @param body Raw response body text.
 * @returns Parsed import statistics.
 */
export function parseImportStats(body: string): ImportStats {
  try {
    // DefectDojo reimport-scan response shape (best-effort parsing):
    // { test: <id>, finding_count: N, new_findings: N, closed_findings: N,
    //   reactivated_findings: N, untouched_findings: N }
    const json = JSON.parse(body) as Record<string, unknown>
    return {
      newFindings: asNumber(json['new_findings']),
      closedFindings: asNumber(json['closed_findings']),
      reactivatedFindings: asNumber(json['reactivated_findings']),
      untouchedFindings: asNumber(json['untouched_findings'])
    }
  } catch {
    // Non-JSON or unexpected body — return zero stats rather than crashing.
    return {
      newFindings: 0,
      closedFindings: 0,
      reactivatedFindings: 0,
      untouchedFindings: 0
    }
  }
}

/**
 * Safely coerce an unknown value to a number (0 on failure).
 *
 * @param value Value to coerce.
 * @returns Number or 0.
 */
function asNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = parseInt(value, 10)
    return isNaN(n) ? 0 : n
  }
  return 0
}

/**
 * Handle an upload error according to the configured error behaviour.
 *
 * @param message Error message to surface.
 * @param onError Configured error behaviour.
 */
function handleUploadError(message: string, onError: 'warn' | 'fail'): void {
  if (onError === 'fail') {
    core.setFailed(message)
  } else {
    core.warning(message)
  }
}
