import { beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { ACCENT_PRESETS, DEFAULT_ACCENT } from '@shared/color'
import { applyAppearance, resolveTheme } from './theme-sync'
import { accentHardToSee, buildTagCss, buildUserThemeCss, tagClass } from './user-theme'

describe('tema', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.getElementById('user-theme')?.remove()
  })

  it('"sistem" teması işletim sisteminin tercihini izler', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('koyu tema .dark sınıfını ve yoğunluk özniteliğini uygular', () => {
    applyAppearance({ ...SETTINGS_DEFAULTS, 'ui.theme': 'dark', 'ui.density': 'compact' }, false)
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.dataset['density']).toBe('compact')
    applyAppearance({ ...SETTINGS_DEFAULTS, 'ui.theme': 'light' }, true)
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('sahibin "ödendi" rengi <style id="user-theme"> ile --status-paid olur', () => {
    applyAppearance({ ...SETTINGS_DEFAULTS, 'ui.statusColors': { paid: '#16a34a' } }, false)
    expect(document.getElementById('user-theme')?.textContent).toContain('--status-paid: #16a34a;')
  })

  it('açık ve koyu temanın renkleri ayrı tutulur', () => {
    const css = buildUserThemeCss({ paid: '#16a34a' }, { blocked: '#a1a1aa' })
    expect(css).toContain(':root:not(.dark) {\n  --status-paid: #16a34a;\n  --status-paid-fg: #0a0a0a;\n}')
    expect(css).toContain(':root.dark {\n  --status-blocked: #a1a1aa;\n  --status-blocked-fg: #0a0a0a;\n}')
    expect(buildUserThemeCss({}, { paid: '#16a34a' })).not.toContain(':root:not(.dark)')
  })

  it('renk dışında hiçbir şey stil sayfasına ulaşamaz', () => {
    const css = buildUserThemeCss({ paid: 'red;} body{display:none' } as never)
    expect(css).toBe('')
  })

  it('özel etiket rengi sınıfla gelir, yazı rengi dolgudan türetilir; yalnız #rrggbb kabul edilir', () => {
    const css = buildTagCss([
      { id: '01ABC', color: '#7f1d1d' },
      { id: 'x', color: 'red;}*{display:none' },
      { id: 'y', color: null }
    ])
    expect(css).toBe('.tag-01ABC {\n  --tag: #7f1d1d;\n  --tag-fg: #ffffff;\n}')
    expect(tagClass('a b<c>')).toBe('tag-abc')
  })

  it('otelin vurgu rengi her temada ayrı: düğme, seçim, odak halkası ve ton; yazı rengi zeminden türetilir', () => {
    const css = buildUserThemeCss({}, {}, { light: '#15803d', dark: '#86efac' })
    expect(css).toContain(':root:not(.dark) {\n  --primary: #15803d;\n  --primary-foreground: #ffffff;')
    expect(css).toContain('  --ring: #15803d;')
    expect(css).toContain('  --accent: color-mix(in oklab, #15803d 12%, var(--background));')
    expect(css).toContain(':root.dark {\n  --primary: #86efac;\n  --primary-foreground: #0a0a0a;')
    expect(buildUserThemeCss({}, {}, { light: null, dark: 'red;}*{display:none' })).toBe('')
  })

  it('zeminde 4,5:1 altında kalan vurgu rengi "zor seçilir" sayılır (bağlantı yazısı da bu renkte; QA2c #14)', () => {
    expect(accentHardToSee('#fcd34d', 'light')).toBe(true)
    expect(accentHardToSee('#1d4ed8', 'light')).toBe(false)
    expect(accentHardToSee('#93c5fd', 'dark')).toBe(false)
    expect(accentHardToSee('#1e293b', 'dark')).toBe(true)
    // ≈ 3,2:1 on white: enough for an outline, not for link text.
    expect(accentHardToSee('#d97706', 'light')).toBe(true)
    // The ready accents pass in both themes.
    for (const p of ACCENT_PRESETS) {
      expect(accentHardToSee(p.light, 'light'), p.id).toBe(false)
      expect(accentHardToSee(p.dark, 'dark'), p.id).toBe(false)
    }
    expect(accentHardToSee(DEFAULT_ACCENT.light, 'light')).toBe(false)
    expect(accentHardToSee(DEFAULT_ACCENT.dark, 'dark')).toBe(false)
  })

  it('büyük yazı modu kökün yazı boyutu özniteliğiyle uygulanır; vurgu rengi stil sayfasına girer', () => {
    applyAppearance({ ...SETTINGS_DEFAULTS, 'ui.fontSize': 'larger', 'ui.accentColor': '#be123c' }, false)
    expect(document.documentElement.dataset['fontSize']).toBe('larger')
    expect(document.getElementById('user-theme')?.textContent).toContain('--primary: #be123c;')
  })
})
