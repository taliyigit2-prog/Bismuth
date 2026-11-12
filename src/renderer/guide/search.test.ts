import { describe, expect, it } from 'vitest'
import { foldText, searchGuide } from './search'
import { buildSection } from './sections'

const payments = buildSection(
  'payments',
  [
    '# Ödeme alınca ne yapılır',
    '',
    'Giriş paragrafı.',
    '',
    '## Kapora {#deposit}',
    '',
    'Önceden alınan para **Kapora** türüyle yazılır.',
    '',
    '- Kapora alınan geceler turuncu görünür.',
    '',
    '## Kasa {#cash-drawer}',
    '',
    '> [!tip]',
    '> Vardiya sonunda kasayı sayın.'
  ].join('\n')
)
const ru = buildSection('ledger', '# Журнал\n\n## Итоги {#day-summary}\n\nЁлка и итог дня.')

describe('kılavuzda arama', () => {
  it('büyük-küçük harf ve Türkçe/Rusça işaret farkını gözetmez', () => {
    expect(foldText('ÖDEME İşlemi')).toBe('odeme islemi')
    expect(foldText('Ёлка')).toBe('елка')
    expect(searchGuide([payments], 'odeme').map((h) => h.anchor)).toEqual([null])
    expect(searchGuide([ru], 'елка')).toHaveLength(1)
  })

  it('en yakın başlığa gider; aynı başlık altında bir kez çıkar', () => {
    const hits = searchGuide([payments], 'kapora')
    expect(hits).toEqual([
      expect.objectContaining({ section: 'payments', anchor: 'deposit', heading: 'Kapora' })
    ])
  })

  it('her sözcük aynı yerde geçmeli; kutuların içinde de arar', () => {
    expect(searchGuide([payments], 'kasayı sayın')).toEqual([
      expect.objectContaining({ anchor: 'cash-drawer', snippet: 'Vardiya sonunda kasayı sayın.' })
    ])
    expect(searchGuide([payments], 'kapora kasa')).toEqual([])
    expect(searchGuide([payments], '   ')).toEqual([])
  })
})
