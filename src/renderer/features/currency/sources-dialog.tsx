// "Kur kaynakları" (K-06): the chain in the order it is tried, each source's state (worked, failed this time,
// resting for 24 hours after a changed answer, needs a key), and the hotel's own key for a keyed source. The key
// is written once and never shown again (it stays in the main process).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { FxSourceStatus } from '@shared/contract/external'
import { FX_PROVIDER_NAMES, type FxKeyedProvider } from '@shared/domain/external'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/field-error'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ErrorState, LoadingState } from '@/components/states'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useErrorToast } from './use-error-toast'
import { useWhen } from './use-when'

const STATE_VARIANT: Record<FxSourceStatus['state'], 'secondary' | 'outline' | 'destructive'> = {
  ok: 'secondary',
  failed: 'destructive',
  resting: 'destructive',
  untried: 'outline',
  needsKey: 'outline'
}

function KeyForm({ provider, hasKey }: { provider: FxKeyedProvider; hasKey: boolean }) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const failed = useErrorToast()
  const save = useApiMutation('fx.setApiKey', { invalidates: ['fx.sources'], onError: failed })
  const id = `fx-key-${provider}`
  const tooLong = key.trim().length > 200
  const valid = key.trim().length >= 8 && !tooLong
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        save.mutate(
          { provider, key: key.trim() },
          {
            onSuccess: () => {
              setKey('')
              toast.success(t('currency.sources.keySaved'))
            }
          }
        )
      }}
    >
      <Label htmlFor={id} className="text-xs font-normal">
        {hasKey ? t('currency.sources.keyReplace') : t('currency.sources.key')}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-invalid={tooLong ? true : undefined}
        />
        <Button type="submit" variant="outline" disabled={!valid || save.isPending}>
          {t('common.save')}
        </Button>
        {hasKey ? (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { provider, key: null },
                { onSuccess: () => toast.success(t('currency.sources.keyRemoved')) }
              )
            }
          >
            {t('currency.sources.keyRemove')}
          </Button>
        ) : null}
      </div>
      <FieldError message={tooLong && t('form.tooLong', { max: 200 })} />
    </form>
  )
}

export function SourcesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const when = useWhen()
  const can = useCan()
  const query = useApiQuery('fx.sources', {}, { enabled: open })
  const canKey = can('settings', 'edit')
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('currency.sources.title')}
      description={t('currency.sources.description')}
      className="sm:max-w-xl"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.close')}
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ol className="grid gap-3" data-testid="fx-sources">
          {query.data.map((s, i) => (
            <li key={s.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-5 text-xs tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 basis-40 font-medium">{FX_PROVIDER_NAMES[s.id]}</span>
                <Badge variant={STATE_VARIANT[s.state]}>{t(`currency.sources.state.${s.state}`)}</Badge>
              </div>
              <p className="text-muted-foreground ps-7 text-xs">
                {s.state === 'resting' && s.restingUntil
                  ? t('currency.sources.restingUntil', { time: when(s.restingUntil) })
                  : s.lastOkAt
                    ? t('currency.sources.lastOk', { time: when(s.lastOkAt) })
                    : s.keyed
                      ? t('currency.sources.keyedHelp')
                      : t('currency.sources.notYet')}
              </p>
              {s.keyed && canKey ? (
                <div className="ps-7">
                  <KeyForm provider={s.id as FxKeyedProvider} hasKey={s.hasKey} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </ResponsiveDialog>
  )
}
