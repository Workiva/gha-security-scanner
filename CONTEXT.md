# gha-security-scanner

A GitHub composite action that runs Semgrep against Workiva repos on pull
requests and a weekly schedule, uploading results to GitHub Advanced Security.

## Language

**Aviary**: The per-repo YAML configuration file (`aviary.yaml` or `aviary.yml`)
that a consuming repo places at its root to customize scanner behavior. _Avoid_:
config file, semgrep config

**Path Exclusion**: A regex in `aviary.yaml`'s `exclude` list that causes
matching file paths to be written to `.semgrepignore`, skipping those paths from
scanning entirely. _Avoid_: ignore path, exclude directory

**Rule Exclusion**: A Semgrep rule ID that is suppressed via `--exclude-rule`,
preventing that rule from producing findings. _Avoid_: ignore rule, suppress
rule, disable rule

**Org-wide Exclusion**: A rule exclusion hardcoded in `main.ts` that applies to
every repo scanned. Represents an infosec policy decision. _Avoid_: global
exclusion, default exclusion

**Per-repo Exclusion**: A rule exclusion specified in a repo's `aviary.yaml`
under `exclude_rules`. Additive on top of org-wide exclusions; requires infosec
approval. _Avoid_: local exclusion, custom exclusion

**SARIF**: The output format Semgrep produces, uploaded to GitHub Advanced
Security. Rule IDs visible in the GHAS UI are the canonical source for writing
`exclude_rules` entries.

## Relationships

- An **Aviary** contains zero or more **Path Exclusions** and zero or more
  **Per-repo Exclusions**
- **Per-repo Exclusions** are always additive — they cannot remove an **Org-wide
  Exclusion**
- **Org-wide Exclusions** are defined in `main.ts`; **Per-repo Exclusions** are
  defined in `aviary.yaml`

## Example dialogue

> **Dev:** "Our repo is CI tooling with no production k8s deployments. Can we
> turn off the run-as-non-root rule?" **Infosec:** "Yes — add it to
> `exclude_rules` in your `aviary.yaml` and get infosec approval on the PR."
> **Dev:** "Where do I find the rule ID?" **Infosec:** "Look at the finding in
> the GitHub Advanced Security tab — the rule ID is shown there."

## Flagged ambiguities

- "exclude" is used for both path patterns (the `exclude` field) and rule IDs
  (the `exclude_rules` field) — these are distinct mechanisms with different
  effects.
