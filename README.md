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
| `dd-close-old-findings` | No       | `true`           | Mark findings inactive when absent from the latest scan. Set to `false` to preserve all historical findings.         |
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

### Uploads only on Scheduled Runs

DefectDojo uploads are restricted exclusively to scheduled workflow executions
(`github.event_name == 'schedule'`). Uploads are skipped on pull requests and
push events to prevent partial scans or branch scans from closing or corrupting
active findings in DefectDojo.

DefectDojo's **Semgrep JSON Report** parser identifies findings using these
deduplication fields (from `dojo/tools/semgrep/parser.py`):

```
title + cwe + line + file_path + description
```

With `dd-close-old-findings: true` (default):

- Findings that appear in a new scan are deduplicated against existing ones.
- Findings absent from the new scan are marked inactive.
- Findings that reappear after being closed are reactivated.

Since full-repository scans occur during scheduled cron runs,
`close_old_findings` accurately retires resolved vulnerabilities without risking
inadvertent closure from pull request checks.

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

## S3 archive (optional)

After the DefectDojo step, the action can archive the raw scan output
(`semgrep.sarif` + `semgrep.json`, as one `.tar.gz`) to an S3 bucket in the AWS
security account. It is opt-in, runs only on `schedule` events (same as
DefectDojo), and never affects the GHAS or DefectDojo uploads.

### Architecture

```
GitHub Actions (scheduled run, repo X)
  │  semgrep -> semgrep.sarif + semgrep.json
  ├─► GHAS (SARIF)
  ├─► DefectDojo (JSON, reimport-scan)
  └─► tar.gz archive
        │  GitHub OIDC token (id-token: write)
        ▼
      AWS STS AssumeRoleWithWebIdentity  ── IAM role (security account)
        │  s3:PutObject only, scoped to the prefix
        ▼
      S3 bucket (security account), SSE, versioning optional, NO lifecycle
        <prefix>/<owner>/<repo>/<YYYY>/<MM>/<DD>/<run_id>-<attempt>/semgrep-<sha>.tar.gz
```

- **Auth**: GitHub OIDC → short-lived credentials. No static AWS keys.
- **Retention**: none is configured by this action or its documentation. No
  lifecycle rules, expiration, or Object Lock. Objects are kept until someone
  deletes them.
- **Layout**: keys are unique per run and attempt, so archives are never
  overwritten.
- **Encryption**: objects are uploaded with SSE-S3 (`AES256`).

### Inputs

| Input         | Required | Default     | Description                                                |
| ------------- | -------- | ----------- | ---------------------------------------------------------- |
| `s3-bucket`   | No       | `''`        | Bucket name. Empty skips the archive.                      |
| `s3-role-arn` | No       | `''`        | IAM role assumed via OIDC. Empty skips the archive.        |
| `s3-region`   | No       | `us-east-1` | Bucket region.                                             |
| `s3-prefix`   | No       | `semgrep`   | Key prefix inside the bucket.                              |
| `s3-on-error` | No       | `warn`      | `warn` — log and continue. `fail` — action exits non-zero. |

The calling workflow must grant `id-token: write`:

```yaml
permissions:
  id-token: write
  contents: read
  actions: read
  security-events: write
steps:
  - uses: actions/checkout@v7
  - uses: Workiva/gha-security-scanner@master
    with:
      s3-bucket: ${{ secrets.SECURITY_S3_BUCKET }}
      s3-role-arn: ${{ secrets.SECURITY_S3_ROLE_ARN }}
```

### AWS-side requirements (security account, managed outside this repo)

- Bucket: `sec-semgrep-archive-415694897066-us-east-1` in the `wk-infosec`
  account (`415694897066`), `us-east-1`. Created with Block Public Access,
  SSE-S3 default encryption, a deny-non-TLS bucket policy, and no lifecycle
  rules.
- IAM OIDC provider `token.actions.githubusercontent.com` in the same account.
- IAM role whose trust policy restricts `sub` to the Workiva org (e.g.
  `repo:Workiva/*`) with `aud = sts.amazonaws.com`.
- Role permission: `s3:PutObject` on `arn:aws:s3:::<bucket>/<prefix>/*` (add
  `kms:GenerateDataKey` if the bucket later moves to SSE-KMS).

## Rebuilding `dist`

If [check-dist.yaml](.github/workflows/check-dist.yml) fails, it probably means
that a transient dependency has changed. To fix it, rebuild `dist` like this and
commit it.

```
$ rm -rf dist node-modules
$ npm install
$ npm run bundle
```
