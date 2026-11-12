// Report an issue (G-180, akislar.md "Gün içinde"): a room or a general area, a short title, detail, severity,
// photos from the phone, and "close the room for sale" while it is open (needs the block right; the service
// checks it). No cost field (S-76): what the repair costs goes into the ledger as an expense. Who reported it is
// the signed-in person (the service writes it).
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AttachmentPicker } from '@/components/attachment-picker'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { RoomPicker } from '@/components/room-picker'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { floorNumber } from '@/features/rooms/room-model'
import { ISSUE_QUERIES, SEVERITIES, useErrorText, type Issue } from './issue-utils'
import { useUploadIssuePhotos } from './use-issue-photos'

const PLACES = ['room', 'area'] as const
type Place = (typeof PLACES)[number]
const SEVERITY_ORDER = [...SEVERITIES].reverse()

export function IssueDialog({
  open,
  onOpenChange,
  roomId: presetRoomId = null,
  onReported
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opened from a room: that room is chosen already. */
  roomId?: string | null
  onReported?: (issue: Issue) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const can = useCan()
  const errorText = useErrorText()
  const upload = useUploadIssuePhotos()
  const rooms = useApiQuery('rooms.list', {}, { enabled: open })
  const types = useApiQuery('rooms.listTypes', {}, { enabled: open })
  const openByRoom = useApiQuery('housekeeping.openIssuesByRoom', {}, { enabled: open })
  const known = useApiQuery('housekeeping.issues', {}, { enabled: open })
  const report = useApiMutation('housekeeping.reportIssue', { invalidates: ISSUE_QUERIES })
  const [place, setPlace] = useState<Place>('room')
  const [roomId, setRoomId] = useState<string | null>(presetRoomId)
  const [area, setArea] = useState('')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [severity, setSeverity] = useState<Issue['severity']>('medium')
  const [blocks, setBlocks] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const canBlock = can('rooms.block', 'edit')

  const pickerRooms = useMemo(() => {
    const typeName = new Map((types.data ?? []).map((ty) => [ty.id, ty]))
    return (rooms.data ?? []).map((r) => {
      const ty = typeName.get(r.roomTypeId)
      return {
        id: r.id,
        number: r.number,
        floor: floorNumber(r.floor),
        typeLabel: ty ? (ty.nameI18n?.[f.locale] ?? ty.name) : '',
        beds: r.beds
      }
    })
  }, [rooms.data, types.data, f])
  const openInRoom = openByRoom.data?.find((o) => o.roomId === roomId)
  const areas = [...new Set((known.data ?? []).map((i) => i.area).filter((a): a is string => !!a))]
  const placeMissing = place === 'room' ? !roomId : !area.trim()
  const titleMissing = !title.trim()

  const close = (next: boolean): void => {
    if (busy) return
    onOpenChange(next)
    if (!next) {
      setPlace('room')
      setRoomId(presetRoomId)
      setArea('')
      setTitle('')
      setDetail('')
      setSeverity('medium')
      setBlocks(false)
      setFiles([])
      setTried(false)
    }
  }
  const save = async (): Promise<void> => {
    if (placeMissing || titleMissing) {
      setTried(true)
      return
    }
    setBusy(true)
    try {
      const issue = await report.mutateAsync({
        roomId: place === 'room' ? roomId : null,
        area: place === 'area' ? area.trim() : null,
        title: title.trim(),
        description: detail.trim() || null,
        severity,
        blocksRoom: place === 'room' && blocks
      })
      const photos = await upload(issue.id, files)
      if (photos.error) toast.error(t('issues.new.photoFailed'), { description: errorText(photos.error) })
      else toast.success(t('issues.new.saved'))
      if (issue.blocksRoom && !issue.block) toast.warning(t('issues.new.soldTonight'))
      setBusy(false)
      close(false)
      onReported?.(issue)
    } catch (error) {
      setBusy(false)
      toast.error(errorText(error))
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('issues.new.title')}
      description={t('issues.new.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4"
        noValidate
        data-testid="issue-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid gap-1.5">
          <Label id={`${formId}-place`}>{t('issues.new.where')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={place}
            aria-labelledby={`${formId}-place`}
            onValueChange={(v) => {
              if (!v) return
              setPlace(v as Place)
              if (v === 'area') setBlocks(false)
            }}
            className="w-full"
          >
            {PLACES.map((p) => (
              <ToggleGroupItem key={p} value={p} className="flex-1">
                {t(`issues.new.place.${p}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {place === 'room' ? (
          <div className="grid gap-1.5">
            <RoomPicker
              id={`${formId}-room`}
              label={t('common.room')}
              rooms={pickerRooms}
              value={roomId}
              onChange={setRoomId}
            />
            {openInRoom ? (
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs" role="note">
                <AlertTriangleIcon className="text-warning mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('issues.new.alreadyOpen', {
                  count: openInRoom.count,
                  title: openInRoom.issues[0]?.title ?? ''
                })}
              </p>
            ) : null}
            {tried && placeMissing ? (
              <p className="text-destructive text-xs">{t('issues.new.roomRequired')}</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-area`}>{t('issues.new.area')}</Label>
            <Input
              id={`${formId}-area`}
              list={`${formId}-areas`}
              value={area}
              maxLength={80}
              onChange={(e) => setArea(e.target.value)}
              placeholder={t('issues.new.areaPlaceholder')}
              aria-invalid={(tried && placeMissing) || undefined}
            />
            <datalist id={`${formId}-areas`}>
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            {tried && placeMissing ? (
              <p className="text-destructive text-xs">{t('issues.new.areaRequired')}</p>
            ) : null}
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-title`}>{t('issues.new.issueTitle')}</Label>
          <Input
            id={`${formId}-title`}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('issues.new.titlePlaceholder')}
            aria-invalid={(tried && titleMissing) || undefined}
            aria-describedby={tried && titleMissing ? `${formId}-title-error` : undefined}
          />
          {tried && titleMissing ? (
            <p id={`${formId}-title-error`} className="text-destructive text-xs">
              {t('issues.new.titleRequired')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-detail`}>{t('issues.new.detail')}</Label>
          <Textarea
            id={`${formId}-detail`}
            rows={2}
            maxLength={2000}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('issues.new.detailPlaceholder')}
          />
        </div>

        <div className="grid gap-1.5">
          <Label id={`${formId}-severity`}>{t('issues.severityLabel')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={severity}
            aria-labelledby={`${formId}-severity`}
            onValueChange={(v) => v && setSeverity(v as Issue['severity'])}
            className="w-full"
          >
            {SEVERITY_ORDER.map((s) => (
              <ToggleGroupItem key={s} value={s} className="flex-1">
                {t(`issues.severity.${s}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <AttachmentPicker label={t('issues.photos')} onFilesChange={setFiles} />

        <Label
          htmlFor={`${formId}-blocks`}
          className="flex min-h-11 items-start gap-3 rounded-lg border p-3 font-normal has-disabled:opacity-60"
        >
          <span className="grid flex-1 gap-0.5">
            <span className="text-sm font-medium">{t('issues.blocksRoom')}</span>
            <span className="text-muted-foreground text-xs">
              {place !== 'room'
                ? t('issues.new.blocksNeedsRoom')
                : canBlock
                  ? t('issues.new.blocksHint')
                  : t('issues.new.blocksNoRight')}
            </span>
          </span>
          <Switch
            id={`${formId}-blocks`}
            checked={blocks}
            onCheckedChange={setBlocks}
            disabled={place !== 'room' || !canBlock}
            data-testid="issue-blocks"
          />
        </Label>
      </form>
    </ResponsiveDialog>
  )
}
