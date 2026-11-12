// Faz 11: market mid rates, hotel rate, converter, weather, holiday check.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/external.ts.
import * as z from 'zod'
import {
  fxOverviewSchema,
  fxRefreshResultSchema,
  fxSetApiKeySchema,
  fxSetHotelRateSchema,
  fxSourceStatusSchema,
  holidayCheckResultSchema,
  weatherViewSchema
} from '../external'
import { empty, proc, type Procedure } from '../proc'

const ok = z.object({ ok: z.literal(true) })

export const externalProcedures = {
  'fx.overview': proc(empty, fxOverviewSchema),
  'fx.refresh': proc(empty, fxRefreshResultSchema),
  'fx.setHotelRate': proc(fxSetHotelRateSchema, ok),
  'fx.sources': proc(empty, z.array(fxSourceStatusSchema)),
  'fx.setApiKey': proc(fxSetApiKeySchema, ok),
  'weather.get': proc(empty, weatherViewSchema),
  'weather.refresh': proc(empty, z.object({ ok: z.boolean(), skipped: z.boolean() })),
  'holidays.check': proc(
    z.object({ year: z.number().int().min(2000).max(2100) }).strict(),
    holidayCheckResultSchema
  ),
  'holidays.lastChecks': proc(empty, z.array(holidayCheckResultSchema))
} as const satisfies Record<string, Procedure>
