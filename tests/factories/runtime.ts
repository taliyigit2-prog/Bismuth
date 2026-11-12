import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A throwaway data folder for a test's runtime info: services create `backups/` in it (never `/data` on a CI runner). */
export const tempDataDir = (): string => mkdtempSync(join(tmpdir(), 'bismuth-data-'))
