// Faz 13 madde 10 — security of the server mode's HTTP surface, over the real router, services and an in-memory
// hotel: no session → 401; a role's missing right → 403; a "local network only" role from the private network →
// 403; sign-in tries limited before any password hash; a revoked session stops at once; CSRF (Content-Type, Origin);
// no CORS, CSP on every answer; only this computer's own names and private addresses are served; the server never
// listens on a public address or 0.0.0.0. "Faz 4'ten notlar": no names in the sign-in list over HTTP, device id
// only from the server's signed HttpOnly cookie, the setup wizard never over the network, lock counter per session.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLog, sessions, users } from '../../src/main/db/schema'
import { hashSecret, remoteAccessOfUser } from '../../src/main/services/auth-service'
import { localOwnerCtx, systemCtx } from '../../src/main/services/context'
import { readSetting } from '../../src/main/services/settings-service'
import { ctxForUser } from '../../src/main/services/users-service'
import { createHostController } from '../../src/main/server/host-controller'
import { createHttpSessions } from '../../src/main/server/http-sessions'
import { signDevice } from '../../src/main/server/cookies'
import { CSP } from '../../src/main/server/static'
import { browserLocale } from '../../src/main/server/host-app'
import { tFor } from '../../src/main/app/i18n'
import {
  hostHarness,
  HOST,
  LAN_PHONE,
  NETBIRD_PHONE,
  ORIGIN,
  PASSWORD,
  phone,
  type HostHarness
} from './host-harness'

let h: HostHarness
afterEach(() => h?.close())

const signIn = (p: ReturnType<typeof phone>, username: string, secret = PASSWORD) =>
  p.call('auth.signIn', { username, secret })

describe('oturum ve yetki (HTTP)', () => {
  it('oturumsuz /api çağrısı 401; oturum açılınca aynı çağrı çalışır', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    expect((await p.call('rooms.list')).status).toBe(401)
    expect((await signIn(p, 'sahip')).status).toBe(200)
    expect((await p.call('rooms.list')).status).toBe(200)
  })

  it('oturum çerezi HttpOnly + SameSite=Strict; belirteç yanıt gövdesinde yok', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    const res = await signIn(p, 'sahip')
    const cookies = res.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/)
      expect(c).toMatch(/SameSite=Strict/)
      expect(c).toMatch(/Path=\//)
    }
    expect(JSON.stringify(res.body)).not.toContain(p.jar.get('bismuth_session'))
  })

  it('rolün yetkisi olmayan çağrı 403 (Temizlik kasa defterini okuyamaz)', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    h.user('kat', 'housekeeping')
    const p = phone(h.app)
    expect((await signIn(p, 'kat')).status).toBe(200)
    const res = await p.call('audit.list', {})
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ error: { code: 'PERMISSION_DENIED' } })
  })

  it('uzaktan erişimi kapalı rol HTTP üzerinden oturum açamaz (401, kim olduğunu söylemez)', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    h.user('kat', 'housekeeping')
    h.setRoleAccess('housekeeping', 'off')
    const res = await signIn(phone(h.app), 'kat')
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { messageKey: 'errors.invalidCredentials' } })
  })

  it('"yalnız yerel ağ" rolü otel Wi‑Fi\'ından açar; özel ağ (NetBird 100.x) adresinden 403 alır', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    h.user('kat', 'housekeeping')
    h.setRoleAccess('housekeeping', 'lan')
    // From the private network: refused with a clear reason (only after the right password).
    const outside = phone(h.app, NETBIRD_PHONE)
    const wrong = await signIn(outside, 'kat', 'yanlis-sifre-9')
    expect(wrong.status).toBe(401)
    const refused = await signIn(outside, 'kat')
    expect(refused.status).toBe(403)
    expect(refused.body).toMatchObject({ error: { messageKey: 'errors.remoteLanOnly' } })
    // From the hotel's Wi-Fi: fine; the same session taken outside stops working (403), public calls still answer.
    const inside = phone(h.app, LAN_PHONE)
    expect((await signIn(inside, 'kat')).status).toBe(200)
    expect((await inside.call('rooms.list')).status).toBe(200)
    const carried = phone(h.app, NETBIRD_PHONE)
    for (const [k, v] of inside.jar) carried.jar.set(k, v)
    const res = await carried.call('rooms.list')
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ error: { messageKey: 'errors.remoteLanOnly' } })
    expect((await carried.call('auth.state')).status).toBe(200)
  })

  it('belirteç iptali anında geçerli: cihaz çıkarılınca sonraki istek 401', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    expect((await p.call('rooms.list')).status).toBe(200)
    const session = h.handle.db.select().from(sessions).get()!
    h.services.auth.revokeDevice(systemCtx(), session.deviceId)
    expect((await p.call('rooms.list')).status).toBe(401)
    // The cookie is cleared as well.
    expect(p.jar.has('bismuth_session')).toBe(false)
  })

  it('giriş listesi HTTP üzerinden boş (uzaktan ad tahmini yok); kurulum sihirbazı ağdan çalışmaz', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    expect((await p.call('auth.signInUsers')).body).toEqual([])
    await signIn(p, 'sahip')
    const setup = await p.call('setup.options')
    expect(setup.status).toBe(409)
    expect(setup.body).toMatchObject({ error: { messageKey: 'errors.setupDone' } })
  })

  it('kurulmamış otelde ağdan kurulum yordamları reddedilir (sihirbaz yalnız otel bilgisayarında)', async () => {
    h = await hostHarness()
    const p = phone(h.app)
    const res = await p.call('setup.options')
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: { messageKey: 'errors.setupNeeded' } })
  })

  it('cihaz kimliği yalnız sunucunun imzaladığı çerezden: uydurma cihaz çerezi yok sayılır', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    const first = h.handle.db.select().from(sessions).get()!.deviceId
    // A forged cookie naming the same device id without the host's signature: a new device row, not that one.
    const forger = phone(h.app)
    forger.jar.set('bismuth_device', `${first}.forged`)
    await signIn(forger, 'sahip')
    const devices = new Set(
      h.handle.db
        .select()
        .from(sessions)
        .all()
        .map((s) => s.deviceId)
    )
    expect(devices.size).toBe(2)
    // The real signed cookie keeps the same device.
    const again = phone(h.app)
    again.jar.set('bismuth_device', signDevice(first, h.secret))
    await signIn(again, 'sahip')
    expect(
      new Set(
        h.handle.db
          .select()
          .from(sessions)
          .all()
          .map((s) => s.deviceId)
      ).size
    ).toBe(2)
  })

  it('kilit sayacı oturum başına: 5 yanlış kilit açma denemesinden sonra o oturum kapanır', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner', { pinHash: hashSecret('8642') })
    const p = phone(h.app)
    await signIn(p, 'sahip')
    expect((await p.call('auth.lock')).status).toBe(200)
    expect((await p.call('rooms.list')).status).toBe(401)
    for (let i = 0; i < 4; i++) expect((await p.call('auth.unlock', { secret: '1111' })).status).toBe(401)
    const last = await p.call('auth.unlock', { secret: '1111' })
    expect(last.body).toMatchObject({ error: { messageKey: 'errors.unauthenticated' } })
    expect(p.jar.has('bismuth_session')).toBe(false)
    // Another phone of the same person is not affected (it unlocks with the password: K-45 (2)).
    const other = phone(h.app)
    await signIn(other, 'sahip')
    await other.call('auth.lock')
    expect((await other.call('auth.unlock', { secret: PASSWORD })).status).toBe(200)
  })
})

describe('K-45 (2): ağdan yalnız kullanıcı adı + şifre', () => {
  it('PIN ile giriş ağdan 403 (O-2); PIN ağda kilit de açmaz, şifre açar', async () => {
    h = await hostHarness()
    const id = h.user('sahip', 'owner', { pinHash: hashSecret('8642') })
    const p = phone(h.app)
    const pin = await p.call('auth.signInWithPin', { userId: id, pin: '8642' })
    expect(pin.status).toBe(403)
    expect(pin.body).toMatchObject({ error: { messageKey: 'errors.pinDesktopOnly' } })
    expect(p.jar.has('bismuth_session')).toBe(false)
    await signIn(p, 'sahip')
    await p.call('auth.lock')
    expect((await p.call('auth.unlock', { secret: '8642' })).status).toBe(401)
    expect((await p.call('auth.unlock', { secret: PASSWORD })).status).toBe(200)
  })

  it('ağdan yanlış şifreler yalnız uzaktan girişi kilitler; otel bilgisayarının penceresi açılır (O-3)', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    // Different addresses, so the per-address limit is not what stops them.
    for (let i = 0; i < 5; i++)
      expect((await signIn(phone(h.app, `192.168.1.${60 + i}`), 'sahip', `yanlis-${i}-sifre`)).status).toBe(
        401
      )
    const row = h.handle.db.select().from(users).where(eq(users.username, 'sahip')).get()!
    expect(row).toMatchObject({ failedAttempts: 0, lockedUntil: null, remoteFailedAttempts: 5 })
    expect(row.remoteLockedUntil).not.toBeNull()
    // Remote sign-in is locked even with the right password…
    const lockedRight = await signIn(phone(h.app, '192.168.1.70'), 'sahip')
    expect(lockedRight.status).toBe(401)
    // …and says so (QA3d): the lock text only for the right password, a wrong one stays "invalid".
    expect(lockedRight.body).toMatchObject({ error: { messageKey: 'errors.accountLocked' } })
    const lockedWrong = await signIn(phone(h.app, '192.168.1.71'), 'sahip', 'yanlis-baska-sifre')
    expect(lockedWrong.body).toMatchObject({ error: { messageKey: 'errors.invalidCredentials' } })
    // …the reception's own window is not.
    const desk = h.services.auth.login({
      username: 'sahip',
      secret: PASSWORD,
      device: { kind: 'desktop', deviceName: 'Resepsiyon' }
    })
    expect(desk.userId).toBe(row.id)
  })
})

describe('K-45 (3): anahtar ve Drive klasörü yalnız masaüstü penceresinde', () => {
  it('Bismuth anahtarı ağdan gösterilmez, girilmez, değiştirilmez; anahtarlı geri yükleme ağdan yapılmaz (Y-1)', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    const shown = await p.call('backup.recoveryText')
    expect(shown.status).toBe(409)
    expect(shown.body).toMatchObject({ error: { messageKey: 'errors.backupDesktopOnly' } })
    const text = 'ABCDE-FGHJK-MNPQR-STVWX-YZ234-56789-ABCDE-FGHJK-MNPQR-STVWX-YZ234'
    const set = await p.call('backup.setRecoveryText', { text, replace: true })
    expect(set.body).toMatchObject({ error: { messageKey: 'errors.backupDesktopOnly' } })
    const restore = await p.call('backup.restore', {
      source: 'drive',
      id: 'bismuth-yedek-2026-10-01-0400.bmy',
      recoveryText: text
    })
    expect(restore.body).toMatchObject({ error: { messageKey: 'errors.backupDesktopOnly' } })
    // No key was made or shown on the way.
    expect(
      h.handle.db
        .select()
        .from(auditLog)
        .all()
        .some((r) => r.entityId === 'recovery_text')
    ).toBe(false)
  })

  it('ağdan ayar: bilgisayarın çalışma biçimi, sunucu, kutu ve Drive klasörü değişmez (O-6, O-7); dönem hiçbir ekrandan yazılmaz', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    for (const patch of [
      { 'app.mode': 'standalone' },
      { 'host.port': 8080 },
      { 'host.listenLan': true },
      { 'relay.enabled': false },
      { 'relay.excludeIdentity': false },
      { 'summary.enabled': false },
      { 'backup.driveFolder': '/tmp/baska-klasor' }
    ]) {
      const res = await p.call('settings.set', patch)
      expect(res.status, JSON.stringify(patch)).toBe(403)
      expect(res.body).toMatchObject({ error: { messageKey: 'errors.remoteLocalOnly' } })
    }
    const epoch = await p.call('settings.set', { 'host.epoch': 9 })
    expect(epoch.status).toBe(400)
    expect(readSetting(h.handle.db, 'host.epoch')).toBe(1)
    // The hotel's window cannot point at a network share either (an NTLM sign-in would go to that server).
    for (const unc of ['\\\\saldirgan\\paylasim', '//saldirgan/paylasim', '\\\\?\\C:\\x'])
      expect(() => h.services.settings.set(localOwnerCtx(), { 'backup.driveFolder': unc }), unc).toThrow(
        expect.objectContaining({ code: 'VALIDATION' })
      )
    // Other settings still work from a phone.
    expect((await p.call('settings.set', { 'hotel.checkinTime': '13:00' })).status).toBe(200)
  })
})

describe('hız sınırı', () => {
  it('giriş denemeleri adres başına sınırlı: sınırdan sonra şifre denenmeden 429', async () => {
    h = await hostHarness({ limits: { signInTries: 3 } })
    h.user('sahip', 'owner')
    const p = phone(h.app)
    for (let i = 0; i < 3; i++) expect((await signIn(p, 'sahip', `yanlis-${i}-sifre`)).status).toBe(401)
    const failedBefore = h.handle.db.select().from(auditLog).where(eq(auditLog.action, 'login_failed')).all()
    const blocked = await signIn(p, 'sahip')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toMatchObject({
      error: { code: 'RATE_LIMITED', messageKey: 'errors.tooManyAttempts' }
    })
    // Refused before the service: no new failure row (no hash was computed).
    const failedAfter = h.handle.db.select().from(auditLog).where(eq(auditLog.action, 'login_failed')).all()
    expect(failedAfter).toHaveLength(failedBefore.length)
    // Another address is not paused.
    expect((await signIn(phone(h.app, '192.168.1.46'), 'sahip')).status).toBe(200)
  })

  it('istekler adres başına sınırlı (429)', async () => {
    h = await hostHarness({ limits: { requestsPerMinute: 5 } })
    const p = phone(h.app)
    const statuses = []
    for (let i = 0; i < 7; i++) statuses.push((await p.call('remote.hello')).status)
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(statuses.slice(5)).toEqual([429, 429])
  })
})

describe('istek gövdesi sınırı (Y-2)', () => {
  it('oturumsuz 8 MB üstü giriş isteği 413 alır, gövde okunmaz; kopya akışına gövdeli istek 413', async () => {
    h = await hostHarness({ replica: {} })
    h.user('sahip', 'owner')
    const p = phone(h.app)
    const big = JSON.stringify({ username: 'sahip', secret: 'x'.repeat(8 * 1024 * 1024 + 10) })
    const res = await p.request('/api/auth.signIn', { method: 'POST', body: big })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { messageKey: 'errors.requestTooLarge' } })
    // Chunked (no length given) is counted as it arrives.
    const chunks = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 9; i++) controller.enqueue(new Uint8Array(1024 * 1024))
        controller.close()
      }
    })
    const streamed = await p.request('/api/auth.signIn', {
      method: 'POST',
      body: chunks,
      duplex: 'half'
    } as RequestInit & { duplex: 'half'; headers?: Record<string, string> })
    expect(streamed.status).toBe(413)
    const feed = await p.request('/api/replica/changes?after=0', {
      method: 'GET',
      headers: { 'content-length': '5' }
    })
    expect(feed.status).toBe(413)
    // A normal sign-in still works.
    expect((await signIn(p, 'sahip')).status).toBe(200)
  })
})

describe('K-45 (1): yerel ağ yalnız açılınca', () => {
  it("varsayılan: otel Wi‑Fi'ından gelen istek 403 (yerel ağ kapalı); özel ağ (NetBird) ve bu bilgisayar açılır", async () => {
    h = await hostHarness({ listenLan: false })
    h.user('sahip', 'owner')
    const wifi = await phone(h.app, LAN_PHONE).call('remote.hello')
    expect(wifi.status).toBe(403)
    expect(wifi.body).toMatchObject({ error: { messageKey: 'errors.remoteLanOff' } })
    expect((await phone(h.app, LAN_PHONE).request('/')).status).toBe(403)
    expect((await phone(h.app, NETBIRD_PHONE).call('remote.hello')).status).toBe(200)
    expect((await phone(h.app, '127.0.0.1').call('remote.hello')).status).toBe(200)
    expect(readSetting(h.handle.db, 'host.listenLan')).toBe(false)
  })

  it('oturum kilidi kayıtta tutulur: ana bilgisayar yeniden başlasa da kilitli telefon kilitli kalır (D3)', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    await p.call('auth.lock')
    expect(h.handle.db.select().from(sessions).get()!.lockedAt).not.toBeNull()
    // A fresh session layer (the program started again) over the same data.
    const restarted = createHttpSessions({
      setupDone: () => true,
      resolve: (token, ip) => h.services.auth.resolveSession(token, ip),
      userCtx: (userId, deviceId, network) => ctxForUser(h.handle.db, userId, deviceId, 'http', network),
      remoteAccess: (userId) => remoteAccessOfUser(h.handle.db, userId),
      endSession: () => undefined,
      secret: h.secret,
      sessionHours: () => 12
    })
    const caller = restarted.open({
      cookies: Object.fromEntries(p.jar),
      ip: LAN_PHONE,
      network: 'lan',
      device: { kind: 'mobile', name: 'iPhone', platform: 'iPhone' }
    })
    expect(caller.ctx.kind).toBe('locked')
    expect((await p.call('auth.unlock', { secret: PASSWORD })).status).toBe(200)
    expect(h.handle.db.select().from(sessions).get()!.lockedAt).toBeNull()
  })
})

describe('CSRF, CORS, CSP, kaynak', () => {
  it('Origin yoksa ya da başka siteyse 403; JSON değilse 400', async () => {
    h = await hostHarness()
    const p = phone(h.app)
    const noOrigin = await p.request('/api/remote.hello', {
      method: 'POST',
      body: '{}',
      headers: { origin: '' }
    })
    expect(noOrigin.status).toBe(403)
    const evil = await p.call('remote.hello', {}, { origin: 'http://kotu-site.example' })
    expect(evil.status).toBe(403)
    expect(evil.body).toMatchObject({ error: { messageKey: 'errors.badOrigin' } })
    const crossSite = await p.call('remote.hello', {}, { 'sec-fetch-site': 'cross-site' })
    expect(crossSite.status).toBe(403)
    const form = await p.request('/api/remote.hello', {
      method: 'POST',
      body: 'a=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    })
    expect(form.status).toBe(400)
    expect((await p.call('remote.hello')).status).toBe(200)
  })

  it('CORS yok: ön kontrol (OPTIONS) reddedilir, hiçbir yanıtta Access-Control-Allow-Origin başlığı yok', async () => {
    h = await hostHarness()
    const p = phone(h.app)
    const pre = await p.request('/api/rooms.list', {
      method: 'OPTIONS',
      headers: { origin: 'http://kotu-site.example', 'access-control-request-method': 'POST' }
    })
    expect(pre.status).toBe(405)
    expect(pre.headers.get('access-control-allow-origin')).toBeNull()
    const res = await p.call('remote.hello')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('content-security-policy')).toContain("connect-src 'self'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('genel (internet) adresinden gelen istek 403; tanınmayan ad (DNS rebinding) 421', async () => {
    h = await hostHarness()
    const fromInternet = phone(h.app, '203.0.113.9')
    expect((await fromInternet.call('remote.hello')).status).toBe(403)
    expect((await fromInternet.request('/')).status).toBe(403)
    const p = phone(h.app)
    const rebound = await p.request('/api/remote.hello', {
      method: 'POST',
      body: '{}',
      headers: { host: 'kotu-site.example:7373', origin: 'http://kotu-site.example:7373' }
    })
    expect(rebound.status).toBe(421)
    const named = await p.request('/api/remote.hello', {
      method: 'POST',
      body: '{}',
      headers: { host: 'bismuth-host.netbird.cloud:7373', origin: 'http://bismuth-host.netbird.cloud:7373' }
    })
    expect(named.status).toBe(200)
    // O-1: a name that only starts with this computer's name belongs to another site.
    const prefixed = await p.request('/api/remote.hello', {
      method: 'POST',
      body: '{}',
      headers: { host: 'otel-pc.saldirgan.example:7373', origin: 'http://otel-pc.saldirgan.example:7373' }
    })
    expect(prefixed.status).toBe(421)
  })

  it('reddedilen sayfa isteği tarayıcının dilinde kısa bir cümle alır; durum kodları aynı kalır (G-08)', async () => {
    h = await hostHarness()
    const fromInternet = phone(h.app, '203.0.113.9')
    const ru = await fromInternet.request('/', { headers: { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' } })
    expect(ru.status).toBe(403)
    expect(await ru.text()).toBe(tFor('ru')('errors.remoteForbidden'))
    const p = phone(h.app)
    const missing = await p.request('/yok-boyle-bir-dosya.txt', { headers: { 'accept-language': 'tr-TR' } })
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe(tFor('tr')('server.refused.notFound'))
    const misdirected = await p.request('/', {
      headers: { host: 'kotu-site.example:7373', 'accept-language': 'en' }
    })
    expect(misdirected.status).toBe(421)
    expect(await misdirected.text()).toBe(tFor('en')('server.refused.misdirected'))
    for (const res of [ru, missing, misdirected])
      expect(res.headers.get('content-type')).toContain('charset=UTF-8')
    expect(browserLocale('de-DE,de;q=0.9,ru;q=0.5')).toBe('ru')
    expect(browserLocale('fr')).toBe('tr')
  })

  it('CSP yazı tipini yalnız programın kendi dosyalarından alır (D10: data: yok)', () => {
    expect(CSP).toContain("font-src 'self';")
    expect(CSP).not.toMatch(/font-src[^;]*data:/)
  })

  it('her yanıt sürüm başlığı taşır (telefon ana bilgisayarın güncellendiğini anlar)', async () => {
    h = await hostHarness({ version: '1.2.3' })
    const res = await phone(h.app).call('remote.hello')
    expect(res.headers.get('x-bismuth-version')).toBe('1.2.3')
    expect(res.body).toMatchObject({ app: 'bismuth', version: '0.0.0' })
    expect(ORIGIN).toBe(`http://${HOST}`)
  })
})

describe('dinleme adresleri', () => {
  it("sunucu dış (genel) arayüze ve 0.0.0.0'a bağlanmaz; yalnız bu bilgisayar + yerel/özel ağ", async () => {
    const controller = createHostController({
      fetch: () => new Response('ok'),
      port: () => 47464,
      // A computer plugged straight into a modem: its public address must not be served.
      interfaces: () => ({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '', mac: '', cidr: null }],
        eth0: [{ address: '203.0.113.5', family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null }]
      }),
      discovery: null,
      announcement: () => ({ name: 'Bismuth (test)', schemaVersion: 0, hotelName: 'x' })
    })
    await controller.start()
    try {
      expect(controller.listening()).toEqual(['127.0.0.1'])
      expect(controller.state()).toMatchObject({ running: true, addresses: [], error: null })
      const res = await fetch('http://127.0.0.1:47464/')
      expect(await res.text()).toBe('ok')
    } finally {
      await controller.stop()
    }
    expect(controller.state().running).toBe(false)
  })

  it('bağlantı noktası doluysa sunucu "port kullanımda" der, çökmez', async () => {
    const make = () =>
      createHostController({
        fetch: () => new Response('ok'),
        port: () => 47465,
        interfaces: () => ({}),
        discovery: null,
        announcement: () => ({ name: 'Bismuth (test)', schemaVersion: 0, hotelName: 'x' })
      })
    const first = make()
    const second = make()
    await first.start()
    try {
      await second.start()
      expect(second.state()).toMatchObject({ running: false, error: 'portInUse' })
    } finally {
      await first.stop()
      await second.stop()
    }
  })
})
