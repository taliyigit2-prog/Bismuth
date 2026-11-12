import { describe, expect, it } from 'vitest'
import { SETTINGS_DEFAULTS, setupDraftSchema } from '@shared/contract'
import {
  defaultDraft,
  employeeRoles,
  firstInvalidStep,
  generateRooms,
  ids,
  isWeakPin,
  locateServerError,
  newEmployee,
  nextRoom,
  pruneDraft,
  restoreDraft,
  roomTotals,
  savedDraft,
  toSetupDraft,
  validateStep,
  type WizardDraft
} from './draft'
import { SETUP_OPTIONS } from './test-kit'

const fresh = (): WizardDraft => defaultDraft(SETUP_OPTIONS, SETTINGS_DEFAULTS, 'standalone')

/** The generator set to 5 floors × 4 rooms (the e2e hotel types it the same way). */
function fiveByFour(d: WizardDraft): WizardDraft {
  d.generator.floors = '5'
  d.generator.perFloor = '4'
  return d
}

/** Pandora-sized (S-78): 19 rooms on 5 floors, 38 beds, one room of the hotel's own type. */
function pandora(): WizardDraft {
  const d = fresh()
  d.hotel.name = 'Martı Otel'
  d.roomTypes.custom.push({
    tempKey: 'aile',
    name: 'Aile odası',
    basePriceMinor: 400_000,
    weekendPriceMinor: null
  })
  d.rooms = generateRooms(fiveByFour(d)).filter((r) => r.number !== '504')
  d.owner = {
    displayName: 'Otel Sahibi',
    username: 'sahip',
    password: 'cok-gizli-sifre',
    repeat: 'cok-gizli-sifre',
    pin: '2468'
  }
  return d
}

describe('kurulum taslağı: varsayılanlar ve oda üretici', () => {
  it('yeni otel: Çift kişilik tipi seçili, listelerin hepsi açık, vardiyalar tohumdan, ad boş', () => {
    const d = fresh()
    expect(d.roomTypes.selected.map((p) => p.id)).toEqual(['rt-double'])
    // No hotel's shape is built in: one room to start from.
    expect(d.generator).toMatchObject({
      floors: '1',
      perFloor: '1',
      beds: '2',
      roomType: { id: 'rt-double' }
    })
    expect(generateRooms(d).map((r) => r.number)).toEqual(['101'])
    expect(d.lists.paymentMethods).toEqual(['pm-cash', 'pm-card', 'pm-bank'])
    expect(d.shifts.map((s) => [s.id, s.name, s.startTime, s.endTime])).toEqual([
      ['sh-day', null, '09:00', '21:00'],
      ['sh-night', null, '21:00', '09:00']
    ])
    expect(d.tasks).toEqual({ suggestions: [], legalReminders: true, custom: [] })
    expect(d.calendar.highlightWeekdays).toEqual([6, 0])
    expect(d.hotel.name).toBe('')
    expect(d.staff.holidayMultiplier).toBe('2')
    expect(d.staff.overtimeMultiplier).toBe('1,5')
    expect(d.staff).toMatchObject({ commissionMode: 'none', commissionPct: '', commissionFixedMinor: null })
  })

  it('kural seçenekleri eksikse programın varsayılan kuralları kullanılır; otelin kuralı önce gelir', () => {
    const empty = defaultDraft({ ...SETUP_OPTIONS, payPolicy: {} }, SETTINGS_DEFAULTS, 'standalone')
    expect(empty.staff).toMatchObject({
      leaveDaysPerMonth: '4',
      unusedLeavePaid: true,
      dailyDivisor: '30',
      divideByMonthDays: false,
      standardHoursPerDay: '8',
      overtimeMode: 'none',
      overtimeMultiplier: '1,5',
      holidayMultiplier: '2',
      commissionMode: 'none'
    })
    const own = defaultDraft(
      {
        ...SETUP_OPTIONS,
        payPolicy: {
          dailyDivisor: 'days_in_month',
          commissionMode: 'pct',
          commissionPct: '2.5',
          leaveDaysPerMonth: 5
        }
      },
      { ...SETTINGS_DEFAULTS, 'ui.language': 'en' },
      'standalone'
    )
    expect(own.staff).toMatchObject({
      leaveDaysPerMonth: '5',
      dailyDivisor: '30',
      divideByMonthDays: true,
      commissionMode: 'pct',
      commissionPct: '2.5'
    })
  })

  it('5 kat × 4 oda: 101…504 numaralanır; biri kaldırılınca 19 oda 38 yatak', () => {
    const d = fiveByFour(fresh())
    const rooms = generateRooms(d)
    expect(rooms.map((r) => r.number)).toEqual([
      ...['101', '102', '103', '104'],
      ...['201', '202', '203', '204'],
      ...['301', '302', '303', '304'],
      ...['401', '402', '403', '404'],
      ...['501', '502', '503', '504']
    ])
    expect(rooms[5]).toMatchObject({ floor: '2', beds: '2', sellable: true, roomType: { id: 'rt-double' } })
    expect(roomTotals(rooms.slice(0, 19))).toEqual({ rooms: 19, beds: 38 })
  })

  it('tek oda eklenince son odanın ardından gelen boş numarayı alır', () => {
    const d = fiveByFour(fresh())
    d.rooms = generateRooms(d).slice(0, 2)
    expect(nextRoom(d, null)).toMatchObject({
      number: '103',
      floor: '1',
      beds: '2',
      roomType: { id: 'rt-double' }
    })
    expect(nextRoom({ ...d, rooms: [] }, { tempKey: 'x' })).toMatchObject({
      number: '101',
      roomType: { tempKey: 'x' }
    })
  })
})

describe('kurulum taslağı: denetimler', () => {
  it('kolay PIN: aynı rakam, ardışık artan/azalan, bilinen sıralar', () => {
    for (const pin of ['0000', '1111', '1234', '4321', '123456', '987654', '1212', '2580'])
      expect(isWeakPin(pin)).toBe(true)
    for (const pin of ['2468', '1357', '8264', '19283']) expect(isWeakPin(pin)).toBe(false)
  })

  it('zorunlu adımlar: otel adı, ana birim, en az bir oda, sahip hesabı', () => {
    const d = fresh()
    expect(firstInvalidStep(d, SETUP_OPTIONS)?.step).toBe('hotel')
    d.hotel.name = 'Martı Otel'
    expect(firstInvalidStep(d, SETUP_OPTIONS)?.step).toBe('rooms')
    expect(validateStep('rooms', d, SETUP_OPTIONS)).toEqual({
      [ids.generate]: { key: 'setup.errors.noRooms' }
    })
    d.rooms = generateRooms(d)
    expect(firstInvalidStep(d, SETUP_OPTIONS)?.step).toBe('owner')
    expect(firstInvalidStep(pandora(), SETUP_OPTIONS)).toBeNull()
  })

  it('odalar: aynı numara, yatak 1–50, seçilmemiş tip işaretlenir', () => {
    const d = pandora()
    const [a, b, c] = d.rooms
    b!.number = ' 101 '
    c!.beds = '0'
    a!.roomType = { id: 'rt-suite' }
    expect(validateStep('rooms', d, SETUP_OPTIONS)).toEqual({
      [ids.room(a!.key, 'type')]: { key: 'setup.errors.roomType' },
      [ids.room(b!.key, 'number')]: { key: 'setup.errors.duplicateRoom' },
      [ids.room(c!.key, 'beds')]: { key: 'setup.errors.wholeNumber', values: { min: 1, max: 50 } }
    })
  })

  it('ödeme: nakit yöntem kapalıysa uyarır', () => {
    const d = pandora()
    d.lists.paymentMethods = ['pm-card']
    expect(validateStep('money', d, SETUP_OPTIONS)).toEqual({
      [ids.cashMethod]: { key: 'errors.cashMethodRequired' }
    })
  })

  it('personel: kat sayı olmalı, bölen 1–31 (ayın gün sayısı seçiliyse aranmaz), saatlik ücret yazılmalı', () => {
    const d = pandora()
    d.staff.holidayMultiplier = 'iki'
    d.staff.dailyDivisor = '0'
    d.staff.overtimeMode = 'hourly_fixed'
    expect(Object.keys(validateStep('staff', d, SETUP_OPTIONS))).toEqual([
      ids.dailyDivisor,
      ids.overtimeHourly,
      ids.holidayMultiplier
    ])
    d.staff.divideByMonthDays = true
    d.staff.holidayMultiplier = '2,5'
    d.staff.overtimeHourlyMinor = 15_000
    expect(validateStep('staff', d, SETUP_OPTIONS)).toEqual({})
  })

  it('prim: yüzde seçilince oran, sabit tutar seçilince tutar istenir', () => {
    const d = pandora()
    d.staff.commissionMode = 'pct'
    expect(validateStep('staff', d, SETUP_OPTIONS)).toEqual({
      [ids.commissionPct]: { key: 'setup.errors.decimal' }
    })
    d.staff.commissionPct = '2,5'
    expect(validateStep('staff', d, SETUP_OPTIONS)).toEqual({})
    d.staff.commissionMode = 'fixed'
    expect(validateStep('staff', d, SETUP_OPTIONS)).toEqual({
      [ids.commissionFixed]: { key: 'setup.errors.required' }
    })
    d.staff.commissionFixedMinor = 150_000
    expect(validateStep('staff', d, SETUP_OPTIONS)).toEqual({})
  })

  it('çalışan hesabı: Sahip rolü verilemez; kullanıcı adı sahipten ve birbirinden farklı olmalı', () => {
    expect(employeeRoles(SETUP_OPTIONS).map((r) => r.code)).toEqual(['manager', 'reception'])
    const d = pandora()
    const deniz = { ...newEmployee('2026-10-01', 'role-owner'), firstName: 'Deniz', lastName: 'Arslan' }
    deniz.hasAccount = true
    deniz.username = 'SAHİP'
    deniz.password = 'gecici-sifre-1'
    d.employees = [deniz]
    expect(validateStep('employees', d, SETUP_OPTIONS)).toEqual({
      [ids.employee(deniz.key, 'username')]: { key: 'setup.errors.usernameDuplicate' },
      [ids.employee(deniz.key, 'role')]: { key: 'setup.errors.role' }
    })
    expect(validateStep('owner', d, SETUP_OPTIONS)).toEqual({
      [ids.ownerUsername]: { key: 'setup.errors.usernameDuplicate' }
    })
  })
})

describe('kurulum taslağı: gönderilen veri ve ara kayıt', () => {
  it('Pandora taslağı setupDraftSchema ile geçerli; özel tipli oda geçici anahtarla bağlanır', () => {
    const d = pandora()
    d.rooms[18]!.roomType = { tempKey: 'aile' }
    d.rooms[18]!.beds = '4'
    d.shifts[0]!.name = 'Sabah'
    d.employees = [
      {
        ...newEmployee('2026-10-01', 'role-reception'),
        firstName: 'Deniz',
        lastName: 'Arslan',
        position: 'Resepsiyon',
        hasAccount: true,
        username: 'deniz',
        password: 'gecici-sifre-1'
      }
    ]
    const payload = toSetupDraft(d, SETUP_OPTIONS)
    const parsed = setupDraftSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    expect(payload.rooms).toHaveLength(19)
    expect(payload.rooms.reduce((sum, r) => sum + r.beds, 0)).toBe(40)
    expect(payload.rooms[18]).toMatchObject({ number: '503', beds: 4, roomType: { tempKey: 'aile' } })
    expect(payload.roomTypes.custom).toEqual([
      { tempKey: 'aile', name: 'Aile odası', basePriceMinor: 400_000, weekendPriceMinor: null }
    ])
    expect(payload.shifts).toEqual([
      { id: 'sh-day', name: 'Sabah', startTime: '09:00', endTime: '21:00' },
      { id: 'sh-night', name: 'Gece', startTime: '21:00', endTime: '09:00' }
    ])
    expect(payload.employees[0]).toMatchObject({
      position: 'Resepsiyon',
      account: { username: 'deniz', password: 'gecici-sifre-1', roleId: 'role-reception' }
    })
    expect(payload.staff.policy).toEqual({
      leaveDaysPerMonth: 4,
      unusedLeavePaid: true,
      dailyDivisor: 30,
      standardHoursPerDay: 8,
      overtimeMode: 'none',
      holidayMultiplier: '2',
      commissionMode: 'none'
    })
  })

  it('kendi görevler taslakla gider (başlık kırpılmış, kural olduğu gibi); ara kayıttan geri gelir', () => {
    const d = pandora()
    d.tasks.custom = [
      { key: 'k1', title: ' Lobideki çiçekleri sula ', recurrence: { kind: 'daily', time: '08:30' } },
      {
        key: 'k2',
        title: 'Perdeleri yıkat',
        recurrence: { kind: 'interval', unit: 'months', every: 6, time: '10:00' }
      }
    ]
    const payload = toSetupDraft(d, SETUP_OPTIONS)
    expect(setupDraftSchema.safeParse(payload).success).toBe(true)
    expect(payload.tasks.custom).toEqual([
      { title: 'Lobideki çiçekleri sula', recurrence: { kind: 'daily', time: '08:30' } },
      { title: 'Perdeleri yıkat', recurrence: { kind: 'interval', unit: 'months', every: 6, time: '10:00' } }
    ])
    const back = restoreDraft(JSON.parse(JSON.stringify(savedDraft(d))), fresh())
    expect(back.tasks.custom.map((task) => [task.key, task.recurrence])).toEqual([
      ['k1', { kind: 'daily', time: '08:30' }],
      ['k2', { kind: 'interval', unit: 'months', every: 6, time: '10:00' }]
    ])
  })

  it('kendi görevlerden önceki ara kayıt ya da bozuk liste: seçilen öneriler korunur, liste boş başlar', () => {
    const d = pandora()
    d.tasks.suggestions = ['tt-call']
    const older = { ...savedDraft(d), tasks: { suggestions: ['tt-call'], legalReminders: false } }
    expect(restoreDraft(JSON.parse(JSON.stringify(older)), fresh()).tasks).toEqual({
      suggestions: ['tt-call'],
      legalReminders: false,
      custom: []
    })
    const damaged = {
      ...savedDraft(d),
      tasks: {
        suggestions: ['tt-call'],
        legalReminders: true,
        custom: [{ key: 'k1', title: '', recurrence: { kind: 'everyNStays' } }]
      }
    }
    expect(restoreDraft(JSON.parse(JSON.stringify(damaged)), fresh()).tasks).toEqual({
      suggestions: ['tt-call'],
      legalReminders: true,
      custom: []
    })
  })

  it('prim kuralı taslakla gider: yüzde oranı noktalı, sabit tutar kuruş olarak', () => {
    const d = pandora()
    d.staff.commissionMode = 'pct'
    d.staff.commissionPct = '2,5'
    d.staff.commissionFixedMinor = 99_900
    const pct = toSetupDraft(d, SETUP_OPTIONS)
    expect(setupDraftSchema.safeParse(pct).success).toBe(true)
    expect(pct.staff.policy).toMatchObject({ commissionMode: 'pct', commissionPct: '2.5' })
    expect(pct.staff.policy).not.toHaveProperty('commissionFixedMinor')
    d.staff.commissionMode = 'fixed'
    const fixed = toSetupDraft(d, SETUP_OPTIONS)
    expect(fixed.staff.policy).toMatchObject({ commissionMode: 'fixed', commissionFixedMinor: 99_900 })
    expect(fixed.staff.policy).not.toHaveProperty('commissionPct')
  })

  it('primden önceki ara kayıt: personel cevapları korunur, prim varsayılandan başlar', () => {
    const d = pandora()
    d.staff.leaveDaysPerMonth = '6'
    const { commissionMode: _mode, commissionPct: _pct, commissionFixedMinor: _fixed, ...older } = d.staff
    const back = restoreDraft(JSON.parse(JSON.stringify({ ...savedDraft(d), staff: older })), fresh())
    expect(back.staff).toEqual({ ...fresh().staff, leaveDaysPerMonth: '6' })
  })

  it('ara kayıtta şifre, tekrar ve PIN yok; geri okununca bozuk bölümler varsayılana döner', () => {
    const d = pandora()
    d.employees = [{ ...newEmployee('2026-10-01', 'role-reception'), password: 'gecici-sifre-1' }]
    const saved = savedDraft(d)
    expect(JSON.stringify(saved)).not.toMatch(/cok-gizli|gecici-sifre|2468|"password"|"repeat"|"pin"/)
    const back = restoreDraft(JSON.parse(JSON.stringify({ ...saved, staff: 'bozuk' })), fresh())
    expect(back.rooms).toHaveLength(19)
    expect(back.hotel.name).toBe('Martı Otel')
    expect(back.staff).toEqual(fresh().staff)
    expect(back.owner).toEqual({
      displayName: 'Otel Sahibi',
      username: 'sahip',
      password: '',
      repeat: '',
      pin: ''
    })
    expect(back.employees[0]!.password).toBe('')
    expect(restoreDraft('bozuk', fresh())).toEqual(fresh())
  })

  it('artık sunulmayan kayıtlar ara kayıttan atılır; üretici kalan ilk tipe geçer', () => {
    const d = pandora()
    d.roomTypes.selected = [
      { id: 'rt-gone', basePriceMinor: null, weekendPriceMinor: null },
      { id: 'rt-twin', basePriceMinor: 270_000, weekendPriceMinor: null }
    ]
    d.generator.roomType = { id: 'rt-gone' }
    d.lists.salesChannels = ['ch-gone', 'ch-direct']
    d.employees = [newEmployee('2026-10-01', 'role-owner')]
    const pruned = pruneDraft(d, SETUP_OPTIONS)
    expect(pruned.roomTypes.selected.map((p) => p.id)).toEqual(['rt-twin'])
    expect(pruned.generator.roomType).toEqual({ id: 'rt-twin' })
    expect(pruned.lists.salesChannels).toEqual(['ch-direct'])
    expect(pruned.employees[0]!.roleId).toBe('role-reception')
  })

  it('sunucunun reddi doğru adıma ve alana gider', () => {
    const d = pandora()
    expect(
      locateServerError({ messageKey: 'errors.roomNumberTaken', details: { number: '203' } }, d)
    ).toEqual({
      step: 'rooms',
      field: ids.room(d.rooms.find((r) => r.number === '203')!.key, 'number')
    })
    expect(
      locateServerError({ messageKey: 'errors.usernameTaken', details: { username: 'sahip' } }, d)
    ).toEqual({
      step: 'owner',
      field: ids.ownerUsername
    })
    expect(
      locateServerError(
        { messageKey: 'errors.validation', details: { fieldErrors: { owner: ['x'], rooms: ['y'] } } },
        d
      )
    ).toEqual({ step: 'rooms', field: null })
    expect(locateServerError({ messageKey: 'errors.cashMethodRequired', details: null }, d)).toEqual({
      step: 'money',
      field: ids.cashMethod
    })
    expect(locateServerError({ messageKey: 'errors.internal', details: null }, d)).toBeNull()
  })
})
