import type * as orig from '@actions/exec'
import { jest } from '@jest/globals'

export const exec = jest.fn<typeof orig.exec>()
