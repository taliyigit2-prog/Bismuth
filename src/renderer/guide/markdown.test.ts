import { describe, expect, it } from 'vitest'
import { headingIds, imageNames, inlineText, links, parseHref, parseInline, parseMarkdown } from './markdown'

describe('kılavuzun Markdown okuyucusu', () => {
  it('başlıkları düzeyi ve çapasıyla okur; çapasız başlık da olur', () => {
    const blocks = parseMarkdown('# Rezervasyon\n\n## Yeni rezervasyon {#new-reservation}\n\n### Ayrıntı')
    expect(blocks).toEqual([
      { t: 'heading', level: 1, id: null, c: [{ t: 'text', v: 'Rezervasyon' }] },
      { t: 'heading', level: 2, id: 'new-reservation', c: [{ t: 'text', v: 'Yeni rezervasyon' }] },
      { t: 'heading', level: 3, id: null, c: [{ t: 'text', v: 'Ayrıntı' }] }
    ])
    expect(headingIds(blocks)).toEqual(['new-reservation'])
  })

  it('art arda satırları tek paragraf yapar, boş satır paragrafı böler', () => {
    const blocks = parseMarkdown('Birinci satır\nikinci satır\n\nYeni paragraf')
    expect(blocks).toEqual([
      { t: 'paragraph', c: [{ t: 'text', v: 'Birinci satır ikinci satır' }] },
      { t: 'paragraph', c: [{ t: 'text', v: 'Yeni paragraf' }] }
    ])
  })

  it('madde ve numaralı listeleri, girintili devam satırını ve başlangıç numarasını okur', () => {
    const blocks = parseMarkdown('- bir\n- iki\n  devamı\n\n3. üç\n4. dört')
    expect(blocks).toEqual([
      {
        t: 'list',
        ordered: false,
        start: 1,
        items: [[{ t: 'text', v: 'bir' }], [{ t: 'text', v: 'iki devamı' }]]
      },
      {
        t: 'list',
        ordered: true,
        start: 3,
        items: [[{ t: 'text', v: 'üç' }], [{ t: 'text', v: 'dört' }]]
      }
    ])
  })

  it('kalın yazıyı, tuşu ve kılavuz içi bağlantıyı okur', () => {
    expect(parseInline('**Kaydet** ya da <kbd>Enter</kbd>; bkz. [kasa](guide:payments#cash-drawer)')).toEqual(
      [
        { t: 'strong', c: [{ t: 'text', v: 'Kaydet' }] },
        { t: 'text', v: ' ya da ' },
        { t: 'kbd', v: 'Enter' },
        { t: 'text', v: '; bkz. ' },
        {
          t: 'link',
          href: { kind: 'guide', section: 'payments', anchor: 'cash-drawer' },
          c: [{ t: 'text', v: 'kasa' }]
        }
      ]
    )
  })

  it('bağlantı yalnız kılavuzun içine ya da programın bir ekranına gider; dış adres düz yazı kalır', () => {
    expect(parseHref('#check-in')).toEqual({ kind: 'guide', section: null, anchor: 'check-in' })
    expect(parseHref('guide:tourism')).toEqual({ kind: 'guide', section: 'tourism', anchor: null })
    expect(parseHref('app:/ledger')).toEqual({ kind: 'app', path: '/ledger' })
    expect(parseHref('https://example.com')).toBeNull()
    expect(parseHref('javascript:alert(1)')).toBeNull()
    expect(parseHref('app://evil')).toBeNull()
    expect(parseInline('[tıkla](https://example.com)')).toEqual([{ t: 'text', v: 'tıkla' }])
  })

  it('tek satırdaki resmi okur; ipucu ve dikkat kutularının içini ayrıca okur', () => {
    const blocks = parseMarkdown(
      '![Takvim ekranı](calendar)\n\n> [!warning]\n> **Dikkat** edin.\n>\n> - madde'
    )
    expect(blocks).toEqual([
      { t: 'image', name: 'calendar', alt: 'Takvim ekranı' },
      {
        t: 'callout',
        kind: 'warning',
        blocks: [
          {
            t: 'paragraph',
            c: [
              { t: 'strong', c: [{ t: 'text', v: 'Dikkat' }] },
              { t: 'text', v: ' edin.' }
            ]
          },
          { t: 'list', ordered: false, start: 1, items: [[{ t: 'text', v: 'madde' }]] }
        ]
      }
    ])
    expect(imageNames(blocks)).toEqual(['calendar'])
    expect(parseMarkdown('> [!tip]\n> Kısa yol')[0]).toMatchObject({ t: 'callout', kind: 'tip' })
  })

  it('yazar notlarını (HTML yorumu) atar; başka hiçbir HTML işlenmez, yazı olarak kalır', () => {
    const blocks = parseMarkdown('<!-- doğrula: P10a -->\nMetin <b>kalın</b> <script>alert(1)</script>')
    expect(blocks).toEqual([
      { t: 'paragraph', c: [{ t: 'text', v: 'Metin <b>kalın</b> <script>alert(1)</script>' }] }
    ])
    expect(parseMarkdown('<!--\nçok satırlı\nnot\n-->\n# Başlık')).toEqual([
      { t: 'heading', level: 1, id: null, c: [{ t: 'text', v: 'Başlık' }] }
    ])
  })

  it('resim adı yalnız harf, rakam ve tire olabilir: yol ya da adres resim sayılmaz', () => {
    expect(parseMarkdown('![x](../../etc/passwd)')[0]).toMatchObject({ t: 'paragraph' })
    expect(parseMarkdown('![x](http://example.com/a.png)')[0]).toMatchObject({ t: 'paragraph' })
  })

  it('bağlantıları ve düz metni bütün öğe türlerinden toplar', () => {
    const blocks = parseMarkdown(
      '## [A](guide:a) {#x}\n\nMetin [B](#b)\n\n- [C](app:/today)\n\n> [!tip]\n> **[D](guide:d#e)**'
    )
    expect(links(blocks)).toEqual([
      { kind: 'guide', section: 'a', anchor: null },
      { kind: 'guide', section: null, anchor: 'b' },
      { kind: 'app', path: '/today' },
      { kind: 'guide', section: 'd', anchor: 'e' }
    ])
    expect(inlineText(parseInline('**Ödeme** al <kbd>Ctrl</kbd>'))).toBe('Ödeme al Ctrl')
  })

  it('[[shortcuts]] kendi satırında kısayol tablosu öğesidir; cümle içinde düz yazı kalır', () => {
    expect(parseMarkdown('Liste:\n\n[[shortcuts]]\n\nSon.')).toEqual([
      { t: 'paragraph', c: [{ t: 'text', v: 'Liste:' }] },
      { t: 'shortcuts' },
      { t: 'paragraph', c: [{ t: 'text', v: 'Son.' }] }
    ])
    expect(parseMarkdown('Bkz. [[shortcuts]] burada')[0]).toMatchObject({ t: 'paragraph' })
    expect(links(parseMarkdown('[[shortcuts]]'))).toEqual([])
  })
})
