# 01 — Mimari ve kod haritası

> Hazırlayan: Fable (2026-11-12). Amaç: bu konuşmayı görmemiş bir modelin (Opus) kodda hızlı yol bulması.
> Sayımlar `grep`/`wc` ile alındı; ± birkaç sapma olabilir. Satır numaraları 2026-11-12 tarihli koda aittir.
> Kaynak ölçek: `src/` altında ~179.000 satır TypeScript/TSX; 73 tablo; ~326 API yordamı; 56 birim test dosyası
> `tests/unit/` + ~30 servis testi `src/` içinde; 31 masaüstü + 21 telefon e2e dosyası; i18n 5.534 anahtar (tr = en; ru 5.922).

## 1. Katmanlar (tek kontrat, iki taşıma)

```
React (src/renderer)  ──►  lib/transport  ──►  IPC (preload → ipc/handle.ts)        ─┐
                                           └─►  HTTP (server/host-app.ts, Hono)     ─┴─► api/app.ts (zod in/out)
                                                                                         └─► api/handlers(.ts|/<modül>.ts)
                                                                                              └─► services/<modül>-service.ts  (yetki + transaction + audit)
                                                                                                   └─► db/client.ts (better-sqlite3 + Drizzle, WAL)
```

| Katman | Giriş dosyası | Not |
|---|---|---|
| Renderer | `src/renderer/main.tsx` → `app.tsx` → `router.tsx` (hash history, 34 route) | Kök düzen `layouts/root-layout.tsx`; koruma `layouts/route-guard.tsx`, `auth-gate.tsx` |
| Transport | `src/renderer/lib/transport/index.ts:36` | `window.bismuth` varsa IPC (`ipc.ts`), yoksa HTTP (`http.ts`). Veri kancaları `lib/api/hooks.ts` |
| Preload | `src/preload/index.ts` | Yalnız iki kanal: `bismuth:api`, `bismuth:ready` (`shared/contract/channels.ts`) |
| IPC girişi | `src/main/ipc/register.ts` → `ipc/handle.ts` | Gönderen URL denetimi; zarf `serializedRequestSchema`; aynı Hono uygulamasına `Request` üretir |
| HTTP girişi (sunucu modu) | `src/main/server/host-app.ts` (402 satır) | Host adı, hız sınırı, POST+JSON+Origin, oturum çerezi (`http-sessions.ts`), statik + CSP. Dinleyici `listen.ts`, duyuru `discovery/` |
| İstemci modu | `src/main/server/client-app.ts`, `host-link.ts` | Yerel DB açmaz (G-140/141) |
| Router | `src/main/api/app.ts` | Yordam → erişim sınıfı (`public/setup/user/locked`) → zod girdi → handler → zod çıktı |
| Handler'lar | `src/main/api/handlers.ts` (çekirdek) + `api/handlers/<modül>.ts` (18 modül) | `Handlers` tipi eksik yordamda typecheck'i düşürür |
| Servisler | `src/main/services/index.ts:90 createServices` | Her servis `ServiceDeps` (`kit.ts`): `requirePermission`, `parseInput`, `inTransaction`, `writeRefusal` |
| DB | `src/main/db/client.ts openDatabase` | WAL, `synchronous=FULL`, FK on, busy 5 s; migrasyon `drizzle/` |
| Paylaşılan | `src/shared/` | `contract/` (zod sözleşme), `domain/` (saf iş kuralları), `money.ts`, `date.ts`, `permissions.ts` |

Tesisat: `src/main/index.ts` (546 satır; başlangıç sırası: veri dizini, tek örnek, güvenlik, pencere, DB, IPC);
`src/main/server/electron-wiring.ts` (sunucu/istemci modu kurulumu).

## 2. Sözleşme (`src/shared/contract`)

`contract = { ...core, ...MODULE_PROCEDURES }` (`index.ts:169`). Erişim sınıfı `proc(input, output, access)`.
**Yetki sözleşmede değil, servis katmanında** (G-23).

| Modül dosyası (`procedures/`) | Yordam | Örnek | Handler | Servis |
|---|---|---|---|---|
| reservations.ts | 7 | `reservations.grid`, `calendar.bounds`, `reservations.freeRooms` | handlers/reservations.ts | `services/calendar/grid.ts`, reservations-service |
| booking.ts | 27 | `booking.get`, `booking.availability`, `booking.checkIn`, `booking.checkOut`, `booking.cancel`, `booking.park` | handlers/booking.ts | reservations-service (1.784 satır), reservation-view, payments-service |
| guests.ts | 18 | `guests.list`, `guests.card`, `guests.history`, `guests.merge` | | guests-service (1.593) |
| ledger.ts | 25 | `ledger.day`, `ledger.month`, `ledger.handover` | | ledger-service (1.184), expenses-service |
| staff.ts | 24 | `staff.employees`, `staff.payroll` | | staff-service (1.416) |
| housekeeping.ts | 15 | `housekeeping.board`, `setStatus` | | housekeeping-service, room-issues-service |
| operations.ts | 23 | `tasks.*`, `shift.*`, `notes.*` | | tasks-service (1.505), shift-service |
| today.ts | 10 | `inHouse.list`, `inHouse.markKbs`, `today.summary` | | occupants-service |
| reports.ts | 12 | `reports.summary`, `reports.monthly` | | reports/reports-service, queries |
| tourism.ts | 11 | `tourism.import`, `tourism.table`, `tourism.compare` | | tourism-stats-service |
| external.ts | 9 | `fx.overview`, `fx.refresh`, `weather.*`, `holidays.verify` | | external-service, currency-service |
| contacts.ts / supply.ts | 15 / 24 | rehber, tedarik, çamaşırhane | | contacts-, supply-, laundry-service |
| backup.ts | 18 | `backup.run`, `backup.verify`, `restore.*`, `export.*` | | backup-service (1.121), data-export/import |
| remote.ts | 25 | `remote.hostStatus`, `remote.setMode`, `devices.*` | | server/*, replica/* |
| rooms.ts / users.ts / system.ts | 2 / 1 / 1 | kapasite geçmişi, rol seçimi, hata raporu | | rooms-service, users-service, diagnostics |
| **Çekirdek** (`contract/index.ts`) | ~59 | `app.getInfo`, `auth.*`, `settings.*`, `setup.*`, `users.*`, `roles.*`, `rooms.*`, `lists.*`, `shifts.*`, `calendar.days`, `audit.list`, `statusTags.*` | handlers.ts | auth-service (1.124), setup-service, settings-service, users-service, rooms-service, lists-service, calendar-service, status-tags-service |

Yeni modül eklerken: `procedures/<modül>.ts` + `api/handlers/<modül>.ts` + `services/<modül>-service.ts` + `procedures/index.ts`
ve `handlers/index.ts` kayıt satırları (ana oturum birleştirir; paketler bu iki dosyaya dokunmaz, YURUTME.md).

## 3. Veri modeli (73 tablo, migrasyon 0000–0018)

| Alan | Tablolar | Kilit noktalar |
|---|---|---|
| Ayar ve kimlik | `settings` (key/value_json), `user_preferences`, `roles`, `role_permissions`, `users`, `devices`, `sessions`, `recovery_codes`, `audit_log` (append-only; 0003/0004 tetikleyiciler) | **Otel bilgisi `settings` anahtarlarında** (`hotel.name/city/country/timezone/currencies/baseCurrency/checkinTime/checkoutTime/email`); `hotel` tablosu ve `hotel_id` sütunu **yok** |
| Odalar | `room_types`, `rooms`, `room_capacity_changes` (K-27), `room_blocks`, `room_issues`, `attachments` | Kapasite zaman serisi; bloklar ızgarada |
| Rezervasyon | `sales_channels`, `payment_methods`, `extra_services`, `reservations` (status, kind, parked_*, cancelled_at), `reservation_rooms` (= oda konaklaması; check_in/out, checked_in_at/out_at, status, released_at), `room_nights` (date, slot night/day, price_minor, currency; `UNIQUE(room_id,date,slot)`), `reservation_notes`, `stay_occupants` (KBS alanları), `folios`, `charges`, `payments` (kind, voided_at, reversal_of_id, handover_id), `reservation_code_sequences` | Ayrı `stays` tablosu yok; konaklama = `reservation_rooms` + `room_nights`. Para tam sayı kuruş + currency; iptal = `voided_at`/durum |
| Kasa | `business_days`, `cash_handovers`, `expense_sections`, `expenses`, `expense_items` | "x" teslimi `payments.handover_id` |
| Misafir | `guests`, `companies`, `blacklist`, `status_tags`, `reservation_tags`, `guest_tags`, `guest_tag_links` | Ad eşleştirme yok; birleştirme (G-51) |
| Personel | `employees`, `employment_periods`, `employee_salaries`, `pay_policies` (scope hotel/employee), `leave_records`, `work_records`, `staff_transactions`, `salary_periods` | |
| Tedarik | `contacts`, `product_categories`, `products`, `laundry_*` (4) | |
| Operasyon | `calendar_days`, `calendar_generation`, `shift_definitions`, `shift_handovers`, `task_templates`, `tasks`, `notes`, `lost_items`, `notifications` | |
| Dış veri / yedek | `fx_rates`, `kbs_imports`, `kbs_stay_rows`, `country_map`, `backups`, `import_batches`, `import_rows` | |
| Çoğaltma | `change_log`, `replica_grants` (0013) | Mac salt-okunur kopya, devralma (epoch) |

Migrasyonlar: 0000 init · 0001 domain (58 tablo) · 0002 fx/roles/indexes · 0003–0004 audit append-only · 0005–0006 roles ·
0007 user_preferences · 0008 kbs_reported · 0009 housekeeping · 0010 roles remote · 0011 reservation release (park) ·
0012 employment_periods · 0013 change_log · 0014 report fixes · 0015 import_batches · 0016 remote security · 0017 guest_tags ·
0018 capacity cancel. **Sonraki numara: 0019.** Kural: commit edilmiş migrasyon değişmez (G-133); `npm run db:generate -- --name <ad>`.

## 4. Renderer

- **Özellik klasörleri** (`src/renderer/features/`, 30): calendar (31 dosya; `calendar-page.tsx`, `calendar-grid.tsx`,
  `reservation-panel.tsx`, `new-reservation-dialog.tsx`, `stay-dialogs.tsx`, `park-area.tsx`, `payment-dialog.tsx`,
  `guest-summary-card.tsx`), today, in-house, tasks, shift, rooms, guests (15), blacklist, companies, lost-items, ledger (14),
  month-end, currency, issues, maintenance, supply, laundry, contacts, staff (13), reports (23), tourism, settings (30),
  setup (22), audit, guide, about, theme-preview, calendar-notes, data-transfer, auth (17).
- **Düzenler:** masaüstü `layouts/desktop/desktop-layout.tsx` (+ `app-sidebar`, `top-bar`, `command-menu`); telefon
  `layouts/mobile/mobile-layout.tsx` (alt çubuk Bugün · Takvim · Misafir · Kasa · Daha fazla; takvim telefonda gün listesi
  `mobile-calendar.tsx`). Kırılım `< 768 px` (`use-mobile.ts`).
- **Menü:** `navigation.ts` `NAV_ITEMS` 27 öğe, 7 grup, `permission` alanı; `visibleNav(can)` yalnız gizler (koruma servis katmanında).
- **Kısayollar:** `lib/shortcuts/registry.ts` 15 kimlik (global / calendar / forms), dinleyici `use-global-shortcuts.ts`.
  Electron `globalShortcut` **yok**; F11 **yok**; tam ekran ve zoom yalnız menü rolleri (`main/app/menu.ts:36-40`).
- **Dört hâl:** `components/query-view.tsx` (yükleniyor/hata/boş/veri). Tema ve renkler `styles/globals.css` CSS değişkenleri.
- **i18n:** `i18n/tr.json` kaynak; `scripts/i18n-check.mjs` anahtar kümesi, `{{değişken}}` ve çoğul denetimi; paralel
  çalışmada `npm run i18n:add -- <spec.json>`.

## 5. Pencere ve ekran (ayrıntı `05-ekran-ve-tam-ekran-uyumu.md`)

- `src/main/windows/main-window.ts`: varsayılan 1366×820, `minWidth 960`, `minHeight 600`, `autoHideMenuBar`,
  `show:false → ready-to-show`; `sandbox`, `contextIsolation`, `webviewTag:false`, `spellcheck:false`.
- `src/main/app/window-state.ts`: `userData/window-state.json`; **yalnız `close` olayında** kaydeder; konum yalnız bir
  ekranın çalışma alanıyla kesişiyorsa geri yüklenir; `maximized` saklanır; tam ekran saklanmaz.
- `src/main/app/display-follow.ts`: monitörle ilgili değil; `ui.language`/`ui.theme` yazımlarının pencereye uygulanması (K-37).
- DPI/zoom: özel kod yok (Chromium varsayılanı); yazı boyutu `ui.fontSize` (normal/%112,5/%125) rem ölçeği.

## 6. Ağ sınırı ve güvenlik (kısa)

İzinli ağ klasörleri: `src/main/network/` (kur, hava, bayram; 5 sn, sessiz), `src/main/server/`, `src/main/discovery/`,
`src/renderer/lib/transport/`. `no-network-guard` kancası diğer yerlerde `fetch/axios/WebSocket` engeller.
HTTP yüzeyi: oturum çerezi, Origin denetimi, hız sınırı, gövde sınırı, yerel ağ isteğe bağlı (K-45), API anahtarları
`safeStorage`. Ayrıntı: `.claude/skills/electron-security/SKILL.md`, `docs/plan/03-mimari.md` §7–8.

## 7. Test ve araç düzeni

| Araç | Yer | Not |
|---|---|---|
| vitest | `vitest.config.ts`: proje `node` (`src/shared`, `src/main`, `tests/unit`; TZ Europe/Istanbul) ve `dom` (jsdom, `src/renderer/**/*.test.tsx`) | Kapsam eşikleri domain 90/85, services 85/75 |
| Playwright | `playwright.config.ts`: `electron` (`tests/e2e/electron`, gerçek Electron) ve `mobile` (`tests/e2e/mobile`, iPhone 13 390×844, `webServer` `tests/e2e/mobile/server.ts`) | Linux'ta `xvfb-run -a`; e2e önce `npm run build` |
| Fabrikalar | `tests/factories/` (`db` seededDatabase, `ctx` roleCtx/testClock, `big-hotel`, `desk`, `fake-external`, `kbs`, `runtime`) | Servis testi kalıbı: `createServices(handle, runtime, {clock})` |
| Ekran görüntüsü | `scripts/ui-shot.mjs` (`--routes`, `--lang`, `--out`, `--full`; masaüstü 1366×768 sabit, telefon 390) | Çoklu çözünürlük için betik genişletilmeli (P18a) |
| Kontrol | `scripts/check.mjs` → typecheck, lint, format:check, test; başarıda `.claude/.checks-passed` (stop-gate kancası) | |
| Diğer | `i18n-add/check`, `notices` (THIRD_PARTY_NOTICES), `release-names`, `seed-demo`, `guide-docs/shots`, `make-icon` | |

## 8. Tek otel varsayımları (çoklu otel analizi için; ayrıntı `10-coklu-otel.md`)

1. `settings` tablosu `hotel.*` anahtarları = tek otel; tablolarda otel kimliği yok.
2. Veritabanı dosyası tek: `app/paths.ts:20-35` (`userData/bismuth.db`); yedek `userData/backups/`, Drive `Bismuth/yedekler`.
3. Roller/kullanıcılar/oturumlar otel-bağımsız; yetki matrisi tek.
4. Sunucu modu tek DB'yi sunar (`electron-wiring.ts:149`); istemci tek ana bilgisayara bağlanır (`host-link.ts`).
5. Saat dilimi tek (`setHotelTimeZone`), raporlar tek otel.

## 9. Sık ihtiyaç duyulan yollar (hızlı başvuru)

| İhtiyaç | Dosya |
|---|---|
| Rezervasyon durum makinesi, iptal/park/gelmedi, check-in/out | `src/main/services/reservations-service.ts` (:719 `endReservation`, :1148 `cancel`, :1314 `checkIn`, :1350 `checkOut`) |
| Çakışma ve gündüz yuvası kuralı | `src/shared/domain/stays.ts`, `src/shared/domain/booking.ts` (`checkoutPlan`) |
| Takvim ızgara sorgusu | `src/main/services/calendar/grid.ts` (`ON_GRID` :63) |
| Panel menüsü | `src/renderer/features/calendar/reservation-panel.tsx` (:134 `editable`, :148 `canCancel`, :222 menü) |
| Ödeme/iade/void | `src/main/services/payments-service.ts` (:139 `create`, :167 `assertRefundCovered`) |
| Yetki matrisi | `src/shared/permissions.ts` (`CATALOG`, 6 rol sütunu: owner, manager, reception, accountant, housekeeping, employee) |
| Ayar anahtarları | `src/shared/contract/settings.ts` |
| Pencere | `src/main/windows/main-window.ts`, `src/main/app/window-state.ts`, `src/main/app/menu.ts` |
| Bildirimler | `src/main/notifications/`, tablo `notifications` |
| Yedek / Drive | `src/main/backup/`, `services/backup-service.ts`, `drive.ts` |
| Turizm istatistiği | `src/main/services/tourism/ministry-table.ts` |
| Dışa/içe aktarma kataloğu | `src/main/services/data-transfer/export-catalog.ts` |
