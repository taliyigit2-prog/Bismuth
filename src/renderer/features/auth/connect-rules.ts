// Rules of the connection screen (faz-13 madde 3): pure, unit-tested.
import type { ClientStatus } from '@shared/contract/remote'

/** Which side runs the older Bismuth: the data version decides, then the program version. */
export function olderSide(status: Pick<ClientStatus, 'host' | 'mine'>): 'mine' | 'host' {
  const host = status.host
  if (!host) return 'mine'
  if (host.schemaVersion !== status.mine.schemaVersion)
    return host.schemaVersion > status.mine.schemaVersion ? 'mine' : 'host'
  const parts = (v: string) => v.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0)
  const [a, b] = [parts(host.version), parts(status.mine.version)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? 'mine' : 'host'
  }
  return 'mine'
}
