import { jest } from '@jest/globals'

jest.unstable_mockModule('../src/defectdojo-main.js', () => ({
  run: jest.fn(() => Promise.resolve())
}))
const defectdojoMain = await import('../src/defectdojo-main.js')

describe('defectdojo-index', () => {
  it('should call `run` when imported', async () => {
    await import('../src/defectdojo-index.js')

    expect(defectdojoMain.run).toHaveBeenCalled()
  })
})
