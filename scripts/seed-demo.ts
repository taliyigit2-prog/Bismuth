// Demo hotel database for development (faz-02 madde 5): 19 rooms / 38 beds and a year of invented data.
//   npm run seed:demo                          → .demo/bismuth.db (then: BISMUTH_USER_DATA=.demo npm run dev)
//   npm run seed:demo -- --out x/bismuth.db --days 120 --seed 7 --force
// Never point it at a real hotel's data folder: an existing file is only replaced with --force.
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openDatabase } from '../src/main/db/client'
import { seedDemo } from '../src/main/db/seed/demo'
import { seedBaseData } from '../src/main/db/seed/seed'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const out = resolve(arg('--out') ?? '.demo/bismuth.db')
  const days = Number(arg('--days') ?? 365)
  const seed = Number(arg('--seed') ?? 20261001)
  if (existsSync(out)) {
    if (!process.argv.includes('--force')) {
      console.error(`${out} already exists; add --force to replace it.`)
      process.exit(1)
    }
    for (const suffix of ['', '-wal', '-shm']) rmSync(out + suffix, { force: true })
  }
  mkdirSync(dirname(out), { recursive: true })
  const started = Date.now()
  const handle = await openDatabase({ file: out, migrationsFolder: resolve(__dirname, '../drizzle') })
  // A demo file: speed over crash safety while it is written; back to FULL before closing.
  handle.sqlite.pragma('synchronous = OFF')
  seedBaseData(handle.db)
  const summary = await seedDemo(handle, { days, seed, dataDir: dirname(out) })
  handle.sqlite.pragma('synchronous = FULL')
  handle.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  handle.close()
  console.log(
    JSON.stringify({ file: out, seconds: Math.round((Date.now() - started) / 1000), ...summary }, null, 2)
  )
  console.log(`\nOpen it with: BISMUTH_USER_DATA=${dirname(out)} npm run dev`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
