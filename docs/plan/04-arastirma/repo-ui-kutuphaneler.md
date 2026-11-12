# Depo ve Kütüphane Seçimi — Derin Araştırma (Bismuth, 2026-10-01)

> Kapsam: arayüz referans depoları, tape chart, veri tablosu/ızgara, formlar, grafikler, Excel/dosya, tarih/para/i18n,
> durum/veri, Electron yardımcıları. Önceki sığ tur: `shadcn-ekosistemi.md` (tekrarlanmadı; burada **doğrulandı,
> derinleştirildi ve düzeltildi**). İlgili başka raporlar: `masaustu-yigin.md` (electron-vite/Vite 8 sorunu),
> `i18n-rtl-mobil.md` (i18next ayrıntısı), `acik-apiler.md` / `fx-uzaktan-erisim.md` (date-holidays testi, Hono, bonjour).

## 0. Yöntem ve kaynak güvenilirliği

| Veri | Nasıl alındı | Güven |
|---|---|---|
| Sürüm, yayın tarihi, lisans, bağımlılık, peer, son 12 ayda yayın sayısı | `registry.npmjs.org/<paket>` tam belge, bu oturumda script ile (`time`, `dist-tags`, `versions[latest]`) | **Kesin** |
| Yıldız, açık issue, arşiv durumu | GitHub arama API'si (MCP `search_repositories`) | **Kesin** (anlık görüntü) |
| Son push tarihi | GitHub aramasında `pushed:>=` / `pushed:<` eşikleriyle **aralık** olarak (ör. "2026-02…2026-06") | Kesin aralık |
| Paket boyutu (min / gzip) | Bu oturumda paketler kurulup **esbuild 0.x ile kendimiz paketledik** (`target chrome138`, React harici, tipik import kümesi). Bundlephobia vekilde engelli. | **Ölçüm** (gerçek kullanımda ±%15) |
| Haftalık indirme | `api.npmjs.org` ve npmtrends vekilde **engelli**; değerler web arama özetlerinden. Kaynaklar arasında 2–5× fark var → yalnızca **büyüklük sırası** olarak okuyun (≈). Bulunamayanlar "—". | Düşük |
| Kod/lisans içeriği | `raw.githubusercontent.com` (LICENSE, package.json, kaynak dosyalar) | Kesin |
| KBS Excel ayrıştırma | Bu oturumda **sentetik seyrek xlsx** (eksik `<c>` hücreleri, Türkçe paylaşılan dizgiler, saat kesirli seri tarih) üretip exceljs / read-excel-file / SheetJS ile okuduk | Kesin (test) |
| Güvenlik | `npm audit` (exceljs, xlsx, read/write-excel-file, pdfmake, date-holidays, electron-store, bonjour-service, hono, electron-log, qrcode, papaparse, csv-*) | Kesin |

Ürün bağlamı (karar ölçütleri): çevrimdışı (G-01/02), CDN/telemetri yok (G-07), **yıllarca dondurulacak ürün**,
Electron 37 (Chromium 138, Node 22) varsayılan (K-12), shadcn **Radix** tabanı (K-08), aynı React paketi **telefon
tarayıcısına HTTP ile** de sunuluyor (G-135, K-19) → renderer paket boyutu telefonda önemli; Arapça RTL (K-20).

---

## 1. Yönetici özeti — önceki tura göre yeni/düzeltilen bulgular

1. **TanStack Table v9 kararlı** (9.0.0 = 2026-08-04, güncel 9.2.4 = 2026-08-28). v8'in son sürümü 8.21.3 (2025-04-14) — v8 artık güncellenmiyor. shadcn `apps/v4` (`^9.0.0`), diceui ve tablecn v9'a geçti. **Ama** v9'da React Compiler ile açık hatalar var (#6577 "v9 still doesn't really support react compiler", #6524 sütun görünürlüğü, #6601 dış veri güncellemesinde yeniden çizim yok) → **React Compiler açılmayacak** (ya da tablo bileşenlerinde `"use no memo"`).
2. **diceui (sadmann7) artık ana kaynak:** 2026-09-29 changelog'u ile Data Table **ve** Data Grid hem Radix hem Base UI varyantında, TanStack Table v9 üzerinde. Data Grid: sanallaştırılmış, hücre içi düzenleme, **Excel/Google Sheets'ten TSV yapıştırma (satır ekleyerek)**, geri al/yinele, Ctrl+F, sabit sütunlar, RTL. tablecn yalnızca bunun Next.js + Postgres demosu.
3. **Kibo UI el değiştirdi:** depo `shadcnblocks/kibo` (Ekim 2025 satın alma), son push 2026-02…2026-06 arası (yavaşladı). Gantt bileşeni **sanallaştırmasız** (3 yılın tüm günlerini DOM'a basar, kaydırınca yıl ekler), `Date` nesnesiyle çalışır, Jotai + dnd-kit + lodash.throttle ister → **yalnızca desen kaynağı**.
4. **Tape chart kütüphane adaylarında yeni elemeler:** `nhn/tui.calendar` **arşivlendi**; **Planby** lisansı "dağıtamazsınız" diyor (masaüstü kurulum paketine gömülemez); **gantt-schedule-timeline-calendar** özel lisans (değiştirme yasak); **DHTMLX Gantt v10 MIT** oldu ama kaynak (resource) görünümü PRO; **DayPilot Lite 6.0.0 bugün çıktı** (Apache‑2.0) fakat npm'de **yalnızca küçültülmüş (minified) kod**, herkese açık kaynak deposu yok, React sarmalayıcısı `create-react-class` kullanıyor.
5. **Tape chart için en güçlü "hazır" yedek:** `react-data-grid` 7.0.0-beta.61 (Comcast, MIT, 0 bağımlılık, 13,9 KB gz): **sütun birleştirme (colSpan) + sabit sütunlar + satır/sütun sanallaştırma + klavye + RTL**. Gece başına bir sütun modeliyle rezervasyon = colSpan hücresi olarak çizilebilir. Yine de kazanan **özel bileşen** (yarım hücre ofseti, sürükle/uzat, gece gece renk tam kontrol).
6. **exceljs**: son npm sürümü **2023-10-19**, son push **2025-01-21**, 813 açık issue, `uuid` üzerinden orta seviye uyarı; buna rağmen stilli dışa aktarma için hâlâ en iyi seçenek. Testte **tarih hücreleri UTC `Date` olarak dönüyor** (46286,979 → `2026-09-21T23:30Z`); Türkiye saatinde `getDate()` kullanılırsa giriş günü **bir gün kayar** → `getUTC*` ile okunmalı.
7. **Telefon girişleri CDN'den bayrak çekiyor:** `react-phone-number-input` varsayılanı `purecatamphetamine.github.io`, `react-international-phone` varsayılanı `cdnjs.cloudflare.com/…/twemoji` → G-01/G-07 ihlali; ya bayraklar pakete gömülür ya da bayraksız bileşen yazılır.
8. **vaul (Drawer) bakımsız** (README: "This repo is unmaintained"). shadcn Calendar'da **her yeniden çizimde tüm DOM'un yeniden kurulması** hatası (#11134, #11635 — Safari'de tıklama kaybı; telefon istemcisi için önemli) → `calendar.tsx` içindeki satır içi slot bileşenleri modül düzeyine taşınmalı.
9. **zod içe aktarma biçimi paket boyutunu 3,5× değiştiriyor:** `import { z } from "zod"` → 90,5 KB gz; `import * as z from "zod"` → 25,4 KB gz (esbuild ölçümü, 4.6.5). Paylaşılan kontrat telefonla da gittiği için ESLint kuralıyla zorlanmalı.
10. **Temporal** yalnızca Chromium 144+ / Firefox 139+ / Node 26'da yerli; Electron 37 (Chromium 138, Node 22) ve iOS Safari'de yok → kullanılmayacak; `YYYY-MM-DD` + kendi `LocalDate`.
11. **PDF:** pdfmake ve @react-pdf Arapça şekillendirme/RTL yapamıyor (react-pdf #1571, #2638, #3007) → **Electron `printToPDF`** (Chromium metin motoru, aynı Tailwind yazdırma CSS'i, paket içi fontlar).
12. **TC Kimlik npm paketleri (`tckimlik`, `turkish-id-validator`) `soap` bağımlılığıyla NVİ'ye çevrimiçi sorgu atıyor** → reddedildi; 10 satırlık algoritma yazılır.

Ölçülen renderer bütçesi (seçilen çekirdek, React dahil, grafiksiz): **312 KB gz**; rapor rotası tembel yüklenen Recharts ile **+127 KB gz**. exceljs (264 KB gz), date-holidays (230 KB gz), PDF üretimi **ana süreçte** kalır, telefona hiç gitmez.

---

## 2. Kategori 1 — shadcn + Vite yönetim paneli referansları

| Depo | ★ | Son push | Lisans | React 19 | TW4 / shadcn | Çevrimdışı | Not |
|---|---|---|---|---|---|---|---|
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) (bloklar: sidebar-01…16, dashboard-01, calendar-NN, 77 grafik) | 124 972 | aktif (2026-10) | MIT | ✓ | kaynak | ✓ (CLI yalnız geliştirmede ağ ister) | `apps/v4`: TanStack Table `^9.0.0`, recharts 3.8.0, RDP `^9.7.0`, @dnd-kit/core 6 |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | 15 515 | ≥ 2026-09-01 | MIT | ✓ (19.2.5) | TW 4.2 / Radix bireysel paketler | ✓ (Clerk + axios çıkarılmalı) | **Vite + TanStack Router** — bize en yakın kabuk. TanStack Table **8.21.3** (v9'a taşınmalı), Clerk (kaldır), RTL değişiklikli bileşenler (shadcn 2026-01'den beri yerli RTL → gereksizleşti) |
| [sadmann7/diceui](https://github.com/sadmann7/diceui) | 2 080 | ≥ 2026-09-01 | MIT | ✓ | TW4, **Radix + Base UI** varyantları, `cn` paketi | ✓ | 48 bileşen: data-table, **data-grid**, mask-input, phone-input, time-picker, file-upload, qr-code, stat, kanban, timeline, tags-input… |
| [sadmann7/tablecn](https://github.com/sadmann7/tablecn) | 6 296 | ≥ 2026-09-01 | MIT | ✓ (19.3) | TW4 | ✓ | Next 16 + nuqs + Drizzle + Postgres demo; **`src/app/lib/filter-columns.ts`** (filtre durumu → Drizzle `where`) değerli |
| [shadcnblocks/kibo](https://github.com/shadcnblocks/kibo) (eski haydenbleasel/kibo) | 3 950 | 2026-02…2026-06 | MIT | ✓ (19.2) | TW4 | ✓ | 41 paket: gantt, calendar, kanban, **contribution-graph**, color-picker, qr-code, dropzone, table (Jotai) |
| [cosscom/coss](https://github.com/cosscom/coss) (Origin UI) | 10 638 | ≥ 2026-06 | **Karma: `apps/origin/` ve `apps/ui/` MIT, geri kalan AGPLv3** | ✓ | TW4; yeni geliştirme Base UI | ✓ | Origin: `event-calendar` (ay/hafta/gün/ajanda, dnd-kit), `datefield-rac` (react-aria DateField) |
| [tremorlabs/tremor](https://github.com/tremorlabs/tremor) (Tremor Raw, kopyala-yapıştır) | 3 644 | 2025-10…2026-02 | Apache‑2.0 | **✗ (React 18.3)** | TW4 ama **Recharts 2, RDP 8, date-fns 3** | ✓ | Vercel satın aldı (2025-01); yavaşladı. Grafiksiz parçaları (Tracker, CategoryBar, BarList, ProgressCircle) işe yarar |
| [tremorlabs/tremor-npm](https://github.com/tremorlabs/tremor-npm) (`@tremor/react` 3.18.7) | 16 488 | < 2025-10 | Apache‑2.0 | **✗ (peer `^18`)** | TW3 | ✓ | Son yayın 2025-01-13 → **ret** |
| [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | 7 086 | ≥ 2026-04 | MIT | ✓ | TW4 | Clerk/Sentry bağlı | Next 16 — yalnızca desen (kanban, ürün tablosu) |
| [hsuanyi-chou/shadcn-ui-expansions](https://github.com/hsuanyi-chou/shadcn-ui-expansions) | 1 938 | ≥ 2026-04 | MIT | ✓ | TW4 | ✓ | MultipleSelector, AutosizeTextarea, DateTimePicker — diceui eşdeğerleri tercih |
| [BelkacemYerfa/shadcn-extension](https://github.com/BelkacemYerfa/shadcn-extension) | 1 330 | < 2026-04 | MIT | ✓ | — | ✓ | düşük ilgi |
| [magicuidesign/magicui](https://github.com/magicuidesign/magicui) | 22 435 | aktif | MIT | ✓ | TW4 | ✓ | pazarlama animasyonları (motion) → **atla** |
| shadcnblocks.com | — | — | ticari (Pro) | — | — | — | ücretli bloklar → atla (Kibo kısmı MIT) |
| [gpbl/react-day-picker](https://github.com/gpbl/react-day-picker) | 6 858 | aktif (10.0.2 = 2026-09-30) | MIT | ✓ | shadcn Calendar tabanı | ✓ | **9.14.0'a sabitle**; v10 shadcn'i kırıyor (#10933, #11012 açık) |

**Kazanan (kabuk/desen):** `satnaing/shadcn-admin` — Vite + TanStack Router + shadcn sidebar + komut paleti + tema + hata sayfaları; bize birebir benzer mimari.
**Kazanan (bileşen kaynağı):** `sadmann7/diceui` (Radix varyantı) — TanStack v9, sürekli bakım, iki taban.
**İkinci:** `shadcn-ui/ui` blokları (sidebar-07, dashboard-01, calendar blokları) — resmî, ama daha az iş bileşeni.
**Vendor mı bağımlılık mı:** Hepsi **kopyala‑yapıştır (vendor)**; hiçbiri npm bağımlılığı olarak eklenmez. Gerekçe: dondurulmuş üründe kod bizde kalır, upstream kırılması bizi etkilemez; MIT/Apache atıf yükümlülüğü `THIRD_PARTY_NOTICES.md` ile karşılanır (§12).

---

## 3. Kategori 2 — Tape chart / kaynak zaman çizelgesi (oda × gün)

### 3.1 Adaylar

| Aday | ★ | Son yayın / push | Lisans | Boyut (gz, ölçüm) | React 19 | shadcn uyumu | Çevrimdışı | Uygunluk / risk |
|---|---|---|---|---|---|---|---|---|
| **Özel bileşen** (`@tanstack/react-virtual` 3.14.13) | 7 128 | 2026-09-14 | MIT | **7,6 KB** | ✓ | tam (kendi markup'ımız) | ✓ | Gece gece renk, bölünmüş hücre, sabit sütun, yarım hücre ofseti, sürükle/uzat **tam kontrol**. Kod sahipliği bizde. |
| react-data-grid 7.0.0-beta.61 (Comcast) | 7 690 | 2026-07-14 / ≥ 2026-09 | MIT | 13,9 KB | ✓ (peer `^19.2`) | kendi CSS'i (`--rdg-*` değişkenleri, `color-scheme`) | ✓ | **colSpan + sabit sütun + 2B sanallaştırma + klavye + RTL**; sürükle-taşı yok (özel yazılır); yıllardır "beta" etiketi. **En iyi hazır yedek.** ≈0,6 M/hafta |
| react-calendar-timeline 0.30.0-beta.19 | 2 158 | 2026-07-24 (stable 0.28) | MIT | 55,2 KB | yalnız beta'da | kendi CSS'i | ✓ | lodash + interactjs + element-resize-detector; sanallaştırma yok; gece başı renk için itemRenderer ile uğraş |
| DayPilot Lite React 6.0.0 | (depo yok) | **2026-10-01** | Apache‑2.0 | 102,8 KB | ✓ (peer ≥18; `create-react-class`) | kendi teması | ✓ | Scheduler (kaynak satırı + yatay zaman, sürükle/uzat, progressive rendering). **npm'de yalnız minified**, public issue/kaynak yok → yamalanamaz. Acil durum yedeği. |
| Kibo Gantt (shadcnblocks/kibo) | 3 950 | 2026-02…06 | MIT | (vendor) | ✓ | shadcn yerli | ✓ | Sanallaştırma yok, `Date` tabanlı, Jotai; **desen kaynağı** |
| SVAR React Gantt 2.7.3 | 212 | 2026-09-09 | MIT çekirdek | — | ✓ | kendi teması | ✓ | Görev Gantt'ı; **kaynak planlama PRO** → ret |
| DHTMLX Gantt 10.0.3 | 1 857 | 2026-09-03 | **MIT** (Community) | — | sarmalayıcı | kendi teması | ✓ | Görev Gantt'ı; kaynak yönetimi PRO; dışa aktarma çevrimiçi servis → ret |
| dhtmlx-scheduler 7.2.15 | 343 | 2026-08-17 | GPL‑2.0 | — | — | — | — | Timeline PRO + GPL → ret |
| frappe-gantt 1.2.2 | 6 133 | 2026-02-25 | MIT | — | vanilla | — | ✓ | Görev Gantt'ı, kaynak satırı yok → ret |
| Planby 2.1.0 | 1 720 | 2026-08-23 | **Özel lisans: dağıtım yasak** | — | ✓ (≥19) | emotion | ✓ | Lisans gereği **ret** |
| Schedule‑X 4.9.1 | 2 590 | 2026-09-29 | MIT çekirdek | — | ✓ | preact + kendi teması | ✓ | Resource scheduler **premium** (479 €/yıl) → ret |
| FullCalendar 7.1.0 + resource-timeline 6.1.21 | 20 660 | 2026-09-05 | çekirdek MIT, **timeline ticari** | — | ✓ | kendi teması | ✓ | lisans anahtarı → ret |
| react-big-calendar 1.20.0 | 8 759 | 2026-06-01 | MIT | — | ✓ | kendi CSS'i | ✓ | Kaynak görünümü yalnız gün/hafta saat ızgarası; moment/luxon/globalize bağımlılıkları → ret |
| @toast-ui/react-calendar 2.1.3 | 12 694 | 2022-08 | MIT | — | — | — | — | **Arşivlendi** → ret |
| @aldabil/react-scheduler 3.1.2 | 418 | 2025-04 / < 2025-06 | MIT | — | ✓ | **MUI 7** | ✓ | MUI ikinci tasarım sistemi → ret |
| @bitnoi.se/react-scheduler 0.3.1 | 514 | 2024-08 / < 2025-06 | MIT | — | ? | styled-components | ✓ | bakımsız → ret |
| react-big-schedule 5.5.1 | 194 | 2026-05 | MIT | — | ✓ | **antd** + react-dnd | ✓ | ikinci tasarım sistemi → ret |
| gantt-schedule-timeline-calendar 3.43.14 | 3 631 | 2026-06 | **Özel (değiştirme yasak)** | — | — | — | — | → ret |
| @mui/x-scheduler 9.0.0-beta.12 | — | 2026-09 | MIT (yatay timeline Premium) | — | ✓ | MUI | ✓ | → ret |
| Bryntum / Syncfusion | — | — | ticari | — | — | — | — | → ret |

GitHub'da "hotel tape chart" için açık kaynak React bileşeni **yok**: arama 0 sonuç; `harshuDev/hotel-pms` (0 ★, 2026-08) ve `Kamra-PMS` (AGPL, Frappe) yalnızca fikir; `sau108/react-hotel-booking-calendar` (5 ★, 2024) önemsiz; QloApps PHP.

### 3.2 Karar

**Kazanan: özel bileşen** — `@tanstack/react-virtual` (yalnız **yatay** sanallaştırma; 20 oda dikeyde düz `map`).
**İkinci: `react-data-grid` 7.0.0-beta.61** (gece = sütun, rezervasyon = `colSpan`, oda sütunları `frozen`). Faz 0 prototipinde 1 gün içinde denenebilir; özel bileşen 60 fps / klavye / sürükle ölçütünü tutturamazsa geçilir.

Tasarım notları (kod referanslarıyla):

- **Zaman ekseni:** sonsuz kaydırma yerine sabit büyük aralık (ör. kurulum yılı −2 … bugün +10 yıl ≈ 4 400 sütun × 40 px ≈ 176 000 px; Chromium sınırı ~33 M px). Kibo'daki "uca gelince yıl ekle + scrollLeft düzelt" yaklaşımı zıplama üretir; **kullanma**. Bugün = `scrollToIndex(todayIdx, { align: 'center' })`.
- **Sabit sol sütunlar:** sanallaştırıcının dışında `position: sticky; inset-inline-start: 0` — TanStack Table v9 `examples/react/virtualized-columns` (sabitlenmiş + sanallaştırılmış sütun, `virtualPaddingLeft/Right` deseni).
- **Hücre modeli:** her (oda, gece) hücresi `room_nights` satırından renk alır (`paid|partial|unpaid|…` → `--status-*`). Rezervasyon çubuğu = gecelerin üstünde mutlak konumlu tek eleman; gece segmentleri çubuğun içinde `grid-template-columns: repeat(n, var(--cell-w))`.
- **Bölünmüş hücre:** aynı tarihte `slot=day` (day-use) + `slot=night` → hücre ikiye bölünür (üst/alt veya sol/sağ yarım). Kibo'nun **şerit paketleme algoritması** (`subRowEndTimes`, gantt `index.tsx` ~1015–1040) aynı odada çakışan blok/rezervasyon önizlemesi için alınır.
- **Sürükle / uzat:** `@dnd-kit/core` 6.3.1 + `@dnd-kit/modifiers` `createSnapModifier(cellW)` (yatay) ve satıra yapışma; veya ~200 satırlık pointer olayı. HTML5 DnD tabanlı pragmatic-drag-and-drop ızgaraya yapışan önizleme veremez ve dokunmatikte zayıf.
- **Klavye ve erişilebilirlik:** `role="grid"`, `aria-rowindex/colindex`, gezgin odak — diceui data-grid `data-grid-cell-wrapper.tsx` desenleri.
- **Satır içi stil kuralı:** CLAUDE.md "inline style yok" diyor; sanallaştırma geometrisi (`transform`, `width`) dinamik olduğundan **tek istisna** olarak yalnızca CSS özel özelliği verilmeli: `style={{ '--x': … }}` + Tailwind `translate-x-(--x)`. ESLint kuralına `features/calendar/grid/*` istisnası yazılmalı.
- **RTL:** K-20 gereği ızgara `dir="ltr"` sabit; çevresindeki kabuk RTL olabilir.

---

## 4. Kategori 3 — Veri tablosu / ızgara (defter, listeler, içe aktarma önizlemesi)

Faz 7 metnine göre defter **hücre hücre Excel düzenlemesi değil**; "satıra tıkla → düzenle", gün grupları, toplamlar, çoklu seçim + "Teslim al". Excel benzeri toplu düzenleme yalnızca **içe aktarma önizlemesi** (2026 verisinin Google Sheets'ten taşınması, yapıştır → düzelt → kaydet) ve belki toplu fiyat girişinde gerekiyor.

| Aday | ★ / açık issue | Son yayın | Lisans | gz (ölçüm) | React 19 | shadcn uyumu | Not |
|---|---|---|---|---|---|---|---|
| **@tanstack/react-table 9.2.4** | 28 474 / 73 | 2026-08-28 (110 yayın/12 ay) | MIT | **14,9 KB** (çekirdek+sıralama+filtre) | ✓ (peer ≥18) | headless → shadcn Table | v9: `useTable`, `tableFeatures`, `create*RowModel`; resmî `examples/react/spreadsheet` (dolgu tutamacı, aralık seçimi, bağlam menüsü) var. ≈5–24 M/hafta. **React Compiler sorunları açık.** |
| **diceui data-table** (vendor) | 2 080 | 2026-09-29 | MIT | (kaynak) | ✓ | Radix/Base | Filtre listesi/menüsü (metin, sayı, aralık, tarih, seçim), sıralama, sütun sabitleme, **seçim eylem çubuğu**, klavye kısayolları. URL durumu **nuqs** ile (TanStack Router adaptörü var: `nuqs/adapters/tanstack-router`) |
| **diceui data-grid** (vendor) | — | 2026-09-29 | MIT | (kaynak; `use-data-grid.ts` 3 656 satır) | ✓ | Radix/Base | Sanallaştırma (TanStack Virtual), 10 hücre türü + özel hücre, **TSV yapıştırma**, geri al/yinele, bul, satır ekle/sil, RTL |
| react-data-grid 7.0.0-beta.61 | 7 690 / 78 | 2026-07-14 | MIT | 13,9 KB | ✓ | kendi CSS | Özet satırları (gün toplamı!), gruplama, kopyala/yapıştır, doldurma; 0 bağımlılık. ≈0,6 M/hafta |
| AG Grid Community 36.2.0 | 15 624 / 138 | 2026-09-16 | MIT | **320,7 KB** | ✓ | kendi tema sistemi | **Aralık seçimi + Excel tarzı kopyala/yapıştır Enterprise'da** → defter için gereken özellik ücretli |
| Glide Data Grid 6.0.3 | 5 359 / 133 | **2024-02-03** (6.0.4-alpha 2025-10) | MIT | 106,7 KB | **✗ (peer ≤18)** | canvas | lodash/marked peer; bakım belirsiz → ret |
| react-datasheet-grid 4.11.6 | 2 030 / 70 | 2026-03-03 | MIT | 28,6 KB | ✓ | kendi CSS | 1 yayın/12 ay → ret |
| RevoGrid (@revolist/react-datagrid 4.28.0) | 3 447 | 2026-09-16 | MIT çekirdek (+Pro) | — | sarmalayıcı (Stencil web bileşeni) | kendi | ikinci bileşen modeli → ret |
| Handsontable 18.1.1 | — | 2026-09 | **ticari / yalnız ticari olmayan kullanım ücretsiz** | — | — | — | → ret |
| jspreadsheet CE 5.0.4 | — | 2025-08 | MIT | — | sarmalayıcı 2024 | jsuites | → ret |
| @silevis/reactgrid 4.1.17 | — | 2025-04 | MIT | — | **✗ (peer ≤18.2)** | sass | → ret |

**Kazanan:** `@tanstack/react-table` 9.2.4 + shadcn `Table` + **diceui data-table** (vendor, Radix). Defter, misafir, gider, rehber, tedarik listeleri bunun üzerine; ay görünümünde satır sanallaştırması `@tanstack/react-virtual`.
**Toplu düzenleme (içe aktarma önizlemesi):** **diceui data-grid** (vendor; aynı motor, aynı tasarım dili). Yalnızca o rotada tembel yüklenir.
**İkinci:** `react-data-grid` 7.0.0-beta.61 (bağımlılık olarak; özet satırı ve gruplama hazır).
**Notlar:** v8 örneklerini (shadcn-admin, eski tablecn) birebir kopyalama — `getCoreRowModel/getSortedRowModel` → `createSortedRowModel`, pinning `{left,right}` → `{start,end}` (diceui changelog). tablecn `filter-columns.ts` Drizzle'a uyarlanırken `ilike` (Postgres) yerine `*_normalized` sütunlarında `LIKE` (SQLite LIKE yalnız ASCII'de büyük/küçük harf duyarsız; Türkçe İ/ı için normalizasyon şart).

---

## 5. Kategori 4 — Formlar ve girişler

| Aday | ★ / açık | Son yayın | Lisans | gz | React 19 | Not |
|---|---|---|---|---|---|---|
| **react-hook-form 7.89.0** | 44 869 / **9** | 2026-09-26 | MIT | 13,5 KB (+ zod resolver) | ✓ | 0 bağımlılık; shadcn `Field` ile resmî kalıp; ≈66 M/hafta. **v8 beta** (8.0.0-beta.4, 2026-09-26) → v7'ye sabitle |
| @tanstack/react-form 1.33.5 | 6 701 / 211 | 2026-08-11 | MIT | 17,3 KB | ✓ | v2 alfa (2026-08-21) — API hareketli; ≈3,6 M/hafta → ikinci |
| **@hookform/resolvers 5.9.1** | — | 2026-08-17 | MIT | (yukarıda) | ✓ | zod `^3.25 || ^4` |
| **zod 4.6.5** | 44 051 / 84 | 2026-09-13 | MIT | **25,4 KB** (`import * as z`) / 90,5 KB (`import { z }`) / 5,1 KB (`zod/mini`) | — | kontrat + form tek şema |
| **react-number-format 5.4.5** | 4 100 / 229 | 2026-03-22 | MIT | 5,8 KB | ✓ | `NumericFormat` (`thousandSeparator="."`, `decimalSeparator=","`, `decimalScale` = ayar). **`values.value` (string) kullan, `floatValue` asla** → `shared/money.ts` `parseMinor()` |
| react-currency-input-field 4.0.12 | — | 2026-10-01 | MIT | — | ✓ | `intlConfig` yerel ayarlı; v4 yeni çıktı, olgunlaşmamış → ikinci |
| react-imask 7.6.1 / @react-input/number-format 2.0.3 | — | 2024 | MIT | — | ✓ | durgun → ret |
| **libphonenumber-js 1.13.14** | (GitLab) | 2026-09-24 (34 yayın/12 ay) | MIT | 28,7 KB (`/min`) · 48,2 KB (`/max`) | — | E.164 normalizasyon (`phone_normalized`, kara liste eşleştirme), `AsYouType` |
| react-phone-number-input 3.4.18 | (GitLab) | 2026-08-20 | MIT | 48,6 KB; bayraklar gömülü **98,5 KB** | ✓ | **Varsayılan `flagUrl` = `purecatamphetamine.github.io` (CDN)** → `flags` içe aktarılmalı ya da `/input` (ülke seçicisiz, 37,5 KB) |
| react-international-phone 4.8.0 | 450 / 62 | 2026-02-21 | MIT | 9,4 KB | ✓ | **Bayraklar `cdnjs.cloudflare.com/…/twemoji`'den** → ret |
| diceui phone-input (vendor) | — | 2026-09 | MIT | — | ✓ | yalnız `radix-ui`; **emoji bayrak** (Windows'ta "TR" harfleri görünür) ve doğrulamasız biçimleme → yalnız desen |
| omeralpi/shadcn-phone-input (vendor) | 967 | < 2026-04 | MIT | — | ✓ | Command tabanlı ülke seçici + react-phone-number-input; Next 14/TW3 → desen |
| Tarih girişi: **shadcn Date Picker** (RDP **9.14.0**) + **diceui mask-input** (`GG.AA.YYYY`) | — | — | MIT | RDP 22 KB | ✓ | Doğum tarihi yazma + takvimden seçme; ayrıştırma `LocalDate` ile |
| react-aria-components 1.21.1 `DateField` (Origin `datefield-rac`) | — | 2026-10-01 | Apache‑2.0 | **48,8 KB** | ✓ | Segmentli, tr/ru/ar yerelleştirme kusursuz; ağır → ikinci |

**Kazananlar:** RHF 7.89.0 + @hookform/resolvers 5.9.1 + zod 4.6.5 (`import * as z`) · para: react-number-format 5.4.5 · telefon: libphonenumber-js 1.13.14 (`/min`) + **kendi `PhoneInput`** (shadcn Combobox ülke listesi, adlar `Intl.DisplayNames` ile 4 dilde, **bayraksız**; `AsYouType` ile biçim) · tarih: shadcn Calendar + mask-input.
**İkinciler:** TanStack Form 1.33.5 · kendi `MoneyInput` · react-phone-number-input 3.4.18 + `react-phone-number-input/flags` · RAC DateField.
**Ek (renk ayarları, G-33):** `react-colorful` 5.8.1 (MIT, 0 bağımlılık, 2026-09) veya Kibo `color-picker` (vendor; `color` paketi ister).

---

## 6. Kategori 5 — Grafikler (KPI, çizgi/çubuk, haftanın günü × ay ısı haritası)

| Aday | ★ / açık | Son yayın | Lisans | gz (ölçüm) | React 19 | Tema | Not |
|---|---|---|---|---|---|---|---|
| **Recharts 3.10.1** (shadcn Chart) | 27 609 / 453 | 2026-07-25 (3.11 canary 2026-09-21) | MIT | 104 KB (yalnız Bar) · 123 KB (Bar+Line+Area+Pie) | ✓ | shadcn `ChartConfig` → `--chart-*` / `--status-*` | Redux Toolkit + immer içeriyor; SVG → yazdırma/PDF sorunsuz; ≈48 M/hafta |
| ECharts 6.1.0 (+ echarts-for-react 3.0.6) | 67 434 / 1 496 | 2026-05-19 | Apache‑2.0 | 209,5 KB (çekirdek: bar+line+heatmap+SVG) · 374,6 KB (tam) | sarmalayıcı (echarts-for-react repo < 2026-04) | kendi tema JSON'u | Takvim ısı haritası yerli; Apache vakfı → uzun ömür; ağır |
| @nivo/heatmap 0.99.0 | 14 106 / 52 | **2025-05-23** | MIT | 82 KB | ✓ | kendi tema | 9 yıldır 0.x, react-spring; yayın durdu → ret |
| @visx/heatmap 4.0.0 (+scale) | 21 073 / 154 | 2026-06-11 | MIT | 12,6 KB | ✓ | CSS değişkenli | Düşük seviyeli; ısı haritası için ince → ikinci (ısı haritası) |
| chart.js 4.5.1 + react-chartjs-2 | — | 2025-10 | MIT | 68,7 KB | ✓ | canvas | shadcn ile tutarsız → ret |
| Tremor (Raw / npm) | 3 644 / 16 488 | 2025-01 (npm) | Apache‑2.0 | — | ✗ | — | Recharts 2/React 18 → ret (grafiksiz parçalar desen) |
| @unovis/react 1.7.1 | 2 857 | 2026-09-29 | Apache‑2.0 | — | ✓ | CSS değişkenli | iyi ama ikinci bir sistem → gereksiz |

**Kazanan:** Recharts 3.10.1 (shadcn Chart; 77 hazır örnek) — rapor rotasında **tembel yükleme** (telefonda ilk açılışa girmez).
**Isı haritası (hafta günü × ay, yıl takvimi):** **kütüphanesiz CSS grid** (7×12 hücre; `<table>` semantiği, `color-mix()` ile `--status-*`/`--chart-*` ölçeği; yazdırılabilir). Yıl görünümü için **Kibo `contribution-graph`** (MIT, yalnız date-fns) vendor edilir.
**İkinci:** ECharts 6.1.0 (yoğun analiz gerekirse) · ısı haritasında @visx/heatmap 4.0.0.

---

## 7. Kategori 6 — Excel / CSV / görsel / QR / PDF

### 7.1 Excel

| Aday | ★ / açık | Son yayın | Son push | Lisans | gz (tarayıcı) | Güvenlik / not |
|---|---|---|---|---|---|---|
| **exceljs 4.4.0** | 15 483 / **813** | **2023-10-19** (4.4.1-prerelease 2024-12) | 2025-01-21 | MIT | 264,3 KB | `npm audit`: **orta** (`uuid` <v11 "buffer bounds", exceljs `buf` vermediği için pratikte etkisiz); `archiver 5`/`unzipper 0.10` → `inflight`, `glob@7`, `rimraf@2` kullanımdan kalkma uyarıları. Stil, sütun genişliği, sayı biçimi, dondurma, akış. ≈10–16 M/hafta |
| read-excel-file 9.3.10 | (GitLab) | 2026-08-10 (**35 yayın/12 ay**) | aktif | MIT | 16,3 KB | 4 bağımlılık; **API her büyük sürümde kırıldı** (v7→v8→v9: `readSheet`, `parseData`…); "non-ASCII karakterler bozuk okunuyordu" hatası ancak **9.3.3 (2026-07-20)** ile düzeldi; testte 23:30 → `23:29:59.999Z` yuvarlama |
| write-excel-file 4.1.1 | (GitLab) | 2026-06-08 | aktif | MIT | 19,5 KB | 1 bağımlılık (fflate); stil, genişlik, sabit satır destekli |
| SheetJS CE 0.20.3 | 36 353 (GitHub ayna) | **2024-07-12**, yalnız `cdn.sheetjs.com` tarball'ı | git.sheetjs.com | Apache‑2.0 | — | .xls/.ods/.xlsb dahil en geniş biçim; npm'deki `xlsx` 0.18.5 (2022) **yüksek**: prototype pollution + ReDoS. Stil yazma Pro'da. CDN vekilde de engelli. |
| xlsx-populate 1.21.0 | 1 001 / 156 | **2020-03-01** | < 2025-06 | MIT | — | bakımsız → ret |

**KBS testi sonucu (sentetik seyrek dosya):** üç kütüphane de eksik `<c>` hücrelerini **hücre referansına göre doğru sütuna** yerleştirdi (sıraya göre kaydırma yok). Farklar: exceljs ve read-excel-file tarih biçimli hücreyi **UTC `Date`**'e çeviriyor (biçimsiz hücrede ham seri sayı kalıyor); SheetJS `raw:true` ile her ikisini de ham seri sayı veriyor.
→ Kural: `kbs-import.ts` her tarih hücresini **seri sayıya geri çevirip** (`Date` ise `ms/86400000 + 25569`) gün + dakika olarak `LocalDate`'e dönüştürsün; **yerel saat getter'ı yasak** (`getDate()` Türkiye'de 23:30 girişini ertesi güne kaydırır). Test verisi: `02-excel-analizi.md` §2.4.2 (607 giriş / 838 geceleme).

**Kazanan:** **exceljs 4.4.0, yalnızca ana süreçte** (KBS okuma + Google Sheets xlsx okuma + stilli rapor yazma — tek kütüphane, K-14 ile uyumlu). `package.json` `overrides`: `uuid` → 11.x (CJS `v4` API'si korunur; Faz 0'da doğrula).
**İkinci:** read-excel-file 9.3.10 + write-excel-file 4.1.1 (küçük, aktif; ama API oynaklığı ve yeni düzelen kodlama hatası dondurulmuş ürün için risk).
**Acil yedek:** `.xls` (BIFF) gelirse SheetJS CE 0.20.3 tarball'ı **depoya konur** (`vendor/xlsx-0.20.3.tgz`, `file:` bağımlılığı; CDN'e çalışma/derleme zamanında gidilmez).

### 7.2 CSV
**Kazanan: papaparse 5.7.0** (MIT, 0 bağımlılık, 7,1 KB gz, 2026-08-24, ≈15 M/hafta) — hem ayrıştırma (ayırıcı otomatik: Google Sheets `,`, Türkçe Excel `;`) hem `unparse` (`delimiter: ';'` + `﻿` BOM). Böylece K-14'teki `csv-stringify` gereksizleşir (tek kütüphane). Not: Google Sheets CSV'sinde sayılar tablo yerel ayarına göre (`"1.234,56"`) gelir → içe aktarma eşlemesinde yerel ayar seçimi.
**İkinci:** `csv-parse` 7.0.3 / `csv-stringify` 6.9.0 (MIT, 0 bağımlılık, 2026-09-25).

### 7.3 Görsel küçültme (K-25)
**Kazanan: bağımlılıksız.** Masaüstünde ana süreçte Electron `nativeImage.createFromPath(p).resize({ width: 1600, quality: 'best' }).toJPEG(82)` (yeniden kodlama EXIF/GPS'i de siler → KVKK artısı). Telefon istemcisinde yüklemeden önce `createImageBitmap(file)` + `<canvas>`/`OffscreenCanvas` `toBlob('image/jpeg', 0.82)` (modern tarayıcılar EXIF yönünü uygular). Sunucu tarafı yine `nativeImage` ile doğrular/yeniden kodlar.
**İkinci:** pica 10.0.3 (MIT, 16,2 KB gz, 2026-08-15, ≈0,8 M/hafta; Lanczos kalitesi) — CSP'de `worker-src blob:` gerekir. **sharp reddedildi** (yerel modül, platforma özel ikili).

### 7.4 QR (Wi‑Fi, telefon eşleme adresi, yorum bağlantısı)
**Kazanan: qrcode.react 4.2.0** (ISC, **0 bağımlılık**, SVG, 6,1 KB gz, peer React 19, ≈6 M/hafta). QR standardı donmuş olduğundan 2024 yayını risk değil.
**İkinci:** lean-qr 2.7.4 (MIT, 0 bağımlılık, 2026-09-07). `qrcode` 1.5.4 (2024-08) `yargs` + `pngjs` çeker → gerek yok (diceui/Kibo QR bileşenleri bunu kullanır; vendor ederken qrcode.react'e çevir).

### 7.5 PDF
**Kazanan: Electron `webContents.printToPDF`** (yerleşik, 0 bağımlılık): aynı React sayfası + `@media print`, paket içi fontlar, **Arapça şekillendirme ve RTL Chromium'dan**. Telefon/tarayıcı istemcisinde `window.print()` → "PDF olarak kaydet".
**Ret:** pdfmake 0.3.11 (fontlarla **811 KB gz**, pdfkit Arapça bidi/ligatür yok), @react-pdf/renderer 4.9.0 (443 KB gz, RTL 2019'dan beri bozuk: #1571/#2638/#3007).

---

## 8. Kategori 7 — Tarih, para, i18n, doğrulayıcılar

| Aday | Son yayın | Lisans | gz | Karar |
|---|---|---|---|---|
| **date-fns 4.4.0** (+`@date-fns/tz` 1.5.0 RDP ister) | 2026-05-29 (5.0.0-alpha.0 aynı gün) | MIT | 11,8 KB (10 fonksiyon + tr/ru/en) | **Kazanan** — react-day-picker zaten bağımlı; ikinci bir tarih kütüphanesi eklenmez. ≈85 M/hafta. v5 alfa → 4.4.0'a sabitle |
| dayjs 1.11.23 | 2026-08-17 | MIT | 6,3 KB | 1 352 açık issue, 2.0 alfa 2022'den beri → ret (ikinci kütüphane olur) |
| luxon 3.7.2 | 2025-09-05 | MIT | 21,5 KB | gereksiz |
| temporal-polyfill 1.0.5 | 2026-09-11 | MIT | 20,1 KB | Electron 37'de yerli Temporal yok; bugün gereksiz → ikinci (gelecek) |
| **Kendi `LocalDate`** (`shared/domain`) | — | — | ~1 KB | `YYYY-MM-DD` ↔ gün sayısı (UTC tabanlı tam sayı aritmetiği), `nightsOf`, hafta günü; saat dilimi yok (CLAUDE.md) |
| **Kendi `Money`** (`shared/money.ts`) | — | — | ~2 KB | `amount_minor` tam sayı; kur çarpımı **BigInt** + yarıya‑çifte yuvarlama; `allocate` (en büyük kalan) |
| dinero.js 2.0.2 | **2.0.0 kararlı = 2026-03-02** | MIT | 2,1 KB | Artık alfa değil; ama `number` tabanlı ve bizim tek‑modül kuralımız (G-131) gereği **yalnız test kahini** (devDependency) olarak düşünülebilir |
| currency.js 2.0.4 | **2021-05** | MIT | — | float tabanlı, durgun → ret |
| big.js 7.0.1 / decimal.js 10.6.0 | 2025 | MIT | 2,9 KB | BigInt yeterli → gereksiz |
| **i18next 26.4.2 + react-i18next 17.0.15** | 2026-09 | MIT | 19,0 KB | **Kazanan** (ayrıntı `i18n-rtl-mobil.md`) |
| **i18next-cli 1.74.4** (dev) | 2026-10-01 | MIT | — | i18next-parser 9.4.0 **kullanımdan kaldırıldı** ("use i18next-cli instead") |
| **eslint-plugin-i18next 6.1.5** (dev) | 2026-06-28 | ISC | — | `no-literal-string` (G-08) |
| **date-holidays 3.37.0** | 2026-09-20 | ISC + **CC‑BY‑3.0** (veri, "Hakkında"da atıf) | **229,8 KB** (tüm ülkeler) | **Kazanan, yalnız ana süreç** (`calendar_days` üretimi); `date-holidays-parser` → `moment-timezone`, `astronomia`, `lodash` çeker. Hicri tablo 1970–2080 (bkz. `acik-apiler.md` testi) |
| **libphonenumber-js 1.13.14** | 2026-09-24 | MIT | 28,7 KB (`/min`) | **Kazanan** (§5) |
| **ibantools 4.5.4** | 2026-04-10 | MIT veya MPL‑2.0 | 3,8 KB | **Kazanan** — TR IBAN 26 hane, mod‑97, `friendlyFormatIBAN` |
| TC Kimlik: `tckimlik` 0.0.2, `turkish-id-validator` 1.0.3 | 2020 / 2025 | ISC | — | **Ret: `soap` bağımlılığıyla NVİ'ye çevrimiçi sorgu** (G-01). Kendi `isValidTckn()` (11 hane, ilk ≠ 0, 10. ve 11. hane kontrol formülü) + Excel'den doğrulanmış test örnekleri |

---

## 9. Kategori 8 — Durum ve veri, komut paleti, bildirim, sürükle‑bırak

| Aday | ★ / açık | Son yayın | Lisans | gz | Karar |
|---|---|---|---|---|---|
| **@tanstack/react-query 5.104.0** | 50 388 / 185 | 2026-09-26 | MIT | 10,2 KB | **Kazanan**; v4 hâlâ `previous` etiketiyle yamalanıyor (4.44.0, 2026-04) → v5 uzun ömürlü |
| **zustand 5.0.15** | 58 780 / 7 | 2026-08-13 | MIT | 0,4 KB | **Kazanan** (UI durumu: seçili gün, panel açık mı, takvim yakınlaştırma). ≈40–54 M/hafta |
| jotai 3.0.1 | 21 289 / 1 | **2026-09-29 (yeni ana sürüm)** | MIT | 3,2 KB | Kibo gantt/table Jotai 2 ister; vendor ederken zustand/context'e çevir → ret |
| **cmdk 1.1.1** | 12 999 / 77 (depo `dip/cmdk`) | **2025-03-14** | MIT | 17,0 KB | **Kazanan** (shadcn `Command`, Radix tabanında tek seçenek); push 2025-06…2026-04; yavaş ama kararlı |
| **sonner 2.0.8** | 13 022 / 78 | 2026-08-09 | MIT | 9,5 KB | **Kazanan** (shadcn Radix toast'u) |
| vaul 1.1.2 | — | 2024-12 | MIT | — | **Ret: README "This repo is unmaintained"**; telefonda `Sheet side="bottom"` |
| **@dnd-kit/core 6.3.1** (+sortable 10.0.0, modifiers 9.0.0, utilities 3.2.2) | 17 684 / 131 | **2024-12-05** (repo aktif; yeni nesil @dnd-kit/react 0.5.0) | MIT | 12,3 KB | **Kazanan**: shadcn dashboard-01, Kibo kanban/gantt, Origin event-calendar hepsi bunu kullanıyor → vendor kod tutarlı; klavye sensörü + ekran okuyucu duyuruları; dokunmatik destek. v6 donmuş = dondurulmuş ürün için sorun değil |
| @dnd-kit/react 0.5.0 | — | 2026-06-11 (+beta 2026-09) | MIT | 32,6 KB | 0.x → ret |
| @atlaskit/pragmatic-drag-and-drop 4.0.0 | 12 780 / 103 | 2026-09-24 | Apache‑2.0 | 6,8 KB | **İkinci**: hafif, Atlassian bakımlı; ama HTML5 DnD tabanlı (ızgaraya yapışan önizleme yok, dokunmatik zayıf) |
| react-resizable-panels 4.14.1 | — | 2026-09-27 | MIT | — | shadcn `Resizable` (takvim/park paneli) |

---

## 10. Kategori 9 — Electron tarafı yardımcılar

| Aday | ★ / açık | Son yayın | Lisans | Karar |
|---|---|---|---|---|
| **electron-log 5.4.4** | 1 475 / 2 | 2026-05-14 (push ≥ 2026-08) | MIT, **0 bağımlılık** | **Kazanan** — dosya döndürme (`maxSize`), `errorHandler.startCatching`, renderer → IPC aktarımı. ≈1,4 M/hafta |
| electron-store 11.0.2 (`conf` 15.1.0) | 5 022 / 0 | 2025-10-05 | MIT | **İkinci**. Yalnız ESM, Electron ≥30, `conf` → ajv, ajv-formats, atomically, dot-prop, env-paths, semver… (9 bağımlılık) |
| **Kendi `device-config.json`** | — | — | — | **Kazanan**: ayarlar zaten SQLite `settings`'te; yalnızca DB'si olmayan **istemci modu** için (sunucu adresi, cihaz belirteci, pencere konumu) zod şemalı JSON + `writeFile(tmp)` + `rename` (~40 satır) |
| electron-window-state 5.0.3 | 679 / 39 | **2018-11-25** | MIT | **Ret (bağımlılık olarak)** → kaynağı vendor edilip modernleştirilir (`screen.getAllDisplays()` ile ekran dışı kontrolü, `jsonfile`/`mkdirp` yerine `node:fs`) |
| **bonjour-service 1.4.4** | 116 / 30 (fork, tek bakımcı) | 2026-07-28 | MIT | **Kazanan** — saf JS mDNS; webpack-dev-server bağımlılığı olduğu için ≈13 M/hafta. Her zaman elle "IP:port" yedeği |
| **hono 4.13.12 + @hono/node-server 2.1.3 + @hono/zod-validator 0.9.1** | 32 400 / 408 | 2026-09-30 | MIT | **Kazanan** (sunucu modu; ayrıntı `fx-uzaktan-erisim.md`). node-server Node ≥20 (Electron 37 = Node 22 ✓) |
| electron-trpc 0.7.1 | 402 / 12 | **2024-12-07** (tRPC v10 hedefli; tRPC 11) | MIT | **Ret**; çatallar (`trpc-electron` 0.1.2 2025-01, `electron-trpc-experimental` 1.0.0-alpha.1) küçük |
| **Elle yazılmış zod kontratı** | — | — | — | **Kazanan**: `shared/contract.ts` = `{ ad: { input, output, permission } }`; iki adaptör: `ipcMain.handle` ve Hono rotası; istemci `transport/ipc.ts` ↔ `transport/http.ts` aynı arayüz (mimari §2 ile aynı) |
| @electron-toolkit/preload 3.0.2 / utils 4.0.0 / typed-ipc 1.0.2 | 215 / 8 | 2025-02…04 / 2024-11 | MIT | Gereksiz (her biri 10–20 satır; inline yazılır). electron-vite şablonu kullanırsa kalabilir — zararsız |
| electron-vite 5.0.0 | 5 619 / 76 | 2025-12-07 | MIT | **Uyarı:** peer `vite ^5–^7`; Vite 8 için 6.0.0-beta.5 → `masaustu-yigin.md` kararı (Vite 7.3.x sabitle) geçerli |

---

## 11. Seçilen kütüphaneler (kesin sürümler, `save-exact`)

> Renderer = Electron penceresi **ve** telefon tarayıcısı. Main = yalnız ana süreç (telefona gitmez).

| Paket | Sürüm | Lisans | Nerede | Neden | Risk | Alternatif |
|---|---|---|---|---|---|---|
| `@tanstack/react-table` | 9.2.4 | MIT | renderer | Headless; shadcn/diceui v9'da; modüler (~15 KB) | v9 2 aylık; React Compiler hataları açık (#6577) → Compiler kapalı | react-data-grid 7.0.0-beta.61 |
| `@tanstack/react-virtual` | 3.14.13 | MIT | renderer | Tape chart yatay sanallaştırma + uzun listeler; 7,6 KB | düşük | react-window 2.3.3 |
| `@tanstack/react-query` | 5.104.0 | MIT | renderer | Sunucu durumu (IPC/HTTP aynı) | düşük | — |
| `zustand` | 5.0.15 | MIT | renderer | Küçük UI durumu | düşük | React context |
| `react-hook-form` | 7.89.0 | MIT | renderer | 0 bağımlılık, en olgun, shadcn `Field` kalıbı | v8 betada → v7'de kal | `@tanstack/react-form` 1.33.5 |
| `@hookform/resolvers` | 5.9.1 | MIT | renderer | zod 4 köprüsü | düşük | — |
| `zod` | 4.6.5 | MIT | shared | Kontrat + form tek şema | `import * as z` zorunlu (ESLint) | `zod/mini` |
| `react-number-format` | 5.4.5 | MIT | renderer | Para girişi, TR ayırıcılar, imleç yönetimi | 229 açık issue, yavaş bakım; `floatValue` kullanılmaz | kendi `MoneyInput` |
| `libphonenumber-js` | 1.13.14 | MIT | shared | E.164 normalizasyon, `AsYouType` | metadata güncellemesi durur (dondurulmuş ürün kabul) | react-phone-number-input 3.4.18 (+`flags`) |
| `ibantools` | 4.5.4 | MIT / MPL‑2.0 | shared | IBAN doğrulama/biçim | düşük | kendi mod‑97 |
| `react-day-picker` | **9.14.0 (sabit)** | MIT | renderer | shadcn Calendar | v10 shadcn'i kırar; slot remount hatası → bileşenleri modül düzeyine taşı | RAC DateField |
| `date-fns` | 4.4.0 | MIT | shared/renderer | RDP bağımlılığı; tek tarih kütüphanesi | v5 alfa | — |
| `recharts` | 3.10.1 | MIT | renderer (tembel) | shadcn Chart, 77 örnek | ~104–123 KB gz | `echarts` 6.1.0 |
| `i18next` / `react-i18next` | 26.4.2 / 17.0.15 | MIT | renderer + main | 4 dil, ICU dışı çoğul | düşük | — |
| `i18next-cli` (dev) | 1.74.4 | MIT | araç | çıkarım/durum/tipler | çok sık sürüm (304/yıl) → sabitle | — |
| `eslint-plugin-i18next` (dev) | 6.1.5 | ISC | araç | G-08 | düşük | — |
| `date-holidays` | 3.37.0 | ISC + CC‑BY‑3.0 | main | Kural tabanlı sınırsız yıl bayram üretimi | Hicri tablo 2080'e kadar; moment-timezone ağırlığı (main'de sorun değil) | kendi Hicri tablo |
| `cmdk` | 1.1.1 | MIT | renderer | shadcn Command (Ctrl+K) | yavaş bakım | Base UI Combobox (taban değişirse) |
| `sonner` | 2.0.8 | MIT | renderer | shadcn toast | düşük | Radix Toast |
| `@dnd-kit/core` / `sortable` / `modifiers` / `utilities` | 6.3.1 / 10.0.0 / 9.0.0 / 3.2.2 | MIT | renderer | shadcn/Kibo/Origin vendor kodu ile aynı; snap modifier; dokunmatik | v6 donmuş (yeni nesil 0.x) | `@atlaskit/pragmatic-drag-and-drop` 4.0.0 |
| `react-resizable-panels` | 4.14.1 | MIT | renderer | shadcn Resizable | düşük | — |
| `react-colorful` | 5.8.1 | MIT | renderer | Durum etiketi renkleri (G-33) | düşük | `<input type="color">` |
| `qrcode.react` | 4.2.0 | ISC | renderer | SVG QR, 0 bağımlılık | 2024 yayını (standart donmuş) | `lean-qr` 2.7.4 |
| `papaparse` | 5.7.0 | MIT | shared | CSV oku/yaz, ayırıcı tespiti | düşük | `csv-parse` 7.0.3 / `csv-stringify` 6.9.0 |
| `exceljs` | 4.4.0 | MIT | **main** | KBS + Sheets xlsx okuma, stilli rapor yazma | **bakımsız** (2023); `uuid` uyarısı → `overrides`; UTC tarih tuzağı | read-excel-file 9.3.10 + write-excel-file 4.1.1 |
| `electron-log` | 5.4.4 | MIT | main | Destek günlükleri | düşük | — |
| `bonjour-service` | 1.4.4 | MIT | main | LAN keşfi | tek bakımcı, fork | elle IP |
| `hono` / `@hono/node-server` / `@hono/zod-validator` | 4.13.12 / 2.1.3 / 0.9.1 | MIT | main | Sunucu modu, aynı kontrat | düşük | Fastify 5 |
| **Yerleşik (bağımlılık yok)** | — | — | — | `printToPDF`, `nativeImage`, canvas, `Intl.*` (Number/DateTime/DisplayNames/Collator/PluralRules), `node:crypto` | — | pdfmake, pica |
| **Kendi modüllerimiz** | — | — | shared/main | `Money`, `LocalDate`, `isValidTckn`, `PhoneInput`, `device-config`, `window-state`, zod IPC kontratı | test zorunlu | dinero.js 2.0.2 (test kahini) |

**Bilerek eklenmeyenler:** vaul, nuqs (TanStack Router `validateSearch` ile değiştirilir; zahmetsiz yol istenirse `nuqs` 2.10.1 `adapters/tanstack-router`), jotai, dayjs/luxon, csv-stringify (papaparse yeter), qrcode, pdfmake, electron-store, @electron-toolkit/*.

Ölçülen toplam (renderer çekirdeği, React+radix+router+query+table+virtual+RHF+zod+i18next+date-fns+RDP+cmdk+sonner+dnd-kit+number-format+libphonenumber+qrcode.react+zustand): **1 037 KB min / 312 KB gz**; + Recharts rotası 127 KB gz; + içe aktarma ızgarası (diceui data-grid) ayrı rota.

---

## 12. Kodundan yararlanılacak depolar (vendor)

| Depo | Alınacak dosyalar / desenler | Uyarlama | Lisans yükümlülüğü |
|---|---|---|---|
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) `apps/v4/registry/new-york-v4` | Tüm `ui/*` (CLI ile, Radix), bloklar **sidebar-07**, **dashboard-01** (section-cards, chart-area-interactive), calendar blokları, chart örnekleri | `npx shadcn eject`; `calendar.tsx`'te satır içi slot bileşenlerini modül düzeyine taşı (#11134/#11635) | MIT — telif + lisans metni `THIRD_PARTY_NOTICES.md` |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | `components/layout/*` (authenticated-layout, app-sidebar, nav-group, header), `command-menu`/search, theme-switch, `features/errors/*` (401/403/404/500/503), settings düzen iskeleti, `confirm-dialog`, `password-input`, `long-text`, data-table toolbar/pagination/view-options/faceted-filter | Clerk, axios, faker, react-top-loading-bar çıkar; tablo parçalarını **v9 API**'sine çevir; RTL değişikliklerini shadcn yerli RTL ile değiştir | MIT — telif + lisans metni |
| [sadmann7/diceui](https://github.com/sadmann7/diceui) `docs/registry/bases/radix/**` | **data-table** (filter-list, filter-menu, sort-list, action-bar, `lib/data-table-features`), **data-grid** (`hooks/use-data-grid.ts`, `components/data-grid/*`, `use-data-grid-undo-redo`), **mask-input**, **time-picker**, **file-upload**, **stat**, `compose-refs`, `visually-hidden-input` | nuqs → TanStack Router search; `IconPlaceholder` → lucide; metinler `t()`; data-grid yalnız içe aktarma rotasında | MIT — telif + lisans metni |
| [sadmann7/tablecn](https://github.com/sadmann7/tablecn) | `src/app/lib/filter-columns.ts` (filtre durumu → Drizzle `and/or` koşulları), sunucu taraflı sayfalama sorgu kalıbı | Postgres `ilike` → SQLite `LIKE` + `*_normalized`; tarih karşılaştırmaları `TEXT YYYY-MM-DD` | MIT |
| [shadcnblocks/kibo](https://github.com/shadcnblocks/kibo) | `packages/gantt/index.tsx`: şerit paketleme algoritması, yapışkan kenar çubuğu/başlık bantları (ay/gün), "bugün" işaretçisi, sürükle/uzat yardımcıları; `packages/contribution-graph` (yıllık doluluk ısı haritası); `packages/color-picker` | Jotai → zustand/context; `Date` → `LocalDate`; sanallaştırma bizde | MIT ("Copyright (c) 2023 — Present shadcnblocks") |
| [TanStack/table](https://github.com/TanStack/table) `examples/react` | `virtualized-columns` (sabit + sanallaştırılmış sütun, `virtualPaddingLeft/Right`), `virtualized-rows`, gerekirse `spreadsheet/SpreadsheetGrid.tsx` (aralık seçimi, doldurma, bağlam menüsü) | — | MIT |
| [TanStack/virtual](https://github.com/TanStack/virtual) `examples/react` | `fixed`, `variable`, `padding` (yatay mod, `scrollToIndex`) | — | MIT |
| [cosscom/coss](https://github.com/cosscom/coss) **yalnız `apps/origin/`** | `registry/default/components/event-calendar/*` (ay/hafta/ajanda — takvim notları, bakım takvimi, Faz 9), `ui/datefield-rac.tsx` (RAC seçilirse) | `@remixicon/react` → lucide | `apps/origin` MIT; **başka dizinlerden kopyalama (AGPLv3)** |
| [tremorlabs/tremor](https://github.com/tremorlabs/tremor) | Grafiksiz bileşenler: `Tracker` (günlük doluluk şeridi), `CategoryBar`, `BarList`, `ProgressCircle` | `tailwind-variants` → cva; Recharts 2 kodunu alma | **Apache‑2.0**: lisans metni + değiştirildiğine dair not; NOTICE varsa korunur |
| [jnsahaj/tweakcn](https://github.com/jnsahaj/tweakcn) | `utils/theme-presets.ts`, `utils/apply-theme.ts`, `color-converter.ts`, `contrast-checker.ts` (önceki tur) | seçilmiş ~8 preset | **Apache‑2.0** (aynı) |
| [omeralpi/shadcn-phone-input](https://github.com/omeralpi/shadcn-phone-input) | Command tabanlı ülke seçici + giriş kompozisyonu | react-phone-number-input yerine libphonenumber-js `AsYouType`; bayraksız; `Intl.DisplayNames` | MIT |
| [mawie81/electron-window-state](https://github.com/mawie81/electron-window-state) | ~150 satırlık durum kaydet/geri yükle mantığı | `node:fs`, ekran dışı kontrolü, TS | MIT |
| [johnpolacek/date-range-picker-for-shadcn](https://github.com/johnpolacek/date-range-picker-for-shadcn) | Rapor tarih aralığı ön ayarları (bugün, son 7/30 gün, bu ay…) | RDP 9.14 API'si | MIT |

Tek bir `THIRD_PARTY_NOTICES.md` (uygulama içi "Hakkında → Lisanslar" ekranından da açılır) tüm MIT/Apache/ISC/OFL/CC‑BY (date-holidays verisi) atıflarını taşır; Apache kopyalarında dosya başına "değiştirildi" yorumu.

---

## 13. Reddedilenler

| Aday | Kategori | Gerekçe |
|---|---|---|
| Planby 2.1.0 | tape chart | Özel lisans: "dağıtamazsınız" → kurulum paketine konamaz |
| gantt-schedule-timeline-calendar 3.43.14 | tape chart | Özel lisans, kod değişikliği yasak |
| FullCalendar resource-timeline, Schedule‑X resource scheduler, Bryntum, Syncfusion, MUI X timeline | tape chart | Ücretli/ticari lisans |
| dhtmlx-scheduler (GPL), DHTMLX Gantt v10 (kaynak görünümü PRO), SVAR Gantt (kaynak PRO), frappe-gantt | tape chart | GPL veya görev‑Gantt'ı; oda × gün modeli yok |
| @toast-ui/calendar | tape chart | **Arşivlendi** (son yayın 2022-08) |
| @aldabil/react-scheduler, react-big-schedule | tape chart | MUI / antd — ikinci tasarım sistemi |
| @bitnoi.se/react-scheduler, gantt-task-react, @wamra/gantt-task-react | tape chart | Bakımsız / MUI |
| react-big-calendar | tape chart | Yatay kaynak zaman çizelgesi yok; moment/globalize/luxon bağımlılıkları |
| react-calendar-timeline 0.30 beta | tape chart | Yalnız beta'da React 19; sanallaştırma yok; lodash+interactjs (yedek değil, 3. sıra) |
| DayPilot Lite 6.0.0 | tape chart | Apache‑2.0 ama yalnız minified kod, public depo/issue yok, `create-react-class` (acil durum yedeği olarak not edildi) |
| AG Grid Community | ızgara | 320 KB gz; Excel tarzı aralık seçimi/kopyala‑yapıştır Enterprise |
| Glide Data Grid | ızgara | React ≤18 peer, 2024'ten beri kararlı sürüm yok, canvas |
| Handsontable | ızgara | Ticari lisans |
| react-datasheet-grid, @silevis/reactgrid, jspreadsheet CE, RevoGrid | ızgara | Durgun / React 19 peer yok / ikinci bileşen modeli |
| @tremor/react, Tremor Raw (bütün olarak) | grafik/panel | React 18 + Recharts 2 + RDP 8 |
| @nivo/* | grafik | 2025-05'ten beri yayın yok, hâlâ 0.x |
| chart.js / react-chartjs-2 | grafik | canvas, shadcn temasıyla tutarsız |
| npm `xlsx` 0.18.5 | Excel | Yüksek: prototype pollution + ReDoS; 2022 |
| xlsx-populate | Excel | 2020'den beri yayın yok |
| pdfmake, @react-pdf/renderer | PDF | 443–811 KB gz; Arapça şekillendirme/RTL yok |
| sharp | görsel | Yerel modül, platforma özel ikili |
| react-international-phone | telefon | Bayraklar cdnjs'ten (G-01/G-07) |
| tckimlik, turkish-id-validator | doğrulama | `soap` ile çevrimiçi NVİ sorgusu |
| currency.js | para | float tabanlı, 2021 |
| dayjs, luxon, @js-temporal/polyfill | tarih | İkinci tarih kütüphanesi; js-temporal 2025-03'ten beri durgun |
| vaul | UI | Bakımsız (README) |
| @dnd-kit/react 0.5 | DnD | 0.x |
| jotai | durum | Gereksiz; v3 yeni ana sürüm |
| electron-trpc (+çatallar) | IPC | 2024-12, tRPC v10; çatallar küçük |
| electron-window-state (bağımlılık olarak) | Electron | 2018; kodu vendor edilir |
| magicui, Aceternity, shadcnblocks Pro | UI | Pazarlama/ücretli |
| Kiranism dashboard (kod olarak) | UI | Next.js + Clerk; yalnız fikir |

---

## 14. Faz 0'da doğrulanacaklar (prototip kontrol listesi)

1. Tape chart prototipi: 20 oda × 4 400 gün, `@tanstack/react-virtual` yatay; Electron 37 (Chromium 138) ve iPhone Safari'de 60 fps kaydırma; klavye gezinme; sürükle‑taşı (dnd-kit snap). Başarısızsa aynı veriyle `react-data-grid` colSpan denemesi.
2. TanStack Table v9 + diceui data-table: React Compiler **kapalı** iken filtre/sıralama/seçim; `"use no memo"` gereksinimi.
3. KBS gerçek dosyası (Eylül 2026) exceljs ile: 607 satır, 23 ülke, 838 geceleme; tarih hücreleri UTC dönüşümü testi; `uuid` override sonrası `npm ls` temiz.
4. Google Sheets → xlsx ve CSV dışa aktarımı (TR yerel ayarı) → papaparse/exceljs ile içe aktarma önizlemesi (diceui data-grid TSV yapıştırma).
5. zod `import * as z` ESLint kuralı (`no-restricted-imports` ile `{ z }` yasak) ve Vite 7 (Rollup) çıktısında gerçek boyut.
6. `printToPDF` ile Türkçe + Arapça rapor (Noto Sans Arabic paket içi).
7. Telefon istemcisi: renderer ilk yükleme ≤ ~350 KB gz (rapor ve içe aktarma rotaları tembel).
8. CSP: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (Radix/Recharts/sanallaştırma), `img-src 'self' data: blob:`, gerekirse `worker-src blob:` (pica seçilirse).

---

## 15. Kaynaklar

- npm registry (bu oturum, 2026-10-01): yukarıdaki tüm paketlerin `time`, `dist-tags`, `license`, `dependencies`, `peerDependencies`, `deprecated`, README (react-data-grid, DayPilot Lite, electron-store, electron-log, read-excel-file CHANGELOG, vaul).
- GitHub arama API'si (MCP): yıldız, açık issue, arşiv, `pushed:` aralıkları; issue aramaları: TanStack/table #6577, #6524, #6601; shadcn-ui/ui #10933, #11012, #11134, #11602, #11635.
- Ham dosyalar: `shadcnblocks/kibo` (`license.md`, `packages/gantt/index.tsx`, `packages/*/package.json`), `sadmann7/diceui` (`LICENSE`, `docs/content/docs/changelog/2026-09-data-table.mdx`, `components/radix/data-grid.mdx`, `phone-input.tsx`, `docs/package.json`), `sadmann7/tablecn` (`package.json`, `README.md`, `src/app/lib/filter-columns.ts`), `satnaing/shadcn-admin` (`package.json`, `README.md`, `LICENSE`), `tremorlabs/tremor` (`LICENSE`, `package.json`), `cosscom/coss` (`LICENSE`, `README.md` lisans bölümü, `apps/origin/public/r/comp-542.json`, `datefield-rac.json`), `karolkozer/planby` (`LICENSE`), `neuronetio/gantt-schedule-timeline-calendar` (`LICENSE`), `DHTMLX/gantt` (`README.md`), `svar-widgets/react-gantt` (`readme.md`, `license.txt`), `TanStack/table` (`docs/overview.md`, `docs/config.json`, `examples/react/{spreadsheet,virtualized-columns*}`), `shadcn-ui/ui` (`apps/v4/package.json`), `emilkowalski/vaul` (`README.md`), `lramos33/big-calendar`, `omeralpi/shadcn-phone-input` (`package.json`, `LICENSE.md`).
- Yerel ölçümler: esbuild paket boyutları (`scratchpad/repo-ui/bundle/measure.mjs`), sentetik KBS xlsx (`scratchpad/repo-ui/audit/mk-kbs.cjs`, `parse.mjs`, `parse2.mjs`), `npm audit`.
- Web araması (indirme sayıları ve doğrulama): npmtrends/socket/snyk özetleri (≈ değerler); Chrome 144 Temporal (blink-dev "Intent to Ship: Temporal", caniuse); AG Grid "Community vs Enterprise" ve "Clipboard" belgeleri; react-pdf RTL issue'ları #1571/#2638/#3007; Kibo UI → Shadcnblocks satın alma duyurusu; SheetJS 0.20.3 sürüm tarihi (git.sheetjs.com CHANGELOG).
