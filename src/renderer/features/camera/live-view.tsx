// The live picture (Faz 20 P20b, K-49, S-108): an MJPEG `<img>` straight from the sidecar on 127.0.0.1, only in the
// hotel computer's own window. The strip above it (location, guests, alarm state) and the face boxes with their names
// are drawn here, not by OpenCV, so Turkish and Cyrillic letters are right. The picture's address is short-lived and
// signed; it is asked for again when the picture drops or the sidecar comes back.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CctvIcon, RefreshCwIcon } from 'lucide-react'
import type { CameraBox, CameraLive } from '@shared/contract/camera'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'

/**
 * Face boxes in the picture's own pixels. An SVG with the picture's size as its view box scales with the picture
 * (no computed inline positions); strokes stay the same width on screen.
 */
export function FaceBoxes({
  frame,
  boxes
}: {
  frame: { width: number; height: number }
  boxes: readonly CameraBox[]
}) {
  const { t } = useTranslation()
  // The picture is shown smaller than its pixels (a phone, the 960 px stream): the label is sized for that.
  const size = Math.max(16, Math.round(frame.height / 24))
  return (
    <svg
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
      data-testid="camera-boxes"
    >
      {boxes.map((box, i) => {
        const above = box.y >= size * 1.4
        // S-107: a known face with no name and no room is a staff member on the exclusion list.
        const label = box.kind === 'known' && !box.label ? t('camera.live.staff') : box.label
        return (
          <g key={i} data-testid="camera-box" data-kind={box.kind}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              fill="none"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              className={box.kind === 'known' ? 'stroke-primary' : 'stroke-destructive'}
            />
            {label ? (
              <text
                x={box.x}
                y={above ? box.y - size * 0.35 : box.y + box.h + size * 1.1}
                fontSize={size}
                fontWeight={600}
                strokeWidth={size / 4}
                className="fill-foreground stroke-background [paint-order:stroke]"
                strokeLinejoin="round"
              >
                {label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

/** The strip that used to be painted into the picture. */
function Strip({ header }: { header: NonNullable<CameraLive['header']> }) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm"
      role="status"
      data-testid="camera-strip"
    >
      <span className="font-medium">{header.location || t('camera.live.defaultLocation')}</span>
      <span className="text-muted-foreground">{t('camera.live.guests', { count: header.activeGuests })}</span>
      {header.alarmsPaused ? <Badge variant="secondary">{t('camera.live.alarmsPaused')}</Badge> : null}
      {!header.cameraConnected ? (
        <Badge variant="destructive">{t('camera.live.disconnected')}</Badge>
      ) : header.cameraCovered ? (
        <Badge variant="destructive">{t('camera.live.covered')}</Badge>
      ) : null}
    </div>
  )
}

function Picture({ url, onRetry }: { url: string; onRetry: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'loading' | 'live' | 'failed'>('loading')
  return (
    <>
      <img
        src={url}
        alt={t('camera.live.alt')}
        className={cn('block h-auto w-full', state === 'live' ? '' : 'invisible')}
        onLoad={() => setState('live')}
        onError={() => setState('failed')}
        data-testid="camera-live-img"
        data-state={state}
      />
      {state === 'loading' ? <Skeleton className="absolute inset-0 rounded-none" aria-hidden /> : null}
      {state === 'failed' ? (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <CctvIcon className="text-muted-foreground size-8" aria-hidden />
          <p className="text-sm">{t('camera.live.failed')}</p>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCwIcon aria-hidden />
            {t('camera.live.retry')}
          </Button>
        </div>
      ) : null}
    </>
  )
}

export function LiveView({ live }: { live: CameraLive | undefined }) {
  const { t } = useTranslation()
  const stream = useApiQuery('camera.streamUrl', {}, { staleTime: 30_000, gcTime: 0 })
  const [attempt, setAttempt] = useState(0)
  // The sidecar answered again after not answering (a restart): its old picture connection is gone, ask for a new one.
  const up = live?.header != null
  const wasUp = useRef(up)
  const refetch = stream.refetch
  useEffect(() => {
    if (up && !wasUp.current) void refetch()
    wasUp.current = up
  }, [up, refetch])

  const url = stream.data?.url ?? null
  return (
    <div className="grid gap-3" data-testid="camera-live">
      {live?.header ? <Strip header={live.header} /> : null}
      <div className="bg-muted relative min-h-48 w-full overflow-hidden rounded-lg border">
        {url ? (
          <>
            <Picture
              key={`${url}|${attempt}`}
              url={url}
              onRetry={() => {
                setAttempt((n) => n + 1)
                void refetch()
              }}
            />
            {live?.frame && live.boxes.length > 0 ? (
              <FaceBoxes frame={live.frame} boxes={live.boxes} />
            ) : null}
          </>
        ) : stream.isPending ? (
          <Skeleton className="absolute inset-0 rounded-none" aria-hidden />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <CctvIcon className="text-muted-foreground size-8" aria-hidden />
            <p className="text-muted-foreground text-sm">{t('camera.live.noPicture')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
