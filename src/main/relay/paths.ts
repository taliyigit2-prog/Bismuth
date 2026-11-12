// Where the box and the PDF summary go (faz-13 madde 4, 8; K-32): the hotel's `Bismuth` folder in Google Drive —
// `Drive'ım/Bismuth/kutu/` and `Drive'ım/Bismuth/ozet.pdf`, next to the encrypted backups (`…/Bismuth/yedekler`,
// src/main/backup/drive.ts). When Settings → Yedek names its own backup folder, its parent is the Bismuth folder.
// On the owner's Mac the hotel's folder appears in Drive'ım once it is added there ("Drive'ıma kısayol ekle");
// another place can be chosen by hand. Nothing found → null: nothing is written, the screen says so.
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { findMyDrive, type DriveProbe } from '../backup/drive'

export const BOX_FOLDER = 'kutu'
export const SUMMARY_FILE = 'ozet.pdf'

/** The hotel's Bismuth folder in Drive (it must exist: Bismuth does not make up a Drive folder). */
export function resolveBismuthFolder(backupSetting: string, probe?: DriveProbe): string | null {
  const configured = backupSetting.trim()
  if (configured) {
    const parent = dirname(configured)
    return isAbsolute(configured) && existsSync(parent) ? parent : null
  }
  const myDrive = findMyDrive(probe)
  if (!myDrive) return null
  const folder = join(myDrive, 'Bismuth')
  return existsSync(folder) ? folder : null
}

/** The box folder on the hotel's computer (made inside the Bismuth folder when missing). */
export function resolveBoxFolder(backupSetting: string, probe?: DriveProbe): string | null {
  const base = resolveBismuthFolder(backupSetting, probe)
  return base ? join(base, BOX_FOLDER) : null
}

/**
 * The box folder on the owner's computer: the one chosen by hand (it must exist), else Drive'ım/Bismuth/kutu.
 * The chosen folder may be the Bismuth folder itself or its `kutu` folder.
 */
export function resolveClientBoxFolder(chosen: string | null | undefined, probe?: DriveProbe): string | null {
  const manual = chosen?.trim()
  if (manual) {
    if (!isAbsolute(manual) || !existsSync(manual)) return null
    const inner = join(manual, BOX_FOLDER)
    return existsSync(inner) ? inner : manual
  }
  const myDrive = findMyDrive(probe)
  if (!myDrive) return null
  const box = join(myDrive, 'Bismuth', BOX_FOLDER)
  return existsSync(box) ? box : null
}
