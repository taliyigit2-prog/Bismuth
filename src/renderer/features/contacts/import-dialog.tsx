// Phone-book import (G-160): paste rows from Excel or open a CSV file — "ad; telefon; kategori" per line. The rows
// are checked here first (what will be added, which lines have a problem), then written in one go; a name that is
// already in the phone book is not added twice.
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileTextIcon } from 'lucide-react'
import { CONTACT_IMPORT_LIMIT } from '@shared/contract/procedures/contacts'
import { parseContactsCsv } from '@shared/domain/contacts-csv'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useAdminMutation } from '../settings/use-admin'
import { categoryLabel } from './categories'

const PREVIEW_ROWS = 8

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const file = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const parsed = parseContactsCsv(text)
  const save = useAdminMutation('contacts.import', { invalidate: ['contacts.list', 'contacts.favorites'] })
  const tooMany = parsed.rows.length >= CONTACT_IMPORT_LIMIT
  const run = (): void => {
    if (!parsed.rows.length) return
    save.mutate(
      {
        contacts: parsed.rows.map((r) => ({
          name: r.name,
          phones: r.phones,
          category: r.category,
          customCategory: r.customCategory
        }))
      },
      {
        onSuccess: (result) => {
          if (!result.created.length) {
            // Nothing new: an information, not a success ("Rehbere 0 kişi eklendi").
            toast.info(t('contacts.import.nothingNew', { count: result.skipped.length }), {
              description: result.skipped.join(', ') || undefined
            })
            onClose()
            return
          }
          toast.success(t('contacts.import.done', { count: result.created.length }), {
            description: result.skipped.length
              ? t('contacts.import.skipped', {
                  count: result.skipped.length,
                  names: result.skipped.join(', ')
                })
              : undefined
          })
          onClose()
        }
      }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('contacts.import.title')}
      description={t('contacts.import.description')}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={run} disabled={!parsed.rows.length || save.isPending} data-testid="import-run">
            {t('contacts.import.run', { count: parsed.rows.length })}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Label htmlFor={`${id}-text`}>{t('contacts.import.paste')}</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
              <FileTextIcon aria-hidden />
              {t('contacts.import.file')}
            </Button>
            <input
              ref={file}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              aria-label={t('contacts.import.file')}
              onChange={(e) => {
                const picked = e.target.files?.[0]
                if (picked) void picked.text().then(setText)
                e.target.value = ''
              }}
            />
          </div>
          <Textarea
            id={`${id}-text`}
            rows={6}
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('contacts.import.placeholder')}
            className="font-mono text-sm"
            data-testid="import-text"
          />
          <p className="text-muted-foreground text-xs">{t('contacts.import.format')}</p>
        </div>
        {parsed.rows.length ? (
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">
              {t('contacts.import.preview', { count: parsed.rows.length })}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('contacts.name')}</TableHead>
                    <TableHead>{t('contacts.phone')}</TableHead>
                    <TableHead>{t('contacts.categoryLabel')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="whitespace-normal">{r.name}</TableCell>
                      <TableCell dir="ltr" className="text-start tabular-nums">
                        {r.phones.map((p) => p.number).join(', ')}
                      </TableCell>
                      <TableCell>{categoryLabel(t, r)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.rows.length > PREVIEW_ROWS ? (
              <p className="text-muted-foreground text-xs">
                {t('contacts.import.more', { count: parsed.rows.length - PREVIEW_ROWS })}
              </p>
            ) : null}
            {tooMany ? (
              <p className="text-destructive text-xs">
                {t('contacts.import.tooMany', { max: CONTACT_IMPORT_LIMIT })}
              </p>
            ) : null}
          </div>
        ) : null}
        {parsed.problems.length ? (
          <ul className="text-destructive grid gap-0.5 text-xs" role="alert" data-testid="import-problems">
            {parsed.problems.map((p) => (
              <li key={p.line}>{t(`contacts.import.problem.${p.reason}`, { line: p.line })}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
