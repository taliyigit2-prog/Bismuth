// Faz 3 acceptance ("koyu tema kontrastı geçer"), pinned on the theme tokens themselves: text colours meet WCAG AA
// (4.5:1) on cards and on their own 15 % tint (status badges), field borders meet 3:1 (WCAG 1.4.11), in both themes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS, DEFAULT_ACCENT, contrastRatio } from '../../src/shared/color'

const css = readFileSync(join(__dirname, '../../src/renderer/styles/globals.css'), 'utf8')

type Rgb = [number, number, number]

/** The opaque `--name: oklch(L C h);` tokens of one rule block (`:root {` or `.dark {`), as linear sRGB. */
function tokens(selector: string): Map<string, Rgb> {
  const start = css.indexOf(`\n${selector} {`)
  const body = css.slice(start, css.indexOf('\n}', start))
  const out = new Map<string, Rgb>()
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\);/g))
    out.set(m[1]!, oklchToLinear(Number(m[2]), Number(m[3]), Number(m[4])))
  return out
}

function oklchToLinear(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ]
}

const encode = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
const decode = (x: number): number => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
/** `bg-x/15` over a surface: browsers blend in gamma-encoded sRGB. */
const tint = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => decode(encode(c) * alpha + encode(bg[i]!) * (1 - alpha))) as Rgb
const luminance = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const light = tokens(':root')
const dark = new Map([...light, ...tokens('.dark')])
const THEMES = [
  ['açık', light],
  ['koyu', dark]
] as const
const TEXT = ['--destructive', '--success', '--warning', '--info', '--muted-foreground'] as const

/** OKLCH lightness of a token of one rule block. */
function lightness(selector: string, token: string): number {
  const start = css.indexOf(`\n${selector} {`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Number(new RegExp(`${token}:\\s*oklch\\(([\\d.]+)`).exec(body)?.[1])
}

describe('tema kontrastı (WCAG AA)', () => {
  it('koyu temanın grafik renkleri koyu zemin bandında (OKLCH L 0,48–0,67; P10a notu)', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const l = lightness('.dark', `--chart-${n}`)
      expect(l, `--chart-${n}`).toBeGreaterThanOrEqual(0.48)
      expect(l, `--chart-${n}`).toBeLessThanOrEqual(0.67)
    }
  })

  for (const [name, theme] of THEMES) {
    it(`${name} tema: durum ve soluk metin renkleri kartta ve kendi %15 tonlu zemininde en az 4,5:1`, () => {
      const card = theme.get('--card')!
      for (const token of TEXT) {
        const fg = theme.get(token)
        expect(fg, token).toBeDefined()
        expect(contrast(fg!, card), `${token} kartta`).toBeGreaterThanOrEqual(4.5)
        if (token !== '--muted-foreground')
          expect(contrast(fg!, tint(fg!, card, 0.15)), `${token} %15 tonda`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${name} tema: grafik serileri kartta en az 3:1 (sarı açık temada tablo görünümüyle desteklenir)`, () => {
      const card = theme.get('--card')!
      for (const n of [1, 2, 3, 4, 5]) {
        if (name === 'açık' && n === 3) continue
        expect(contrast(theme.get(`--chart-${n}`)!, card), `--chart-${n}`).toBeGreaterThanOrEqual(3)
      }
    })

    it(`${name} tema: alan kenarlığı (giriş, onay kutusu, radyo, kapalı anahtar) kartta en az 3:1`, () => {
      expect(contrast(theme.get('--input')!, theme.get('--card')!)).toBeGreaterThanOrEqual(3)
    })
  }
})

describe('vurgu rengi (faz-15 madde 6)', () => {
  const hex = ([r, g, b]: Rgb): string =>
    '#' +
    [r, g, b]
      .map((c) =>
        Math.round(encode(c) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')

  it("Bismuth'un kendi vurgusu globals.css --primary ile aynı", () => {
    expect(hex(light.get('--primary')!)).toBe(DEFAULT_ACCENT.light)
    expect(hex(dark.get('--primary')!)).toBe(DEFAULT_ACCENT.dark)
  })

  it('hazır vurgu renkleri kendi temalarının zemininde en az 3:1, üstlerindeki yazı 4,5:1', () => {
    const page = { light: hex(light.get('--background')!), dark: hex(dark.get('--background')!) }
    for (const preset of ACCENT_PRESETS)
      for (const theme of ['light', 'dark'] as const) {
        expect(contrastRatio(preset[theme], page[theme]), `${preset.id} ${theme}`).toBeGreaterThanOrEqual(3)
        const text = Math.max(
          contrastRatio(preset[theme], '#0a0a0a'),
          contrastRatio(preset[theme], '#ffffff')
        )
        expect(text, `${preset.id} ${theme} yazı`).toBeGreaterThanOrEqual(4.5)
      }
  })
})
