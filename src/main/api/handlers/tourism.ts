// Handlers of procedures/tourism.ts (Faz 10): contract procedure → service call.
import type { tourismProcedures } from '@shared/contract/procedures/tourism'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

const ok = { ok: true } as const

export const tourismHandlers = (services: Services): HandlersFor<keyof typeof tourismProcedures> => ({
  'tourism.listImports': (ctx, input) => services.tourism.listImports(ctx, input.period),
  // The file travels as base64 inside the JSON envelope; the service reads the bytes (identity columns never).
  'tourism.import': (ctx, input) =>
    services.tourism.importKbs(ctx, {
      fileName: input.fileName,
      period: input.period,
      bytes: new Uint8Array(Buffer.from(input.dataBase64, 'base64'))
    }),
  'tourism.table': (ctx, input) => services.tourism.table(ctx, input.importId),
  'tourism.compare': (ctx, input) => services.tourism.compareWithProgram(ctx, input.importId),
  'tourism.countries': (ctx) => services.tourism.countries(ctx),
  'tourism.confirmCountry': (ctx, input) => {
    services.tourism.confirmCountry(ctx, input)
    return ok
  },
  'tourism.renameCountry': (ctx, input) => {
    services.tourism.renameCountry(ctx, input)
    return ok
  },
  'tourism.setStayUntil': (ctx, input) => services.tourism.setStayUntil(ctx, input),
  'tourism.assignRow': (ctx, input) => services.tourism.assignRow(ctx, input),
  'tourism.markReported': (ctx, input) => services.tourism.markReported(ctx, input.importId, input.reported),
  'tourism.export': (ctx, input) => services.tourism.exportTable(ctx, input.importId, input.format)
})
