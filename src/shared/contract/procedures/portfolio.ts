// P21c (K-54): the owner's portfolio — every hotel on one screen: today's occupancy, the cash drawer, the income and
// expense of a period, and each hotel's tape chart (read-only). Handlers in src/main/api/handlers/portfolio.ts; in client
// mode src/main/server/portfolio-client.ts answers (the hotel in use live, the others from their read-only copies).
// Money stays per hotel in its own base currency; nothing is converted (no rates here).
import * as z from 'zod'
import { proc, type Procedure } from '../proc'
import { localDateSchema } from '../rooms'
import { gridRangeSchema, gridSchema } from './reservations'
import { periodInputSchema } from './reports'

const minor = z.number().int()

/** One hotel's figures; the money parts are in `baseCurrency`. */
export const portfolioFiguresSchema = z.object({
  /** The hotel's own business day. */
  today: localDateSchema,
  baseCurrency: z.string(),
  sellableRooms: z.number().int(),
  soldTonight: z.number().int(),
  /** Cash that should be in the drawer, per currency (zero amounts left out). */
  drawer: z.array(z.object({ currency: z.string(), amountMinor: minor })),
  period: z.object({
    from: localDateSchema,
    to: localDateSchema,
    /** Basis points of sellable nights sold (the same figure as the occupancy report). */
    occupancyBp: z.number().int(),
    revenueMinor: minor,
    expensesMinor: minor,
    profitMinor: minor,
    /** Some expense section is hidden from the caller: the expense figure is partial. */
    partial: z.boolean()
  })
})
export type PortfolioFigures = z.infer<typeof portfolioFiguresSchema>

/**
 * `ok`: figures shown; `noCopy`: this computer holds no read-only copy of the hotel yet (connect to it once);
 * `failed`: the copy could not be read.
 */
export const PORTFOLIO_STATES = ['ok', 'noCopy', 'failed'] as const

export const portfolioHotelSchema = z.object({
  /** The saved hotel's code (client mode); null = this computer's own hotel (alone / main computer). */
  code: z.string().nullable(),
  name: z.string(),
  /** The hotel this computer is connected to (or its own hotel). */
  active: z.boolean(),
  /** `live`: read from the hotel's main computer just now; `copy`: from the read-only copy on this computer. */
  source: z.enum(['live', 'copy']).nullable(),
  /** For a copy: the hotel's data in it is up to this moment (ISO); null = unknown or live. */
  syncedAt: z.string().nullable(),
  state: z.enum(PORTFOLIO_STATES),
  figures: portfolioFiguresSchema.nullable()
})
export type PortfolioHotel = z.infer<typeof portfolioHotelSchema>

export const portfolioOverviewSchema = z.object({
  /** `host`: alone or the main computer (only its own hotel); `client`: the saved hotels of this computer. */
  mode: z.enum(['host', 'client']),
  hotels: z.array(portfolioHotelSchema)
})
export type PortfolioOverview = z.infer<typeof portfolioOverviewSchema>

export const portfolioGridInputSchema = z
  .object({ hotel: z.string().nullable(), from: localDateSchema, to: localDateSchema })
  .strict()
  .refine((r) => gridRangeSchema.safeParse({ from: r.from, to: r.to }).success, {
    path: ['to'],
    message: 'range'
  })

export const portfolioGridSchema = z.object({
  source: z.enum(['live', 'copy']),
  syncedAt: z.string().nullable(),
  grid: gridSchema
})
export type PortfolioGrid = z.infer<typeof portfolioGridSchema>

export const portfolioProcedures = {
  /** Owner only: every hotel's figures for the period (`from` inclusive, `to` exclusive). */
  'portfolio.overview': proc(periodInputSchema, portfolioOverviewSchema),
  /** Owner only: one hotel's tape chart for [from, to), read-only. */
  'portfolio.grid': proc(portfolioGridInputSchema, portfolioGridSchema)
} as const satisfies Record<string, Procedure>
