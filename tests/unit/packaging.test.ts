// Faz 16 madde 3 ve 6: paketleme ayarları, dosya adları, kaldırıcı, sürüm damgası ve bağımlılık dondurma.
// The installers themselves are built and smoke-tested in CI (.github/workflows/ci.yml "package", release.yml);
// these tests keep the settings that decide what the owner downloads from drifting.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// `yaml` comes with Vite (in package-lock.json); electron-builder and GitHub read these files as YAML too.
import { parse } from 'yaml'
import { appInfoSchema } from '@shared/contract'
import { buildStamp } from '@main/build-stamp'

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const builder = parse(read('electron-builder.yml'))
const pkg = JSON.parse(read('package.json'))

describe('Windows kurulumu (NSIS)', () => {
  it('kullanıcı başına sihirbaz: yönetici şifresi istemez, masaüstü ve Başlat kısayolu açar', () => {
    expect(builder.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: 'Bismuth',
      installerLanguages: ['tr_TR', 'en_US', 'ru_RU']
    })
  })

  it('her mimari için ayrı kurucu: birleşik üçüncü kurucu üretilmez', () => {
    expect(builder.win.target).toEqual([{ target: 'nsis', arch: ['x64', 'arm64'] }])
    expect(builder.nsis.buildUniversalInstaller).toBe(false)
    expect(builder.nsis.artifactName).toBe('${productName}-Setup-${arch}.${ext}')
  })

  it('kaldırıcı veri klasörünü silmez ve ilk sayfasında bunu üç dilde söyler', () => {
    expect(builder.nsis.deleteAppDataOnUninstall).toBe(false)
    expect(builder.nsis.include).toBe('build/installer.nsh')
    const nsh = read('build/installer.nsh')
    expect(nsh).toMatch(/!macro customUnWelcomePage[\s\S]*MUI_UNPAGE_WELCOME[\s\S]*!macroend/)
    for (const [lcid, phrase] of [
      ['1055', 'Kayıtlarınız silinmez'],
      ['1033', 'Your records are not deleted'],
      ['1049', 'Ваши записи не удаляются']
    ]) {
      expect(nsh).toContain(`LangString bismuthUnWelcomeText ${lcid} "`)
      expect(nsh).toContain(phrase)
    }
    // Strings only the uninstaller uses stay out of the installer build (makensis -WX: an unused string would fail it).
    expect(nsh.indexOf('!ifdef BUILD_UNINSTALLER')).toBeLessThan(
      nsh.indexOf('LangString bismuthUnWelcomeText')
    )
  })

  it('sunucu modu için güvenlik duvarı kuralı korunur ve kaldırırken silinir (Faz 13)', () => {
    const nsh = read('build/installer.nsh')
    expect(nsh).toMatch(/!macro customInstall[\s\S]*add rule name="Bismuth"[\s\S]*profile=private/)
    expect(nsh).toMatch(/!macro customUnInstall[\s\S]*delete rule name="Bismuth"/)
  })
})

describe('macOS paketi (DMG)', () => {
  it('Apple çipli ve Intel için iki ayrı DMG; imzasız (ad-hoc), noter yok (S-04)', () => {
    expect(builder.mac.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }])
    expect(builder.mac).toMatchObject({ identity: '-', notarize: false })
    expect(builder.dmg.artifactName).toBe('${productName}-${arch}.${ext}')
  })

  it('yerel ağ izni metni ve Bonjour hizmeti korunur (Faz 13)', () => {
    expect(builder.mac.extendInfo.NSLocalNetworkUsageDescription).toMatch(/ana bilgisayarını/)
    expect(builder.mac.extendInfo.NSBonjourServices).toEqual(['_bismuth._tcp'])
  })
})

describe('dosya adları (G-03)', () => {
  function run(files: string[]): { code: number; files: string[]; out: string } {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-release-'))
    for (const f of files) writeFileSync(join(dir, f), f)
    try {
      const out = execFileSync(process.execPath, [join(root, 'scripts/release-names.mjs'), dir], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      return { code: 0, files: readdirSync(dir).sort(), out }
    } catch (e) {
      const err = e as { status: number; stderr: string }
      return { code: err.status, files: readdirSync(dir).sort(), out: err.stderr }
    }
  }

  it('kurulum dosyaları sürüm numarasız sabit adlar alır ve yanlarına SHA256SUMS.txt yazılır', () => {
    const r = run([
      'Bismuth-Setup-x64.exe',
      'Bismuth-Setup-arm64.exe',
      'Bismuth-arm64.dmg',
      'Bismuth-x64.dmg',
      'builder-debug.yml'
    ])
    expect(r.code).toBe(0)
    expect(r.files).toEqual([
      'Bismuth-Intel.dmg',
      'Bismuth-Setup-arm64.exe',
      'Bismuth-Setup.exe',
      'Bismuth.dmg',
      'SHA256SUMS.txt',
      'builder-debug.yml'
    ])
    // sha256 of the file's own name (the fixture's content), in the `sha256sum -c` / `shasum -a 256 -c` format.
    expect(r.out).toMatch(/^[0-9a-f]{64} {2}Bismuth-Setup\.exe$/m)
    expect(r.out.trim().split('\n')).toHaveLength(4)
  })

  it('iki kez çalışınca adlar değişmez (CI adımı yeniden denenebilir)', () => {
    const r = run(['Bismuth-Setup.exe', 'Bismuth.dmg'])
    expect(r.code).toBe(0)
    expect(r.files).toEqual(['Bismuth-Setup.exe', 'Bismuth.dmg', 'SHA256SUMS.txt'])
  })

  it('kılavuzun anlatmadığı bir kurulum dosyası çıkarsa durur', () => {
    const r = run(['Bismuth-Setup-x64.exe', 'Bismuth-Setup-1.0.0.exe'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('unexpected installer Bismuth-Setup-1.0.0.exe')
  })

  it('belgeler aynı adları kullanır', () => {
    for (const doc of ['README.md', 'docs/otel/kurulum.md']) {
      const text = read(doc)
      for (const name of ['Bismuth-Setup.exe', 'Bismuth.dmg', 'Bismuth-Intel.dmg', 'SHA256SUMS.txt']) {
        expect(text, `${doc}: ${name}`).toContain(name)
      }
      expect(text, doc).not.toMatch(/Bismuth-Setup-…-x64|Bismuth-…-arm64\.dmg/)
    }
  })
})

describe('iş akışları', () => {
  const ci = parse(read('.github/workflows/ci.yml'))
  const release = parse(read('.github/workflows/release.yml'))
  const steps = (job: { steps: { run?: string }[] }) => job.steps.map((s) => s.run ?? '').join('\n')

  it('paketler hiçbir yere yayımlanmaz (G-07) ve sabit adlarını alır', () => {
    // Only release.yml packages; ci.yml is Linux verification and is reused through workflow_call.
    expect(ci.jobs.package).toBeUndefined()
    expect(ci.on).toHaveProperty('workflow_call')
    expect(release.jobs.verify.uses).toBe('./.github/workflows/ci.yml')
    for (const job of [release.jobs.windows, release.jobs.macos]) {
      const run = steps(job)
      expect(run).toMatch(/electron-builder .*--publish never/)
      expect(run).not.toMatch(/--publish (always|onTag|onTagOrDraft)/)
      expect(run).toContain('node scripts/release-names.mjs release')
    }
    expect(builder.publish).toBeNull()
  })

  it('sürüm etiketi package.json sürümüyle aynı olmalı; sürüm notu belgeden okunur', () => {
    const run = steps(release.jobs.version)
    expect(run).toContain("require('./package.json').version")
    expect(release.jobs.publish.if).toContain('refs/tags/v')
    const publish = steps(release.jobs.publish)
    // The tag reaches scripts through env (TAG), never interpolated into the shell text.
    expect(publish).toContain('docs/surum-notlari/$TAG.md')
    expect(publish).not.toContain('${{')
    expect(publish).toContain('--notes-file')
    for (const name of ['Bismuth-Setup.exe', 'Bismuth-Setup-arm64.exe', 'Bismuth.dmg', 'Bismuth-Intel.dmg']) {
      expect(publish).toContain(name)
    }
  })

  it('sahip sürümü "Sürümü yayınla" kutusuyla yayınlar: yalnız main, aynı sürüm iki kez yayınlanmaz', () => {
    expect(release.on.workflow_dispatch.inputs.publish.type).toBe('boolean')
    expect(release.on.workflow_dispatch.inputs.publish.default).toBe(false)
    expect(release.jobs.publish.if).toContain('inputs.publish')
    const guard = steps(release.jobs.version)
    expect(guard).toContain('refs/heads/main')
    expect(guard).toContain('gh release view')
    // The release tag comes from package.json, never from the branch name.
    expect(steps(release.jobs.publish)).toContain(`TAG="v$(node -p "require('./package.json').version")"`)
  })

  it('DMG penceresi sürükleme görselini ve Uygulamalar kısayolunu gösterir', () => {
    expect(builder.dmg.contents).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'link', path: '/Applications' })])
    )
    expect(existsSync(join(root, 'build/background.png'))).toBe(true)
    expect(existsSync(join(root, 'build/background@2x.png'))).toBe(true)
  })
})

describe('sürüm damgası (Hakkında)', () => {
  it('kaynaktan çalışırken (test, geliştirme) damga boştur; şema bunu kabul eder', () => {
    expect(buildStamp()).toEqual({ commit: null, date: null })
    const shape = appInfoSchema.shape.build
    expect(shape.safeParse({ commit: null, date: null }).success).toBe(true)
    expect(shape.safeParse({ commit: '33b453e', date: '2026-10-05' }).success).toBe(true)
    expect(shape.safeParse({ commit: '33b453e', date: '5.10.2026' }).success).toBe(false)
  })

  it('derleme damgası commit günü ve kısa kimliğidir; saate bağlı değildir (aynı commit, aynı paket)', () => {
    const config = read('electron.vite.config.ts')
    expect(config).toContain('__BISMUTH_BUILD__')
    expect(config).toContain('SOURCE_DATE_EPOCH')
    expect(config).not.toMatch(/new Date\(\)|Date\.now\(\)/)
  })
})

describe('bağımlılık dondurma (madde 6)', () => {
  const lock = JSON.parse(read('package-lock.json'))

  it('package.json sürümleri tam sabit (save-exact); kilit dosyası aynı sürümü taşır', () => {
    expect(read('.npmrc')).toMatch(/^save-exact=true$/m)
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
      expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(version)
    }
    expect(lock.packages[''].version).toBe(pkg.version)
  })

  it('güncelleme, telemetri ve hata izleme paketleri kilit dosyasında bile yok (G-07)', () => {
    const forbidden =
      /(^|\/)(electron-updater|update-electron-app|@sentry\/[^/]+|posthog[^/]*|mixpanel[^/]*|firebase|@firebase\/[^/]+|@segment\/[^/]+|analytics-node)$/
    const hits = Object.keys(lock.packages).filter((p) => forbidden.test(p.replace(/^.*node_modules\//, '')))
    expect(hits).toEqual([])
  })
})
