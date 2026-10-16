# gha-security-scanner

Generates and uploads SARIF files to GitHub Advanced Security. Optionally sends
the same scan result to a DefectDojo instance.

## Per-repo configuration (`aviary.yaml`)

Place an `aviary.yaml` (or `aviary.yml`) at the root of a consuming repo to
customize scanner behavior.

### Excluding paths

Use `exclude` to skip directories or files. Each entry is a regex matched
against file paths:

```yaml
version: 1

exclude:
  - ^__tests__/
  - ^tools/
```

### Excluding rules

Use `exclude_rules` to suppress Semgrep rules that don't apply to your repo
(e.g., Kubernetes rules in a repo with no production deployments). Each entry is
a full Semgrep rule ID:

```yaml
version: 1

exclude_rules:
  - yaml.kubernetes.security.run-as-non-root.run-as-non-root
```

Rule IDs can be found by searching the
[Semgrep Registry](https://semgrep.dev/r). Changes to `exclude_rules` require
infosec approval.

## DefectDojo integration (optional)

The action can upload the Semgrep scan result to a DefectDojo instance **after**
the existing GitHub Advanced Security upload. This is entirely opt-in and does
not affect the existing GHAS flow.

Semgrep runs **once** and writes **two output files** in a single invocation:

- `semgrep.sarif` → uploaded to GitHub Advanced Security (unchanged)
- `semgrep.json` → sent to DefectDojo using the native **Semgrep JSON Report**
  parser

DefectDojo's `reimport-scan` endpoint is used so that repeated scans update the
same Test object rather than creating new ones on every run.

### Action Inputs

The DefectDojo URL, API key and organization name are passed as action inputs.
Calling workflows should populate them from the `secrets` context (e.g. the
`DEFECTDOJO_URL`, `DEFECTDOJO_API_KEY` and `DEFECTDOJO_ORG_NAME` organization
secrets).

| Input                   | Required | Default          | Description                                                                                                          |
| ----------------------- | -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `scanner`               | No       | `semgrep`        | Static code analysis tool to use. Options: `semgrep`.                                                                |
| `dd-url`                | No       | `''`             | DefectDojo instance base URL. When empty, the DefectDojo upload is skipped entirely.                                 |
| `dd-api-key`            | No       | `''`             | DefectDojo API key / token for authentication.                                                                       |
| `dd-org-name`           | No       | `<repo owner>`   | Target organization (product type) in DefectDojo. Required for automatic asset creation.                             |
| `dd-engagement-name`    | No       | `GitHub Actions` | Engagement name in DefectDojo (e.g. `Semgrep CI`). All scans from this action are grouped under the same engagement. |
| `dd-close-old-findings` | No       | `true`           | Mark findings inactive when absent from the latest scan. Set to `false` for PR scans of changed files.               |
| `dd-on-error`           | No       | `warn`           | `warn` — log a warning on failure, continue. `fail` — mark the action as failed.                                     |

The DefectDojo asset (product) name is always the GitHub repository name (e.g.
`xyz` for `Workiva/xyz`); it cannot be overridden.

### Automatic Asset Creation & Dynamic Mapping

When configured, the action uses DefectDojo's `POST /api/v2/reimport-scan/`
endpoint with `auto_create_context: true`:

- **First run for a repository**: Automatically creates the asset
  (`product_name`), target organization (`product_type_name`), engagement
  (`engagement_name`), and test (`test_title: 'Semgrep'`).
- **Subsequent runs**: Updates the existing test in place under the same asset
  and engagement.
- **Dynamic mapping**: Because `product_name` automatically resolves to the
  repository name (`xyz`) and `product_type_name` resolves to the `dd-org-name`
  input (or `$GITHUB_REPOSITORY_OWNER`), no per-repository hardcoding is needed
  across hundreds of repositories.
- **Uniqueness & Permissions**: Asset names must be unique across the DefectDojo
  instance, and the API user needs permission to add assets in the target
  organization.

### Example usage

```yaml
- uses: actions/checkout@v7
- uses: Workiva/gha-security-scanner@master
  with:
    dd-url: ${{ secrets.DEFECTDOJO_URL }}
    dd-api-key: ${{ secrets.DEFECTDOJO_API_KEY }}
    dd-org-name: ${{ secrets.DEFECTDOJO_ORG_NAME }}
```

### Permissions required

The DD API user needs the following permissions in DefectDojo:

- **Product Creator** role (required for `auto_create_context=true` to create
  assets in the target organization)
- Read/write access to the target Product and Engagement

### DefectDojo mapping

| DD Field                     | Value                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `scan_type`                  | `Semgrep JSON Report`                                         |
| `file`                       | `semgrep.json` (native Semgrep JSON output)                   |
| `product_name`               | GitHub repository name (from `$GITHUB_REPOSITORY`)            |
| `product_type_name`          | `dd-org-name` input (or `$GITHUB_REPOSITORY_OWNER`)           |
| `engagement_name`            | `dd-engagement-name` input (default: `GitHub Actions`)        |
| `test_title`                 | `Semgrep` (stable — enables reimport to target the same Test) |
| `auto_create_context`        | `true`                                                        |
| `scan_date`                  | Today's date (UTC, `YYYY-MM-DD`)                              |
| `branch_tag`                 | `GITHUB_REF_NAME` (branch name)                               |
| `commit_hash`                | `GITHUB_SHA`                                                  |
| `build_id`                   | `GITHUB_RUN_ID`                                               |
| `source_code_management_uri` | `https://github.com/{owner}/{repo}`                           |

### Deduplication and PR Scans

DefectDojo's **Semgrep JSON Report** parser identifies findings using these
deduplication fields (from `dojo/tools/semgrep/parser.py`):

```
title + cwe + line + file_path + description
```

With `dd-close-old-findings: true` (default):

- Findings that appear in a new scan are deduplicated against existing ones.
- Findings absent from the new scan are marked inactive.
- Findings that reappear after being closed are reactivated.

> [!IMPORTANT] By default, reimport closes any finding in that test that isn't
> in the new report. If your PR scans only cover changed files, set
> `dd-close-old-findings: false` on PR workflows, or reimport only full-repo
> scans (e.g. on default branch merges / scheduled runs). Otherwise, a PR scan
> covering only modified files will close findings detected from earlier full
> scans!

### Failure handling

| Scenario                 | `dd-on-error: warn` (default)   | `dd-on-error: fail`                |
| ------------------------ | ------------------------------- | ---------------------------------- |
| DD unreachable / timeout | Warning logged; action succeeds | `setFailed`; action exits non-zero |
| HTTP 401 Unauthorized    | Warning logged                  | `setFailed`                        |
| HTTP 4xx bad payload     | Warning with response body      | `setFailed`                        |
| HTTP 5xx server error    | Warning logged                  | `setFailed`                        |
| SARIF file missing       | Warning logged; DD skipped      | Warning logged; DD skipped         |
| DD URL not configured    | Silent skip                     | Silent skip                        |

**The GHAS upload is never affected by a DefectDojo failure.**

## Rebuilding `dist`

If [check-dist.yaml](.github/workflows/check-dist.yml) fails, it probably means
that a transient dependency has changed. To fix it, rebuild `dist` like this and
commit it.

```
$ rm -rf dist node-modules
$ npm install
$ npm run bundle
```
