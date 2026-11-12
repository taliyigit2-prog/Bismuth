// Where the encrypted copies go (K-32, S-42): the hotel's Google Drive folder, synced by the Drive desktop program.
// Bismuth only writes files into that local folder — it never talks to Google (CLAUDE.md yasak 4). The folder is
// set in Settings → Yedek, or found by itself: Drive for desktop shows "My Drive" / "Drive'ım" on a drive letter
// (Windows, usually G:) or under ~/Library/CloudStorage/GoogleDrive-<account>/ (macOS). Copies go to
// <My Drive>/Bismuth/yedekler. Nothing found → null: the copy is skipped quietly and the Today badge says so.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const MY_DRIVE_NAMES = ['My Drive', "Drive'ım", 'Drive’ım', 'Mein Ablage', 'Мой диск']
export const DRIVE_SUBFOLDER = ['Bismuth', 'yedekler'] as const

export interface DriveProbe {
  platform: NodeJS.Platform
  home: string
  isDir(path: string): boolean
  list(path: string): string[]
}

const realProbe = (): DriveProbe => ({
  platform: process.platform,
  home: homedir(),
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
})

/** The "My Drive" folder of Drive for desktop on this computer, or null. */
export function findMyDrive(probe: DriveProbe = realProbe()): string | null {
  const roots: string[] = []
  if (probe.platform === 'win32') {
    // G: first (the default), then the other letters.
    for (const letter of 'GDEFHIJKLMNOPQRSTUVWXYZ') roots.push(`${letter}:\\`)
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
