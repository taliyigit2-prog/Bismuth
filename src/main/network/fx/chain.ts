// The market-rate chain (K-06): sources in the hotel's order; a source that cannot be reached is skipped this
// time, one whose answer no longer matches rests 24 hours; currencies a source lacks (Frankfurter: RUB) are asked
// of the next one. Silent: the result says what happened, nothing is thrown.
import { crossRates, isKeyedProvider, SOURCE_REST_MS, type FxProvider } from '@shared/domain/external'
import type { HttpClient } from '../http'
import type { StateStore } from '../state'
import { FX_ADAPTERS, SourceSchemaError, tcmb, type FxAdapter } from './sources'

export interface MarketRate {
  currency: string
  /** Base-currency units for one unit × 1 000 000. */
  micro: number
  provider: FxProvider
  /** The source's own time of the rate (null: live, it is "now"). */
  asOf: string | null
}

export interface ChainResult {
  /** Network switched off: nothing was asked. */
  skipped: boolean
  rates: MarketRate[]
  /** Wanted currencies no source could give. */
  missing: string[]
}

interface ChainInput {
  http: HttpClient
  state: StateStore
  order: readonly FxProvider[]
  base: string
  wanted: readonly string[]
  now: Date
}

function markOk(state: StateStore, id: string, now: Date): void {
  state.update((s) => {
    s.sources[id] = {
      lastOkAt: now.toISOString(),
      lastFailAt: s.sources[id]?.lastFailAt ?? null,
      restingUntil: null
    }
  })
}

function markFailed(state: StateStore, id: string, now: Date, rest: boolean): void {
  state.update((s) => {
    const prev = s.sources[id]
    s.sources[id] = {
      lastOkAt: prev?.lastOkAt ?? null,
      lastFailAt: now.toISOString(),
      restingUntil: rest
        ? new Date(now.getTime() + SOURCE_REST_MS).toISOString()
        : (prev?.restingUntil ?? null)
    }
  })
}

const resting = (state: StateStore, id: string, now: Date): boolean => {
  const until = state.read().sources[id]?.restingUntil
  return !!until && Date.parse(until) > now.getTime()
}

/** Asks one source; null = unreachable, wrong status or wrong shape (recorded in the state). */
async function ask(
  adapter: FxAdapter,
  input: Pick<ChainInput, 'http' | 'state' | 'base' | 'now'>,
  key: string | null
): Promise<{ off: true } | { off: false; table: ReturnType<FxAdapter['parse']> | null }> {
  const res = await input.http.get(adapter.url(input.base, key), { Accept: 'application/json, text/xml' })
  if (!res.ok) {
    if (res.reason === 'off') return { off: true }
    markFailed(input.state, adapter.id, input.now, false)
    return { off: false, table: null }
  }
  if (res.result.status !== 200) {
    markFailed(input.state, adapter.id, input.now, false)
    return { off: false, table: null }
  }
  try {
    const table = adapter.parse(res.result.text, input.base)
    markOk(input.state, adapter.id, input.now)
    return { off: false, table }
  } catch (error) {
    markFailed(input.state, adapter.id, input.now, error instanceof SourceSchemaError)
    return { off: false, table: null }
  }
}

export async function runFxChain(input: ChainInput): Promise<ChainResult> {
  const keys = input.state.read().apiKeys
  let remaining = input.wanted.filter((c) => c !== input.base)
  const rates: MarketRate[] = []
  for (const id of input.order) {
    if (remaining.length === 0) break
    const key = isKeyedProvider(id) ? (keys[id] ?? null) : null
    if (isKeyedProvider(id) && !key) continue
    if (resting(input.state, id, input.now)) continue
    const answer = await ask(FX_ADAPTERS[id], input, key)
    if (answer.off) return { skipped: true, rates: [], missing: remaining }
    if (!answer.table) continue
    const got = crossRates(answer.table.pivot, answer.table.perUnit, input.base, remaining)
    const asOf = answer.table.asOf ?? null
    for (const [currency, micro] of Object.entries(got)) rates.push({ currency, micro, provider: id, asOf })
    remaining = remaining.filter((c) => !(c in got))
  }
  return { skipped: false, rates, missing: remaining }
}

/** The TCMB comparison line (only for a TRY hotel: the bulletin is in TRY). */
export async function fetchTcmb(
  input: Pick<ChainInput, 'http' | 'state' | 'now'> & { wanted: readonly string[] }
): Promise<{ currency: string; micro: number }[] | null> {
  if (resting(input.state, 'tcmb', input.now)) return null
  const answer = await ask(tcmb, { ...input, base: 'TRY' }, null)
  if (answer.off || !answer.table) return null
  const got = crossRates(answer.table.pivot, answer.table.perUnit, 'TRY', input.wanted)
  return Object.entries(got).map(([currency, micro]) => ({ currency, micro }))
}
