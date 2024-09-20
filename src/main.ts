import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

import * as yaml from 'js-yaml'
import * as inputs from './inputs'
import * as scanner from './scanner'

/**
 * Main function for the action. Runs scanner based on inputs.
 *
 * @returns `Promise` that resolves when the operation is complete.
 */
export async function run(): Promise<void> {
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
        '/dev/null'
      ],
      url: 'https://github.com/semgrep/semgrep/archive/refs/tags/v1.84.1.tar.gz',
      version: 'v1.84.1',
      installType: scanner.InstallType.Pip
    }
  } else {
    core.setFailed(`${scannerInput} is not supported`)
    return
  }

  // Generates .semgrepignore if it doesn't exist
  for (const aviaryName of ['aviary.yaml', 'aviary.yml']) {
    console.log(`foo ${aviaryName}`)
    if (!fs.existsSync('.semgrepignore') && fs.existsSync(aviaryName)) {
      console.log(`bar ${aviaryName}`)

      interface Aviary {
        exclude: string[]
      }

      const aviary = yaml.load(fs.readFileSync('aviary.yaml', 'utf8'), {
        json: true // Ignore duplicate keys in mappings
      }) as Aviary

      // Walks a directory recursively, appending files that match "exclude" to .semgrepignore
      // Function is defined inline because it references aviary which is defined conditionally
      // eslint-disable-next-line no-inner-declarations
      function walk(directory: string): void {
        for (const fileName of fs.readdirSync(directory)) {
          const filePath = path.join(directory, fileName)
          if (fs.statSync(filePath).isDirectory()) {
            // Recurse into subdirectories
            return walk(filePath)
          }
          if (aviary.exclude.some(regex => new RegExp(regex).test(filePath))) {
            console.log(`baz ${aviaryName} ${filePath}`)
            fs.appendFileSync('.semgrepignore', `${filePath}\n`)
          }
        }
      }

      walk('.')
      break
    }

    // TODO: Add .semgrepignore as an action artifact and print a message that teams can include that for faster scans
  }

  try {
    await scanner.run(scannerInstance)
  } catch (error) {
    core.setFailed(`${error instanceof Error ? error.message : String(error)}`)
  }
}
