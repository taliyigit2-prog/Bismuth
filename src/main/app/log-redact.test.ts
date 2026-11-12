// Faz 16 madde 2: "hata günlüğü dosyası (kişisel veri içermez)". The same electron-log set-up as the program (Node
// build, a temporary folder) writes a guest record, an error and free text; the file holds none of the personal values.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { redactLogData, redactText, setUpErrorLog } from './log-redact'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

// Invented sample person (CLAUDE.md: no real identity data in the repository; the number is built at run time).
const idNumber = ['1', '0000', '0001', '46'].join('')
const guest = {
  id: '01JB0000000000000000000001',
  firstName: 'Melis',
  lastName: 'Karadağlı',
  phone: '+90 555 010 20 30',
  email: 'melis.k@example.com',
  idDocNumber: idNumber,
  standingNote: 'Kat 3 ister, eşi Ahmet ile gelir',
  vip: true,
  status: 'checked_in',
  checkIn: '2026-10-04',
  amountMinor: 250_000
}

describe('hata günlüğünde kişisel veri yok (Faz 16)', () => {
  it('kayıt nesnesinde ad, telefon, e-posta, kimlik ve not gizlenir; kimlik, durum, tarih ve tutar kalır', () => {
    const [clean] = redactLogData([guest]) as [Record<string, unknown>]
    for (const key of ['firstName', 'lastName', 'phone', 'email', 'idDocNumber', 'standingNote'])
      expect(clean[key], key).toBe('[gizli]')
    expect(clean).toMatchObject({
      id: guest.id,
      vip: true,
      status: 'checked_in',
      checkIn: '2026-10-04',
      amountMinor: 250_000
    })
    // The original object is not changed.
    expect(guest.firstName).toBe('Melis')
  })

  it('serbest metinde telefon, T.C. kimlik, pasaport, e-posta ve IBAN maskelenir; tarih ve saat kalır', () => {
    const text = redactText(
      `Misafir aradı 0532 123 45 67 / +90 (555) 010-2030, kimlik ${idNumber}, pasaport U12345678, ` +
        'posta ali.veli@example.com, IBAN TR33 0006 1005 1978 6457 8413 26, giriş 2026-10-04 14:30, ' +
        'kayıt 2026-10-04T11:30:00.000Z, oda 302, satır 12'
    )
    expect(text).not.toMatch(/532|555|010|U12345678|ali\.veli|TR33|1978/)
    expect(text).not.toContain(idNumber)
    expect(text).toContain('[numara]')
    expect(text).toContain('[belge]')
    expect(text).toContain('[e-posta]')
    expect(text).toContain('[iban]')
    expect(text).toContain('2026-10-04 14:30')
    expect(text).toContain('2026-10-04T11:30:00.000Z')
    expect(text).toContain('oda 302, satır 12')
  })

  it('hata nesnesi adını ve yığınını korur, iletideki kişisel veri maskelenir; döngülü nesne günlüğü kırmaz', () => {
    const error = new Error(`UNIQUE constraint failed for phone 0532 123 45 67`)
    error.name = 'SqliteError'
    const loop: Record<string, unknown> = { id: 'x' }
    loop['self'] = loop
    const [cleanError, cleanLoop] = redactLogData([error, loop]) as [Error, Record<string, unknown>]
    expect(cleanError).toBeInstanceOf(Error)
    expect(cleanError.name).toBe('SqliteError')
    expect(cleanError.message).toBe('UNIQUE constraint failed for phone [numara]')
    expect(cleanError.stack).not.toContain('0532')
    expect(cleanLoop).toEqual({ id: 'x', self: '[circular]' })
  })

  it('programın günlük ayarıyla yazılan dosyada (userData/logs/main.log) kişisel değerler yer almaz', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-logs-'))
    temps.push(dir)
    const { default: nodeLog } = await import('electron-log/node')
    const log = nodeLog.create({ logId: `p16a-${Date.now()}` })
    log.transports.console.level = false
    setUpErrorLog(log, dir)
    log.error('api internal error', '/api/guests.update', new Error(`bad row for ${guest.email}`))
    log.error('window error', { kind: 'render', message: `Cannot read ${guest.phone}`, route: '/guests' })
    log.warn('guest', guest)
    const file = join(dir, 'main.log')
    await expect.poll(() => existsSync(file) && readFileSync(file, 'utf8').includes('[gizli]')).toBe(true)
    const written = readFileSync(file, 'utf8')
    for (const value of [
      guest.firstName,
      guest.lastName,
      guest.phone,
      '010 20 30',
      guest.email,
      idNumber,
      'Ahmet'
    ])
      expect(written, value).not.toContain(value)
    expect(written).toContain('/api/guests.update')
    expect(written).toContain('/guests')
    expect(written).toContain(guest.id)
  })
})

// Son kontrol (QA2c #7): forms that passed the filter. Invented values only: the 11-digit number fails the T.C.
// check-digit rule (built at run time), the phone and the IBAN are samples.
describe('hata günlüğü süzgeci: bitişik, bölünmez boşluklu, küçük harfli biçimler', () => {
  const fakeId = ['1234', '5678', '901'].join('')
  const phone = '05321234567'
  const iban = 'TR330006100519786457841326'
  const cases: [label: string, text: string, secret: string][] = [
    ['telefon iki noktadan sonra', `Tel:${phone}`, phone],
    ['kimlik "T.C." ile bitişik', `T.C.${fakeId}`, fakeId],
    ['kimlik tireyle bitişik', `kimlik-${fakeId}`, fakeId],
    ['telefon bölünmez boşlukla (U+00A0)', '0532 123 45 67', '123 45 67'],
    ['IBAN küçük harf', iban.toLowerCase(), '0006100519786457841326'],
    ['IBAN tireli', 'TR33-0006-1005-1978-6457-8413-26', '1978-6457-8413'],
    ['pasaport küçük harf', 'pasaport u12345678', '12345678'],
    ['pasaport üç harfli önek', 'passport ABC1234567', '1234567']
  ]
  for (const [label, text, secret] of cases)
    it(`serbest metin: ${label} maskelenir`, () => {
      expect(redactText(text), text).not.toContain(secret)
    })

  it('saat, tarih, oda ve satır numarası yine okunur kalır', () => {
    expect(redactText('giriş 2026-10-04 14:30:15, oda 302, satır 12:7')).toBe(
      'giriş 2026-10-04 14:30:15, oda 302, satır 12:7'
    )
  })

  it('nesnede açıklama, arama sorgusu ve teslim alan kişi alanları gizlenir', () => {
    const [clean] = redactLogData([
      {
        description: 'Melis Karadağlı için avans',
        q: 'Melis Karadağlı',
        query: 'Karadağlı',
        search: 'Karadağlı',
        returnedTo: 'Melis Karadağlı',
        status: 'kept'
      }
    ]) as [Record<string, unknown>]
    expect(JSON.stringify(clean)).not.toContain('Karadağlı')
    expect(clean['status']).toBe('kept')
  })
})
