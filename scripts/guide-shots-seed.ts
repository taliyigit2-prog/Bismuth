// Helper of scripts/guide-shots.mjs (run with tsx): a data folder with the invented demo hotel (src/main/db/seed/demo,
// a few weeks of history) whose sign-in screen speaks the given language, without the first-run tour.
//   npx tsx --tsconfig tsconfig.node.json scripts/guide-shots-seed.ts <folder> <tr|en|ru>
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isAppLocale } from '../src/shared/format'
import { openDatabase } from '../src/main/db/client'
import { seedDemo } from '../src/main/db/seed/demo'
import { seedBaseData } from '../src/main/db/seed/seed'
import { createServices } from '../src/main/services'
import { localOwnerCtx } from '../src/main/services/context'

async function main(): Promise<void> {
  const [dir, lang] = process.argv.slice(2)
  if (!dir || !lang || !isAppLocale(lang)) throw new Error('usage: guide-shots-seed.ts <folder> <tr|en|ru>')
  mkdirSync(dir, { recursive: true })
  const handle = await openDatabase({
    file: join(dir, 'bismuth.db'),
    migrationsFolder: resolve(__dirname, '../drizzle')
  })
  handle.sqlite.pragma('synchronous = OFF')
  seedBaseData(handle.db)
  await seedDemo(handle, { days: 45, aheadDays: 30, seed: 20261001, dataDir: dir })
  const services = createServices(handle, {
    name: 'Bismuth',
    version: 'guide-shots',
    packaged: false,
    dataDir: dir,
    electron: null,
    chrome: null
  })
  // The hotel's own values (no user): the sign-in screen's language, the light theme, no tour for the shots.
  services.settings.set(localOwnerCtx('guide-shots'), {
    'ui.language': lang,
    'ui.theme': 'light',
    'guide.tourForNewUsers': false
  })
  handle.sqlite.pragma('synchronous = FULL')
  handle.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  handle.close()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
