// "Durum etiketleri" (G-32, G-33, K-21; faz-03 madde 2): the automatic statuses (name, colour per theme, meaning,
// on/off) and the hotel's own tags (add, name, colour, meaning, fill-or-border priority, on/off, delete while
// unused). Every edit shows at once in the calendar preview and the legend next to it (on the phone the preview
// comes first, above the lists). Real service, not demo.
import { useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, PlusIcon, RotateCcwIcon, TagsIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import {
  STATUS_DEFAULT_COLORS,
  type ProcedureInput,
  STATUS_KEYS,
  type SettingsPatch,
  type SettingsValues,
  type StatusColors,
  type StatusKey
} from '@shared/contract'
import { isReadable, TAG_PALETTE } from '@shared/color'
import { APP_LOCALES } from '@shared/format'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { StatusSwatch } from '@/components/status-swatch'
import { tagFill } from '@/lib/status-style'
import { useResolvedTheme } from '@/lib/theme/theme-sync'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { TagPreview } from './tag-preview'
import {
  autoMeaningPatch,
  autoNamePatch,
  ownWording,
  tagLabel,
  useStatusTagMutations,
  useStatusTags,
  type StatusTag
} from './use-status-tags'

interface Props {
  values: SettingsValues
  onSave: (patch: SettingsPatch) => void
}

type Patch = ProcedureInput<'statusTags.update'>['patch']
/** Saves a field once the hand stops; `make` reads the latest value and returns nothing when it is unchanged. */
type SaveLater = (tag: StatusTag, field: string, make: () => Patch | undefined) => void
type SaveNow = (tag: StatusTag, patch: Patch) => void

const isStatusKey = (code: string): code is StatusKey => (STATUS_KEYS as readonly string[]).includes(code)

const colorInput =
  'focus-visible:ring-ring size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 max-md:size-11'

/**
 * Name and meaning are one-line fields that grow a line instead of cutting the text ("Частично оплачено /
 * предоплата" on a phone, a long meaning): textareas sized to their content, with no line breaks of their own.
 */
const growing = 'min-h-9 resize-none py-1.5 max-md:min-h-11'
/** The name: set apart from the meaning by its weight; its own full-width row on the phone. */
const nameField = cn(growing, 'min-w-0 flex-1 basis-48 font-medium max-md:order-last max-md:basis-full')

const noNewLine = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
  if (e.key === 'Enter') e.preventDefault()
}
/** A pasted line break becomes a space. */
const oneLine = (value: string): string => value.replace(/\s*\n\s*/g, ' ')

/** Saves once the hand stops (colour pickers and typing fire on every change). */
function useDebounced() {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  return (key: string, run: () => void, ms = 300): void => {
    const old = timers.current.get(key)
    if (old) clearTimeout(old)
    timers.current.set(key, setTimeout(run, ms))
  }
}

/**
 * The colour itself is the button: the live swatch (theme CSS, so it shows exactly what the calendar shows) with
 * an invisible native colour picker over it.
 */
function ColorSwatchPicker({
  swatch,
  label,
  disabled,
  ...input
}: {
  swatch: ReactNode
  label: string
  disabled: boolean
} & Omit<ComponentProps<'input'>, 'type' | 'className' | 'aria-label' | 'disabled'>) {
  return (
    <label
      title={label}
      className={cn(
        'has-focus-visible:ring-ring relative grid size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border has-focus-visible:ring-[3px] max-md:size-11',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      {swatch}
      <input
        type="color"
        aria-label={label}
        disabled={disabled}
        className="absolute -inset-px size-[calc(100%+2px)] cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...input}
      />
    </label>
  )
}

/** On/off with its words on screen; the screen reader also hears which status or tag it belongs to. */
function ShowSwitch({
  tag,
  disabled,
  onChange,
  testId
}: {
  tag: StatusTag
  disabled: boolean
  onChange: (enabled: boolean) => void
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <Label className="ms-auto min-h-6 shrink-0 font-normal max-md:min-h-11">
      <Switch
        checked={tag.enabled}
        disabled={disabled}
        aria-label={t('settings.tags.enabled', { name: tagLabel(tag, t) })}
        data-testid={testId}
        onCheckedChange={onChange}
      />
      {t('settings.tags.showOnCalendar')}
    </Label>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>
}

function ReadabilityHint({ color }: { color: string | null | undefined }) {
  const { t } = useTranslation()
  if (!color || isReadable(color)) return null
  return (
    <Badge variant="outline" className="border-warning text-foreground gap-1 font-normal">
      <AlertTriangleIcon aria-hidden />
      {t('settings.tags.lowContrast')}
    </Badge>
  )
}

/**
 * One automatic status. Name and meaning show the wording in use (the program's, translated, until the hotel
 * writes its own); emptied, they go back to the program's wording and say so.
 */
function AutoTagRow({
  tag,
  code,
  color,
  theme,
  canEdit,
  onColor,
  saveLater,
  saveNow
}: {
  tag: StatusTag
  code: StatusKey
  color: string
  theme: 'light' | 'dark'
  canEdit: boolean
  onColor: (value: string) => void
  saveLater: SaveLater
  saveNow: SaveNow
}) {
  const { t, i18n } = useTranslation()
  // The program's wording in the interface language first, then in every language (any of them = "not renamed").
  const builtInName = t(`status.${code}`)
  const builtInNames = [builtInName, ...APP_LOCALES.map((lng) => i18n.getFixedT(lng)(`status.${code}`))]
  const builtInMeaning = t(`settings.tags.autoMeaning.${code}`)
  const builtInMeanings = [
    builtInMeaning,
    ...APP_LOCALES.map((lng) => i18n.getFixedT(lng)(`settings.tags.autoMeaning.${code}`))
  ]
  const [name, setName] = useState(() => tagLabel(tag, t))
  const [meaning, setMeaning] = useState(() => tag.description ?? builtInMeaning)
  const renamed = ownWording(name, builtInNames) !== null

  return (
    <li
      className={cn('grid gap-2 rounded-lg border p-3', !tag.enabled && 'bg-muted/50')}
      data-testid={`auto-tag-${code}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ColorSwatchPicker
          // Re-mount when the theme changes so the picker shows that theme's colour.
          key={`${theme}-${code}`}
          swatch={<StatusSwatch status={code} className="size-full rounded-none border-0" />}
          label={t('settings.pickColor', { name: tagLabel(tag, t) })}
          data-testid={`color-${code}`}
          defaultValue={color}
          disabled={!canEdit}
          onChange={(e) => onColor(e.target.value)}
        />
        <Textarea
          rows={1}
          className={nameField}
          aria-label={t('settings.tags.name')}
          value={name}
          maxLength={60}
          disabled={!canEdit}
          data-testid={`name-${code}`}
          onKeyDown={noNewLine}
          onChange={(e) => {
            const value = oneLine(e.target.value)
            setName(value)
            saveLater(tag, 'name', () => autoNamePatch(tag, value, builtInNames))
          }}
          onBlur={() => {
            if (!name.trim()) setName(builtInName)
          }}
        />
        <ShowSwitch
          tag={tag}
          disabled={!canEdit}
          testId={`enabled-${code}`}
          onChange={(enabled) => saveNow(tag, { enabled })}
        />
      </div>
      {!name.trim() ? (
        <Hint>{t('settings.tags.nameEmpty', { name: builtInName })}</Hint>
      ) : renamed ? (
        <Hint>{t('settings.tags.nameDefault', { name: builtInName })}</Hint>
      ) : null}
      <Textarea
        rows={1}
        className={growing}
        aria-label={t('settings.tags.meaning')}
        value={meaning}
        maxLength={300}
        disabled={!canEdit}
        onKeyDown={noNewLine}
        onChange={(e) => {
          const value = oneLine(e.target.value)
          setMeaning(value)
          saveLater(tag, 'description', () => autoMeaningPatch(tag, value, builtInMeanings))
        }}
        onBlur={() => {
          if (!meaning.trim()) setMeaning(builtInMeaning)
        }}
      />
      <ReadabilityHint color={color} />
    </li>
  )
}

/** One of the hotel's own tags. A tag needs a name: emptied, the field keeps the last name. */
function CustomTagRow({
  tag,
  canEdit,
  saveLater,
  saveNow,
  onRemove
}: {
  tag: StatusTag
  canEdit: boolean
  saveLater: SaveLater
  saveNow: SaveNow
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(tag.name ?? '')
  const [meaning, setMeaning] = useState(tag.description ?? '')
  const label = tagLabel(tag, t)
  return (
    <li
      className={cn('grid gap-2 rounded-lg border p-3', !tag.enabled && 'bg-muted/50')}
      data-testid={`custom-tag-${tag.id}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ColorSwatchPicker
          swatch={<span aria-hidden className={cn('size-full', tagFill(tag.id))} />}
          label={t('settings.pickColor', { name: label })}
          defaultValue={tag.color ?? TAG_PALETTE[0]}
          disabled={!canEdit}
          onChange={(e) => {
            const color = e.target.value
            saveLater(tag, 'color', () => ({ color }))
          }}
        />
        <Textarea
          rows={1}
          className={nameField}
          aria-label={t('settings.tags.name')}
          aria-invalid={!name.trim()}
          value={name}
          maxLength={60}
          disabled={!canEdit}
          onKeyDown={noNewLine}
          onChange={(e) => {
            const value = oneLine(e.target.value)
            setName(value)
            const next = value.trim()
            saveLater(tag, 'name', () => (next && next !== tag.name ? { name: next } : undefined))
          }}
          onBlur={() => {
            if (!name.trim()) setName(tag.name ?? '')
          }}
        />
        {/* Switch and delete stay together: when the row is narrow they move under the name as one. */}
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <ShowSwitch tag={tag} disabled={!canEdit} onChange={(enabled) => saveNow(tag, { enabled })} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                aria-label={t('settings.tags.remove', { name: label })}
              >
                <Trash2Icon />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('settings.tags.removeTitle', { name: label })}</AlertDialogTitle>
                <AlertDialogDescription>{t('settings.tags.removeBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove}>{t('settings.tags.removeConfirm')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {!name.trim() ? <Hint>{t('settings.tags.nameRequired', { name: tag.name ?? '' })}</Hint> : null}
      <Textarea
        rows={1}
        className={growing}
        aria-label={t('settings.tags.meaning')}
        value={meaning}
        placeholder={t('settings.tags.meaningPlaceholder')}
        maxLength={300}
        disabled={!canEdit}
        onKeyDown={noNewLine}
        onChange={(e) => {
          const value = oneLine(e.target.value)
          setMeaning(value)
          const description = value.trim() || null
          saveLater(tag, 'description', () => (description === tag.description ? undefined : { description }))
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="min-h-6 leading-snug font-normal max-md:min-h-11">
          <Switch
            checked={tag.priorityOverAuto}
            disabled={!canEdit}
            onCheckedChange={(priorityOverAuto) => saveNow(tag, { priorityOverAuto })}
          />
          {t('settings.tags.priority')}
        </Label>
        <ReadabilityHint color={tag.color} />
      </div>
    </li>
  )
}

export function StatusTagsSection({ values, onSave }: Props) {
  const { t, i18n } = useTranslation()
  const theme = useResolvedTheme()
  const can = useCan()
  const canEdit = can('settings.colors', 'edit')
  const query = useStatusTags()
  const later = useDebounced()
  const [adding, setAdding] = useState(false)
  const { update, create, remove } = useStatusTagMutations((error) =>
    toast.error(t('settings.saveFailed'), {
      description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
    })
  )
  const settingKey = theme === 'dark' ? 'ui.statusColorsDark' : 'ui.statusColors'
  const colors = values[settingKey]
  const saveColors = (next: StatusColors): void =>
    onSave(theme === 'dark' ? { 'ui.statusColorsDark': next } : { 'ui.statusColors': next })
  const saveNow: SaveNow = (tag, patch) => update.mutate({ id: tag.id, patch })
  const saveLater: SaveLater = (tag, field, make) =>
    later(`${tag.id}-${field}`, () => {
      const patch = make()
      if (patch) update.mutate({ id: tag.id, patch })
    })

  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const tags = query.data
  const auto = tags.filter((tag) => tag.kind === 'auto' && isStatusKey(tag.code))
  const custom = tags.filter((tag) => tag.kind === 'custom')

  return (
    // Two columns only on a wide screen: at 1366 px beside the menu each would be too narrow for a tag row.
    <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.tags.autoTitle')}</CardTitle>
            <CardDescription>{t('settings.tags.autoHelp')}</CardDescription>
            <CardDescription data-testid="status-colors-theme">
              {theme === 'dark' ? t('settings.statusColorsForDark') : t('settings.statusColorsForLight')}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ul className="grid gap-2">
              {auto.map((tag) => {
                const code = tag.code as StatusKey
                return (
                  <AutoTagRow
                    // A new interface language re-reads the program's wording into the fields.
                    key={`${tag.id}-${i18n.language}`}
                    tag={tag}
                    code={code}
                    color={colors[code] ?? STATUS_DEFAULT_COLORS[theme][code]}
                    theme={theme}
                    canEdit={canEdit}
                    onColor={(value) =>
                      later(`color-${code}`, () => saveColors({ ...colors, [code]: value }), 250)
                    }
                    saveLater={saveLater}
                    saveNow={saveNow}
                  />
                )
              })}
            </ul>
            <div>
              <Button variant="outline" size="sm" onClick={() => saveColors({})} disabled={!canEdit}>
                <RotateCcwIcon aria-hidden />
                {t('settings.resetColors')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <CardTitle>{t('settings.tags.customTitle')}</CardTitle>
              <CardDescription>{t('settings.tags.customHelp')}</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAdding(true)} disabled={!canEdit} data-testid="add-tag">
              <PlusIcon aria-hidden />
              {t('settings.tags.add')}
            </Button>
          </CardHeader>
          <CardContent>
            {custom.length ? (
              <ul className="grid gap-2">
                {custom.map((tag) => (
                  <CustomTagRow
                    key={tag.id}
                    tag={tag}
                    canEdit={canEdit}
                    saveLater={saveLater}
                    saveNow={saveNow}
                    onRemove={() => remove.mutate(tag.id)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={TagsIcon}
                title={t('settings.tags.emptyTitle')}
                body={t('settings.tags.emptyBody')}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* One column: the preview first, so a colour or on/off change shows right above the lists. */}
      <Card className="max-2xl:order-first 2xl:sticky 2xl:top-18">
        <CardHeader>
          <CardTitle>{t('settings.tags.previewTitle')}</CardTitle>
          <CardDescription>{t('settings.tags.previewHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <TagPreview tags={tags} />
        </CardContent>
      </Card>

      <NewTagDialog
        open={adding}
        onOpenChange={setAdding}
        defaultColor={TAG_PALETTE[custom.length % TAG_PALETTE.length]!}
        onCreate={(input) =>
          create.mutate(input, {
            onSuccess: () => {
              setAdding(false)
              toast.success(t('settings.saved'))
            }
          })
        }
      />
    </div>
  )
}

function NewTagDialog({
  open,
  onOpenChange,
  defaultColor,
  onCreate
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultColor: string
  onCreate: (input: {
    name: string
    color: string
    description: string | null
    priorityOverAuto: boolean
  }) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState(defaultColor)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(false)
  const reset = (o: boolean): void => {
    if (!o) {
      setName('')
      setDescription('')
      setPriority(false)
    } else setColor(defaultColor)
    onOpenChange(o)
  }
  const submit = (): void => {
    if (!name.trim()) return
    onCreate({
      name: name.trim(),
      color,
      description: description.trim() || null,
      priorityOverAuto: priority
    })
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={reset}
      title={t('settings.tags.addTitle')}
      description={t('settings.tags.addHelp')}
      footer={
        <>
          <Button variant="outline" onClick={() => reset(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim()} data-testid="save-tag">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="tag-name">{t('settings.tags.name')}</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className={colorInput}
              aria-label={t('settings.pickColor', { name: name || t('settings.tags.name') })}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.tags.namePlaceholder')}
              maxLength={60}
              autoFocus
              data-testid="tag-name"
            />
          </div>
          <ReadabilityHint color={color} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tag-meaning">{t('settings.tags.meaning')}</Label>
          <Input
            id="tag-meaning"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('settings.tags.meaningPlaceholder')}
            maxLength={300}
          />
        </div>
        <Label className="min-h-6 leading-snug font-normal max-md:min-h-11">
          <Switch checked={priority} onCheckedChange={setPriority} />
          {t('settings.tags.priority')}
        </Label>
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
