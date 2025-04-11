import { jest } from '@jest/globals'

jest.unstable_mockModule('../src/main.js', () => ({
  // Mock the action's entrypoint.
  run: jest.fn(() => Promise.resolve()),
}))

// Modules to be mocked.
const main = await import('../src/main.js')

describe('index', () => {
  it('should call `run` when imported', async () => {
    await import('../src/index.js')

    expect(main.run).toHaveBeenCalled()
  })
})
