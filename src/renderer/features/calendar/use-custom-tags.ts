// The hotel's own tags (statusTags.list, kind=custom, enabled) with their colour classes on the page (G-33).
import { useApiQuery } from '@/lib/api/hooks'
import { useTagStyles } from '@/lib/status-style'

export type TagRow = { id: string; name: string | null; color: string | null; description: string | null }

/** Enabled custom tags (statusTags.list), for the picker and the panel's chips. */
export function useCustomTags(): TagRow[] {
  const query = useApiQuery('statusTags.list', {}, { staleTime: 60_000 })
  const tags = (query.data ?? []).filter((t) => t.kind === 'custom' && t.enabled)
  useTagStyles(tags)
  return tags
}
