import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOC_FILE, readGuidePages, renderGuideDoc, shortcutTableMarkdown } from '../../scripts/guide-docs-lib'

describe('docs/otel/kullanim-kilavuzu.md', () => {
  it('programdaki Türkçe kılavuzla aynı; değilse "npm run guide:docs" çalıştırın', () => {
    expect(readFileSync(DOC_FILE, 'utf8')).toBe(renderGuideDoc(readGuidePages()))
  })

  it('kılavuz bağlantıları tek dosyanın çapalarına, resimler paketteki görüntülere döner; yazar notu kalmaz', () => {
    const doc = renderGuideDoc([
      {
        file: '01-getting-started.md',
        text: '# Başlarken\n\n<!-- doğrula: P15a -->\n\n## Kilit {#lock}\n\nBkz. [kasa](guide:payments#cash-drawer), [yedek](guide:backup), [defter](app:/ledger).\n\n![Takvim](calendar)\n\n> [!tip]\n> Not.'
      }
    ])
    expect(doc).toContain('1. [Başlarken](#getting-started)')
    expect(doc).toContain('<a id="lock"></a>\n\n### Kilit')
    expect(doc).toContain('[kasa](#cash-drawer), [yedek](#backup), defter.')
    expect(doc).toContain('![Takvim](../../src/renderer/guide/img/tr/calendar.jpg)')
    expect(doc).toContain('> [!TIP]\n> Not.')
    expect(doc).not.toContain('doğrula')
  })

  it('[[shortcuts]] programın kısayol listesinden tabloya döner (kılavuz ve "?" listesi aynı kaynak)', () => {
    const doc = renderGuideDoc([{ file: '01-getting-started.md', text: '# Başlarken\n\n[[shortcuts]]\n' }])
    expect(doc).not.toContain('[[shortcuts]]')
    expect(doc).toContain('| Yeni rezervasyon | <kbd>N</kbd> |')
    expect(doc).toContain('| Hızlı arama | <kbd>Ctrl</kbd> + <kbd>K</kbd> ya da <kbd>/</kbd> |')
    expect(doc).toContain('**Takvimde (bir hücre seçiliyken)**')
    expect(shortcutTableMarkdown().join('\n')).toContain('<kbd>←</kbd> <kbd>→</kbd>')
  })
})
