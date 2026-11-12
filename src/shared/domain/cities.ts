// Bundled city → coordinate list for the weather location (G-113, K-13; repo-alan-tr-hava.md §3.7): the 81
// province centres, İstanbul's districts and a few resort towns. No online geocoding. Coordinates are rounded to
// two decimals (~1 km; the forecast model's grid is ~9 km, MET allows at most four decimals).

export interface City {
  name: string
  lat: number
  lon: number
  /** Province of a district or town (shown after its name). */
  province?: string
}

const P = (name: string, lat: number, lon: number): City => ({ name, lat, lon })
const D = (name: string, lat: number, lon: number, province: string): City => ({ name, lat, lon, province })

export const DEFAULT_CITY: City = P('İstanbul', 41.01, 28.98)

export const CITIES: readonly City[] = [
  P('Adana', 37.0, 35.32),
  P('Adıyaman', 37.76, 38.28),
  P('Afyonkarahisar', 38.76, 30.54),
  P('Ağrı', 39.72, 43.05),
  P('Aksaray', 38.37, 34.03),
  P('Amasya', 40.65, 35.83),
  P('Ankara', 39.93, 32.86),
  P('Antalya', 36.9, 30.7),
  P('Ardahan', 41.11, 42.7),
  P('Artvin', 41.18, 41.82),
  P('Aydın', 37.85, 27.84),
  P('Balıkesir', 39.65, 27.88),
  P('Bartın', 41.63, 32.34),
  P('Batman', 37.88, 41.13),
  P('Bayburt', 40.26, 40.23),
  P('Bilecik', 40.14, 29.98),
  P('Bingöl', 38.88, 40.5),
  P('Bitlis', 38.4, 42.11),
  P('Bolu', 40.74, 31.61),
  P('Burdur', 37.72, 30.29),
  P('Bursa', 40.19, 29.06),
  P('Çanakkale', 40.15, 26.41),
  P('Çankırı', 40.6, 33.62),
  P('Çorum', 40.55, 34.95),
  P('Denizli', 37.78, 29.09),
  P('Diyarbakır', 37.91, 40.24),
  P('Düzce', 40.84, 31.16),
  P('Edirne', 41.68, 26.56),
  P('Elazığ', 38.67, 39.22),
  P('Erzincan', 39.75, 39.49),
  P('Erzurum', 39.9, 41.27),
  P('Eskişehir', 39.78, 30.52),
  P('Gaziantep', 37.07, 37.38),
  P('Giresun', 40.91, 38.39),
  P('Gümüşhane', 40.46, 39.48),
  P('Hakkari', 37.58, 43.74),
  P('Hatay', 36.2, 36.16),
  P('Iğdır', 39.92, 44.04),
  P('Isparta', 37.76, 30.55),
  DEFAULT_CITY,
  P('İzmir', 38.42, 27.14),
  P('Kahramanmaraş', 37.58, 36.94),
  P('Karabük', 41.2, 32.62),
  P('Karaman', 37.18, 33.22),
  P('Kars', 40.6, 43.1),
  P('Kastamonu', 41.38, 33.78),
  P('Kayseri', 38.72, 35.49),
  P('Kırıkkale', 39.85, 33.51),
  P('Kırklareli', 41.73, 27.22),
  P('Kırşehir', 39.15, 34.16),
  P('Kilis', 36.72, 37.12),
  P('Kocaeli', 40.77, 29.92),
  P('Konya', 37.87, 32.48),
  P('Kütahya', 39.42, 29.98),
  P('Malatya', 38.35, 38.31),
  P('Manisa', 38.61, 27.43),
  P('Mardin', 37.31, 40.74),
  P('Mersin', 36.8, 34.63),
  P('Muğla', 37.22, 28.36),
  P('Muş', 38.75, 41.51),
  P('Nevşehir', 38.62, 34.71),
  P('Niğde', 37.97, 34.68),
  P('Ordu', 40.98, 37.88),
  P('Osmaniye', 37.07, 36.25),
  P('Rize', 41.02, 40.52),
  P('Sakarya', 40.78, 30.4),
  P('Samsun', 41.29, 36.33),
  P('Siirt', 37.93, 41.94),
  P('Sinop', 42.03, 35.15),
  P('Sivas', 39.75, 37.02),
  P('Şanlıurfa', 37.16, 38.79),
  P('Şırnak', 37.52, 42.46),
  P('Tekirdağ', 40.98, 27.51),
  P('Tokat', 40.31, 36.55),
  P('Trabzon', 41.0, 39.72),
  P('Tunceli', 39.11, 39.55),
  P('Uşak', 38.68, 29.41),
  P('Van', 38.49, 43.38),
  P('Yalova', 40.66, 29.27),
  P('Yozgat', 39.82, 34.81),
  P('Zonguldak', 41.45, 31.79),
  // İstanbul districts (the first hotel is in Kadıköy).
  D('Adalar', 40.87, 29.09, 'İstanbul'),
  D('Ataşehir', 40.99, 29.12, 'İstanbul'),
  D('Bakırköy', 40.98, 28.87, 'İstanbul'),
  D('Beşiktaş', 41.04, 29.01, 'İstanbul'),
  D('Beylikdüzü', 41.0, 28.64, 'İstanbul'),
  D('Beyoğlu', 41.04, 28.98, 'İstanbul'),
  D('Esenyurt', 41.03, 28.67, 'İstanbul'),
  D('Fatih', 41.01, 28.95, 'İstanbul'),
  D('Kadıköy', 40.99, 29.03, 'İstanbul'),
  D('Kartal', 40.89, 29.19, 'İstanbul'),
  D('Maltepe', 40.93, 29.13, 'İstanbul'),
  D('Pendik', 40.88, 29.23, 'İstanbul'),
  D('Sarıyer', 41.17, 29.05, 'İstanbul'),
  D('Silivri', 41.07, 28.25, 'İstanbul'),
  D('Şile', 41.18, 29.61, 'İstanbul'),
  D('Şişli', 41.06, 28.99, 'İstanbul'),
  D('Üsküdar', 41.02, 29.02, 'İstanbul'),
  D('Zeytinburnu', 40.99, 28.9, 'İstanbul'),
  // Resort towns.
  D('Alanya', 36.54, 32.0, 'Antalya'),
  D('Bodrum', 37.04, 27.43, 'Muğla'),
  D('Çeşme', 38.32, 26.3, 'İzmir'),
  D('Fethiye', 36.62, 29.12, 'Muğla'),
  D('Göreme', 38.64, 34.83, 'Nevşehir'),
  D('Kaş', 36.2, 29.64, 'Antalya'),
  D('Kuşadası', 37.86, 27.26, 'Aydın'),
  D('Marmaris', 36.85, 28.27, 'Muğla'),
  D('Pamukkale', 37.92, 29.12, 'Denizli'),
  D('Side', 36.77, 31.39, 'Antalya')
]

/** Lower-case, Turkish-aware, without accents ("İSTANBUL", "istanbul", "Istanbul" → "istanbul"). */
export function cityKey(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
}

/** "Kadıköy (İstanbul)": a district or town with its province. */
export const cityLabel = (c: City): string => (c.province ? `${c.name} (${c.province})` : c.name)

/**
 * The city a free-text "Şehir" setting names: "Kadıköy", "Kadıköy, İstanbul", "Kadıköy / İstanbul" and
 * "istanbul" all match; the most specific part (a district before its province) wins. Null when nothing matches.
 */
export function findCity(text: string): City | null {
  const parts = text
    .split(/[,/;-]/)
    .map(cityKey)
    .filter(Boolean)
  for (const part of parts) {
    const hit = CITIES.find((c) => cityKey(c.name) === part)
    if (hit) return hit
  }
  return null
}
