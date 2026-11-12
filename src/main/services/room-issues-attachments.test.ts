import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenseSections, roomTypes, salesChannels } from '../db/schema'
import { createAttachmentsService, insideRoot, MAX_FILES_PER_RECORD, sniffMime } from './attachments-service'
import { createExpensesService } from './expenses-service'
import { createReservationsService } from './reservations-service'
import { createRoomIssuesService, ISSUE_BLOCK_MAX_DAYS } from './room-issues-service'
import { createRoomsService } from './rooms-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
const temps: string[] = []
afterEach(() => {
  handle?.close()
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PDF = new TextEncoder().encode('%PDF-1.7\n%…')

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = roomsSvc.createRoom(owner, {
    number: '501',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-att-'))
  temps.push(dir)
  return {
    clock,
    deps,
    room,
    roomsSvc,
    issues: createRoomIssuesService(deps),
    files: createAttachmentsService({ ...deps, attachmentsDir: dir }),
    dir
  }
}

describe('oda arızası (G-180)', () => {
  it('açık → planlandı → çözüldü; liste önce açık ve acil olanları verir', async () => {
    const { issues, room, clock } = await setup()
    const low = issues.create(housekeeping, { roomId: room.id, title: 'Ampul yanmıyor', severity: 'low' })
    const urgent = issues.create(housekeeping, { roomId: room.id, title: 'Su kaçağı', severity: 'urgent' })
    const lobby = issues.create(reception, { title: 'Lobi kapısı gıcırdıyor' })
    expect(lobby.roomNumber).toBeNull()
    expect(issues.list(reception).map((i) => i.id)).toEqual([urgent.id, lobby.id, low.id])
    expect(
      issues.plan(reception, urgent.id, { plannedDate: '2026-10-02', assignedTo: 'Tesisatçı' })
    ).toMatchObject({
      status: 'planned',
      plannedDate: '2026-10-02'
    })
    clock.advance(60)
    const done = issues.resolve(housekeeping, low.id, { resolutionNote: 'Ampul değişti' })
    expect(done).toMatchObject({ status: 'resolved', resolvedBy: 'user-housekeeping' })
    expect(issues.list(reception).map((i) => i.id)).toEqual([urgent.id, lobby.id, low.id])
    expect(issues.list(reception, { status: ['open', 'planned'] })).toHaveLength(2)
    expect(() => issues.resolve(reception, low.id)).toThrow(/errors.issueResolved/)
    expect(() => issues.reopen(reception, low.id, '')).toThrow(/errors.reasonRequired/)
    expect(issues.reopen(reception, low.id, 'yine yanmıyor').status).toBe('open')
    expect(() => issues.reopen(reception, low.id, 'x')).toThrow(/errors.issueNotResolved/)
    expect(issues.update(reception, lobby.id, { severity: 'urgent' }).severity).toBe('urgent')
    expect(() => issues.list(roleCtx('accountant'))).toThrow(/PERMISSION_DENIED/)
  })

  it('"odayı satışa kapat" bugünden bir sonraki satılmış geceye kadar blok koyar; çözülünce blok o gün biter', async () => {
    const { issues, room, deps, clock, roomsSvc } = await setup()
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    const res = createReservationsService(deps)
    res.create(owner, {
      guest: { firstName: 'Gelecek' },
      channelId,
      stays: [{ roomId: room.id, checkIn: '2026-10-10', checkOut: '2026-10-12', nightlyPriceMinor: 1 }]
    })
    expect(() =>
      issues.create(housekeeping, {
        roomId: room.id,
        title: 'Su kaçağı',
        severity: 'urgent',
        blocksRoom: true
      })
    ).toThrow(/PERMISSION_DENIED/)
    const leak = issues.create(reception, {
      roomId: room.id,
      title: 'Su kaçağı',
      severity: 'urgent',
      blocksRoom: true
    })
    expect(leak.block).toMatchObject({
      dateFrom: '2026-10-01',
      dateTo: '2026-10-10',
      kind: 'oos',
      reason: 'Su kaçağı'
    })
    expect(() =>
      res.create(owner, {
        guest: { firstName: 'Yeni' },
        channelId,
        stays: [{ roomId: room.id, checkIn: '2026-10-03', checkOut: '2026-10-04', nightlyPriceMinor: 1 }]
      })
    ).toThrow(/errors.roomBlocked/)
    clock.set('2026-10-04T09:00:00.000Z')
    const fixed = issues.resolve(reception, leak.id)
    expect(fixed.block).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-04' })
    expect(roomsSvc.listBlocks(reception, '2026-10-04' as never, '2026-10-10' as never)).toEqual([])
    // Closing the room again also stops before the next sold night.
    const other = issues.create(owner, { roomId: room.id, title: 'Klima', blocksRoom: true })
    expect(other.block?.dateTo).toBe('2026-10-10')
    expect(ISSUE_BLOCK_MAX_DAYS).toBe(365)
  })
})

describe('dosya ekleri (K-25)', () => {
  it('dosya ekler klasörüne yazılır, sha256 saklanır; tür imzadan anlaşılır', async () => {
    const { files, issues, room, dir, deps } = await setup()
    const issue = issues.create(housekeeping, { roomId: room.id, title: 'Kırık lavabo' })
    const att = files.add(housekeeping, {
      entity: 'room_issue',
      entityId: issue.id,
      fileName: 'lavabo.jpg',
      mime: 'image/jpeg',
      bytes: JPEG
    })
    expect(att.path).toMatch(/^room_issue\/2026\/[0-9A-Z]{26}\.jpg$/)
    expect(existsSync(join(dir, att.path))).toBe(true)
    expect(att.sha256).toHaveLength(64)
    expect(files.read(reception, att.id).bytes).toEqual(JPEG)
    expect(files.list(reception, 'room_issue', issue.id).map((a) => a.id)).toEqual([att.id])
    expect(() =>
      files.add(housekeeping, {
        entity: 'room_issue',
        entityId: issue.id,
        fileName: 'x.jpg',
        mime: 'image/jpeg',
        bytes: PDF
      })
    ).toThrow(/errors.attachmentType/)
    expect(() =>
      files.add(housekeeping, {
        entity: 'room_issue',
        entityId: issue.id,
        fileName: 'x.exe',
        mime: 'application/x-msdownload',
        bytes: new Uint8Array([0x4d, 0x5a])
      })
    ).toThrow(/errors.attachmentType/)
    expect(() =>
      files.add(housekeeping, {
        entity: 'expense',
        entityId: 'e1',
        fileName: 'fis.pdf',
        mime: 'application/pdf',
        bytes: PDF
      })
    ).toThrow(/PERMISSION_DENIED/)
    const exp = createExpensesService(deps)
    const section = (code: string) =>
      handle.db.select().from(expenseSections).where(eq(expenseSections.code, code)).get()!.id
    const receipt = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: section('general'),
      amountMinor: 1_000,
      currency: 'TRY',
      description: 'Market'
    })
    const rent = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: section('owner'),
      amountMinor: 1_000,
      currency: 'TRY',
      description: 'Kira'
    })
    const pdf = { fileName: 'fis.pdf', mime: 'application/pdf', bytes: PDF }
    expect(files.add(reception, { entity: 'expense', entityId: receipt.id, ...pdf }).path).toMatch(/\.pdf$/)
    // The owner's hidden expense section stays closed even with the expense right (G-67).
    expect(() => files.add(reception, { entity: 'expense', entityId: rent.id, ...pdf })).toThrow(
      /PERMISSION_DENIED/
    )
    const ownerFile = files.add(owner, { entity: 'expense', entityId: rent.id, ...pdf })
    expect(() => files.read(reception, ownerFile.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => files.list(reception, 'expense', rent.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => files.add(reception, { entity: 'expense', entityId: 'yok', ...pdf })).toThrow(/NOT_FOUND/)
    // A file changed on disk is not served as if it were the original.
    writeFileSync(join(dir, att.path), new Uint8Array([0xff, 0xd8, 0xff, 0x00]))
    expect(() => files.read(reception, att.id)).toThrow(/errors.attachmentChanged/)
  })

  it('çözülmüş arızanın fotoğrafı elle ya da saklama süresi dolunca silinir; kayıt iz olarak kalır', async () => {
    const { files, issues, room, dir, clock } = await setup()
    const issue = issues.create(housekeeping, { roomId: room.id, title: 'Kırık lavabo' })
    const photo = (name: string) =>
      files.add(housekeeping, {
        entity: 'room_issue',
        entityId: issue.id,
        fileName: name,
        mime: 'image/jpeg',
        bytes: JPEG
      })
    const first = photo('a.jpg')
    const second = photo('b.jpg')
    expect(() => files.deleteFile(housekeeping, first.id)).toThrow(/errors.attachmentKept/)
    issues.resolve(housekeeping, issue.id)
    const gone = files.deleteFile(housekeeping, first.id)
    expect(gone.deletedAt).not.toBeNull()
    expect(existsSync(join(dir, first.path))).toBe(false)
    expect(() => files.read(reception, first.id)).toThrow(/errors.attachmentDeleted/)
    expect(files.purgeResolvedIssueFiles(owner)).toBe(0) // resolved today: kept for 30 days
    clock.set('2026-11-01T09:00:00.000Z')
    expect(files.purgeResolvedIssueFiles(owner)).toBe(1)
    expect(existsSync(join(dir, second.path))).toBe(false)
    expect(files.list(reception, 'room_issue', issue.id).every((a) => a.deletedAt !== null)).toBe(true)
  })

  it('bir kayda en çok 20 dosya eklenir; silinen dosya sayıdan düşer', async () => {
    const { files, issues, room } = await setup()
    const issue = issues.create(housekeeping, { roomId: room.id, title: 'Duvar nemi' })
    const photo = () =>
      files.add(housekeeping, {
        entity: 'room_issue',
        entityId: issue.id,
        fileName: 'n.jpg',
        mime: 'image/jpeg',
        bytes: JPEG
      })
    const first = photo()
    for (let i = 1; i < MAX_FILES_PER_RECORD; i++) photo()
    expect(() => photo()).toThrow(/errors.attachmentLimit/)
    issues.resolve(housekeeping, issue.id)
    files.deleteFile(housekeeping, first.id)
    expect(photo().entityId).toBe(issue.id)
  })

  it('yol kökün dışına çıkamaz; imza tanıma', () => {
    expect(() => insideRoot('/data/att', '../secret.db')).toThrow(/errors.attachmentPath/)
    expect(() => insideRoot('/data/att', '/etc/passwd')).toThrow(/errors.attachmentPath/)
    expect(insideRoot('/data/att', 'room_issue/2026/x.jpg')).toBe(
      resolve('/data/att', 'room_issue', '2026', 'x.jpg')
    )
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffMime(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp')
    expect(sniffMime(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})
