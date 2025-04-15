import * as scanner from '../src/scanner.js'
import { jest } from '@jest/globals'

export const run = jest.fn<typeof scanner.run>()
export const InstallType = scanner.InstallType
