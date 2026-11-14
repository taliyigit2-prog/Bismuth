import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { FetchLike } from '../http'
import {
  TELEGRAM_MAX_CHATS,
  TELEGRAM_TIMEOUT_MS,
  createTelegramClient,
  isValidChatId,
  isValidToken,
  parseChatIds,
  type TelegramCredentials,
  type TelegramDeps
} from './index'

// Made-up values: a token-shaped string long enough for the check but not a real bot's.
const TOKEN = '1234567:TESTtokenNotReal_abc'
const creds: TelegramCredentials = { token: TOKEN, chatIds: ['-100123', '42'] }

interface Seen {
  url: string
  method: string
  body: unknown
}

function recorder(status = 200): { fetch: FetchLike; seen: Seen[] } {
  const seen: Seen[] = []
  const fetchFn: FetchLike = (url, init) => {
    seen.push({ url, method: String(init.method), body: init.body })
    return Promise.resolve(new Response('{}', { status }))
  }
  return { fetch: fetchFn, seen }
}

const client = (over: Partial<TelegramDeps> = {}) =>
  createTelegramClient({ enabled: () => true, credentials: () => creds, ...over })

describe('Telegram istemcisi (K-50)', () => {
  it('ağ ya da Telegram ayarı kapalıyken tek istek bile çıkmaz', async () => {
    const { fetch, seen } = recorder()
    let enabled = false
    const c = client({ fetch, enabled: () => enabled })
    expect(await c.sendAlert({ text: 'x' })).toEqual({ ok: false, reason: 'off' })
    expect(c.requestCount).toBe(0)
    expect(seen).toHaveLength(0)
    enabled = true // ayar çalışırken açılır: her çağrıda okunur
    expect((await c.sendAlert({ text: 'x' })).ok).toBe(true)
  })

  it('bilgi yoksa ya da biçim bozuksa istek çıkmaz; token yanıta sızmaz', async () => {
    const { fetch, seen } = recorder()
    expect(await client({ fetch, credentials: () => null }).sendAlert({ text: 'x' })).toEqual({
      ok: false,
      reason: 'noCredentials'
    })
    const evil = client({ fetch, credentials: () => ({ token: '1234:abc/../../x', chatIds: ['1'] }) })
    const out = await evil.sendAlert({ text: 'x' })
    expect(out).toEqual({ ok: false, reason: 'invalidCredentials' })
    const badChat = client({ fetch, credentials: () => ({ token: TOKEN, chatIds: ['1/../x'] }) })
    expect((await badChat.sendAlert({ text: 'x' })).ok).toBe(false)
    expect(seen).toHaveLength(0)
    expect(JSON.stringify(await client({ fetch }).sendAlert({ text: 'x' }))).not.toContain(TOKEN)
  })

  it('her sohbete yalnız api.telegram.org adresine, düz metin olarak gider', async () => {
    const { fetch, seen } = recorder()
    const out = await client({ fetch }).sendAlert({ text: 'Merdiven: kayıtsız giriş' })
    expect(out).toEqual({ ok: true, sent: 2, failed: 0 })
    expect(seen.map((s) => s.url)).toEqual([
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      `https://api.telegram.org/bot${TOKEN}/sendMessage`
    ])
    expect(JSON.parse(seen[0]!.body as string)).toEqual({
      chat_id: '-100123',
      text: 'Merdiven: kayıtsız giriş'
    })
    expect(seen[0]!.method).toBe('POST')
  })

  it('en çok TELEGRAM_MAX_CHATS sohbete gider; fazlası için istek çıkmaz', async () => {
    const { fetch, seen } = recorder()
    const many = Array.from({ length: TELEGRAM_MAX_CHATS + 7 }, (_, i) => String(100 + i))
    const out = await client({ fetch, credentials: () => ({ token: TOKEN, chatIds: many }) }).sendAlert({
      text: 'x'
    })
    expect(out).toEqual({ ok: true, sent: TELEGRAM_MAX_CHATS, failed: 0 })
    expect(seen).toHaveLength(TELEGRAM_MAX_CHATS)
  })

  it('toplam süre dolunca kalan sohbetlere istek çıkmaz ve kuyruğa alınmaz', async () => {
    let calls = 0
    const slow: FetchLike = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 40))
      return new Response('{}', { status: 200 })
    }
    const chats = ['1', '2', '3', '4', '5']
    const out = await client({
      fetch: slow,
      totalMs: 60,
      credentials: () => ({ token: TOKEN, chatIds: chats })
    }).sendAlert({ text: 'x' })
    expect(calls).toBe(2) // 0 ms and 40 ms start; at 80 ms the 60 ms budget is gone
    expect(out).toEqual({ ok: true, sent: 2, failed: 3 })
  })

  it('fotoğraf eki ayarı açıkken sendPhoto, kapalıyken ya da fotoğraf yokken sendMessage kullanılır', async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff])
    const on = recorder()
    await client({ fetch: on.fetch, photoEnabled: () => true }).sendAlert({ text: 'a', photo })
    expect(on.seen[0]!.url).toContain('/sendPhoto')
    expect(on.seen[0]!.body).toBeInstanceOf(FormData)
    expect((on.seen[0]!.body as FormData).get('caption')).toBe('a')

    const off = recorder()
    await client({ fetch: off.fetch, photoEnabled: () => false }).sendAlert({ text: 'a', photo })
    expect(off.seen[0]!.url).toContain('/sendMessage')

    const none = recorder()
    await client({ fetch: none.fetch, photoEnabled: () => true }).sendAlert({ text: 'a', photo: null })
    expect(none.seen[0]!.url).toContain('/sendMessage')
  })

  it('zaman aşımı 5 saniyedir; takılan istek sessizce başarısız olur, hata fırlatılmaz', async () => {
    expect(TELEGRAM_TIMEOUT_MS).toBe(5_000)
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    const started = Date.now()
    const out = await client({ fetch: hang, timeoutMs: 60 }).sendAlert({ text: 'x' })
    expect(out).toEqual({ ok: false, reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('ağ yokken (bağlantı hatası) sessizce başarısız olur; yeniden deneme ve kuyruk yoktur', async () => {
    let calls = 0
    const down: FetchLike = () => {
      calls++
      return Promise.reject(new TypeError('fetch failed'))
    }
    const c = client({ fetch: down, credentials: () => ({ token: TOKEN, chatIds: ['1'] }) })
    expect(await c.sendAlert({ text: 'x' })).toEqual({ ok: false, reason: 'network' })
    expect(calls).toBe(1)
    expect(c.requestCount).toBe(1)
  })

  it('Telegram yanıt vermese de bir sohbete gitmiş olması başarı sayılır', async () => {
    let n = 0
    const half: FetchLike = () => Promise.resolve(new Response('{}', { status: n++ === 0 ? 200 : 400 }))
    expect(await client({ fetch: half }).sendAlert({ text: 'x' })).toEqual({ ok: true, sent: 1, failed: 1 })
  })

  describe('sahte yerel sunucuyla (gerçek HTTP)', () => {
    let server: Server | null = null
    afterEach(async () => {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
      server = null
    })

    it('istek <origin>/api.telegram.org/bot…/sendMessage yoluna ve JSON gövdeyle gider', async () => {
      const got: { path: string; body: string }[] = []
      server = createServer((req, res) => {
        let body = ''
        req.on('data', (d: Buffer) => (body += d.toString()))
        req.on('end', () => {
          got.push({ path: req.url ?? '', body })
          res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
        })
      })
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const out = await client({ origin, credentials: () => ({ token: TOKEN, chatIds: ['7'] }) }).sendAlert({
        text: 'merhaba'
      })
      expect(out).toEqual({ ok: true, sent: 1, failed: 0 })
      expect(got[0]!.path).toBe(`/api.telegram.org/bot${TOKEN}/sendMessage`)
      expect(JSON.parse(got[0]!.body)).toEqual({ chat_id: '7', text: 'merhaba' })
    })
  })

  it('belirteç ve sohbet biçimi denetlenir', () => {
    expect(isValidToken(TOKEN)).toBe(true)
    expect(isValidToken('abc')).toBe(false)
    expect(isValidChatId('-1001234')).toBe(true)
    expect(isValidChatId('@otelkanal')).toBe(true)
    expect(isValidChatId('1; drop')).toBe(false)
    expect(parseChatIds('-1001, 55 ;@otelkanal  kötü/giriş')).toEqual(['-1001', '55', '@otelkanal'])
  })
})
