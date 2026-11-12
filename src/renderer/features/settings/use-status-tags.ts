// Status tags over the real service (G-32, G-33): the list, and edits applied to the cache at once so the
// calendar preview and the legend follow the owner's hand; the service answer then replaces the guess.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { STATUS_KEYS, type ProcedureInput, type ProcedureOutput, type StatusKey } from '@shared/contract'
import { queryKey, useApiQuery } from '@/lib/api/hooks'
import { useTransport } from '@/lib/api/api-context'
import type { ApiError } from '@/lib/transport'

export type StatusTag = ProcedureOutput<'statusTags.list'>[number]
type Patch = ProcedureInput<'statusTags.update'>['patch']

const LIST = queryKey('statusTags.list', {})

export function useStatusTags() {
  return useApiQuery('statusTags.list', {})
}

export function useStatusTagMutations(onError: (error: ApiError) => void) {
  const transport = useTransport()
  const client = useQueryClient()
  const setList = (fn: (tags: StatusTag[]) => StatusTag[]): void => {
    client.setQueryData<StatusTag[]>(LIST, (old) => (old ? fn(old) : old))
  }
  const refresh = (): Promise<void> => client.invalidateQueries({ queryKey: LIST })

  const update = useMutation<StatusTag, ApiError, { id: string; patch: Patch }>({
    mutationFn: (input) => transport.call('statusTags.update', input),
    onMutate: ({ id, patch }) =>
      setList((tags) => tags.map((t) => (t.id === id ? ({ ...t, ...patch } as StatusTag) : t))),
    onSuccess: (tag) => setList((tags) => tags.map((t) => (t.id === tag.id ? tag : t))),
    onError: (error) => {
      onError(error)
      void refresh()
    }
  })

  const create = useMutation<StatusTag, ApiError, ProcedureInput<'statusTags.createCustom'>>({
    mutationFn: (input) => transport.call('statusTags.createCustom', input),
    onSuccess: (tag) => setList((tags) => [...tags, tag]),
    onError
  })

  const remove = useMutation<unknown, ApiError, string>({
    mutationFn: (id) => transport.call('statusTags.removeCustom', { id }),
    onSuccess: (_, id) => setList((tags) => tags.filter((t) => t.id !== id)),
    onError
  })

  return { update, create, remove }
}

/** The hotel's name for a tag, else the translated name of an automatic status. */
export function tagLabel(tag: StatusTag, t: (key: `status.${StatusKey}`) => string): string {
  if (tag.name) return tag.name
  return (STATUS_KEYS as readonly string[]).includes(tag.code)
    ? t(`status.${tag.code as StatusKey}`)
    : tag.code
}

/**
 * What to store for an automatic status's name or meaning (G-08, G-33). The field shows the wording in use. Saved
 * empty, or equal to the program's own wording in any interface language, it stores `null`: the status then keeps
 * the translated wording and follows the interface language. Anything else is the hotel's own and stays as typed.
 */
export function ownWording(input: string, builtIns: readonly string[]): string | null {
  const text = input.trim()
  return text === '' || builtIns.includes(text) ? null : text
}

/** The patch for an automatic status's name field, or `undefined` when the stored name would not change. */
export function autoNamePatch(
  tag: Pick<StatusTag, 'name'>,
  input: string,
  builtIns: readonly string[]
): Patch | undefined {
  const name = ownWording(input, builtIns)
  return name === tag.name ? undefined : { name }
}

/** The patch for an automatic status's meaning field (`null` = the program's translated meaning). */
export function autoMeaningPatch(
  tag: Pick<StatusTag, 'description'>,
  input: string,
  builtIns: readonly string[]
): Patch | undefined {
  const description = ownWording(input, builtIns)
  return description === tag.description ? undefined : { description }
}
