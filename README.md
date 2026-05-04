# gha-security-scanner

A GitHub Action that runs static code analysis using [Semgrep](https://semgrep.dev/) and uploads the results (SARIF) to [GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security) (Code Scanning).

## Features

- Installs and runs Semgrep automatically — no setup required
- Uploads SARIF results to GitHub Code Scanning
- Automatically dismisses suppressed finding alerts
- Supports `.semgrepignore` generation from an `aviary.yaml` exclude list
- Excludes common false-positive rules out of the box

## Usage

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: Workiva/gha-security-scanner@v1.0.0
```

## Inputs

| Name           | Description                                                                 | Required | Default               |
| -------------- | --------------------------------------------------------------------------- | -------- | --------------------- |
| `scanner`      | Static code analysis tool to use. Currently only `semgrep` is supported.    | No       | `semgrep`             |
| `github-token` | GitHub token with `security-events: write` permission.                      | No       | `${{ github.token }}` |

## Outputs

| Name       | Description                                          |
| ---------- | ---------------------------------------------------- |
| `sarif-id` | The ID of the SARIF upload to GitHub Code Scanning.  |

## Excluding Files from Scanning

If your repository does not already have a `.semgrepignore` file, the action will look for an `aviary.yaml` (or `aviary.yml`) file in the repository root and generate a `.semgrepignore` from its `exclude` patterns.

Example `aviary.yaml`:

```yaml
version: 1

exclude:
  - ^__tests__/
  - ^docs/
```

Each entry is a regular expression matched against file paths. Matching files and directories are excluded from the scan.

If you already have a `.semgrepignore` file, the action will use it as-is.

## Requirements

- The workflow must have `security-events: write` permission.
- GitHub Advanced Security must be enabled on the repository.
- Runs on `ubuntu-latest` (Linux runners). Python 3 must be available in the runner tool cache.
