import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

import * as yaml from 'js-yaml'
import * as inputs from './inputs.js'
import * as scanner from './scanner.js'

/**
 * Main function for the action. Runs scanner based on inputs.
 *
 * @returns `Promise` that resolves when the operation is complete.
 */
export async function run(): Promise<void> {
  // Required to avoid the changes made in Semgrep Release v1.128.0
  delete process.env.HTTP_PROXY
  delete process.env.http_proxy
  delete process.env.HTTPS_PROXY
  delete process.env.https_proxy

  const scannerInput = inputs.getScannerInput()

  let scannerInstance: scanner.Scanner

  if (scannerInput === 'semgrep') {
    scannerInstance = {
      command: 'semgrep',
      args: [
        '--quiet',
        '--config',
        'auto',
        '--sarif',
        '--sarif-output',
        'semgrep.sarif',
        '--output',
        '/dev/null',

        // Exclude rules that are mostly false positives (GAS-195)
        '--exclude-rule',
        'generic.secrets.security.detected-aws-access-key-id-value.detected-aws-access-key-id-value',
        '--exclude-rule',
        'generic.secrets.security.detected-jwt-token.detected-jwt-token',
        '--exclude-rule',
        'generic.secrets.security.detected-aws-account-id.detected-aws-account-id',
        '--exclude-rule',
        'yaml.docker-compose.security.no-new-privileges.no-new-privileges',
        '--exclude-rule',
        'yaml.docker-compose.security.writable-filesystem-service.writable-filesystem-service',
        '--exclude-rule',
        'yaml.kubernetes.security.run-as-non-root.run-as-non-root',
        // Workiva uses mutable tags for all internal actions to allow for timely updates.
        // Some external actions are limited to a sha hash in our org settings.
        '--exclude-rule',
        'yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag',
        // Cooldowns will be defined in org Wide github settings
        '--exclude-rule',
        'package_managers.dependabot.dependabot-missing-cooldown.dependabot-missing-cooldown',
        '--exclude-rule',
        'generic.secrets.security.detected-private-key.detected-private-key', // Duplicate of secret scanning

        // pnpm config is handled by @workiva/pnpm-plugin-config
        '--exclude-rule',
        'package_managers.pnpm.pnpm-block-exotic-sub-dependencies.pnpm-block-exotic-sub-dependencies',
        '--exclude-rule',
        'package_managers.pnpm.pnpm-missing-minimum-release-age.pnpm-missing-minimum-release-age',
        '--exclude-rule',
        'package_managers.pnpm.pnpm-trust-policy.pnpm-trust-policy'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.149.0.tar.gz',
      version: 'v1.149.0',
      installType: scanner.InstallType.Pip
    }
  } else {
    core.setFailed(`${scannerInput} is not supported`)
    return
  }

  interface Aviary {
    exclude: string[]
    exclude_rules: string[]
  }

  for (const aviaryName of ['aviary.yaml', 'aviary.yml']) {
    if (!fs.existsSync(aviaryName)) {
      continue
    }

    const aviary = yaml.load(fs.readFileSync(aviaryName, 'utf8'), {
      json: true // Ignore duplicate keys in mappings
    }) as Aviary

    for (const ruleId of aviary?.exclude_rules || []) {
      core.info(`Excluding rule (aviary.yaml): ${ruleId}`)
      scannerInstance.args.push('--exclude-rule', ruleId)
    }

    // Generates .semgrepignore if it doesn't exist
    if (!fs.existsSync('.semgrepignore')) {
      const exclude = aviary?.exclude || []

      // Walks a directory recursively, appending files that match "exclude" to .semgrepignore
      function walk(directory: string): void {
        for (const fileName of fs.readdirSync(directory)) {
          let filePath = path.join(directory, fileName)
          let isDirectory = false
          try {
            isDirectory = fs.statSync(filePath).isDirectory()
          } catch {
            // Ignore broken symlinks
          }
          if (isDirectory) {
            filePath = `${filePath}/`
          }
          if (exclude.some(regex => new RegExp(regex).test(filePath))) {
            fs.appendFileSync('.semgrepignore', `${filePath}\n`)
            continue
          }
          if (isDirectory) {
            walk(filePath)
          }
        }
      }

      walk('.')
    }

    break
  }

  try {
    await scanner.run(scannerInstance)
  } catch (error) {
    core.setFailed(`${error instanceof Error ? error.message : String(error)}`)
  }
}
