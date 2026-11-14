// Where the encrypted copies go (K-32, S-42): the hotel's Google Drive folder, synced by the Drive desktop program.
// Bismuth only writes files into that local folder — it never talks to Google (CLAUDE.md yasak 4). The folder is
// set in Settings → Yedek, or found by itself: Drive for desktop shows "My Drive" / "Drive'ım" on a drive letter
// (Windows, usually G:) or under ~/Library/CloudStorage/GoogleDrive-<account>/ (macOS). Copies go to
// <My Drive>/Bismuth/yedekler. Nothing found → null: the copy is skipped quietly and the Today badge says so.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const MY_DRIVE_NAMES = ['My Drive', "Drive'ım", 'Drive’ım', 'Mein Ablage', 'Мой диск']
export const DRIVE_SUBFOLDER = ['Bismuth', 'yedekler'] as const

export interface DriveProbe {
  platform: NodeJS.Platform
  home: string
  isDir(path: string): boolean
  list(path: string): string[]
  /** Drive roots (`X:\\`) that must not be touched: mapped network drives can freeze a scan for many seconds. */
  skipRoot?(root: string): boolean
}

/** Letters of the mapped network drives of this Windows user (HKCU\Network\<letter>); empty when unknown. */
function mappedNetworkLetters(): Set<string> {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Network'], {
      encoding: 'utf8',
      timeout: 2000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return new Set([...out.matchAll(/\\Network\\([A-Za-z])\s*$/gm)].map((m) => (m[1] ?? '').toUpperCase()))
  } catch {
    return new Set()
  }
}

const fsProbe: Pick<DriveProbe, 'isDir' | 'list'> = {
  isDir: (path) => {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  },
  list: (path) => {
    try {
      return readdirSync(path)
    } catch {
      return []
    }
  }
}

const realProbe = (): DriveProbe => {
  let network: Set<string> | null = null
  return {
    platform: process.platform,
    // BISMUTH_DRIVE_HOME: test hook so e2e/screenshot runs never see (or write into) the owner's real Drive folder.
    home: process.env['BISMUTH_DRIVE_HOME'] || homedir(),
    skipRoot: (root) => {
      if (process.platform !== 'win32') return false
      network ??= mappedNetworkLetters()
      return network.has(root.charAt(0).toUpperCase())
    },
    ...fsProbe
  }
}

/** The "My Drive" folder of Drive for desktop on this computer, or null. */
export function findMyDrive(probe: DriveProbe = realProbe()): string | null {
  const roots: string[] = []
  if (probe.platform === 'win32') {
    // G: first (the default), then the other letters.
    // Mapped network drives are skipped (they can block the scan); fixed, removable and Drive's virtual drive stay.
    for (const letter of 'GDEFHIJKLMNOPQRSTUVWXYZ') {
      const root = `${letter}:\\`
      if (!probe.skipRoot?.(root)) roots.push(root)
    }
  } else if (probe.platform === 'darwin') {
    const cloud = join(probe.home, 'Library', 'CloudStorage')
    for (const name of probe
      .list(cloud)
      .filter((n) => n.startsWith('GoogleDrive'))
      .sort())
      roots.push(join(cloud, name))
    roots.push('/Volumes/GoogleDrive')
  }
  // Older Drive versions mirrored into the home folder.
  roots.push(join(probe.home, 'Google Drive'), join(probe.home, 'GoogleDrive'))
  for (const root of roots) {
    for (const name of MY_DRIVE_NAMES) {
      const candidate = join(root, name)
      if (probe.isDir(candidate)) return candidate
    }
  }
  return null
}

/**
 * The folder for the encrypted copies: the one set in Settings (it must exist — Bismuth does not make a Drive
 * folder up), else <My Drive>/Bismuth/yedekler when Drive for desktop is installed. Null when there is none.
 */
export function resolveDriveBackupDir(setting: string, probe: DriveProbe = realProbe()): string | null {
  const configured = setting.trim()
  if (configured) return isAbsolute(configured) && probe.isDir(configured) ? configured : null
  const myDrive = findMyDrive(probe)
  return myDrive ? join(myDrive, ...DRIVE_SUBFOLDER) : null
}

export const driveFolderExists = (dir: string | null): boolean => dir !== null && existsSync(dir)

/**
 * "Drive klasörünü bul" (Settings → Yedek): finds Drive for desktop's "My Drive" folder on this computer (local
 * folders only, no network) and makes sure <My Drive>/Bismuth/yedekler exists. Returns that folder, or null.
 */
export function prepareDriveBackupDir(probe: DriveProbe = realProbe()): string | null {
  const myDrive = findMyDrive(probe)
  if (!myDrive) return null
  const dir = join(myDrive, ...DRIVE_SUBFOLDER)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return null
  }
  return dir
}
