// K-45 (1), Y-3: the client computer keeps the main computer's identity it met first (trust on first use), sends
// nothing to an address whose answer it has not checked, and stops (asks the person) when another key answers.
import { randomBytes } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tempDataDir } from '../../../tests/factories/runtime'
import { checkProof, fingerprintOf, hostIdentity, loadHostSecret } from './host-identity'
import { createHostLink } from './host-link'

const HOST = 'http://192.168.1.20:7373'
const real = hostIdentity(Buffer.alloc(32, 7))
const stranger = hostIdentity(Buffer.alloc(32, 9))

/** A main computer answering as `who()`: hello signed over the nonce; every other call recorded. */
function fakeHost(who: () => ReturnType<typeof hostIdentity> | 'replay') {
  const calls: string[] = []
  let lastProof: string | null = null
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const path = new URL(url).pathname
    calls.push(path)
    const headers = { 'x-bismuth-version': '0.1.0', 'x-bismuth-schema': '11' }
    if (path === '/api/remote.hello') {
      const { nonce } = JSON.parse(String(init.body)) as { nonce: string }
      const id = who()
      // "replay": somebody copied the real computer's earlier answer (key + an old signature).
      const identity =
        id === 'replay'
          ? { key: real.publicKey, proof: lastProof }
          : { key: id.publicKey, proof: id.prove(nonce) }
      if (id !== 'replay') lastProof = identity.proof
      return Response.json(
        { app: 'bismuth', version: '0.1.0', schemaVersion: 11, hotelName: 'Lale', identity },
        { headers }
      )
    }
    return new Response('{}', { headers })
  }
  return { fetch, calls }
}

const link = (fetch: (url: string, init: RequestInit) => Promise<Response>) => {
  let kept: string | null = null
  const l = createHostLink({
    fetch,
    version: '0.1.0',
    schemaVersion: 11,
    deviceName: 'Sahibin Mac',
    platform: 'darwin',
    loadDevice: () => null,
    saveDevice: () => undefined,
    loadHostKey: () => kept,
    saveHostKey: (k) => void (kept = k),
    probeEveryMs: 60_000
  })
  return { l, kept: () => kept }
}

describe('ana bilgisayar kimliği (TOFU, K-45)', () => {
  it('kimlik sunucu sırrından türetilir: aynı sır aynı anahtar, imza yalnız o anahtarla doğrulanır', () => {
    expect(hostIdentity(Buffer.alloc(32, 7)).publicKey).toBe(real.publicKey)
    expect(real.publicKey).not.toBe(stranger.publicKey)
    expect(real.fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)
    expect(fingerprintOf(real.publicKey)).toBe(real.fingerprint)
    const proof = real.prove('nonce-123456789012')
    expect(checkProof(real.publicKey, 'nonce-123456789012', proof)).toBe(true)
    expect(checkProof(real.publicKey, 'baska-nonce-123456', proof)).toBe(false)
    expect(checkProof(stranger.publicKey, 'nonce-123456789012', proof)).toBe(false)
    expect(checkProof('bozuk', 'nonce-123456789012', proof)).toBe(false)
  })

  it('ilk bağlantıda anahtar saklanır; sonra başka anahtar cevap verirse hiçbir çağrı gitmez, kişi kabul edince bağlanır', async () => {
    let who = real
    const host = fakeHost(() => who)
    const { l, kept } = link(host.fetch)
    l.setHost(HOST)
    // Nothing goes before the answer was checked: the first call checks first.
    expect((await l.call(1, '/api/rooms.list', '{}')).status).toBe(200)
    expect(host.calls).toEqual(['/api/remote.hello', '/api/rooms.list'])
    expect(kept()).toBe(real.publicKey)

    // The address goes quiet and comes back as another computer (a stranger on the Wi-Fi, or a takeover).
    who = stranger
    l.setHost(HOST)
    host.calls.length = 0
    const refused = await l.call(1, '/api/auth.signIn', '{"username":"sahip","secret":"gizli"}')
    expect(refused.status).toBe(503)
    expect(JSON.parse(refused.body)).toMatchObject({ error: { messageKey: 'errors.hostIdentityChanged' } })
    expect(host.calls).toEqual(['/api/remote.hello'])
    expect(l.status()).toMatchObject({
      state: 'identityChanged',
      identity: { known: real.fingerprint, offered: stranger.fingerprint }
    })
    expect(l.verifiedHostUrl()).toBeNull()

    expect(await l.acceptOffered(stranger.fingerprint)).toBe(true)
    expect(kept()).toBe(stranger.publicKey)
    expect(l.status()).toMatchObject({
      state: 'connected',
      identity: { known: stranger.fingerprint, offered: null }
    })
    expect((await l.call(1, '/api/rooms.list', '{}')).status).toBe(200)
  })

  it("A kapanıp aynı adreste B açılınca, arada çağrı olmasa da şifre B'ye gitmez (QA3d D1)", async () => {
    let who = real
    const host = fakeHost(() => who)
    const { l } = link(host.fetch)
    l.setHost(HOST)
    expect((await l.call(1, '/api/rooms.list', '{}')).status).toBe(200)
    // A goes away and B takes the address; no call was made in between and the client never saw "unreachable".
    who = stranger
    host.calls.length = 0
    const refused = await l.call(1, '/api/auth.signIn', '{"username":"sahip","secret":"gizli"}')
    expect(refused.status).toBe(503)
    expect(JSON.parse(refused.body)).toMatchObject({ error: { messageKey: 'errors.hostIdentityChanged' } })
    expect(host.calls).toEqual(['/api/remote.hello'])
    expect(l.status().state).toBe('identityChanged')
    expect(l.verifiedHostUrl()).toBeNull()
  })

  it('kabul, ekranda görülen parmak iziyle: arada anahtar değişince kabul reddedilir (N-7)', async () => {
    const third = hostIdentity(Buffer.alloc(32, 11))
    let who = real
    const host = fakeHost(() => who)
    const { l, kept } = link(host.fetch)
    l.setHost(HOST)
    await l.call(1, '/api/rooms.list', '{}')
    who = stranger
    l.setHost(HOST)
    await l.call(1, '/api/rooms.list', '{}')
    // The screen shows the stranger's fingerprint…
    const shown = l.status().identity.offered
    expect(shown).toBe(stranger.fingerprint)
    // …and before the person presses "accept", a third key answers.
    who = third
    await l.probe().catch(() => undefined)
    expect(l.status().identity.offered).toBe(third.fingerprint)
    expect(await l.acceptOffered(shown!)).toBe(false)
    expect(kept()).toBe(real.publicKey)
    expect(l.status().state).toBe('identityChanged')
    // A fingerprint nobody offered is not accepted either; the one shown now is.
    expect(await l.acceptOffered('0000-0000-0000-0000')).toBe(false)
    expect(await l.acceptOffered(third.fingerprint)).toBe(true)
    expect(kept()).toBe(third.publicKey)
  })

  it('kopyalanmış eski cevap (aynı anahtar, eski imza) kabul edilmez', async () => {
    let replay = false
    const host = fakeHost(() => (replay ? 'replay' : real))
    const { l } = link(host.fetch)
    await l.probe(HOST)
    replay = true
    await expect(l.probe(HOST)).rejects.toMatchObject({ reason: 'notBismuth' })
  })

  it('kimliği olmayan cevap Bismuth sayılmaz', async () => {
    const { l } = link(async () =>
      Response.json({ app: 'bismuth', version: '0.1.0', schemaVersion: 11, hotelName: 'X', identity: null })
    )
    await expect(l.probe(HOST)).rejects.toMatchObject({ reason: 'notBismuth' })
  })
})

describe('sunucu sırrı dosyası (N-10)', () => {
  const fakeSafeStorage = (secret = randomBytes(8).toString('hex')) => ({
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`${secret}|${plain}`).reverse(),
    decryptString: (blob: Buffer) => {
      const text = Buffer.from(blob).reverse().toString()
      if (!text.startsWith(`${secret}|`)) throw new Error('another key store')
      return text.slice(secret.length + 1)
    }
  })

  it('sistemin anahtar deposuyla mühürlenir; eski düz dosya aynı kimlikle mühürlenir; kopyası başka makinede işe yaramaz', () => {
    const file = join(tempDataDir(), 'host-secret.key')
    const old = randomBytes(32)
    writeFileSync(file, old.toString('base64url'))
    const os = fakeSafeStorage()
    const secret = loadHostSecret(file, os)
    expect(Buffer.from(secret).equals(old)).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(text).toMatch(/^os:/)
    expect(text).not.toContain(old.toString('base64url'))
    expect(Buffer.from(loadHostSecret(file, os)).equals(old)).toBe(true)
    // The file copied to another machine (another key store): a new secret, so a new identity there.
    const elsewhere = join(tempDataDir(), 'host-secret.key')
    writeFileSync(elsewhere, text)
    expect(Buffer.from(loadHostSecret(elsewhere, fakeSafeStorage())).equals(old)).toBe(false)
  })

  it.skipIf(process.platform === 'win32')(
    'anahtar deposu yokken düz yazılır ama yalnız sahibi okuyabilir (0600)',
    () => {
      const file = join(tempDataDir(), 'host-secret.key')
      const secret = loadHostSecret(file, null)
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(Buffer.from(loadHostSecret(file, null)).equals(Buffer.from(secret))).toBe(true)
    }
  )
})
