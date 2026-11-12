import { defineConfig } from 'drizzle-kit'

// Migrations are generated into ./drizzle and shipped with the app (electron-builder extraResources).
// Committed migration files are immutable (CLAUDE.md yasak 9): change the schema, then generate a new one.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true
})
