import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Test/support hook: run with a separate data folder (e2e, ui-shot). Must be applied before `ready`. Ignored in a packaged build. */
export function applyDataDirOverride(): void {
  const override = app.isPackaged ? undefined : process.env['BISMUTH_USER_DATA']
  if (override) app.setPath('userData', override)
}

export interface DataPaths {
  root: string
  db: string
  backups: string
  logs: string
  attachments: string
  windowState: string
}

/** userData/{bismuth.db, backups/, logs/, attachments/} (faz-01 madde 3). */
export function dataPaths(): DataPaths {
  const root = app.getPath('userData')
  const paths: DataPaths = {
    root,
    db: join(root, 'bismuth.db'),
    backups: join(root, 'backups'),
    logs: join(root, 'logs'),
    attachments: join(root, 'attachments'),
    windowState: join(root, 'window-state.json')
  }
  for (const dir of [paths.backups, paths.logs, paths.attachments]) mkdirSync(dir, { recursive: true })
  return paths
}

/** Migrations ship as extraResources when packaged; in development they live in the project root. */
export function migrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}
