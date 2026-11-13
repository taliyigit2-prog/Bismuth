// The sidecar's life against a real child process (tests/fixtures/fake-sidecar.mjs stands in for the Python service):
// start, token, loopback only, stop, parent-pipe, crash notices, hang, stubborn process.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { tempDataDir } from '../../../tests/factories/runtime'
import { createBridge, makeStreamToken } from './bridge'
import { createSecretStore } from './secrets'
import {
  SidecarConfigError,
  createSidecar,
  type Sidecar,
  type SidecarNotice,
  type SidecarOptions
} from './sidecar'
import { buildSidecarConfig } from './config'
import { redactSecrets } from './redact'

const FIXTURE = fileURLToPath(new URL('../../../tests/fixtures/fake-sidecar.mjs', import.meta.url))
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

const live: Sidecar[] = []
afterEach(async () => {
  await Promise.all(live.splice(0).map((s) => s.stop()))
})

interface Made {
  sidecar: Sidecar
  notices: SidecarNotice[]
  record: () => {
    pid: number
    tokenSha256: string
    tokenInArgv: boolean
    watchStdin: string
    host: string
    port: number
  }[]
}

function make(env: Record<string, string> = {}, over: Partial<SidecarOptions> = {}): Made {
  const recordFile = join(tempDataDir(), 'record.jsonl')
  const notices: SidecarNotice[] = []
  const sidecar = createSidecar({
    command: process.execPath,
    args: [FIXTURE],
    cwd: ROOT,
    env: { FAKE_RECORD: recordFile, ...env },
    buildConfig: (port) => ({
      WEB_HOST: '127.0.0.1',
      WEB_PORT: port,
      CAMERA_SOURCE: 'rtsp://cam.example/stream'
    }),
    onNotice: (n) => notices.push(n),
    healthIntervalMs: 40,
    monitorIntervalMs: 150,
    stopGraceMs: 500,
    backoffMs: () => 30,
    healthTimeoutMs: 5_000,
    ...over
  })
  live.push(sidecar)
  return {
    sidecar,
    notices,
    record: () =>
      existsSync(recordFile)
        ? readFileSync(recordFile, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l))
        : []
  }
}

const until = async (predicate: () => boolean, ms = 8_000): Promise<void> => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('timed out waiting')
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('yan süreç yaşam döngüsü (K-49)', () => {
  it('başlar, belirteçle yoklanır, yalnız 127.0.0.1 üzerinden konuşur ve durdurulunca süreç ölür', async () => {
    const { sidecar, record } = make()
    await sidecar.start()
    await until(() => sidecar.snapshot().state === 'running')
    const snap = sidecar.snapshot()
    expect(snap.pid).toBeGreaterThan(0)
    expect(snap.loop).toBe('ok')

    const [seen] = record()
    expect(seen!.host).toBe('127.0.0.1')
    expect(seen!.tokenInArgv).toBe(false) // the token goes through the environment, never the command line
    expect(seen!.watchStdin).toBe('1') // the stdin pipe is how the sidecar learns Bismuth is gone

    // Without the token the sidecar refuses (the fixture mirrors bridge_security.py).
    const bare = await fetch(`http://127.0.0.1:${seen!.port}/api/health`)
    expect(bare.status).toBe(401)
    expect((await sidecar.bridge()!.health())?.state).toBe('running')

    const pid = snap.pid!
    await sidecar.stop()
    expect(sidecar.snapshot().state).toBe('stopped')
    expect(alive(pid)).toBe(false)
    const journal = sidecar.snapshot().history.join('\n')
    expect(journal).toMatch(/started \(pid \d+, port \d+\)/)
    expect(journal).toContain('running')
    expect(journal).toContain('stop requested')
    expect(journal).toMatch(/exited \(/)
  })

  it('her başlatmada yeni belirteç ve yeni port alır', async () => {
    const { sidecar, record } = make()
    await sidecar.start()
    await until(() => sidecar.snapshot().state === 'running')
    await sidecar.restart()
    await until(() => sidecar.snapshot().state === 'running')
    const [a, b] = record()
    expect(a!.tokenSha256).not.toBe(b!.tokenSha256)
  })

  it('modeller yüklenirken "starting" gösterir, sonra "running" olur', async () => {
    const { sidecar } = make({ FAKE_MODE: 'slow', FAKE_SLOW_MS: '600' })
    await sidecar.start()
    await until(() => sidecar.snapshot().history.some((l) => l.includes('started')))
    expect(sidecar.snapshot().state).toBe('starting')
    await until(() => sidecar.snapshot().state === 'running')
  })

  it('ana süreç beklenmedik kapanınca boru kapanır ve yan süreç kendiliğinden çıkar (SIGTERM yoksayılsa bile)', async () => {
    const { sidecar } = make({ FAKE_MODE: 'ignore-term' })
    await sidecar.start()
    await until(() => sidecar.snapshot().state === 'running')
    await sidecar.stop()
    expect(sidecar.snapshot().history.join('\n')).not.toContain('killing it')
  })

  it("inatçı süreç (boruyu ve SIGTERM'i yoksayar) bekleme süresinden sonra öldürülür", async () => {
    const { sidecar } = make({ FAKE_MODE: 'stubborn' })
    await sidecar.start()
    await until(() => sidecar.snapshot().state === 'running')
    const pid = sidecar.snapshot().pid!
    await sidecar.stop()
    expect(alive(pid)).toBe(false)
    expect(sidecar.snapshot().history.join('\n')).toContain('killing it')
  })

  it('çökme yeniden başlatılır; 3. çökmede bildirim, 5. çökmede vazgeçme bildirimi, sonra yeniden başlatma durur', async () => {
    const { sidecar, notices, record } = make({ FAKE_MODE: 'crash', FAKE_CRASH_MS: '80' })
    await sidecar.start()
    await until(() => sidecar.snapshot().state === 'gaveUp')
    expect(notices).toEqual([
      { kind: 'crashed', crashes: 3 },
      { kind: 'gaveUp', crashes: 5 }
    ])
    expect(record()).toHaveLength(5)
    await new Promise((r) => setTimeout(r, 250))
    expect(record()).toHaveLength(5) // no sixth start
    const snap = sidecar.snapshot()
    expect(snap.crashes).toBe(5)
    expect(snap.lastExit).toBe('code 3')
    // the owner restarts it by hand
    await sidecar.start()
    await until(() => record().length >= 6)
  })

  it('hiç ayağa kalkmayan süreç sağlık zaman aşımında öldürülür ve çökme sayılır', async () => {
    const { sidecar } = make(
      { FAKE_MODE: 'hang' },
      { healthTimeoutMs: 300, windowMs: 60_000, giveUpAfter: 99 }
    )
    await sidecar.start()
    await until(() => sidecar.snapshot().totalCrashes >= 1)
    expect(sidecar.snapshot().history.join('\n')).toContain('health timeout')
    await sidecar.stop()
  })

  it('kamera adresi yoksa başlatılmaz ve nedeni bildirilir', async () => {
    const { sidecar, record } = make(
      {},
      {
        buildConfig: () => {
          throw new SidecarConfigError('noSource')
        }
      }
    )
    await sidecar.start()
    expect(sidecar.snapshot()).toMatchObject({ state: 'stopped', blocked: 'noSource', pid: null })
    expect(record()).toHaveLength(0)
  })

  it('başlatılamayan komut (ENOENT) çökme sayılır, program çökmez', async () => {
    const { sidecar } = make(
      {},
      { command: join(ROOT, 'yok-boyle-bir-python'), giveUpAfter: 2, backoffMs: () => 10 }
    )
    await sidecar.start()
    await until(() => sidecar.snapshot().state === 'gaveUp')
    expect(sidecar.snapshot().lastError).toBeTruthy()
  })
})

describe('köprü', () => {
  const TOKEN = 't'.repeat(32)

  it("canlı yayın adresi Python tarafıyla aynı imzayı üretir; belirteç URL'ye girmez", () => {
    // Value computed by otel-kamera/bridge_security.make_stream_token("t" * 32, 2000000000).
    expect(makeStreamToken(TOKEN, 2_000_000_000)).toBe(
      '2000000000.6d67ef3ad5c0210df15ad220e706c4de8b232be1316820655005e925f452cbce'
    )
    const bridge = createBridge({ port: 47511, token: TOKEN })
    const url = bridge.streamUrl(60, 1_999_999_940_000)
    expect(url).toBe(
      'http://127.0.0.1:47511/api/stream?st=2000000000.6d67ef3ad5c0210df15ad220e706c4de8b232be1316820655005e925f452cbce'
    )
    expect(url).not.toContain(TOKEN)
  })

  it('yalnız /api/ yollarına ve geçerli porta istek gider', async () => {
    const bridge = createBridge({
      port: 47511,
      token: TOKEN,
      fetch: () => Promise.resolve(new Response('{}'))
    })
    await expect(bridge.request('GET', '//evil.example/api/x')).rejects.toThrow()
    await expect(bridge.request('GET', '/api/@evil.example')).rejects.toThrow()
    await expect(bridge.request('GET', 'http://evil.example/')).rejects.toThrow()
    expect((await bridge.request('GET', '/api/status')).status).toBe(200)
    expect(() => createBridge({ port: 80, token: TOKEN })).toThrow()
    expect(() => createBridge({ port: 47511, token: 'kısa' })).toThrow()
  })

  it('belirteci başlıkta gönderir', async () => {
    let seen: RequestInit | null = null
    const bridge = createBridge({
      port: 47511,
      token: TOKEN,
      fetch: (_url, init) => {
        seen = init
        return Promise.resolve(new Response('{}'))
      }
    })
    await bridge.request('POST', '/api/system/toggle-alarms', {})
    expect((seen as RequestInit | null)?.headers).toMatchObject({ 'X-Bismuth-Token': TOKEN })
  })
})

describe('ayar ve sır', () => {
  it('yan sürece giden ayar yalnız loopback adresi ve Bismuth ayarlarını taşır', () => {
    const cfg = buildSidecarConfig(SETTINGS_DEFAULTS, 'rtsp:' + '//u:p@10.0.0.2:554/x', 47512, {
      dataDir: '/tmp/cam'
    })
    expect(cfg).toMatchObject({
      WEB_HOST: '127.0.0.1',
      WEB_PORT: 47512,
      FACE_SIMILARITY_THRESHOLD: 0.36,
      CONFIRMATION_FRAMES: 3,
      ALERT_RETENTION_DAYS: 3
    })
    expect(JSON.stringify(cfg)).not.toMatch(/telegram/i) // K-50: nothing about Telegram reaches Python
    expect(() => buildSidecarConfig(SETTINGS_DEFAULTS, null, 47512, { dataDir: '/tmp/cam' })).toThrow(
      SidecarConfigError
    )
  })

  it('model klasörü ve P20d eşikleri ayardan yan sürece gider; klasör verilmezse yan süreç kendi varsayılanını kullanır', () => {
    const source = 'rtsp:' + '//u:p@10.0.0.2:554/x'
    const cfg = buildSidecarConfig(SETTINGS_DEFAULTS, source, 47512, {
      dataDir: '/tmp/cam',
      modelsDir: '/app/models'
    })
    expect(cfg).toMatchObject({
      MODELS_DIR: '/app/models',
      FACE_UNCERTAIN_MARGIN: 0.06,
      IDLE_FACE_SCAN_EVERY: 3,
      STREAM_MAX_WIDTH: 960
    })
    expect(buildSidecarConfig(SETTINGS_DEFAULTS, source, 47512, { dataDir: '/tmp/cam' })).not.toHaveProperty(
      'MODELS_DIR'
    )
  })

  it('sırlar diske mühürlenerek yazılır ve düz metin kalmaz', () => {
    const file = join(tempDataDir(), 'camera-secrets.json')
    const sealer = {
      seal: (p: string) => `os:${Buffer.from(p).reverse().toString('base64')}`,
      open: (s: string) => Buffer.from(s.slice(3), 'base64').reverse().toString()
    }
    const store = createSecretStore(file, sealer)
    store.set('camera.source', 'rtsp:' + '//admin:s3cret@10.0.0.2/x')
    store.set('telegram.token', '1234567:TESTtokenNotReal_abc')
    expect(readFileSync(file, 'utf8')).not.toContain('s3cret')
    expect(readFileSync(file, 'utf8')).not.toContain('TESTtoken')
    const again = createSecretStore(file, sealer)
    expect(again.get('camera.source')).toBe('rtsp:' + '//admin:s3cret@10.0.0.2/x')
    again.set('camera.source', null)
    expect(createSecretStore(file, sealer).has('camera.source')).toBe(false)
  })

  it('şifrede / ya da @ olsa da kamera şifresi maskelenir', () => {
    for (const pw of ['p/ss', 'p@ss', 'a:b@c/d']) {
      const out = redactSecrets('fail rtsp:' + '//admin:' + pw + '@10.0.0.9:554/x')
      expect(out).not.toContain(pw)
      expect(out).not.toContain('admin')
      expect(out).toContain('10.0.0.9:554/x')
    }
  })

  it('kamera şifresi ve bot belirteci günlük metninden maskelenir', () => {
    const text =
      'open rtsp:' +
      '//admin:s3cret@10.0.0.2:554/x failed; https://api.telegram.org/bot1234567:TESTtokenNotReal_abc/sendMessage'
    const out = redactSecrets(text)
    expect(out).not.toContain('s3cret')
    expect(out).not.toContain('admin')
    expect(out).not.toContain('TESTtoken')
    expect(out).toContain('10.0.0.2')
  })
})
