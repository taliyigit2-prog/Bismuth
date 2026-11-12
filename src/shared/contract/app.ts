import * as z from 'zod'

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  /** Which build this is (faz-16 madde 3): the commit's short id and day 'YYYY-MM-DD'; null in development/tests. */
  build: z.object({
    commit: z.string().nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
  }),
  versions: z.object({
    electron: z.string().nullable(),
    chrome: z.string().nullable(),
    node: z.string(),
    sqlite: z.string()
  }),
  platform: z.string(),
  arch: z.string(),
  packaged: z.boolean(),
  dataDir: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  integrity: z.string(),
  transport: z.enum(['ipc', 'http'])
})
export type AppInfo = z.infer<typeof appInfoSchema>

export const pingOutputSchema = z.object({
  ok: z.literal(true),
  userId: z.string().nullable(),
  transport: z.enum(['ipc', 'http']),
  at: z.string()
})
