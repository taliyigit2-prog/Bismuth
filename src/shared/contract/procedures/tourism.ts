// Faz 10: Ministry of Tourism accommodation statistics from the KBS file (G-150, K-24, K-29, K-36).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/tourism.ts.
import * as z from 'zod'
import { okSchema } from '../admin'
import { proc, type Procedure } from '../proc'
import {
  countryConfirmInputSchema,
  statsPeriodSchema,
  tourismAssignRowInputSchema,
  tourismComparisonViewSchema,
  tourismCountriesSchema,
  tourismExportInputSchema,
  tourismExportViewSchema,
  tourismImportRefSchema,
  tourismImportRequestSchema,
  tourismImportViewSchema,
  tourismRenameInputSchema,
  tourismReportedInputSchema,
  tourismStayUntilInputSchema,
  tourismTableViewSchema
} from '../tourism'

export const tourismProcedures = {
  'tourism.listImports': proc(
    z.object({ period: statsPeriodSchema.optional() }).strict(),
    z.array(tourismImportViewSchema)
  ),
  'tourism.import': proc(tourismImportRequestSchema, tourismTableViewSchema),
  'tourism.table': proc(tourismImportRefSchema, tourismTableViewSchema),
  'tourism.compare': proc(tourismImportRefSchema, tourismComparisonViewSchema),
  'tourism.countries': proc(z.object({}).strict(), tourismCountriesSchema),
  'tourism.confirmCountry': proc(countryConfirmInputSchema.strict(), okSchema),
  'tourism.renameCountry': proc(tourismRenameInputSchema, okSchema),
  'tourism.setStayUntil': proc(tourismStayUntilInputSchema, tourismTableViewSchema),
  'tourism.assignRow': proc(tourismAssignRowInputSchema, tourismTableViewSchema),
  'tourism.markReported': proc(tourismReportedInputSchema, tourismImportViewSchema),
  'tourism.export': proc(tourismExportInputSchema, tourismExportViewSchema)
} as const satisfies Record<string, Procedure>
