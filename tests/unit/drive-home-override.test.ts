import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareDriveBackupDir, resolveDriveBackupDir } from '../../src/main/backup/drive'

describe('BISMUTH_DRIVE_HOME', () => {
  const dirs: string[] = []
  const previous = process.env['BISMUTH_DRIVE_HOME']
  afterEach(() => {
    if (previous === undefined) delete process.env['BISMUTH_DRIVE_HOME']
    else process.env['BISMUTH_DRIVE_HOME'] = previous
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('looks for Drive under the override instead of the real home folder', () => {
    const home = mkdtempSync(join(tmpdir(), 'bismuth-drive-home-'))
    dirs.push(home)
    process.env['BISMUTH_DRIVE_HOME'] = home
    // An empty fake home has no Drive: nothing is found, nothing is written outside it.
    expect(resolveDriveBackupDir('')).toBeNull()
    expect(prepareDriveBackupDir()).toBeNull()
    // A "Google Drive/My Drive" folder inside the fake home is found.
    mkdirSync(join(home, 'Google Drive', 'My Drive'), { recursive: true })
    expect(resolveDriveBackupDir('')).toBe(join(home, 'Google Drive', 'My Drive', 'Bismuth', 'yedekler'))
  })
})
