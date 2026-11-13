import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findMyDrive, prepareDriveBackupDir, type DriveProbe } from './drive'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

const probeOf = (dirs: string[], over: Partial<DriveProbe> = {}): DriveProbe => ({
  platform: 'win32',
  home: 'C:\\Users\\x',
  isDir: (p) => dirs.includes(p),
  list: () => [],
  ...over
})

describe('Drive klasörünü bulma (yerel tarama)', () => {
  it('Windows: G: sürücüsündeki "My Drive" ve "Drive\'ım" klasörlerini bulur', () => {
    expect(findMyDrive(probeOf([join('G:\\', 'My Drive')]))).toBe(join('G:\\', 'My Drive'))
    expect(findMyDrive(probeOf([join('G:\\', "Drive'ım")]))).toBe(join('G:\\', "Drive'ım"))
  })

  it('Windows: kullanıcı klasöründeki eski "Google Drive" yansısını bulur', () => {
    const mirror = join('C:\\Users\\x', 'Google Drive', 'My Drive')
    expect(findMyDrive(probeOf([mirror]))).toBe(mirror)
  })

  it('macOS: ~/Library/CloudStorage/GoogleDrive-* altındaki klasörü bulur', () => {
    const cloud = join('/Users/x', 'Library', 'CloudStorage')
    const mine = join(cloud, 'GoogleDrive-otel@example.com', 'My Drive')
    const probe = probeOf([mine], {
      platform: 'darwin',
      home: '/Users/x',
      list: (p) => (p === cloud ? ['Dropbox', 'GoogleDrive-otel@example.com'] : [])
    })
    expect(findMyDrive(probe)).toBe(mine)
  })

  it('Drive yoksa null döner ve hiçbir klasör oluşturmaz', () => {
    expect(findMyDrive(probeOf([]))).toBeNull()
    expect(prepareDriveBackupDir(probeOf([]))).toBeNull()
  })

  it('bulunan Drive içinde Bismuth/yedekler klasörünü hazırlar', () => {
    const root = mkdtempSync(join(tmpdir(), 'bismuth-drive-'))
    temps.push(root)
    const myDrive = join(root, 'Google Drive', 'My Drive')
    mkdirSync(myDrive, { recursive: true })
    const dir = prepareDriveBackupDir(
      probeOf([], { home: root, platform: 'linux', isDir: (p) => existsSync(p) })
    )
    expect(dir).toBe(join(myDrive, 'Bismuth', 'yedekler'))
    expect(existsSync(dir!)).toBe(true)
  })
})
