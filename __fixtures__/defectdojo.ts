import type * as defectdojo from '../src/defectdojo.js'
import { jest } from '@jest/globals'

export const upload = jest.fn<typeof defectdojo.upload>()
