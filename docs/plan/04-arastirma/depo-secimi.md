# Depo (Repo) ve Paket Seçimi — Bismuth (Faz 0 · A0.12)

> Sahip: "Repo konusu çok önemli; bize en uygun repoları seçmeliyiz." Bu dosya dört derin araştırma kolunun ve
> Faz 0 prototiplerinin **tek özetidir**. Faz 1 bu tabloya göre kurulur; listede olmayan paket eklemek için
> gerekçe + `docs/plan/bagimliliklar.md` kaydı gerekir.
>
> Ayrıntılı raporlar: `repo-masaustu-sablonlar.md` (29 depo), `repo-ui-kutuphaneler.md`, `uzaktan-bulut-secenekleri.md`,
> `repo-alan-tr-hava.md`, `faz0-prototipler.md`, `canli-dogrulama.md`.
>
> Seçim ölçütleri (her depo 1–5): **uygunluk** (ihtiyaca birebir), **bakım** (son 12 ay etkinlik, yazar sayısı),
> **lisans** (MIT/ISC/Apache/BSD/OFL serbest; GPL/AGPL yalnızca fikir), **kalite** (test, tip, güvenlik varsayılanları),
> **uyarlama emeği**. "Bitmiş ürün" kuralı gereği: az bağımlılık, kopyala‑yapıştır bileşenler (shadcn) bağımlılıktan iyidir,
> bakımı biten paket ancak küçük ve kararlıysa kabul edilir.

## 1. Masaüstü temeli ✅ (kesin)

| Rol | Seçilen | Sürüm | Lisans | Neden | Alternatif / reddedilen |
|---|---|---|---|---|---|
| Başlangıç şablonu | **electron-vite resmi `react-ts`** (`@quick-start/create-electron`) | 1.0.30 | MIT | 32 dosya, silinecek yok; araç zinciri birebir | electron-shadcn (Forge + `nodeIntegration:true` + updater → ret), electron-react-boilerplate (webpack, eski), Forge şablonları (NSIS yok) |
| Kabuk | **electron** | 37.10.3 (yedek 44.5.1) | MIT | Faz 0: Win+Mac paketleme ve duman testi geçti; macOS 11+ | Tauri (K-01) |
| Paketleyici | **electron-builder** | 26.15.3 | MIT | NSIS + DMG ad‑hoc doğrulandı; `electronFuses` | Electron Forge (NSIS yok) |
| Derleyici | **electron-vite** + **vite** | 5.0.0 + **7.3.6** (sabit) | MIT | electron-vite 5 Vite 8'i desteklemiyor | vite-plugin-electron |
| Veritabanı | **better-sqlite3** | 13.0.3 | MIT | 8 platform hazır ikili, yeniden derleme yok; Faz 0'da paketli uygulamada çalıştı | `node:sqlite` (RC), sql.js (bellek içi) |
| ORM/migrasyon | **drizzle-orm** + **drizzle-kit** | 0.45.3 / 0.31.11 | Apache‑2.0 | SQL migrasyon üretir, gömülü `migrate()`; electron-db aynı yığında | Kysely (migrasyon elle), Prisma (CLI'ya bağımlı) |
| Kod kaynağı (dosya düzeyi, MIT) | electron-db · guasam/electron-react-app · LuanRoger/electron-shadcn · cawa-93/vite-electron-builder · actualbudget/actual | — | MIT | Tablo: `repo-masaustu-sablonlar.md` §4.2 | Frappe Books (AGPL), Beekeeper (GPL), lisanssız 6 şablon → **kopyalanmaz** |
| IPC/kontrat | **Hono tek yönlendirici** (+ `@hono/zod-validator`) | hono 4.13.12 | MIT | Electron'da port açmadan `app.fetch`, sunucu modunda aynı uygulama | oRPC 1.15 (yedek), electron-trpc (bakımsız → ret) |
| Excel okuma/yazma | **exceljs** | 4.4.0 | MIT | Faz 0: gerçek KBS dosyası (seyrek hücre) doğru okundu | SheetJS npm (terk edilmiş/CVE) |
| Ülke adları | **i18n-iso-countries** | 7.14.0 | MIT | Faz 0: KBS uyrukları → Türkçe ad | — |
| Bayram | **date-holidays** (+ `Intl` yedeği) | 3.37.0 | ISC + CC‑BY‑3.0 (atıf) | Faz 0: 2026 Diyanet ile aynı; 2076'dan sonrası `Intl` | Nager.Date (dini bayram yok), Calendarific (anahtar) |
| Takvim ızgarası | **@tanstack/react-virtual** (özel bileşen) | 3.14.13 | MIT | Faz 0: 10 yıl, 60 fps | Planby/Schedule‑X/FullCalendar (ücretli), react-calendar-timeline (beta) |

## 2. Arayüz ve kütüphaneler ✅ (kesin; ayrıntı `repo-ui-kutuphaneler.md` §11–13)

| Rol | Seçilen | Sürüm | Lisans | Not |
|---|---|---|---|---|
| UI bileşenleri | **shadcn/ui (Radix tabanı)** — CLI ile proje içine, `eject` | CLI 4.21.x | MIT | Bağımlılık değil, kod; `calendar.tsx` slot bileşenleri modül düzeyine (yeniden çizim hatası #11134) |
| Kabuk/desen kaynağı | **satnaing/shadcn-admin** (layout, sidebar, header, command-menu, hata sayfaları, ayarlar iskeleti) | — | MIT | Clerk/axios/faker çıkar; v9 tablo API'si |
| Tablo/ızgara bileşenleri | **sadmann7/diceui** (data-table, **data-grid**: Excel/Sheets'ten yapıştırma, geri al, sanallaştırma; mask-input, time-picker, file-upload) | — | MIT | data-grid yalnız içe aktarma önizlemesinde (2026 verisi taşıma, G-123) |
| Tablo motoru | **@tanstack/react-table** | 9.2.4 | MIT | React Compiler **kapalı** (v9 açık hataları) |
| Sanallaştırma | **@tanstack/react-virtual** | 3.14.13 | MIT | Takvim + uzun listeler |
| Sunucu durumu / UI durumu | **@tanstack/react-query** 5.104.0 · **zustand** 5.0.15 | | MIT | |
| Yönlendirme | **@tanstack/react-router** (hash history) | 1.170.x | MIT | Aynı paket `file://` ve Hono altında |
| Formlar | **react-hook-form** 7.89.0 + **@hookform/resolvers** 5.9.1 + **zod** 4.6.5 (`import * as z` zorunlu) | | MIT | |
| Para girişi | **react-number-format** 5.4.5 (`floatValue` kullanılmaz) + kendi `Money` (BigInt/kuruş) | | MIT | |
| Telefon | **libphonenumber-js** 1.13.14 + kendi bayraksız `PhoneInput` | | MIT | Bayrak çeken bileşenler internet ister → ret |
| IBAN / TC / VKN | **ibantools** 4.5.4 + kendi `isValidTckn`/`isValidVkn` | | MIT/MPL | NVİ'ye SOAP sorgu atan paketler → ret |
| Tarih | **date-fns** 4.4.0 + kendi `LocalDate`; **react-day-picker 9.14.0 sabit** | | MIT | Temporal Electron 37'de yok |
| Grafik | **recharts** 3.10.1 (rapor rotasında tembel yükleme) | | MIT | Isı haritası CSS grid (Kibo contribution-graph deseni) |
| Komut paleti / bildirim / sürükle‑bırak / panel | cmdk 1.1.1 · sonner 2.0.8 · @dnd-kit/core 6.3.1 · react-resizable-panels 4.14.1 | | MIT | |
| Renk seçici (durum etiketleri) | **react-colorful** 5.8.1 | | MIT | |
| QR (telefon eşleme, Wi‑Fi) | **qrcode.react** 4.2.0 | | ISC | |
| CSV | **papaparse** 5.7.0 (okuma + yazma) | | MIT | csv-stringify gereksiz |
| Excel | **exceljs** 4.4.0 — yalnız ana süreç; `uuid` `overrides` ile yükseltilir; tarihler UTC/seri sayıdan okunur | | MIT | Bakımı yavaş ama kararlı; yedek read/write-excel-file |
| PDF / görsel küçültme | Electron `printToPDF` · `nativeImage` / canvas | yerleşik | – | pdfmake/react-pdf/sharp → ret |
| Dil | **i18next** 26.4.2 · **react-i18next** 17.0.15 · **i18next-cli** 1.74.4 (dev) · eslint-plugin-i18next 6.1.5 | | MIT/ISC | TR/EN/RU |
| Ana süreç yardımcıları | electron-log 5.4.4 · bonjour-service 1.4.4 · hono 4.13.12 + @hono/node-server 2.1.3 + @hono/zod-validator 0.9.1 | | MIT | |
| Kodundan yararlanılacak ek depolar | Kibo (gantt şerit paketleme, contribution-graph), TanStack örnekleri, coss `apps/origin` (yalnız bu klasör MIT; olay takvimi → takvim notları/bakım), Tremor grafiksiz bileşenler (Apache‑2.0), tweakcn tema yardımcıları (Apache‑2.0), shadcn-phone-input, electron-window-state, date-range-picker-for-shadcn | | MIT/Apache | `THIRD_PARTY_NOTICES.md` |

**Bilerek eklenmeyenler:** vaul (bakımsız), jotai, dayjs/luxon, nuqs, electron-store, `@electron-toolkit/preload` (her kanala ham `ipcRenderer` açıyor), AG Grid (asıl özellikler ücretli), Planby/gantt-schedule (dağıtımı yasaklayan lisans), tui.calendar (arşiv), Nivo (durgun), npm `xlsx` (CVE).

**Ölçülen renderer çekirdeği:** ~312 KB gz (telefon istemcisi için de uygun); raporlar +127 KB gz tembel.

## 3. Uzaktan erişim / bulut / eşitleme (öneri — sahip seçimi S-79, S-82…S-89)

| Rol | Önerilen | Neden | Reddedilen |
|---|---|---|---|
| Mimari | **C2: tek yazıcı (otel PC) + Mac'te sıcak salt‑okunur kopya + şifreli kutu + devralma sihirbazı** | Çakışma yok; PC çökse de Mac her şeyi gösterir; bizim sunucumuz yok; KVKK riski en düşük | C3 Supabase ana kaynak (çevrimdışı çakışma, 7 gün durdurma, iki şema, KVKK), C4 CRDT motorları (Evolu 8 göç yok, Jazz 2 alfa, Triplit durgun; oda‑gece tekilliği sağlanamaz) |
| Özel ağ | **Tailscale** (otel için ayrı kimlik + cihazı sahibin ağına paylaşma) ya da **NetBird** | GUI, ücretsiz başlangıç; Bismuth yalnız adres kullanır | ZeroTier (ücretsiz plan ticari değil), Cloudflare Tunnel (alan adı), port yönlendirme |
| Değişiklik günlüğü | SQLite tetikleyicileri (Drizzle şemasından üretilir) → `change_log(epoch, seq)` | Bağımlılık yok, test edilebilir | — |
| Şifreli kutu | AES‑256‑GCM (`node:crypto`), anahtar scrypt; sahibin Google Drive / OneDrive / iCloud klasörü | Anahtarsız API, ücretsiz; kimlik no varsayılan olarak konmaz | Canlı WAL veritabanını Drive'da paylaşmak (bozulur) |
| Telefon | Otel PC'nin sunduğu web uygulaması (Tailscale `serve` ile HTTPS) | Kurulumsuz, ana ekrana eklenir | Yerel mobil uygulama |
| İsteğe bağlı v1.1 | Sahibin Cloudflare hesabında şifreli ayna + VPN'siz telefon | PC kapalıyken telefondan bakış | — |

## 4. Alan, Türkiye ve hava durumu ✅

| Rol | Seçilen | Neden | Not |
|---|---|---|---|
| Alan modeli referansı (fikir) | **OCA/pms 16.0** (AGPL — kod yok), **open-hotel-pms** (MIT — çamaşırhane partisi, vardiya defteri, kayıp eşya, gün sonu özeti), **siewong007/hotel-app** (MIT — kapora iade/yakma, komisyon dondurma, çift tık koruması) | Gerçek otelde çalışan modeller | Türk "otel otomasyonu" depoları öğrenci projesi; kötü desenler (float para, saklanan bakiye) |
| KBS alan listesi | **tunjayoff/KBS-Sync** (MIT, Ağustos 2026) | Yeni `kbs.egm.gov.tr` alanları; yabancılar için anne/baba adı + doğum yeri; 248 uyrukluk listesi | Entegrasyon yok; ISO eşlemesindeki hata (IND) kopyalanmaz |
| Ülke eşleme | **i18n-iso-countries** 7.14.0 `tr` + KBS takma ad tablosu (246 KBS ülkesi, 238 otomatik + 8 elle; `repo-alan-tr-hava.md` Ek A) | Çevrimdışı, sabit | Çalışma zamanında `Intl.DisplayNames` kullanılmaz (Electron sürümüne göre değişir) |
| Kur | Truncgil → fawazahmed0 → open.er-api → exchangerate-api → Frankfurter (K-06) | Faz 0 canlı ölçüm | GenelPara, Google kazıma, Yahoo, currency-api-tr elendi |
| Hava | **MET Norway** (birincil), Open‑Meteo (sahip açarsa), kullanıcı anahtarlı Visual Crossing/OpenWeatherMap; lucide + isteğe bağlı Meteocons (MIT) | Ticari kullanım serbest | MGM (resmî API yok, sahte başlık gerekiyor) → ret |
| Bayram | date-holidays + `Intl` yedeği; doğrulama Google TR ICS, yedek Nager.Date | Faz 0 canlı ölçüm | Calendarific (anahtar) isteğe bağlı |

## 5. Lisans yükümlülükleri

- MIT/ISC/Apache dosyaları: dosya başına kaynak satırı + `THIRD_PARTY_NOTICES.md` (Hakkında ekranından açılır).
- date-holidays verisi CC‑BY‑3.0: Hakkında'da atıf.
- Hava/kur kaynakları: atıf gerektirenler (ör. open.er-api, MET Norway) kartın altında ve Hakkında'da.
- AGPL/GPL depolar (Frappe Books, Beekeeper, Logseq): **hiç kod alınmaz**, yalnızca fikir.
