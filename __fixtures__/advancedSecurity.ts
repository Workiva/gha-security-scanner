import type { uploadVulnScansToGHAS as uploadFn } from '../src/internal/advancedSecurity.js'
import { jest } from '@jest/globals'

export const uploadVulnScansToGHAS = jest.fn<typeof uploadFn>()
