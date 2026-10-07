import * as inputs from '../src/inputs.js'
import { jest } from '@jest/globals'

export const getScannerInput = jest.fn<typeof inputs.getScannerInput>()
export const getDefectDojoInputs = jest.fn<typeof inputs.getDefectDojoInputs>()
export const getRepoName = jest.fn<typeof inputs.getRepoName>()
export const getRepoOwner = jest.fn<typeof inputs.getRepoOwner>()
