import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATUS_DEFAULT_COLORS, STATUS_KEYS, type StatusKey } from '@shared/contract'

const css = readFileSync(join(__dirname, '../../src/renderer/styles/globals.css'), 'utf8')
const cssVar: Record<StatusKey, string> = {
  paid: '--status-paid',
  unpaid: '--status-unpaid',
  partial: '--status-partial',
  dayuse: '--status-dayuse',
  pastEmpty: '--status-past-empty',
  empty: '--status-empty',
  blocked: '--status-blocked'
}

/** The `--status-*: #hex` declarations of one rule block (`:root {` or `.dark {`). */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return new Map([...body.matchAll(/(--status-[a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1]!, m[2]!]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('durum renkleri varsayılanları', () => {
  it('globals.css ile renk seçicinin gösterdiği varsayılanlar her temada aynı', () => {
    const light = block(':root')
    const dark = new Map([...light, ...block('.dark')])
    for (const key of STATUS_KEYS) {
      expect(light.get(cssVar[key]), `light ${key}`).toBe(STATUS_DEFAULT_COLORS.light[key])
      expect(dark.get(cssVar[key]), `dark ${key}`).toBe(STATUS_DEFAULT_COLORS.dark[key])
    }
  })

  it('koyu temada "Satılmaz" boş hücreden ve geçmiş boş hücreden ayırt edilir', () => {
    const d = STATUS_DEFAULT_COLORS.dark
    expect(contrast(d.blocked, d.empty)).toBeGreaterThanOrEqual(3)
    expect(contrast(d.blocked, d.pastEmpty)).toBeGreaterThanOrEqual(1.8)
    expect(contrast(d.pastEmpty, d.empty)).toBeGreaterThanOrEqual(1.5)
  })
})
