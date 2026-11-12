// A small synthetic KBS "EGM Konaklayan Listesi" for the e2e runs (invented, masked placeholders in the identity
// columns; a real export never enters the repository). Shaped like the export: header row by name, Excel serial
// dates with times, the 1900-01-01 sentinel for guests still in-house.
import ExcelJS from 'exceljs'

export const KBS_FILE_NAME = 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx'

const HEADERS = [
  'Tc Kimlik No',
  'Geçerli Belge',
  'Adı',
  'Soyadı',
  'Araç Plakası',
  'Geliş Tarihi',
  'Çıkış Tarihi',
  'Verilen Oda',
  'Cinsiyet',
  'Uyruğu',
  'Durum'
] as const

/** Placeholders in the identity columns: the screen and the database must never show any of them. */
export const E2E_IDENTITY = { name: 'GİZLİAD*****', surname: 'GİZLİSOYAD*****', id: '00******000' } as const

interface Stay {
  arrival: string
  departure: string | null
  room: string
  nationality: string
}

// Rooms 101–203 of the e2e draft hotel (6 rooms × 2 beds). Totals: 9 arrivals, 15 nights (the in-house guest in
// 203 counted to 1 October: 2 nights). A typo ("TÜRKYİE") and the ambiguous "KIBRIS" need the user.
export const E2E_STAYS: readonly Stay[] = [
  { arrival: '2026-09-02', departure: '2026-09-04', room: '101', nationality: 'TÜRKİYE' },
  { arrival: '2026-09-02', departure: '2026-09-02', room: '102', nationality: 'TÜRKİYE' },
  { arrival: '2026-09-05', departure: '2026-09-07', room: '103', nationality: 'TÜRKİYE' },
  { arrival: '2026-09-10', departure: '2026-09-13', room: '201', nationality: 'GERMANY (Deutschland)' },
  { arrival: '2026-09-10', departure: '2026-09-13', room: '201', nationality: 'GERMANY (Deutschland)' },
  { arrival: '2026-09-15', departure: '2026-09-16', room: '202', nationality: 'TÜRKYİE' },
  { arrival: '2026-09-18', departure: '2026-09-19', room: '101', nationality: 'KIBRIS' },
  {
    arrival: '2026-09-20',
    departure: '2026-09-20',
    room: '102',
    nationality: 'KUZEY KIBRIS TURK CUMHURİYETİ'
  },
  { arrival: '2026-09-29', departure: null, room: '203', nationality: 'TÜRKİYE' }
]
export const E2E_TOTALS = { arrivals: 9, nights: 2 + 1 + 2 + 3 + 3 + 1 + 1 + 1 + 2 } as const

const serial = (day: string, hour: number): number =>
  Date.parse(`${day}T00:00:00Z`) / 86_400_000 + 25_569 + hour / 24

export async function kbsFile(stays: readonly Stay[] = E2E_STAYS): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(' EGM_Konaklayan_Listesi')
  ws.addRow([...HEADERS])
  stays.forEach((s, i) => {
    ws.addRow([
      s.nationality === 'TÜRKİYE' ? E2E_IDENTITY.id : null,
      s.nationality === 'TÜRKİYE' ? null : 'U0*****',
      E2E_IDENTITY.name,
      E2E_IDENTITY.surname,
      null,
      serial(s.arrival, 14),
      s.departure ? serial(s.departure, 11) : 1,
      Number(s.room),
      i % 2 ? 'Kadın' : 'Erkek',
      s.nationality,
      s.departure ? 'Pasif' : 'Aktif'
    ])
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}
