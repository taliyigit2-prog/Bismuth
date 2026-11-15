// "Kamera ekini kur…" (camera add-on install): the owner picks `Bismuth-Kamera-Windows.zip` / `-Mac.zip` (~0.7 GB) and it is
// unpacked into `<userData>/camera-addon`. Streamed with yauzl (the zip is never loaded whole), unpacked into a temporary
// folder next to the target, checked with `inspectAddonRoot`, then swapped in; on any failure the temporary folder goes and
// an earlier add-on stays. Files only: no network. Paths from the zip are never trusted (zip-slip, absolute, symlinks).
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, rename, rm, stat, statfs } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import type { CameraAddonError, CameraAddonInstallState } from '@shared/contract/camera'
import { addonRoot, inspectAddonRoot } from './addon'

export class AddonInstallFailure extends Error {
  constructor(readonly code: CameraAddonError) {
    super(code)
  }
}

/** The zip's top-level folder (`scripts/camera-bundle.mjs`); a zip with the contents at its root works too. */
const TOP = 'camera-addon/'
const UNIX_TYPE_MASK = 0o170000
const UNIX_SYMLINK = 0o120000

/** The zip's entry name as a safe relative path inside the add-on, `null` for entries to skip, or a failure. */
export function entryTarget(raw: string): string | null {
  const name = raw.replaceAll('\\', '/')
  if (name.startsWith('__MACOSX/') || name.endsWith('/.DS_Store') || name === '.DS_Store') return null
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new AddonInstallFailure('notAddon')
  const parts = name.split('/')
  if (parts.includes('..')) throw new AddonInstallFailure('notAddon')
  const rel = name.startsWith(TOP) ? name.slice(TOP.length) : name
  return rel === '' ? null : rel
}

const openZip = (path: string): Promise<yauzl.ZipFile> =>
  new Promise((ok, fail) =>
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zip) =>
      err || !zip ? fail(new AddonInstallFailure('notAddon')) : ok(zip)
    )
  )

const openEntry = (zip: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<NodeJS.ReadableStream>((ok, fail) =>
    zip.openReadStream(entry, (err, stream) =>
      err || !stream ? fail(new AddonInstallFailure('incomplete')) : ok(stream)
    )
  )

export interface InstallOptions {
  zipPath: string
  userData: string
  platform?: NodeJS.Platform
  arch?: string
  /** Free bytes on the target disk (tests inject; default `statfs`). */
  freeBytes?: (dir: string) => Promise<number>
  onProgress?: (phase: 'checking' | 'unpacking' | 'verifying', percent: number) => void
  now?: () => number
}

const defaultFree = async (dir: string): Promise<number> => {
  const s = await statfs(dir)
  return Number(s.bavail) * Number(s.bsize)
}

/** Unpacks, verifies and swaps in the add-on. Throws `AddonInstallFailure`; leaves an earlier add-on alone on failure. */
export async function installAddonZip(opts: InstallOptions): Promise<void> {
  const platform = opts.platform ?? process.platform
  const arch = opts.arch ?? process.arch
  const stamp = (opts.now ?? Date.now)()
  const target = addonRoot(opts.userData)
  const tmp = `${target}.tmp-${stamp}`
  const old = `${target}.old-${stamp}`
  const progress = opts.onProgress ?? (() => undefined)

  progress('checking', 0)
  let zipSize: number
  try {
    zipSize = (await stat(opts.zipPath)).size
  } catch {
    throw new AddonInstallFailure('notAddon')
  }
  await mkdir(opts.userData, { recursive: true })
  const free = await (opts.freeBytes ?? defaultFree)(opts.userData).catch(() => Infinity)
  if (free < zipSize * 3) throw new AddonInstallFailure('noSpace')

  try {
    await mkdir(tmp, { recursive: true })
    const zip = await openZip(opts.zipPath)
    let done = 0
    await new Promise<void>((ok, fail) => {
      zip.on('error', (e) => fail(e))
      zip.on('end', () => ok())
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          const rel = entryTarget(entry.fileName)
          if (rel !== null) {
            const mode = (entry.externalFileAttributes >>> 16) & 0xffff
            if ((mode & UNIX_TYPE_MASK) === UNIX_SYMLINK) throw new AddonInstallFailure('notAddon')
            const dest = resolve(tmp, rel)
            if (dest !== resolve(tmp) && !dest.startsWith(resolve(tmp) + sep))
              throw new AddonInstallFailure('notAddon')
            if (entry.fileName.endsWith('/')) await mkdir(dest, { recursive: true })
            else {
              await mkdir(dirname(dest), { recursive: true })
              const perm = (mode & 0o777 || 0o644) | 0o600
              await pipeline(await openEntry(zip, entry), createWriteStream(dest, { mode: perm }))
              await chmod(dest, perm)
            }
          }
          done += entry.compressedSize
          progress('unpacking', Math.min(99, Math.floor((done / Math.max(zipSize, 1)) * 100)))
        })().then(
          () => zip.readEntry(),
          (e: unknown) => {
            zip.close()
            fail(e)
          }
        )
      })
      zip.readEntry()
    })

    progress('verifying', 100)
    const found = inspectAddonRoot(tmp, platform, arch)
    if ('problem' in found) throw new AddonInstallFailure(found.problem)

    // Swap: the earlier add-on is only set aside until the new one is in place.
    let aside = false
    try {
      await rename(target, old)
      aside = true
    } catch {
      /* none installed */
    }
    try {
      await rename(tmp, target)
    } catch (e) {
      if (aside) await rename(old, target).catch(() => undefined)
      throw e
    }
    if (aside) await rm(old, { recursive: true, force: true }).catch(() => undefined)
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
    throw e instanceof AddonInstallFailure ? e : new AddonInstallFailure('failed')
  }
}

/** One install at a time, with a state the screen polls (there is no main → renderer event channel). */
export function createAddonInstaller(base: Omit<InstallOptions, 'zipPath' | 'onProgress'>) {
  let state: CameraAddonInstallState = { phase: 'idle', percent: 0, error: null }
  return {
    state: (): CameraAddonInstallState => state,
    running: (): boolean => ['checking', 'unpacking', 'verifying'].includes(state.phase),
    /** Starts the job and returns at once; `onDone` runs after a success. */
    start(zipPath: string, onDone: () => void): void {
      state = { phase: 'checking', percent: 0, error: null }
      void installAddonZip({
        ...base,
        zipPath,
        onProgress: (phase, percent) => {
          state = { phase, percent, error: null }
        }
      }).then(
        () => {
          state = { phase: 'done', percent: 100, error: null }
          onDone()
        },
        (e: unknown) => {
          state = {
            phase: 'failed',
            percent: 0,
            error: e instanceof AddonInstallFailure ? e.code : 'failed'
          }
        }
      )
    }
  }
}
export type AddonInstaller = ReturnType<typeof createAddonInstaller>
