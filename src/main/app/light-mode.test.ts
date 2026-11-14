import { describe, expect, it } from 'vitest'
import { browserUrl, keepRunningWithoutWindow, lightModeWanted } from './light-mode'

const base = { wanted: true, serverRunning: true, quitting: false, smoke: false }

describe('light mode', () => {
  it('is wanted only on the main computer with the setting on', () => {
    expect(lightModeWanted({ 'app.lightMode': true, 'app.mode': 'host' })).toBe(true)
    expect(lightModeWanted({ 'app.lightMode': true, 'app.mode': 'standalone' })).toBe(false)
    expect(lightModeWanted({ 'app.lightMode': true, 'app.mode': 'client' })).toBe(false)
    expect(lightModeWanted({ 'app.lightMode': false, 'app.mode': 'host' })).toBe(false)
  })

  it('keeps the program running without a window while the server answers', () => {
    expect(keepRunningWithoutWindow(base)).toBe(true)
  })

  it('quits when the server is not running (nobody could reach the program)', () => {
    expect(keepRunningWithoutWindow({ ...base, serverRunning: false })).toBe(false)
  })

  it('quits while quitting, in a smoke run, and when the setting is off', () => {
    expect(keepRunningWithoutWindow({ ...base, quitting: true })).toBe(false)
    expect(keepRunningWithoutWindow({ ...base, smoke: true })).toBe(false)
    expect(keepRunningWithoutWindow({ ...base, wanted: false })).toBe(false)
  })

  it("opens the browser on this computer's own address, never a public one", () => {
    expect(browserUrl(7373)).toBe('http://127.0.0.1:7373/')
  })
})
