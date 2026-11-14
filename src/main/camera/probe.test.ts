// The wizard's one-picture test (Faz 20 P20g): the Node side against the stand-in process (tests/fixtures/fake-probe.mjs):
// the address goes in through the environment (never argv), the one JSON line is checked, a hung process is killed,
// an address outside the hotel's network never starts anything.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_PROBE_IMAGE_CHARS } from '@shared/contract/camera'
import { probeCamera, readProbeOutput, type ProbeCommand } from './probe'

const FIXTURE = fileURLToPath(new URL('../../../tests/fixtures/fake-probe.mjs', import.meta.url))
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const S = 'rtsp:' + '//'
const how = (over: Partial<ProbeCommand> = {}): ProbeCommand => ({
  command: process.execPath,
  args: [FIXTURE],
  cwd: ROOT,
  timeoutMs: 8_000,
  ...over
})
const src = (host: string, auth = 'kamera:gizli@', path = '/Streaming/Channels/101') =>
  `${S}${auth}${host}:554${path}`

describe('kamera denemesi (Node tarafı)', () => {
  it('başarıda görüntü data adresi ve boyut gelir', async () => {
    const out = await probeCamera(src('192.168.1.64'), how())
    expect(out).toMatchObject({ ok: true, reason: null, width: 128, height: 72 })
    expect(out.image).toMatch(/^data:image\/jpeg;base64,\/9j\//)
  })

  it('2. kanal da geçer; olmayan kanal yol hatası verir', async () => {
    expect(
      (await probeCamera(src('192.168.1.64', 'kamera:gizli@', '/Streaming/Channels/201'), how())).ok
    ).toBe(true)
    expect(
      (await probeCamera(src('192.168.1.64', 'kamera:gizli@', '/Streaming/Channels/901'), how())).reason
    ).toBe('path')
  })

  it.each([
    ['192.168.1.65', 'auth'],
    ['192.168.1.66', 'timeout'],
    ['192.168.1.67', 'unreachable'],
    ['192.168.1.68', 'path'],
    ['192.168.1.69', 'noFrame']
  ])('%s adresindeki hata "%s" nedeniyle döner ve görüntü olmaz', async (host, reason) => {
    expect(await probeCamera(src(host), how())).toEqual({
      ok: false,
      reason,
      image: null,
      width: 0,
      height: 0
    })
  })

  it('yanlış şifre kimlik hatası verir', async () => {
    expect((await probeCamera(src('192.168.1.64', 'kamera:yanlis@'), how())).reason).toBe('auth')
  })

  it('cevap vermeyen süreç zaman aşımında öldürülür', async () => {
    const started = Date.now()
    const out = await probeCamera(src('192.168.1.99'), how({ timeoutMs: 400 }))
    expect(out.reason).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('başlamayan süreç "kullanılamıyor" olur', async () => {
    expect((await probeCamera(src('192.168.1.64'), how({ command: '/yok/yok/python' }))).reason).toBe(
      'unavailable'
    )
  })

  it('bu ağın dışındaki adres hiç süreç başlatmadan reddedilir', async () => {
    // A command that would fail loudly if it were started: the answer is still "badAddress".
    const never = how({ command: '/yok/yok/python' })
    for (const bad of [src('8.8.8.8'), src('kamera.example'), 'http://192.168.1.64/x', '0', ''])
      expect((await probeCamera(bad, never)).reason).toBe('badAddress')
  })

  it('adres süreç argümanlarına girmez', () => {
    const c = how()
    expect(c.args.join(' ')).not.toContain('gizli')
  })
})

describe('sürecin çıktısı', () => {
  const json = (o: unknown): string => JSON.stringify(o) + '\n'

  it('başarılı satır görüntüyü data adresine çevirir', () => {
    const out = readProbeOutput(
      json({ ok: true, reason: null, image: '/9j/4AAQSkZJRg==', width: 10, height: 5 })
    )
    expect(out).toMatchObject({
      ok: true,
      width: 10,
      height: 5,
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    })
  })

  it('JPEG olmayan, bozuk ya da boyutsuz görüntü "kare yok" sayılır', () => {
    for (const image of ['AAAAAAAA', 'not base64!!', '', null])
      expect(readProbeOutput(json({ ok: true, image, width: 1, height: 1 })).reason).toBe('noFrame')
    expect(readProbeOutput(json({ ok: true, image: '/9j/4AAQ', width: 'x', height: 1 })).reason).toBe(
      'noFrame'
    )
  })

  it('çok büyük görüntü "kare yok" sayılır (sözleşme sınırı)', () => {
    const image = '/9j/' + 'A'.repeat(MAX_PROBE_IMAGE_CHARS)
    expect(readProbeOutput(json({ ok: true, image, width: 1, height: 1 })).reason).toBe('noFrame')
  })

  it('bilinmeyen neden "kare yok", çıktı yoksa ya da JSON değilse "kullanılamıyor" olur', () => {
    expect(readProbeOutput(json({ ok: false, reason: 'uzay' })).reason).toBe('noFrame')
    expect(readProbeOutput('').reason).toBe('unavailable')
    expect(readProbeOutput('Traceback ...').reason).toBe('unavailable')
  })

  it('başında uyarı satırları olsa da son satır okunur', () => {
    expect(readProbeOutput('warning\n' + json({ ok: false, reason: 'auth' })).reason).toBe('auth')
  })
})
