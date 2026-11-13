import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')

describe('kamera lisans bildirimi (K-57, P20d)', () => {
  const notices = read('THIRD_PARTY_NOTICES.md')

  it('THIRD_PARTY_NOTICES K-57 uyarısını taşır: ticari olmayan InsightFace ağırlıkları ve AGPL Ultralytics', () => {
    expect(notices).toContain('## Camera module')
    expect(notices).toContain('K-57')
    expect(notices).toMatch(/non-commercial research purposes only/)
    expect(notices).toMatch(/AGPL-3\.0/)
    expect(notices).toMatch(/must not be sold, sub-licensed or handed to another hotel/)
  })

  it('requirements.txt içindeki her sabitlenmiş Python paketi sürümüyle bildirimde listelenir', () => {
    const pinned = read('otel-kamera/requirements.txt')
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z0-9_.-]+)==(\S+)/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
    expect(pinned.length).toBeGreaterThan(5)
    for (const [, name, version] of pinned) expect(notices).toContain(`| ${name} | ${version} |`)
  })

  it('model dosyaları depoya girmez: yalnız README.md ve SHA256SUMS izlenir, yerleşim ve lisans README’de yazılı', () => {
    const ignore = read('.gitignore')
    expect(ignore).toContain('resources/camera/models/*')
    expect(ignore).toContain('!resources/camera/models/README.md')
    expect(ignore).toContain('!resources/camera/models/SHA256SUMS')
    const readme = read('resources/camera/models/README.md')
    for (const file of ['yolo11n.pt', 'det_500m.onnx', 'w600k_mbf.onnx', 'AGPL-3.0', 'sha256'])
      expect(readme).toContain(file)
  })
})
