import * as core from '@actions/core'
import * as fs from 'fs'
import { parse } from 'yaml'

/**
 * Aviary configuration schema.
 */
interface AviaryConfig {
  version: number
  branches?: string[]
  exclude?: string[]
  /* eslint-disable @typescript-eslint/no-explicit-any */
  raven_monitored_classes?: Record<string, any>
  raven_monitored_files?: Record<string, any>
  raven_monitored_functions?: Record<string, any>
  raven_monitored_keywords?: Record<string, any>
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Write or append the `exclude` block of a `aviary.yaml` file to an ignore file.
 *
 * @param aviaryFile Path to a `aviary.yaml` file.
 * @param ignoreFile Path to an ignore file.
 * @returns `Promise` that resolves when the operation is complete.
 */
export async function writeExcludeToFile(aviaryFile: string, ignoreFile: string): Promise<void> {
  core.info(`Writing \`exclude\` block of ${aviaryFile} to ${ignoreFile}`)

  if (!fs.existsSync(aviaryFile)) {
    core.info(`${aviaryFile} does not exist. ${ignoreFile} not written`)
    return
  }

  let aviaryConfig: AviaryConfig

  try {
    const aviaryFileContent: string = fs.readFileSync(aviaryFile, 'utf8')
    aviaryConfig = parse(aviaryFileContent)
  } catch (error) {
    core.error(`Failed to parse ${aviaryFile}: ${error}`)
    return
  }

  if (!aviaryConfig.exclude || aviaryConfig.exclude.length === 0) {
    core.info(`\`exclude\` block does not exist. ${ignoreFile} not written`)
    return
  }

  const excludeContent = aviaryConfig.exclude.join('\n')
  core.debug(`\`exclude\` block content:\n${excludeContent}`)

  try {
    if (fs.existsSync(ignoreFile)) {
      core.info(`${ignoreFile} already exists. Appending to file`)
      fs.appendFileSync(ignoreFile, `\n${excludeContent}`, 'utf8')
    } else {
      core.info(`Writing to ${ignoreFile}`)
      fs.writeFileSync(ignoreFile, excludeContent, 'utf8')
    }
    core.debug(`${ignoreFile}\n${fs.readFileSync(ignoreFile, 'utf8')}`)
  } catch (error) {
    core.error(`Failed to write to ${ignoreFile}: ${error}`)
  }
}
