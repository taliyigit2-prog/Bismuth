# 03 · Mimari, Veri Modeli ve İş Kuralları — Bismuth (v4)

> "Nasıl" sorusunun cevabı. Faz dosyaları buradaki bölümlere atıf yapar. Teknoloji seçimi §2, çoklu cihaz §11,
> dil §12. **v4 (2026-10-02, 4. tur cevapları):** çoklu cihaz kararı kesin (K-19: C2 + NetBird Free + otelin Google Drive'ı);
> yeni tablolar: odadaki kişiler (`stay_occupants`), görevler (`task_templates`, `tasks`), vardiya devri ve notlar
> (`shift_definitions`, `shift_handovers`, `notes`), kayıp eşya (`lost_items`), gider bölümleri ve ürün satırları
> (`expense_sections`, `expense_items`), çamaşırhane giden/gelen; misafirde doğum/anne‑baba alanları kaldırıldı; kur
> kaydın yazıldığı dakikada; yeni iş kuralları §6.15–§6.17. **v3:** Arapça ertelendi; kur yalnızca orta kur; kapasite geçmişi; çamaşırhane fiyat tablosu; çok cihaz mimarisi Faz 0'da yeniden seçiliyor (K-19). Gerekçeler `06-kararlar.md` (K-xx). Şema §4; iş kuralları §6 test senaryolarıyla.
> **v2 (2026-10-01):** sunucu/istemci/telefon modeli, dört dil, piyasa kuru, serbest durum etiketleri, yeni modüller
> (turizm istatistiği, rehber, tedarik/çamaşırhane, arıza, firma/fatura bilgileri, sürekli istekler).

## 1. Mimari ilkeler

1. **Tek kaynak, türetilmiş görünümler.** Rezervasyon, ödeme, gider, personel, tedarik kayıtları bir kez yazılır; takvim rengi, defter, kasa paneli, raporlar, istatistikler bunlardan hesaplanır (G-60).
2. **Tek doğruluk kaynağı = sunucu makine.** Veritabanı otel bilgisayarında; diğer cihazlar ince istemcidir (G-140). Çakışma yönetimi yok çünkü tek yazıcı var: sunucudaki servis katmanı.
3. **Çekirdek arayüzden ve taşımadan bağımsızdır.** `shared/domain` (saf kurallar) ve `main/services` (DB + yetki) hiçbir UI'ya ve Electron'a bağımlı değildir. Aynı servisler **IPC** (tek bilgisayar) ve **HTTP** (sunucu modu) üzerinden çağrılır; tek tipli kontrat (zod).
4. **Tek arayüz paketi.** React uygulaması hem Electron penceresinde hem sunucunun sunduğu tarayıcı sayfasında (dizüstü istemci, telefon) aynı koddur; farkı yalnızca taşıma katmanı (`renderer/lib/transport`) bilir (G-135).
5. **Yetki servis katmanında**; her çağrı `ctx` (kullanıcı, rol, yetkiler, cihaz) taşır (G-23).
6. **Çevrimdışı önce.** Sunucu makine internetsiz tam çalışır. Dış ağ istekleri yalnızca `main/network` içinde, isteğe bağlı, zaman aşımlı, sessiz başarısız (G-01/G-02). İstemci bağlantı kaybında salt‑okunur son görüntü (G-141).
7. **Para = tam sayı + para birimi.** `amount_minor` + `currency`. Kayan sayı yok (G-131).
8. **Tarih = yerel gün.** `YYYY-MM-DD`; konaklama `[giriş, çıkış)`; çıkış günü gece değildir (istatistik modülü hariç: bakanlık kuralı aynı gün = 1 gece, §6.11).
9. **Değişmez tarih; düzeltme = ters kayıt**; denetim kaydı her yazmayı izler (G-24).
10. **Bitmiş ürün.** Az ve sabit bağımlılık; CDN yok; bizim sunucumuz yok; üçüncü taraf yalnızca sahibin hesabıyla (özel ağ, kur anahtarı).
11. **Çok dilli.** Metin = anahtar; düzen = mantıksal CSS (start/end) — Arapça ertelendi ama RTL'ye kapı açık kalsın (G-08, §12).

## 2. Teknoloji yığını

> Araştırma: `04-arastirma/masaustu-yigin.md`, `shadcn-ekosistemi.md`, `fx-uzaktan-erisim.md`, `i18n-rtl-mobil.md`.
> Kararlar: `06-kararlar.md`. Faz 0 bunları gerçek derlemeyle doğrular.

| Katman | Seçim | Neden |
|---|---|---|
| Masaüstü kabuğu | **Electron** — sürüm K-12'ye göre (**37.x**: macOS 11+/Win10+ en geniş aralık; ya da 44.x: macOS 13+) + electron-vite + electron-builder (NSIS `Bismuth-Setup.exe`, `Bismuth.dmg` ×2) | Tarayıcı motoru paketin içinde → her makinede aynı, yıllar sonra da aynı; tek dil (TS); en olgun paketleme. Tauri reddedildi (K-01). |
| Gömülü sunucu (sunucu modu) | **Hono** + `@hono/node-server` ana süreçte; aynı React paketini ve `/api` kontratını sunar; `bonjour-service` ile yerel ağda keşif | Küçük, bağımlılığı az; aynı zod kontratı; istemci `hono/client` ile tipli. |
| Uzaktan erişim | **C2** (K-19): Mac'te salt‑okunur yedek kopya (`change_log` + şifreli `.bmr` paketleri) + otelin Google Drive klasörü (Drive masaüstü uygulaması eşitler) + canlı erişim için sahibin kuracağı **ücretsiz özel ağ: NetBird Free** (K-31; Tailscale/ZeroTier/LAN de çalışır) — Bismuth yalnızca adres algılar ve kılavuz sunar | Bizim sunucumuz yok; GUI kurulum; uçtan uca şifreli; özel ağ engellense bile Mac Drive'dan güncellenir. |
| Arayüz | React 19 + TypeScript + Vite + Tailwind v4 + **shadcn/ui (Radix)** + lucide; `@fontsource` ile paket içi fontlar (Latin/Kiril/Türkçe) | Sahibin isteği; bileşenler proje içinde. |
| Dil | **i18next + react-i18next** (+ i18next-cli); `tr` kaynak, `en`/`ru` çeviri; CLDR çoğul ekleri; `Intl` biçimleyiciler | Üç dil (§12). |
| Durum/veri | TanStack Query + küçük Zustand store; taşıma katmanı IPC/HTTP seçer | Basit, sabit. |
| Tablolar/ızgara | TanStack Table + TanStack Virtual; takvim özel bileşen (K-03) | Lisans/bakım riski yok. |
| Grafikler | shadcn charts (Recharts) | Tutarlı tema. |
| Veritabanı | **SQLite** (WAL) — `better-sqlite3` 13.x (hazır ikili) + **Drizzle ORM** + SQL migrasyonları | Tek dosya; tek yerel modül. |
| Dosya ekleri | `userData/attachments/<yyyy>/<ulid>.jpg` — DB'de yalnızca yol + boyut + sha256; görsel küçültme (maks. 1600 px, ~300 KB) | Veritabanı şişmez; yedek klasörü ekleri de kapsar (K-25). |
| Doğrulama | zod 4 (kontrat + formlar) | Tek şema. |
| Kimlik | `node:crypto` scrypt; oturum belirteçleri (HTTP) | Yerel modül gerekmez. |
| Dışa aktarma | exceljs, csv-stringify; `printToPDF` | K-14. |
| Test | Vitest + Playwright (`_electron` + mobil görünüm emülasyonu) | |
| CI | GitHub Actions: lint/test/build (Linux), paket (windows-latest, macos-latest), Release | |

**Süreç ve taşıma yapısı:**

```
┌──────────── Otel bilgisayarı (sunucu modu) ────────────┐      ┌── Sahibin Mac'i (istemci modu) ──┐
│ main (Node)                                              │      │ Bismuth.app                         │
│  ├─ db/ (SQLite, migrasyon)                              │      │  renderer (aynı React paketi)       │
│  ├─ services/* (yetki + iş + audit)   ◄── ipc/ ◄── preload ◄── renderer (Electron penceresi)        │
│  ├─ server/ (Hono: /api = aynı kontrat, / = React paketi) ◄── HTTP ── transport/http ◄── renderer     │
│  ├─ network/ (isteğe bağlı dış veri: kur, bayram, hava)  │      └────────────────────────────────────┘
│  ├─ backup/, notifications/, printing/, attachments/     │      ┌── Telefon ──────────────────────────┐
│  └─ discovery/ (bonjour)                                 │      │ tarayıcı → http(s)://<özel ağ adı>  │
└──────────────────────────────────────────────────────────┘      │ mobil düzen (aynı React paketi)      │
          ▲ özel ağ (NetBird/WireGuard) veya yerel ağ               └─────────────────────────────────────┘
```

`shared/`: tipler, zod kontratı, `Money`, `LocalDate`, saf iş kuralları. `renderer/lib/transport/`: `ipc.ts` (Electron içi) ve `http.ts` (sunucuya) aynı arayüzü uygular; uygulama açılışta modu bilir.

## 3. Modüller ve fazlar

| Modül | Klasör | Faz |
|---|---|---|
| Kurulum sihirbazı, ayarlar (dil, tema, çalışma modu) | `features/setup`, `features/settings` | 4 |
| Kimlik, roller (rol düzenleyici) | `features/auth`, `features/roles` | 4 |
| Takvim, rezervasyon, durum etiketleri, **odadaki kişiler + KBS işaretleri** | `features/calendar`, `features/reservations`, `features/status-tags`, `features/occupants` | 5 |
| Misafir, kara liste, **firma/fatura bilgileri, sürekli istekler, fiyat geçmişi** | `features/guests`, `features/blacklist`, `features/companies` | 6 |
| Defter, kasa, gider, ek hizmet | `features/ledger`, `features/cash`, `features/expenses`, `features/sales` | 7 |
| Personel | `features/staff` | 8 |
| Oda durumu (+ kat planı), **arıza bildirimi**, **görevler** (bakım dahil), **vardiya devri ve notlar**, otelde kalanlar, takvim notları, Bugün | `features/housekeeping`, `features/room-issues`, `features/tasks`, `features/shift-notes`, `features/in-house`, `features/calendar-notes`, `features/today` | 9 |
| Raporlar + **Turizm istatistiği (KBS içe aktarma)** | `features/reports`, `features/tourism-stats` | 10 |
| Döviz (piyasa), bayram çevrimiçi doğrulama, hava durumu | `features/currency`, `main/network` | 11 |
| **Telefon rehberi, tedarik, çamaşırhane, kayıp eşya** | `features/contacts`, `features/supplies`, `features/laundry`, `features/lost-items` | 12 |
| **Sunucu modu, istemci modu, telefon arayüzü, yedek kopya (replica), şifreli kutu, devral** | `main/server`, `main/replica`, `main/relay`, `renderer/lib/transport`, `features/remote`, mobil düzenler | 13 |
| Yedek (program klasörü + Drive, şifreli, parçalı), dışa/içe aktarma | `main/backup`, `features/backup`, `features/import-export` | 14 |
| UI cilası, **program içi kılavuz**, klavye kısayolları | `features/help` | 15 |
| Test, paketleme, sürüm | — | 16 |

## 4. Veri modeli (SQLite)

Notasyon: `pk` birincil anahtar (ULID metin), `fk→`, `?` boş olabilir, `*` dizin. Tüm tablolarda `created_at`,
`updated_at`, çoğunda `created_by fk→users`. Para: `amount_minor INTEGER` + `currency TEXT`.

### 4.1 Ayarlar, kullanıcılar, cihazlar, denetim

```
settings            key pk, value_json, updated_at, updated_by
                    -- ui.language(tr|en|ru; `ar` ertelendi, K-20), ui.theme(light|dark|system), ui.showMinor(bool), ui.density,
                    -- app.mode(standalone|host|client; Faz 4), hotel.country/city/timezone, security.idleLockMinutes (15),
                    -- internal.setup.progress / internal.setup.completedAt (sihirbaz; settingsShape dışında),
                    -- host.port, host.address?, client.hostUrl?,
                    -- network.enabled, fx.mode, fx.sources[], fx.refreshMinutes, calendar.highlightWeekdays[] (varsayılan [6,0] = cts+paz),
                    -- ui.startScreen (calendar), businessDay.closingEnabled (false), staff.advanceFromDrawer,
                    -- kbs.checksEnabled (true), tasks.everyNStays (10), attachments.resolvedIssueRetentionDays (30),
                    -- backup.localDir, backup.cloudDir?, backup.retentionDays (30), backup.quietHour (04:00), backup.chunkKb (4096),
                    -- relay.dir?, relay.excludeIdentity (true), host.epoch, weather.*, ...
user_preferences    id pk, user_id fk→users, key, value_json, created_at, updated_at   -- UNIQUE(user_id, key); 0007
                    -- kişinin kendi görünüm seçimleri (ui.language/theme/density/showMinor/startScreen; K-37, G-47);
                    -- settings'teki değer otelin varsayılanıdır (giriş ekranı, hiç seçmemiş hesaplar)
roles               id pk, name, is_system(bool), description, code? unique, name_i18n_json?,
                    tasks_own_only(bool; 0002 — Temizlik/Çalışan varsayılan, K-38),
                    remote_allowed(bool, varsayılan 1; 0005 — HTTP'den oturum açabilir),
                    archived_at? (0006 — "rolü sil" = arşiv; tohum geri getirmez; kullanan hesap/açık görev/etkin şablon varken reddedilir)
role_permissions    role_id fk→roles, permission TEXT, level(none|view|edit)   -- pk(role_id, permission); §5
users               id pk, username unique, display_name, role_id fk→roles, employee_id? (kullanılmaz: bağ employees.user_id),
                    password_hash, pin_hash?, must_change(bool), active(bool), last_login_at, failed_attempts, locked_until?
recovery_codes      user_id fk→users, code_hash, used_at?
sessions            id pk, user_id fk*, device_id fk→devices, token_hash unique, created_at, last_seen_at, expires_at, revoked_at?
devices             id pk, name, kind(desktop|browser|mobile), platform?, first_seen_at, last_seen_at, last_ip?, trusted(bool), revoked_at?
audit_log           id pk, ts*, user_id?, device_id?, entity, entity_id*, action, before_json?, after_json?, reason?
                    -- yalnızca ekleme: UPDATE/DELETE (0003) ve var olan kimlikle INSERT OR REPLACE (0004) tetikleyiciyle
                    -- reddedilir; kimlik no yazılırken maskelenir
```

### 4.2 Odalar, tipler, bloklar, arızalar

```
room_types          id pk, code unique, name_i18n_json ({tr,en,ru}; Arapça ertelendi, K-20), group, is_custom, max_adults, max_children, bed_config_json?, size_m2?, base_price_minor?, base_currency?, sort, active
rooms               id pk, number unique, floor?, room_type_id fk, beds(int), sellable(bool), notes?, sort, active,
                    hk_status(clean|dirty|inspected|maintenance|out_of_order), hk_status_at, hk_status_by?
room_capacity_changes id pk, room_id fk*, valid_from*, active(bool), sellable(bool), beds(int), note?   -- K-27: tadilat/ekleme/çıkarma geçmişi
room_blocks         id pk, room_id fk*, date_from*, date_to*, kind(oos|ooo), reason, note?, room_issue_id?, task_id?, created_by
room_issues         id pk, room_id? fk→rooms*, title, description?, severity(low|medium|urgent), status(open|planned|resolved)*,
                    reported_by fk→users, reported_at*, assigned_to?, planned_date?, resolved_at?, resolved_by?, resolution_note?,
                    blocks_room(bool)                      -- maliyet alanı yok (S-76): masraf defterde gider olarak yazılır
attachments         id pk, entity(room_issue|expense|laundry_delivery|lost_item|task), entity_id*, path, mime, bytes, sha256, width?, height?,
                    created_by, deleted_at?, deleted_by?    -- çözülen arıza fotoğrafı N gün sonra dosyası silinir, satır iz olarak kalır (K-25)
```

### 4.3 Misafirler, firmalar, kara liste, etiketler

```
guests              id pk, first_name, last_name, name_normalized*, phone?, phone_normalized*, email?, nationality?(ISO2, isteğe bağlı),
                    id_doc_type?(tc|passport|other), id_doc_number?*, language?, vip(bool),
                    standing_note? (sürekli istek, G-192), standing_note_level(info|warn), notes?, company_id? fk→companies, merged_into_id?
                    -- doğum tarihi/yeri, anne/baba adı, cinsiyet, adres TUTULMAZ (S-15, S-92; KVKK veri en aza indirme)
companies           id pk, title, address?, city?, tax_office?, tax_number?, phone?, email?, iban?, contact_person?, note?,
                    favorite(bool), last_used_at?, name_normalized*
blacklist           id pk, guest_id?, name, name_normalized*, id_doc_number?*, phone_normalized?*, birth_date?, severity(warn|block),
                    reason_code, reason_text, incident_date?, added_by, approved_by?, status(active|removed), removed_at?, removed_by?, removed_reason?
status_tags         id pk, code unique, kind(auto|custom), name_i18n_json, color, description?, enabled(bool), sort, priority_over_auto(bool)
                    -- auto kodları sabit: paid, unpaid, partial, dayuse, past_empty, empty, blocked; ad/renk değişir
reservation_tags    reservation_id fk, tag_id fk→status_tags   -- custom etiketler
```

### 4.4 Rezervasyon, geceler, folyo, ödeme

```
sales_channels      id pk, code unique, name, kind, default_collected_by, commission_pct?, active, sort
payment_methods     id pk, code unique, name, group, is_cash(bool), active, sort
extra_services      id pk, code unique, name, default_price_minor?, default_currency?, unit, active, sort

reservations        id pk, code unique, primary_guest_id fk, channel_id fk, channel_ref?, status(tentative|confirmed|checked_in|checked_out|cancelled|no_show|parked),
                    kind(overnight|day_use), parked_reason?, parked_note?, adults?, children? (yalnız kişi listesi yoksa; S-22), notes?, created_by, cancelled_at?, cancel_reason?, sold_by_user_id?
reservation_rooms   id pk, reservation_id fk*, room_id fk*, check_in*, check_out*, checked_in_at?, checked_out_at?, status
room_nights         id pk, reservation_room_id fk*, room_id fk, date*, slot(night|day), start_time?, end_time? ('HH:MM', yalnız saatlik gündüz yuvası; null = tüm gün/gece),
                    price_minor, currency   -- 0019 (K-48): gece UNIQUE(room_id, date) kısmi (slot=night); gündüz UNIQUE(room_id, date, start_time) kısmi (saatli)
                    --   + saatsiz gündüz UNIQUE(room_id, date) kısmi; saat çakışması `shared/domain/stays.ts` (hourRangesOverlap) ve serviste engellenir
reservation_notes   id pk, reservation_id fk, date?, text, created_by
stay_occupants      id pk, reservation_room_id fk*, guest_id? fk→guests, full_name, descriptor_note? ("kızıl saçlı"; yalnız personel),
                    is_primary(bool), arrived_at?, left_at?, kbs_reported_at?, kbs_reported_by?, kbs_checkout_at?, kbs_checkout_by?,
                    created_by     -- K-33 (eski reservation_guests); kişi sayısı = aktif satır sayısı (adults/children alanları türetilir)

folios              id pk, kind(reservation|sale|house), reservation_id? unique, title?, currency, status(open|closed), closed_at?
charges             id pk, folio_id fk*, date*, kind(room_night|extra|discount|penalty|adjustment), room_night_id? unique, extra_service_id?, description, qty, unit_minor, amount_minor, currency, voided_at?, void_reason?, reversal_of_id?
payments            id pk, folio_id fk*, date*, kind(payment|deposit|refund), method_id fk, channel_id?, amount_minor, currency,
                    fx_rate_to_base?, fx_rate_at? (kurun alındığı an = kaydın yazıldığı/değiştiği dakika; K-15), fx_source?, amount_base_minor?,
                    fx_rate_observed_at? (kullanılan kurun kendi zamanı — "kur 9 saat önceki"; 0002),
                    reference?, note?, collected_at?*, collected_by?, handover_id?, voided_at?, void_reason?, reversal_of_id?, created_by, sold_by_user_id?
```

### 4.5 Kasa, giderler

```
expense_sections    id pk, code unique, name_i18n_json, visibility_permission (expenses.view | expenses.owner.view), sort, active
                    -- tohum: "Genel", "Yönetici giderleri" (G-67); hazır gider kategorisi YOK (S-33, K-35)
expenses            id pk, date*, section_id fk→expense_sections, amount_minor, currency, fx_rate_to_base?, fx_rate_at?, amount_base_minor?,
                    fx_source?, fx_rate_observed_at? (0002),
                    description, description_key* (normalize: otomatik tamamlama + "en çok harcama" gruplaması), vendor_contact_id? fk→contacts,
                    kind(manual|staff|laundry) , paid_from_drawer(bool), method_id?, settled_at?, handover_id?, employee_id?, staff_txn_id?,
                    laundry_settlement_id?, voided_at?, void_reason?, created_by
expense_items       id pk, expense_id fk*, product_id fk→products*, qty, unit_price_minor, amount_minor   -- tedarik = gider + ürün satırları (G-71)
cash_handovers      id pk, at*, by_user, note?, totals_json
business_days       date pk, status(open|closed), closed_at?, closed_by?, note?, sort_pref?
```

### 4.6 Personel

```
employees               id pk, first_name, last_name, position?, phone?, start_date, end_date?, active, notes?, user_id? fk→users
employee_salaries       id pk, employee_id fk*, valid_from*, monthly_minor, currency     -- maaş geçmişi
pay_policies            scope(hotel|employee), employee_id?, key, value_json
                        -- leave_days_per_month(4), unused_leave_paid(true), unused_leave_multiplier(1.0), daily_divisor(30|days_in_month),
                        -- leave_carry_over(false), standard_hours_per_day(8), overtime_mode(none|hourly_fixed|multiplier) (Lale: none), overtime_hourly_minor?,
                        -- overtime_multiplier(1.5), hourly_divisor(225), holiday_multiplier(2.0), holiday_pay_mode(hourly|daily),
                        -- commission_mode(none|pct|fixed), commission_pct?, commission_base(room_revenue_all|own_sales|extras), commission_fixed_minor?,
                        -- advance_from_drawer(bool)   -- oranları ve tabanı Sahip + Müdür ayarlar (S-34…S-38)
leave_records           id pk, employee_id fk*, date*, kind(rest_day|annual|sick|unpaid|holiday_worked), note?, created_by
work_records            id pk, employee_id fk*, date*, start_time?, end_time? (çalışan kendisi girer), hours_worked (türetilir/düzeltilir),
                        overtime_hours (yalnız Müdür/Sahip girer; K-38), kind(normal|holiday|rest_day), note?, created_by
staff_transactions      id pk, employee_id fk*, date*, kind(advance|salary_payment|leave_payout|overtime_payment|commission_payment|bonus|deduction),
                        amount_minor, currency, period_year, period_month, expense_id? fk→expenses, note?, created_by
salary_periods          id pk, employee_id fk, year, month (unique üçlü), snapshot_json, locked_at?, locked_by?
```

### 4.7 Rehber, tedarik, çamaşırhane

```
contacts            id pk, name, category(supplier|laundry|plumber|electrician|taxi|emergency|other|custom:<ad>), phones_json [{label,number}],
                    address?, email?, note?, favorite(bool), name_normalized*, active
product_categories  id pk, name_i18n_json, sort, active   -- tohum (S-73): su ve içecek, market, kahvaltı, temizlik malzemeleri, banyo/misafir ürünleri,
                                                             --   kâğıt ürünleri, çamaşır/tekstil, teknik/bakım, kırtasiye, diğer
products            id pk, name, category_id fk→product_categories, supplier_contact_id? fk→contacts, unit(piece|kg|lt|pack|bag),
                    track_stock(bool, varsayılan false; S-63), stock_qty?, active
                    -- fiyat geçmişi = expense_items ⋈ expenses (product_id, date) sıralı; zam uyarısı §6.13 (ayrı purchases tablosu yok; K-35)
laundry_item_types  id pk, name_i18n_json, sort, active        -- çarşaf, alez, nevresim, yastık kılıfı, büyük/küçük/ayak havlu, yastık, yorgan, pike, perde...
laundry_prices      id pk, laundry_contact_id fk, item_type_id fk, valid_from*, unit_price_minor, currency   -- K-28: anlaşma fiyatı + zam geçmişi
laundry_deliveries  id pk, date*, direction(out|in) (giden kirli | gelen temiz fiş; S-95), laundry_contact_id fk→contacts, slip_no?, note?, created_by
laundry_delivery_items delivery_id fk*, item_type_id fk, qty, stained_qty(int, lekeli), slip_unit_price_minor? (fişte yazıyorsa), amount_minor? (hesaplanan)
laundry_settlements id pk, laundry_contact_id fk, period_year, period_month, computed_qty_json, computed_total_minor, invoiced_total_minor?, difference_minor?, note?, expense_id?, settled_at?
```

### 4.8 Takvim, bakım, bildirim, kur, istatistik, yedek

```
calendar_days       id pk, date*, kind(holiday|half_holiday|special|note|event), title_i18n_json, note?, color?, source(generated|verified|user), estimated(bool: dini bayram hesaplanmış), generator?(date-holidays|intl-umalqura), group_key?, recurring_yearly(bool), generated_year?
calendar_generation year pk, generated_at, verified_at?, source_version
task_templates      id pk, title, description?, kind(general|maintenance|legal), assignee_user_id?, assignee_role_id?, assignee_shift_id?,
                    room_id?, recurrence_json (none | daily@HH:MM | weekdays[]@HH:MM | monthDay@HH:MM | everyNStays{n, perRoom}),
                    remind_minutes_before?, active, created_by     -- bakım hatırlatıcıları ve yasal tohumlar (G-93) burada (K-34)
tasks               id pk, template_id? fk, title, description?, assignee_user_id?, assignee_role_id?, assignee_shift_id?, room_id?,
                    due_at*?, status(open|done|cancelled)*, done_at?, done_by?, note?, created_by
                    -- UNIQUE(template_id, due_at): tekrar üretimi idempotent
shift_definitions   id pk, name_i18n_json, start_time, end_time, sort, active   -- Lale tohumu: Gündüz 09:00–21:00, Gece 21:00–09:00
shift_handovers     id pk, business_date*, from_shift_id?, to_shift_id?, written_by, written_at, text?, summary_json (otomatik özet anlık görüntüsü),
                    acknowledged_by?, acknowledged_at?
notes               id pk, kind(personal|board), owner_user_id? (personal ise yalnız o görür), text, remind_at?, pinned(bool), done_at?, created_by
lost_items          id pk, found_at*, room_id?, location_text?, found_by?, description, storage_location?, status(stored|returned|disposed),
                    returned_to?, returned_at?, note?, created_by
notifications       -- v1 ile aynı (görev/bakım/yasal hatırlatma kaynağı tasks)
fx_rates            id pk, ts*, base, quote, mid_rate_micro, source(market_mid|user_api|tcmb|manual|hotel), provider?, is_manual
                    -- UNIQUE(ts, base, quote, source); günlük kapanış görünümü için `date` türetilir
kbs_imports         id pk, period_year, period_month, file_name, imported_at, row_count, same_day_count, active_count, created_by
kbs_stay_rows       id pk, import_id fk*, arrival_at, departure_at?, room_no, gender? (okunmaz, hep boş — §4.8b), nationality_raw, nationality_iso?, status_raw, nights_computed,
                    nights_basis(actual|plan|import_day), counted_until?, in_period(bool)
                    -- kimlik/ad alanları HİÇ saklanmaz (zaten maskeli; KVKK)
country_map         key_normalized pk, raw_example, iso2?, ministry_name_tr, source(seed|user), confirmed_by?, confirmed_at?   -- K-36
backups, schema_version  -- v1 ile aynı; backups + location(local|cloud), encrypted(bool), chunks?
change_log          seq pk autoincrement, epoch, tbl, pk, op(i|u|d), row_json, schema_version, ts   -- Faz 13 (K-19 C2): tetikleyicilerle doldurulur
```

### 4.8a Faz 2 uygulama notları (şemanın gerçek hâli: `src/main/db/schema/*.ts`, `drizzle/0001_domain.sql`)

- **Çok dilli liste adları**: tohumla gelen satırlarda (roller, oda tipleri, ödeme yöntemleri, kanallar, ek hizmetler, gider
  bölümleri, durum etiketleri, vardiyalar, çamaşır türleri, ürün kategorileri, görev şablonları) `name_i18n_json` {tr,en,ru};
  otel yeniden adlandırınca düz `name` yazılır ve çeviri temizlenir. `code` alanı tohumun kimliğidir (yeniden tohumlama kopya
  üretmez). `roles` tablosuna `code` + `name_i18n_json` eklendi.
- **Ödeme**: `payments.amount_folio_minor` (folyo para biriminde, yazıldığı dakikanın kuruyla dondurulmuş tutar) — gece dağılımı
  bunu kullanır; `fx_rate_to_base` tam sayı ×1 000 000. Kur bilinmiyorsa kayıt yine yazılır (`amount_base_minor` boş); folyo
  başka para birimindeyse ve kur bilinmiyorsa elle kur girilir (`manualRateMicro`; kur biliniyorsa yazılan kur yok sayılır, K-43).
- **Geceler**: `room_nights` türetilmiş takvimdir; iptal/park/kısaltmada satır kalkar, bağlı masraf `voided_at` + `room_night_id`
  boşaltılarak iptal edilir (geçmiş masrafta ve denetim kaydında kalır). Fiyat değişikliği eski masrafı iptal edip
  `reversal_of_id` ile yenisini yazar. `reservation_rooms.sort` çok odalı dağılım sırasıdır. Rezervasyon kodu
  `R-YYYY-NNNNNN` (`reservation_code_sequences`).
- **Oda tipi**: `weekend_price_minor` (hafta sonu geceleri ve özel günlerde öneri fiyat, G-48; hangi geceler hafta sonu sayılır: `pricing.weekendNights` ayarı, varsayılan Cuma + Cumartesi geceleri; takvimde vurgulanan günlerden (`calendar.highlightWeekdays`) ayrı bir ayardır; K-44 (2); son kontrol); `room_blocks` silinmez, `cancelled_at` ile biter.
- **Kasa**: `cash_handovers.reverted_*` (teslim geri alma aynı partinin durumu); `expense_items.qty_milli` (1,5 kg = 1500).
- **Personel**: süreler tam sayı dakika (`work_records.minutes_worked`, `overtime_minutes`); `leave_records.voided_at`,
  `staff_transactions.voided_at`. `pay_policies` satır kimlikli (otel ya da çalışan kapsamı).
- **Görevler**: `task_templates` `code`, `title_i18n_json`, `first_due_at`, `suggested`, `last_done_at`, `materialized_until`;
  `tasks.overdue_notified_at`, `cancel_reason`. "Her N konaklama" görevleri `due_at` boş, `room_id` dolu açılır (aynı şablon ve
  oda için tek açık görev; UNIQUE(template_id, due_at) yalnız tarihli tekrarları korur).
- **Kara liste**: `birth_date` tutulmaz (misafirde olduğu gibi KVKK veri en aza indirme).
- **Diğer**: `calendar_days.title` + `cancelled_at`; `notes.archived_at`; `laundry_deliveries.voided_at`;
  `laundry_settlements.currency`; `backups.kind` + `pre_migration`, `restored_at`; `contacts.custom_category`. `schema_version`
  tablosu yok: şema sürümü = uygulanmış drizzle migrasyon sayısı (Faz 1 kararı). `change_log` Faz 13'te eklenecek.

### 4.8b Faz 2 servis notları (davranışın gerçek hâli: `src/main/services/*`)

- **Kalıp**: `createXService(deps)` → her yöntem `ctx` ile başlar: `requirePermission` → zod `parseInput` → `inTransaction`
  (tek transaction + `audit_log` satırları). Servisler Electron içe aktarmaz; dosya işleri (`attachments`, `backup`)
  yalnız `node:fs` ile, klasörler dışarıdan verilir. Hepsi `services/index.ts` → `createServices(handle, runtime, storage)`.
- **Kimlikler** (`src/shared/ids.ts`): ULID **monoton** — aynı milisaniyede ya da geri giden saatte üretilenler üretim
  sırasıyla sıralanır (bir transaction'daki ürün satırları, geceler girildiği sırada listelenir).
- **Bilinçli fiziksel silmeler** (iş kaydı değil, türetilmiş/indeks satırı; eski hâli audit'te): kısalan/iptal edilen
  konaklamanın `room_nights` satırları (bağlı masraf iptal edilir), düzenlenen giderin `expense_items` satırları,
  rezervasyonun özel etiketleri (`reservation_tags`), misafirden çıkarılan etiket bağı (`guest_tag_links`, K-46),
  budanan otomatik yedeğin `backups` satırı (dosyasıyla birlikte), hiç kullanılmamış özel durum etiketi
  (`status_tags.kind='custom'`; `auto` silinmez), çözülmüş arızanın süresi dolan fotoğraf eki (`attachments`, K-25),
  30 günü geçen `change_log` satırları (türetilmiş akış). (Son kontrol: veritabanı incelemesi #4.)
- **Personel**: maaş/avans/izin parası/mesai ve prim ödemesi `kind=staff` gider satırı yazar (G-69); bölümü yeni ayar
  `staff.expenseSection` (varsayılan `general`; `owner` seçilirse personel ödemeleri çalışanlardan gizlenir). Kasadan avans
  yalnız `staff.advanceFromDrawer` açıkken. Bayram çalışması takvimdeki resmî tatillerden (`calendar.holidayDatesBetween`).
  Kilitli maaş ayı anlık görüntüsünü döndürür; o aya izin/mesai/para kaydı yazılamaz. Ücret kuralında "devral" = değeri
  `null` olan satır (kayıt silinmez).
- **Arıza → oda bloğu**: "odayı satışa kapat" `rooms.block` yetkisi ister; blok bugünden bir sonraki satılmış geceye kadar
  (en çok 365 gün) konur; çözülünce o gün biter (geçmiş günler blokta kalır).
- **Ek dosya**: `userData/attachments/<varlık>/<yıl>/<ulid>.<uzantı>`; tür dosya imzasından (JPEG/PNG/WebP/PDF), en çok
  15 MB, okumada sha256 denetimi; yalnız çözülmüş arızanın fotoğrafı silinebilir (elle ya da
  `attachments.resolvedIssueRetentionDays` sonra), satır iz olarak kalır.
- **Yedek**: `userData/backups/bismuth-<tür>_<zaman>_<id>/` içinde `bismuth.db` (SQLite çevrimiçi yedek API'si) +
  `attachments/`; sha256 + `integrity_check`. Geri yükleme açık veritabanını değiştirmez: `restore-pending.json`
  işareti bırakılır, bir sonraki açılışta veritabanı açılmadan önce güvenlik kopyası alınıp uygulanır; değişmiş yedek
  reddedilir (`.failed`). Otomatik yedekler 30 günden eski olunca budanır; en yeni sağlam otomatik yedek yaşına bakılmadan
  kalır; elle alınanlar kalır. Zamanlama, Drive kopyası, şifreleme Faz 14.
- **Turizm istatistiği**: KBS okuyucu yalnız beş istatistik sütununu okur (Geliş, Çıkış, Oda, Uyruk, Durum); kimlik
  sütunları ve **Cinsiyet okunmaz** (`kbs_stay_rows.gender` her zaman boş; KVKK veri en aza indirme). Otelde kalan misafir,
  Bismuth'taki aynı oda + giriş günlü konaklamanın planlı çıkışına kadar sayılır; yoksa içe aktarma gününe kadar.
- **Kişisel not**: metni `audit_log`'a da yazılmaz (yalnız kimlik ve durum); başkası için "bulunamadı" döner.
- **Kur önceliği** (K-43; son kontrol): otel kuru (girilmiş ve "misafire bu kurdan söyle" açıksa) > piyasa kuru (en yeni satır);
  **elle kur yalnız hiçbir kur bulunamazsa** geçerlidir, bilinen bir kurun yerine yazılan kur yok sayılır. Çapraz kur ana para
  birimi üzerinden kurulur (USD → TRY → EUR), böylece aynı ödeme folyoda, defterde ve raporda aynı ana para tutarını verir.
  Aynı kaynakta en yenisi (her kaynak için en yeni satır ayrı okunur). Kullanılan kurun kendi zamanı `fx_rate_observed_at`'e
  yazılır. `fx.mode` ayarı Faz 11'de geldi. **Ana para birimi** folyo, ödeme ya da gider varken değiştirilemez.
- **Oda değişikliği (ileri tarihli)**: taşınma günü eski konaklamanın çıkışı ya da yenisinin girişi kişileri KBS işaretleriyle
  yeni odaya taşır (KBS çıkışı istenmez); eski oda kirli olur, "her N konaklama" sayacı eski oda için işler. Aynı rezervasyonda
  aynı odaya çakışan iki konaklama "oda dolu" döner; bir konaklama en çok 400 gece.
- **KBS uyarıları**: otelde kalanlar + son 30 günde ayrılıp KBS çıkışı işaretlenmemiş kişiler okunur; kimsenin yazılmadığı dolu
  oda "isimsiz" uyarısı verir. Erken ayrılan kişi için KBS çıkışı istenir; çıkışı bildirilenin giriş işareti kaldırılamaz.
- **Kapalı gün** (G-72): ödeme iptali, ek satış ve çamaşırhane ay mutabakatı (gider ayın son gününe yazılır) da `ledger.locked` +
  gerekçe ister. **Kasa teslimi** yalnız teslim alanın görebildiği bölümlerdeki kasa giderlerini kapatır; teslimde kapatılmış
  ("x") gider, teslim geri alınmadan değiştirilemez ya da iptal edilemez.
- **Oda bloğu kaldırma**: süren blok bugün biter (geçmiş günler doluluk geçmişinde kalır); başlamamış blok iptal edilir;
  bitmiş blok yalnız gerekçeyle (düzeltme) iptal edilir.
- **Denetim kaydı**: yalnız ekleme (0003 tetikleyicileri UPDATE/DELETE'i, 0004 var olan kimlikle INSERT OR REPLACE'i
  reddeder); kimlik belge no yazılırken maskelenir (tam hâli yalnız misafir kaydında). Okurken maaş verisi (personel
  ödemesinin gider satırı dahil) ve görülemeyen bölümün gider satırı "gizli" döner. Oturumun "son görülme" zamanı dakikada en
  çok bir kez yazılır (denetime girmez: veri değişikliği değil).
- **Görev görünürlüğü**: rolün `tasks_own_only` bayrağı (K-38 varsayılanı Temizlik, Çalışan; sahip rol düzenleyicide değiştirir).
- **Kullanıcı–personel bağı** yalnız `employees.user_id`; `users.employee_id` yazılmaz. Bağlı kart başka kullanıcıya verilmez.
- **Firma kopyası** (G-191): servis dolu alanları sırayla verir; etiket sözcükleri dil dosyasında (`companies.copy.*`),
  `formatCopyText` birleştirir — ana süreçte arayüz metni yok (yasak 8).

### 4.9 Değişmezler

v1 §4.8'dekiler + (8) `kbs_stay_rows` kimlik/ad içermez; (9) `attachments.path` yalnızca `userData/attachments/` altında; (10) `sessions.token_hash` düz belirteç saklamaz; (11) `status_tags.kind=auto` satırları silinemez (yalnızca kapatılır); (12) `notes.kind=personal` yalnız `owner_user_id` tarafından okunur (Sahip dahil başkası göremez; servis katmanı); (13) `stay_occupants.descriptor_note` Drive PDF özetine ve dışa aktarmalara girmez (K-46 (4): teyit; `export-catalog.ts` odadaki kişiler veri kümesinde sütun yok, test `data-transfer.test.ts`); (14) şifreli kutu paketlerinde (`relay.excludeIdentity`) `guests.id_doc_number` yoktur; (15) `tasks` tekrar üretimi idempotenttir.

## 5. Roller ve yetkiler

- Yetki anahtarları ekran/veri alanı başına **üç seviyeli**: `none | view | edit` (G-20/21). Sahip, "Roller" ekranında her satır için select seçer; teknik anahtar görünmez (ekran adı görünür).
- Sistem rolleri ve **varsayılan** seviyeler v1 §5 matrisinden türetilir (✓ = edit, – = none, "görür" = view). Sahip istediği gibi değiştirir; "Sahip" rolü düzenlenemez.
- Yeni ekranların anahtarları: `contacts`, `supplies`, `laundry`, `room_issues`, `tourism_stats`, `companies` (fatura bilgileri), `remote.settings`, `devices`; **v4:** `tasks`, `shift_notes`, `in_house` (otelde kalanlar + KBS işaretleri), `lost_items`, `audit_log` (varsayılan yalnız Sahip), `payments.handover` (x; varsayılan Sahip + Müdür), `staff.overtime` (ek mesai girişi; Müdür), `staff.own_hours` (çalışan yalnız kendi geliş/çıkış saati), `business_day.close`.
- Varsayılanlar (K-38): Temizlik rolü → oda durumu ve arıza (düzenler), görevler (kendine atananlar), diğerleri göremez. Kişisel notlar yetki matrisinden bağımsızdır (yalnız sahibi).
- Kısmi görünüm kuralı: görünmeyen satırlar toplamlardan düşer, "kısmi görünüm" rozeti çıkar.
- Uzaktan erişimde (HTTP) aynı matris; ek olarak rol bazlı `remote.allowed` (bazı roller yalnızca otel içinden girebilsin).

## 6. İş kuralları (saf fonksiyonlar, `shared/domain/`)

Her kural için test dosyası aynı adı taşır (`*.test.ts`). Excel'den doğrulanmış sayılar test verisidir.

### 6.1 Konaklama ve geceler
- `nightsOf(checkIn, checkOut)` → `[checkIn, checkOut)` tarih listesi; `checkIn == checkOut` ise day-use (slot=day).
- `canAssign(room, dates, slot)` → çakışma yoksa true; day-use ile gece aynı tarihte birlikte olabilir; çıkış günü = başka girişin günü olabilir.
- Oda bloğu (`room_blocks`) aralığına rezervasyon yazılamaz (Sahip/Müdür için "yine de" seçeneği + audit). Açık **acil** arıza (`room_issues.blocks_room`) aynı etkiyi yapar.
- Oda değişikliği: eski odanın kalan geceleri silinir, yeni odada açılır; fiyatlar taşınır; eski oda `dirty`.

### 6.2 Fiyat
- Gece fiyatı: rezervasyonda girilen tek fiyat tüm gecelere kopyalanır; gece gece düzenlenebilir (G-36).
- Varsayılan fiyat (S-20): oda tipi `base_price` → özel gün ya da hafta sonu gecesi için oda tipinin `weekend_price` fiyatı (çarpan değil; hafta sonu geceleri `pricing.weekendNights` ayarı, varsayılan Cuma + Cumartesi, K-44 (2); takvimde vurgulanan günlerden ayrıdır) → öneri; kullanıcı değiştirir. Misafirin **son ödediği fiyat** panelde referans olarak gösterilir (§6.12).

### 6.3 Ödeme dağılımı ve durum
- `allocatePayments(nights[], payments[])`: ödemeler (refund negatif, void hariç) toplanır; geceler tarih sırasıyla doldurulur; her gece `paid | partial | unpaid`.
- Otomatik durum: hiç ödeme yok → `unpaid`; bakiye 0 → `paid`; arada → `partial` (etiket kapalıysa `unpaid` + kapora simgesi); kind=day_use → `dayuse`; status=parked → takvimde yok; blok → `blocked`; geçmiş + boş → `past_empty`; boş → `empty`.
- Çok odalı rezervasyonda ödeme tüm odaların gecelerine tarih (sonra oda sırası) ile dağıtılır.
- Testler: 3 gece × 2.000 = 6.000; ödeme 2.000 → [paid, unpaid, unpaid]; 5.000 → [paid, paid, partial]; 6.000 → hepsi paid; iade 1.000 sonrası → [paid, paid, partial].

### 6.4 Kasa ve teslim
- `drawerBalance(payments, expenses)`: Σ (collected_at null, is_cash) − Σ (paid_from_drawer, settled_at null) → para birimi bazında.
- `handover(ids | upToDate | onlyCash)` → tek transaction; `collected_at`, `handover_id`; totals_json.
- Teslim geri alma: yalnızca aynı teslim partisi; audit reason zorunlu.
- Yetki: `payments.handover` (varsayılan Sahip + Müdür, S-30). Kart/IBAN satırları da banka kontrolünden sonra aynı işaretle (S-31); ayrı mutabakat alanı yok (`reconciled_*` kaldırıldı).

### 6.5 Döviz (güncellendi)
- `fx.mode`: `market_mid` (piyasa orta kur, Google benzeri; varsayılan) | `user_api` | `hotel` (elle sabit). Alış/satış görünümü yok (sahip, v3). TCMB yalnızca karşılaştırma satırı. Kaynak zinciri `fx.sources[]` sıralı; ilk başarılı kazanır; her sonuç `fx_rates`'e yazılır.
- Yenileme: internet varken her `fx.refreshMinutes` (varsayılan 30) ve kullanıcı isteğinde; sunucu modu yeniler, istemciler sunucudan okur.
- `toBase(amount, currency, at, mode)`: kur **kaydın yazıldığı dakikadaki** son geçerli `market_mid` kurdur (`fx_rate_at` saklanır); tutar ya da para birimi değiştirilirse o anın kuru yeniden alınır, diğer alanların değişmesi kuru değiştirmez (S-32). İnternet yoksa son bilinen kur + "kur X saat önceki" işareti; otel kuru / elle düzeltme isteğe bağlı. Ay kuru yöntemi yok.

### 6.6 Maaş
- `computeSalaryPeriod(employee, year, month, policy, salaryHistory, leave[], work[], txns[], holidays[], salesBase)`:
  - `monthly` = o ay geçerli maaş (valid_from ≤ ayın 1'i olan son kayıt); `daily` = monthly ÷ `daily_divisor`.
  - `leave_entitled` = policy.leave_days_per_month; `leave_used` = rest_day kayıtları; `leave_left` = max(0, entitled − used) (+ devir, ayar).
  - `leave_payout` = unused_leave_paid ? leave_left × daily × unused_leave_multiplier : 0.
  - `hourly` = monthly ÷ hourly_divisor (225) ya da sabit saatlik.
  - `overtime_pay` = `overtime_mode=none` ise 0 (Lale); aksi halde Σ overtime_hours × (multiplier modunda hourly × overtime_multiplier, sabit modda overtime_hourly). `overtime_hours` yalnız Müdür/Sahip girer; `hours_worked` çalışanın girdiği geliş/çıkış saatinden türetilir (gece yarısını aşan vardiya: çıkış < geliş → +24 saat).
  - `holiday_pay` = `holiday_pay_mode` saatlikse Σ hours × hourly × (holiday_multiplier − 1), günlükse çalışılan bayram günü × daily × (holiday_multiplier − 1).
  - `commission` = mode'a göre pct × base (ay oda geliri | sold_by = çalışanın kullanıcısı | ek hizmet) veya sabit.
  - `advances` = Σ advance; `deductions` = Σ deduction.
  - `unpaid_deduction` = ücretsiz izin (`unpaid`) günü × daily (bölen kuralı aynı: ÷30 ya da ayın gün sayısı); çalışılan günlerdeki kayıtlar sayılır, ayın ödenecek maaşını geçmez. Ücretsiz izin dinlenme günü hakkını değiştirmez; kullanılmayan izin parası kuralı aynen (P7fix B3). Örnek: 30.000, 5 gün ücretsiz, izin 4/0/4 → 30.000 − 5.000 + 4.000 = 29.000.
  - "Bayramda çalıştı" izin kaydı (aynı gün çalışma kaydı yoksa) bir bayram günü sayılır: günlük modda 1 gün, saatlik modda `standard_hours_per_day` saat (P7fix B15).
  - Çalışma dönemleri (`employment_periods`): işten ayrılıp yeniden alınan çalışanın aradaki ayları boştur; ay içinde birden çok dönem varsa gün sayıları toplanır (P7fix B6).
  - **`net = monthly − unpaid_deduction − advances + leave_payout + overtime_pay + holiday_pay + commission + bonus − deductions`**; `paid` = Σ ödeme türleri; `remaining = net − paid`.
  - Testler: Eda (40.000, 12.500, 4/1/3) → 31.500; Haziran Erol (35.000, 35.005, 4/2/2) → 2.328; Kerem Haziran (40.000, 36.000, 4/2/2) → 6.667; mesai 2 saat × (40.000/225 × 1.5) = 53.333 kuruş.

### 6.7 Takvim (güncellendi)
- `ensureYearGenerated(year)`: takvimde görünen her yıl için `calendar_generation` yoksa kural tabanlı üret (`date-holidays`), `source=generated`. Sınırsız yıl; takvimin gösterdiği yıl aralığı K-46 (1): geçmişte `calendar.startYear` ayarı ile en eski konaklamanın yılından erken olanı, ileride bugünden 10 yıl ile en ileri kaydın yılı + 1'den geç olanı. Sahip düzenlemesi `source=user` olur ve yeniden üretimde korunur.
- `verifyYearOnline(year)` (isteğe bağlı, Faz 11): dış kaynaktan alınan listeyle yalnızca `generated` satırlar güncellenir; fark raporu gösterilir.

### 6.8 Bakım, görev tekrarı ve yasal hatırlatıcılar (K-34)
- Bakım hatırlatıcıları `task_templates(kind=maintenance)`; `nextDue(template, doneAt)`: months → aynı gün, yoksa ayın son günü; years → yıl +N; days → +N; none → null.
- `materializeTasks(templates, from, to)`: tekrar kuralından görev üretir (UNIQUE(template_id, due_at) ile idempotent); geciken açık görev bir kez bildirim üretir.
- `everyNStays(roomId, n)`: odanın son "yapıldı" kaydından bu yana **çıkış yapılmış konaklama sayısı** ≥ n → o oda için görev (S-94, varsayılan n=10; gündüz kullanımı sayılır: kural `countDayUse` alanı, varsayılan evet; ekranda ayrı bir ayar yok, K-46 (8)).
- Yasal tohumlar (TR, kapatılabilir): "Turizm Bakanlığı konaklama istatistiği" her ayın 1'i (10'una kadar), "KBS çıkış bildirimi kontrolü" günlük.
- Örnek görev önerileri (Lale akışından, ilk kurulumda seçmeli): "12:00 çıkış yapmayan odaları ara", "15:00 çamaşırhaneye kirli teslim", "11:00 temiz çamaşır fişini gir".

### 6.9 Kara liste eşleşmesi
- `normalizeName` (küçük harf, Türkçe karakter sadeleştirme, tek boşluk), `normalizePhone` (+90, boşluk, 0 öneki); `matches(candidate, entries)` → ad **veya** kimlik no **veya** telefon.

### 6.10 Raporlar
- `occupancy(range)`: satılan gece ÷ satılabilir gece (OOO düşülür; day-use ayarına göre dahil/hariç).
- `adr`, `revpar`, `alos`, `revenueBy(method|channel|currency|roomType)`, `laborCostRatio`, `supplyCostBy(product|productCategory)`.
- `topExpenses(range)` ("en çok ne harcadım"): personel kalemleri (maaş/avans/izin/mesai) tek grup, `expense_items` olanlar ürün kategorisine göre, kalanlar `description_key`'e göre; tutar sırasıyla.
- KPI sırası (S-40): ciro, kâr, gider, doluluk, ödeme yöntemi, kanal. **Ay sonu kontrol** (G-100): x'lenmiş/bekleyen kart ve IBAN toplamları, maaş ödenen/kalan, ciro, kâr, `topExpenses`.
- Tutarlılık testi: aynı veri için `monthlyRevenue == ledgerTotal == Σ charges paid`.

### 6.11 Turizm istatistiği (yeni)
- Girdi: KBS Excel satırları (sütunlar **başlık adıyla** eşlenir: Geliş Tarihi, Çıkış Tarihi, Verilen Oda, Uyruğu, Durum; harfle değil, K-24; `kbs-reader.ts`). `nights = max(1, days(departure.date − arrival.date))`; **aynı gün = 1** (bakanlık kuralı).
- `arrivals(nat) = count(rows where arrival in period)`; `nights(nat) = Σ nights(rows where arrival in period)` — **tüm geceler giriş ayına yazılır** (K-29; 30 Eylül → 2 Ekim = 2 gece Eylül). Çocuklar ayrı sayılmaz (KBS satırı = giriş).
- Çıkışı olmayan satırlar (KBS `1900-01-01` = otelde): Bismuth'ta **aynı oda + aynı giriş günü** rezervasyonu varsa **planlı çıkışına kadar** (sonraki aya sarkan geceler dahil; S-81), yoksa **içe alma gününe kadar**; `nights_basis` işaretlenir, ekranda listelenir, kullanıcı düzeltebilir. Yeni dosya alınınca gerçek çıkışla yeniden hesaplanır.
- Uyruk → `country_map` (K-36): anahtar normalizasyonu (Türkçe büyük harf, aksan ve noktalama yok sayılır: "K.K.T.C." = "KKTC"), takma adlar (TR, KKTC, GKRY…), İngilizce + Türkçe ülke adı dizini; **harf hatalı yazım** (≤ 1–2 harf) tek en yakın ülkeye öneri olarak eşlenir ama **kullanıcı onayı** ister; belirsiz ("KIBRIS") ve hassas ("CYPRUS" → Güney Kıbrıs Rum Kesimi) değerler otomatik eşlenmez; onaylanan eşleme kalıcıdır. Bakanlık panelinde liste yok, yazdıkça çıkan kutu var → Türkçe ülke adı Bismuth'tan (bazı adlar bakanlık kullanımına göre: "Rusya Federasyonu", "Amerika Birleşik Devletleri", "Filistin", "Kuzey Kıbrıs Türk Cumhuriyeti").
- Karşılaştırma: aynı dönem için programın `stay_occupants` verisinden giriş/geceleme toplamı (uyruk isteğe bağlı olduğundan ülke bazında karşılaştırma yalnız uyruk girilmişse); farklar listelenir.
- **Doluluk oranı (bakanlık) = geceleme ÷ (yatak sayısı × ayın gün sayısı)**; yatak sayısı o ayın kapasite geçmişinden (K-27) — **gerçek** sayı; bakanlıkta kayıtlı sayı kullanılmaz (S-99). Lale 38 yatak: Eylül 840 ÷ (38 × 30) = **%73,7**. (Panelin %0,24 değeri bakanlığın kayıtlı 28 yatağıyla hesaplanmıştı.) Otelin kendi oda doluluğu (§6.10) ayrı KPI'dır.
- Testler: Eylül örneği (607 giriş, 840 geceleme — otelde kalan 5 kişi dosya ayı sonuna kadar —, 248 aynı gün, 23 ülke) sentetik satırlarla yeniden üretilir; yazım hatası örnekleri (`TÜRKYİE`, `KUZY KIBRIS TURK CUMHURIYETI`), belirsiz `KIBRIS`, planlı çıkış senaryosu (prototip: `prototypes/kbs-stats` (arşiv etiketi `archive/faz0`), 15 test).

### 6.12 Misafir fiyat geçmişi (yeni)
- `guestHistory(guestId)`: konaklamalar (tarih, oda, gece, gecelik fiyat listesi, ödenen toplam, yöntem/kanal) + özet: son konaklama tarihi, son gecelik fiyat, ortalama fiyat, toplam harcama, toplam gece.
- **Sayılan konaklama** (`isCountedStay`, P5fix): bugüne kadar başlamış (giriş ≤ bugün) ve park, gelmedi, iptal olmayan rezervasyon; son konaklama, son gecelik fiyat (o konaklamanın son gecesi), ortalama, toplam gece, konaklama sayısı ve "tekrar gelen" yalnız bunlardan hesaplanır; misafir listesi, kart, panelin özet kartı (panelin kendi rezervasyonu hariç) ve yeni rezervasyon formu aynı kuralı okur. Toplam ödenen iptal hariç bütün rezervasyonların tahsilatıdır.
- Rezervasyon paneli açılırken misafir seçildiğinde özet kartı + `standing_note` uyarısı (§6.14).

### 6.13 Tedarik ve çamaşırhane (yeni)
- `priceChange(productId)`: son alım birim fiyatı − önceki alım birim fiyatı; `> 0` ise "zam" rozeti (% ve tutar); 12 aylık fiyat çizgisi.
- `monthlyConsumption(productId, year, month)`: Σ qty, Σ amount.
- `laundrySettlement(contact, year, month)`: **gelen** (temiz) teslimatlar üzerinden tür bazında Σ qty, Σ lekeli, varsa Σ amount (geçerlilik tarihli fiyatla); fatura tutarı girilince fark; fark ≠ 0 → vurgulu.
- `laundryOutstanding(contact, until)`: tür bazında Σ giden − Σ gelen (başlangıç devri ayarla girilebilir) → "çamaşırhanede bekleyen / eksik" (S-95); uzun süre kapanmayan fark vurgulu.
- Alım = gider kaydı + `expense_items` (K-35); ürün fiyat geçmişi bu satırlardan; ayrı alım ekranı da aynı gider kaydını üretir (tek giriş).

### 6.14 Durum etiketleri ve sürekli istekler (yeni)
- `cellStyle(night, reservation, tags, settings)`: otomatik durum (6.3) → `status_tags(auto)` rengi; rezervasyonun özel etiketi varsa ve `priority_over_auto` ise özel etiket rengi üstte; ikisi de görünür (kenarlık + dolgu).
- `standingNoteAlert(guest)`: `standing_note` dolu ise rezervasyon panelinde ve hücre ipucunda uyarı; `warn` seviyesi kaydetmeden önce onay ister.

### 6.15 Odadaki kişiler ve KBS (yeni, K-33)
- `occupantCount(reservationRoom, at)` = `stay_occupants` içinde `arrived_at ≤ at < left_at` (boşsa birincil misafir = 1).
- `kbsMissing(today)`: giriş yapmış ve ayrılmamış her kişide `kbs_reported_at` yoksa → eksik; çıkış yapmış/ayrılmış kişide `kbs_checkout_at` yoksa → "KBS çıkışı yapılmadı". Takvim hücresi simgesi, Bugün kartı, vardiya devri özeti ve "Otelde kalanlar" ekranı aynı fonksiyonu kullanır.
- Kişi ekleme konaklama sırasında da yapılır (`arrived_at` = şimdi); tanıtıcı not yalnız personel ekranlarında görünür (§4.9-13).
- Testler: ikinci kişi sonradan eklenir → KBS eksik uyarısı çıkar, işaretlenince kalkar; çıkışta işaretsiz kişi "KBS çıkışı" uyarısı verir.

### 6.16 Vardiya devri özeti (yeni, K-34)
- `handoverSummary(now, shift)` (elle yazılmaz, türetilir): henüz giriş yapmamış bugünkü gelişler; bu gece kalanlar ve `kbsMissing`; çıkışı geçmiş ama çıkmamışlar; ödenmemiş bakiyeli konaklamalar; açık/geciken görevler; açık arızalar; kasa (yetkiye göre). Devir kaydedilirken `summary_json` anlık görüntü olarak saklanır; gelen vardiya "okudum" der; okunmamış devir Bugün'de rozet.

### 6.17 Görevler (yeni, K-34)
- Görünürlük: kişiye atanmış → o kişi + yöneticiler; role/vardiyaya atanmış → o rol/vardiyadaki herkes; kişisel not görev değildir (notes).
- Durum geçişi: open → done (yapan + saat) | cancelled (neden); done geri alınabilir (audit).

## 7. Ağ politikası

- Ağ kodu yalnızca dört yerde: `src/main/network/` (dış veri), `src/main/server/` (sunucu modu), `src/main/discovery/` (sunucu modunda yerel ağ duyurusu, mDNS), `src/renderer/lib/transport/` (istemci). Kanca zorlar (CLAUDE.md yasak 1).
- Dış veri: izinli alan adı listesi ayarlanabilir ama paket içi varsayılanla gelir; 5 sn zaman aşımı; zod ile yanıt doğrulama; `network.enabled=false` → sıfır istek.
- Sunucu modu: varsayılan tüm yerel arayüzlere bağlanır (otel PC NAT arkasındadır; internete açık değildir), ayarla yalnızca özel ağ arayüzüne sınırlanabilir; `remote.allowed` ile bir rol yalnız yerel ağa izinli yapılabilir; her `/api` isteği oturum belirteci ister (çerez `HttpOnly` + `SameSite=Strict` + Origin denetimi); `/` statik React paketi; CSP aynı; CORS yok. Bağlama/HTTPS kararı Faz 0 (A0.6).
- İstemci: `client.hostUrl` ayarı; yerel ağda `bonjour` keşfi; bağlantı yoksa son başarılı yanıt önbelleği salt‑okunur.
- Renderer'da CSP `connect-src 'self' <hostUrl>`; CDN yok; fontlar paket içinde.

## 8. Güvenlik

- Electron: `contextIsolation`, `sandbox`, `nodeIntegration:false`; preload yalnızca kontrat.
- Şifre/PIN: scrypt; başarısız deneme sınırı ve kilit; boşta kilit.
- HTTP oturumları: rastgele 256‑bit belirteç, `sessions.token_hash`; süre (ayar); cihaz listesi ve iptal (G-144); istek hız sınırı; uzaktan izinli roller.
- Taşıma şifrelemesi: özel ağ (WireGuard) uçtan uca; yerel ağda HTTP (seçenek: kendinden imzalı HTTPS; K-19).
- Kişisel veri: kimlik numaraları maskeli; KBS içe aktarmada ad/kimlik saklanmaz; ekler yalnızca yerel klasörde.
- Veritabanı dosyası şifrelenmez (K-05); **Drive'a giden yedek ve kutu paketleri her zaman şifreli** (AES‑256‑GCM, "Bismuth anahtarı" QR + 11×5 harf-rakam kâğıt metni (K-41), cihazda `safeStorage`); yerel yedek isteğe bağlı şifreli. Kılavuz: otel PC'de BitLocker/aygıt şifreleme, Mac'te FileVault önerilir.

## 9. Depo yapısı

```
/
├─ CLAUDE.md, .claude/                 kurallar, kancalar, ajanlar, beceriler
├─ docs/plan/                          bu plan · docs/gelistirici/README.md geliştirici notları
├─ src/main/                           app (yollar, pencere durumu, menü, ana süreç i18n), api (Hono yönlendirici + işleyiciler:
│                                      IPC ve HTTP'nin ortak kapısı), db, services, ipc, server (Hono statik + güvenlik
│                                      başlıkları), security, windows, backup, network, discovery, notifications, printing, attachments
├─ src/preload/                        yalnızca `window.bismuth = { api, ready, platform }` (zod yok, ~0,4 KB)
├─ src/renderer/                       features/, components/{ui,…}, lib/{api,transport,theme}, i18n/{tr,en,ru}.json,
│                                      layouts/{desktop,mobile}, hooks/, styles/
├─ src/shared/                         contract/ (zod kontratı, kanal adları, hata kodları), domain/, money.ts, date.ts, format.ts, ids.ts
├─ drizzle/                            numaralı migrasyonlar (commit edilmiş olan değişmez; kurulumda extraResources)
├─ build/                              simge kaynağı (svg + 1024 png), paketleme
├─ resources/                          çalışma anı simgesi; ileride fontlar, tohum veriler (oda tipleri, ödeme, kanal, hizmet,
│                                      ülke eşleme, çamaşır türleri, yasal hatırlatıcılar)
├─ scripts/                            check, notices, i18n-check, ui-shot, make-icon; ileride seed-demo, holiday-generate
├─ tests/                              unit/ (node + jsdom), factories/ (bellek içi DB), e2e/{electron,mobile}
└─ .github/workflows/                  ci.yml (her push: doğrulama + Windows/macOS paketi), release.yml (v* etiketi)
```

**Çağrı yolu (Faz 1'de kuruldu):** renderer `lib/transport` (IPC ya da HTTP, aynı `Transport` arayüzü) → `bismuth:api` IPC kanalı
(`{path, body}` zarfı) ya da `POST /api/<prosedür>` → **aynı Hono uygulaması** (`src/main/api/app.ts`: bilinmeyen prosedür 404,
`ctx` yok 401, zod giriş 400, çıktı da zod'dan geçer) → `src/main/services` (`ctx` ile yetki + transaction + `audit_log`) → Drizzle.
IPC'de port açılmaz: `ipcMain.handle` isteği `app.fetch(new Request(...), { ctx })` ile işler; gönderen çerçevenin adresi denetlenir.

## 10. Performans hedefleri

v1 ile aynı + sunucu modu: `/api` yanıtı < 100 ms (yerel ağ), telefon Bugün ekranı ilk çizim < 2 sn (özel ağ üzerinden), tek sunucuya 5 eşzamanlı istemci.

## 11. Çoklu cihaz mimarisi (G-140 … G-146)

> **Karar (K-19 kesin, 2026-10-02):** C2 — aşağıdaki sunucu/istemci yapısına ek olarak **Mac'te salt‑okunur yedek kopya** (`change_log` tetikleyicileri + canlı akış), **şifreli kutu** (otelin Gmail hesabının Google Drive klasörü; Drive masaüstü uygulaması eşitler, Bismuth yalnız dosya yazar) ve **devralma sihirbazı**; canlı erişim ve telefon için **NetBird Free** (K-31; otel Gmail'i ağın sahibi, sahip davetli). Ayrıntı `04-arastirma/uzaktan-bulut-secenekleri.md` §6.1 ve §11. G-140…G-145 4. turda güncellendi.

**Modlar (kurulumda seçilir, sonra değiştirilebilir):**

| Mod | Nerede | Davranış |
|---|---|---|
| Tek bilgisayar | Küçük otel, tek PC | IPC; sunucu kapalı. |
| **Sunucu** | Otel bilgisayarı | IPC + Hono sunucusu açık (port ayarlanır); yerel ağda `bonjour` ile "Bismuth @ Lale" olarak duyurur; özel ağ adresi varsa ayarlarda gösterir; QR kod ile telefon bağlantısı. |
| **İstemci + yedek kopya** | Sahibin Mac'i | Yazmalar `hostUrl`'e (canlı); yerel **salt‑okunur yedek kopya** (SQLite) canlı akıştan ve Drive kutusundan güncellenir; bağlantı yoksa tüm ekranlar kopyadan salt‑okunur ("Yedek kopya · saat" rozeti); "Ana bilgisayarı devral" sihirbazı. |
| Tarayıcı / telefon | Herhangi cihaz | `http(s)://<adres>:<port>` → mobil düzen; "ana ekrana ekle" (PWA kabuğu). |

**Uzaktan erişim:** Otel bilgisayarına NetBird kurulur ve **otelin Gmail hesabıyla** ağ açılır (Windows servisi, kurulum anahtarı, oturum süresi dolması kapalı); sahip Mac'ine ve telefonuna NetBird uygulamasını kurup **kendi hesabıyla davetli** girer. Bismuth sunucu ayarlarında özel ağ adresini (örn. `http://bismuth-host.netbird.cloud:7373` ya da `100.x.y.z`) otomatik tespit eder ve QR olarak gösterir; telefonda HTTP (tünel zaten şifreli). Drive: otel PC'de Drive masaüstü uygulaması (otel hesabı), Mac'te paylaşılan "Bismuth" klasörü. Kılavuz resimli. Tailscale/ZeroTier/aynı yerel ağ da çalışır (Bismuth ağdan bağımsız). Alternatifler ve neden reddedildikleri K-19, K-31.

**Arıza durumları:** otel PC kapalı → Mac'te yedek kopya salt‑okunur tam görüntü (telefonda Drive'daki PDF özet; G-145); özel ağ engellenirse Mac kopyası Drive kutusundan güncellenmeye devam eder; özel ağ kesik ama yerel ağda → otomatik yerel adres; sunucu sürümü ≠ istemci sürümü → istemci sunucunun sunduğu tarayıcı arayüzüne yönlendirilir (sürüm uyumsuzluğu asla veri bozmaz).

**Yazma kuralı:** tüm yazmalar sunucuda, tek SQLite bağlantısı, transaction; istemciler yalnızca kontrat çağırır. Böylece CRDT/senkron ihtiyacı yok.

## 12. Dil (G-08, K-17, K-20)

- `tr.json` kaynak; `en`, `ru` aynı anahtarlar; eksik anahtar → `en` → `tr`. Çoğul: CLDR ekleri (`ru`: one/few/many/other); i18next ≥24 `Intl.PluralRules` kullanır.
- Biçimler `Intl` ile dile göre (`tr-TR`, `en-GB`, `ru-RU`); para her dilde Latin rakam, `src/shared/format.ts` üzerinden.
- **Arapça ertelendi** (v3). Ucuz sigorta olarak Tailwind mantıksal sınıflar (`ms-`, `me-`, `ps-`, `pe-`, `text-start`) kuralı korunur; takvim ızgarası ve sayısal tablolar zaten LTR. İleride Arapça eklemek = çeviri dosyası + font + RTL QA.
- Fontlar paket içi: Inter (değişken; Latin/Türkçe/Kiril).
- Çeviri akışı: i18next-cli ile anahtar çıkarma → `tr.json` elle → `en/ru` üretilir ve Faz 15'te gözden geçirilir; `turkish-ui-copy` ajanı üç dosyanın anahtar eşitliğini denetler.
- Electron: `spellcheck: false` (Windows'ta sözlükleri CDN'den indirir); menü/diyalog metinleri ana süreçte i18next ile.
