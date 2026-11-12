// The description dictionary (faz-07 madde 4; G-66, S-33): every expense description the hotel has used, with the
// spellings that already fall into one group ("su", "Su " → one). A group can be renamed, or merged into another by
// giving it that group's text, so "en çok harcama" groups the same thing once. Only the words change, never amounts.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BookTextIcon, MergeIcon, PencilIcon } from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useLedgerMutation } from './ledger-api'

type Group = ProcedureOutput<'ledger.descriptionGroups'>[number]

export function DictionaryDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('ledger.dict.title')}
      description={t('ledger.dict.description')}
      className="sm:max-w-2xl"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.close')}
        </Button>
      }
    >
      {open ? <Dictionary /> : null}
    </ResponsiveDialog>
  )
}

function Dictionary() {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const query = useApiQuery('ledger.descriptionGroups', {})
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ key: string; text: string; mode: 'rename' | 'merge' } | null>(null)
  const rename = useLedgerMutation('ledger.renameDescription', {
    onSuccess: (done) => {
      setEditing(null)
      // B16: rows of a closed day keep their text; say how many.
      if (done.skippedClosed > 0) toast.info(t('ledger.dict.skippedClosed', { count: done.skippedClosed }))
      else toast.success(t('ledger.dict.renamed'))
    }
  })
  if (query.isPending)
    return (
      <div role="status" aria-busy className="grid gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-10 w-full" aria-hidden />
        <Skeleton className="h-10 w-full" aria-hidden />
      </div>
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const groups = query.data
  if (!groups.length)
    return (
      <EmptyState
        compact
        icon={BookTextIcon}
        title={t('ledger.dict.emptyTitle')}
        body={t('ledger.dict.emptyBody')}
      />
    )
  const canEdit = can('expenses', 'edit')
  const needle = q.trim().toLocaleLowerCase(f.locale)
  const shown = needle
    ? groups.filter((g) =>
        g.spellings.some((s) => s.description.toLocaleLowerCase(f.locale).includes(needle))
      )
    : groups
  const save = (g: Group): void => {
    if (!editing || !editing.text.trim() || rename.isPending) return
    rename.mutate({ key: g.key, description: editing.text.trim() })
  }
  return (
    <div className="grid gap-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('ledger.dict.search')}
        aria-label={t('ledger.dict.search')}
      />
      <ul className="grid gap-2" data-testid="dictionary">
        {shown.map((g) => (
          <li key={g.key} className="grid gap-2 rounded-lg border px-3 py-2" data-testid="dictionary-group">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">{g.description}</span>
              <Badge variant="secondary" className="tabular-nums">
                {t('ledger.dict.uses', { count: g.count })}
              </Badge>
              {canEdit && editing?.key !== g.key ? (
                <span className="ms-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="max-md:min-h-11"
                    onClick={() => setEditing({ key: g.key, text: g.description, mode: 'rename' })}
                  >
                    <PencilIcon aria-hidden />
                    {t('ledger.dict.rename')}
                  </Button>
                  {groups.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="max-md:min-h-11"
                      onClick={() => setEditing({ key: g.key, text: '', mode: 'merge' })}
                    >
                      <MergeIcon aria-hidden />
                      {t('ledger.dict.merge')}
                    </Button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {g.spellings.length > 1 ? (
              <p className="text-muted-foreground text-xs">
                {t('ledger.dict.spellings')}{' '}
                {g.spellings
                  .map((s) => t('ledger.dict.spelling', { text: s.description, count: s.count }))
                  .join(', ')}
              </p>
            ) : null}
            {editing?.key === g.key ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  save(g)
                }}
              >
                {editing.mode === 'rename' ? (
                  <Input
                    value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                    aria-label={t('ledger.dict.newName')}
                    className="min-w-0 flex-1"
                    maxLength={200}
                    autoFocus
                    data-testid="dictionary-rename"
                  />
                ) : (
                  <Select value={editing.text} onValueChange={(v) => setEditing({ ...editing, text: v })}>
                    <SelectTrigger className="min-w-0 flex-1" aria-label={t('ledger.dict.mergeInto')}>
                      <SelectValue placeholder={t('ledger.dict.mergeInto')} />
                    </SelectTrigger>
                    <SelectContent>
                      {groups
                        .filter((o) => o.key !== g.key)
                        .map((o) => (
                          <SelectItem key={o.key} value={o.description}>
                            {o.description}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={!editing.text.trim() || rename.isPending}
                  data-testid="dictionary-save"
                >
                  {t('common.save')}
                </Button>
                <p className="text-muted-foreground w-full text-xs">
                  {t('ledger.dict.effect', { count: g.count })}
                </p>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
