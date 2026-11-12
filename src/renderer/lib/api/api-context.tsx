import { createContext, useContext, type ReactNode } from 'react'
import type { Transport } from '../transport'

const TransportContext = createContext<Transport | null>(null)

export function ApiProvider({ transport, children }: { transport: Transport; children: ReactNode }) {
  return <TransportContext.Provider value={transport}>{children}</TransportContext.Provider>
}

/** Components call the API only through these hooks (.claude/rules/ui.md: no direct window.bismuth). */
export function useTransport(): Transport {
  const transport = useContext(TransportContext)
  if (!transport) throw new Error('useTransport outside ApiProvider')
  return transport
}
