import { describe, expect, it } from 'vitest'
import { matchCategory, parseContactsCsv, splitCsvLine } from './contacts-csv'

describe('rehber içe aktarma (ad; telefon; kategori)', () => {
  it('noktalı virgüllü satırları okur, başlık satırını atlar, kategoriyi koda çevirir', () => {
    const r = parseContactsCsv(
      'Ad;Telefon;Kategori\nMunzur Su;0532 000 00 01;Tedarikçi\nUsta Ali;0533 000 00 02;tesisatçı\n'
    )
    expect(r.problems).toEqual([])
    expect(r.rows).toEqual([
      {
        line: 2,
        name: 'Munzur Su',
        phones: [{ label: '', number: '0532 000 00 01' }],
        category: 'supplier',
        customCategory: null
      },
      {
        line: 3,
        name: 'Usta Ali',
        phones: [{ label: '', number: '0533 000 00 02' }],
        category: 'plumber',
        customCategory: null
      }
    ])
  })

  it('bilinmeyen kategori otelin kendi etiketi olur; boşsa "Diğer"', () => {
    const r = parseContactsCsv('Damacana Ahmet\t0532 111 11 11\tSucu\nKırtasiye\t0212 000 00 00\t')
    expect(r.rows.map((x) => [x.category, x.customCategory])).toEqual([
      ['custom', 'Sucu'],
      ['other', null]
    ])
  })

  it('bir hücrede birden çok numara ve tırnaklı hücre okunur', () => {
    const r = parseContactsCsv('"Usta ""Ali""",0532 000 00 03 / 0212 000 00 04,electrician')
    expect(r.rows[0]).toMatchObject({
      name: 'Usta "Ali"',
      category: 'electrician',
      phones: [{ number: '0532 000 00 03' }, { number: '0212 000 00 04' }]
    })
  })

  it('virgüllü dosyada tırnak içindeki virgül hücreyi bölmez (P10fix #14)', () => {
    const r = parseContactsCsv('Ad,Telefon,Kategori\n"Yıldız Su, Ltd.",0532 000 00 01,Tedarikçi')
    expect(r.problems).toEqual([])
    expect(r.rows).toEqual([
      {
        line: 2,
        name: 'Yıldız Su, Ltd.',
        phones: [{ label: '', number: '0532 000 00 01' }],
        category: 'supplier',
        customCategory: null
      }
    ])
    expect(splitCsvLine('"a;b";"c ""d""";e', ';')).toEqual(['a;b', 'c "d"', 'e'])
  })

  it('"Adı Soyadı;Telefon;Kategori" gibi yaygın başlıklar atlanır; numaralı ilk satır başlık sayılmaz', () => {
    for (const head of ['Adı Soyadı;Telefon;Kategori', 'Kişi;Tel', 'Name;Phone', 'Имя;Телефон']) {
      const r = parseContactsCsv(`${head}\nSucu Mehmet;0532 000 00 02;Sucu`)
      expect(r.problems).toEqual([])
      expect(r.rows.map((x) => x.name)).toEqual(['Sucu Mehmet'])
    }
    const noHead = parseContactsCsv('Ad Ali;0532 000 00 05;taksi')
    expect(noHead.rows.map((x) => x.name)).toEqual(['Ad Ali'])
  })

  it('adı ya da telefonu olmayan satır satır numarasıyla bildirilir', () => {
    const r = parseContactsCsv('Munzur Su;0532 000 00 01;\n;0532;\nTaksi Durağı;;taksi')
    expect(r.rows).toHaveLength(1)
    expect(r.problems).toEqual([
      { line: 2, reason: 'noName' },
      { line: 3, reason: 'noPhone' }
    ])
  })

  it('kategori adı üç dilde ve kodla tanınır', () => {
    expect(matchCategory('Çamaşırhane')).toBe('laundry')
    expect(matchCategory('Laundry')).toBe('laundry')
    expect(matchCategory('Такси')).toBe('taxi')
    expect(matchCategory('emergency')).toBe('emergency')
    expect(matchCategory('Sucu')).toBeNull()
  })
})
