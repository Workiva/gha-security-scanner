# gha-security-scanner

Generates and uploads SARIF files to GitHub Advanced Security.

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

## Rebuilding `dist`

If [check-dist.yaml](.github/workflows/check-dist.yml) fails, it probably means
that a transient dependency has changed. To fix it, rebuild `dist` like this and
commit it.

```
$ rm -rf dist node-modules
$ npm install
$ npm run bundle
```
