// Electron side of the error handling (Faz 16 madde 2): the error log file without personal data, the handlers for
// errors nobody caught, and the start-up offer to restore the newest backup when the data file is damaged on disk.
// Kept out of index.ts so the start sequence there only calls three functions.
import { app, BrowserWindow, dialog } from 'electron'
import type { MainLogger } from 'electron-log'
import { localBackups, prepareRecoveryRestore } from '../backup/startup-recovery'
import { createCrashHandler, type CrashChoice } from './crash'
import { tMain } from './i18n'
import { recoveryDetail } from './recovery-text'
export { setUpErrorLog } from './log-redact'

const choose = async (
  buttons: { label: string; choice: CrashChoice }[],
  options: { title: string; detail: string }
): Promise<CrashChoice> => {
  const owner = BrowserWindow.getFocusedWindow()
  const box = {
    type: 'error' as const,
    title: options.title,
    message: options.title,
    detail: options.detail,
    buttons: buttons.map((b) => b.label),
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true
  }
  const { response } = owner ? await dialog.showMessageBox(owner, box) : await dialog.showMessageBox(box)
  return buttons[response]?.choice ?? 'continue'
}

/** Uncaught errors of the main process and crashed windows: logged, and the user is told what to do. */
export function installCrashHandlers(log: MainLogger, logsDir: string): void {
  const handler = createCrashHandler({
    log,
    restart: () => {
      app.relaunch()
      app.exit(0)
    },
    quit: () => app.quit(),
    ask: (kind) => {
      if (!app.isReady()) return Promise.resolve('continue')
      const section = { main: 'crash', window: 'windowGone', windowLoop: 'windowLoop' }[kind]
      const detail = tMain(`main.dialog.${section}.body`, { folder: logsDir })
      const title = tMain(`main.dialog.${section}.title`)
      if (kind === 'main')
        return choose(
          [
            { label: tMain('main.dialog.crash.restart'), choice: 'restart' },
            { label: tMain('main.dialog.crash.continue'), choice: 'continue' }
          ],
          { title, detail }
        )
      if (kind === 'window')
        return choose(
          [
            { label: tMain('main.dialog.windowGone.reload'), choice: 'reload' },
            { label: tMain('main.dialog.crash.restart'), choice: 'restart' }
          ],
          { title, detail }
        )
      // The window keeps crashing (opened again by itself a few times already).
      return choose(
        [
          { label: tMain('main.dialog.crash.restart'), choice: 'restart' },
          { label: tMain('main.dialog.windowLoop.close'), choice: 'close' }
        ],
        { title, detail }
      )
    }
  })
  process.on('uncaughtException', (error) => void handler.uncaught(error))
  process.on('unhandledRejection', (reason) => handler.unhandledRejection(reason))
  app.on('render-process-gone', (_event, contents, details) => {
    void handler.windowGone(details, () => {
      if (!contents.isDestroyed()) contents.reload()
    })
  })
  app.on('child-process-gone', (_event, details) => handler.childGone(details))
}

/**
 * The data file is damaged (it does not open, or integrity_check failed): offer the newest usable local backup.
 * 'restarting': a restore was scheduled and the program starts again; 'declined': the user chose to go on (or the
 * backups could not be used, which was said); 'none': there is no local backup at all.
 */
export async function offerRecoveryRestore(opts: {
  /** 'open': the data could not be opened at all; 'integrity': it opened but the check found damage. */
  kind: 'open' | 'integrity'
  backupsDir: string
  markerPath: string
  programSchemaVersion: number
  log: MainLogger
}): Promise<'restarting' | 'declined' | 'none'> {
  if (localBackups(opts.backupsDir).length === 0) return 'none'
  const noneUsable = async (): Promise<'declined'> => {
    await dialog.showMessageBox({
      type: 'error',
      title: tMain('main.dialog.recovery.title'),
      message: tMain('main.dialog.recovery.title'),
      detail: tMain('main.dialog.recovery.none'),
      noLink: true
    })
    return 'declined'
  }
  // The backup is unpacked and checked first, so the question names the one that will really be restored (an
  // older one when the newest is damaged or half written).
  const prepared = await prepareRecoveryRestore(opts).catch((error: unknown) => {
    opts.log.error('recovery restore failed', error)
    return null
  })
  if (!prepared) return noneUsable()
  const choice = await choose(
    [
      { label: tMain('main.dialog.recovery.restore'), choice: 'restart' },
      {
        label: tMain(opts.kind === 'open' ? 'main.dialog.recovery.quit' : 'main.dialog.recovery.continue'),
        choice: 'continue'
      }
    ],
    { title: tMain('main.dialog.recovery.title'), detail: recoveryDetail(opts.kind, prepared.backup.at) }
  )
  if (choice !== 'restart') {
    prepared.discard()
    return 'declined'
  }
  const scheduled = await prepared.schedule().then(
    () => true,
    (error: unknown) => {
      opts.log.error('recovery restore failed', error)
      prepared.discard()
      return false
    }
  )
  if (!scheduled) return noneUsable()
  opts.log.info('recovery restore scheduled', prepared.backup.id)
  app.relaunch()
  app.exit(0)
  return 'restarting'
}
