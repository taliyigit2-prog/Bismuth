# Derin depo araştırması: alan (PMS) · Türkiye'ye özgü · hava durumu (Bismuth)

Tarih: 2026-10-01 · Hazırlayan: araştırma ajanı · Hedef dosya (plan): `docs/plan/04-arastirma/repo-alan-tr-hava.md`
(Faz 11 bu adla atıf yapıyor). Önceki raporlar tekrar edilmedi: `hotel-pms-features.md`, `public-apis.md`,
`fx-remote-access.md`; yalnızca **yeni bulgu, düzeltme ve karar** yazıldı.

## Doğrulama notu (önce okuyun)

| Kaynak türü | Erişim | Nasıl kullanıldı |
|---|---|---|
| GitHub arama (MCP `search_repositories`, `search_code`) | ✅ | Depo/yıldız/son etkinlik, kod içinde arama |
| `raw.githubusercontent.com` | ✅ | README, LICENSE, şema/migrasyon dosyaları, MET belge deposu, Open‑Meteo site kaynağı, canlı `currency-api-tr` JSON |
| npm kayıt defteri | ✅ | Sürüm/tarih/lisans; `i18n-iso-countries`, `@meteocons/svg-static` paketleri indirilip incelendi |
| `api.github.com`, `github.com` HTML, api.met.no, open-meteo.com, ktb.gov.tr, jandarma.gov.tr, mgm.gov.tr, visualcrossing.com, hmsotel.com, aa.com.tr, jsDelivr, truncgil | ❌ vekil engeli | Bu konulardaki bilgi resmî belgenin GitHub kaynağından (MET, Open‑Meteo) ya da arama özetinden; ikincisi **(doğrula)** ile işaretli |
| Yerel deneme | ✅ | Node 22 `Intl.DisplayNames('tr')`, KBS etiketi → ISO otomatik eşleme betiği (Ek A) |

Canlı API çağrısı gereken her şey Faz 0 A0.5'te (GitHub Actions, `prototypes/live-checks` (arşiv etiketi `archive/faz0`)) tekrar sınanmalıdır.

---

## 0. Yönetici özeti ve nihai seçimler

**En önemli 6 bulgu**

1. **Türkçe açık kaynak "otel otomasyonu" depoları işe yaramaz** (216 + 732 sonuç, en iyisi 11★; C# WinForms + Access
   öğrenci projeleri; para `money`, bakiye satırda saklı, denetim yok). Gerçek tasarım referansı yabancı ama
   **üretimde çalışan** üç projedir: **OCA/pms 16.0** (AGPL, fikir), **open-hotel-pms** (MIT, Tayland'da bir otelde
   Mart 2026'dan beri üretimde) ve **siewong007/hotel-app** (MIT, React 19 + Tauri masaüstü).
2. **KBS için altın kaynak bulundu:** `tunjayoff/KBS-Sync` (MIT, Ağustos 2026). Temmuz 2026'da açılan yeni
   `kbs.egm.gov.tr` portalının alanları, kuralları ve **248 satırlık uyruk listesi** (sahibin Excel'indeki
   `GERMANY (Deutschland)`, `SWITZERLAND (Confederation of Helvetia)`, `SERBIA AND MONTENEGRO`,
   `KUZEY KIBRIS TURK CUMHURİYETİ` biçimleri birebir) var. Listenin kökeni ~2004–2006 tarihli "Rowlett Country Codes"
   tablosu; bu tabloyla **246 KBS ülkesinin 238'i otomatik ISO koduna eşlendi**, 8'i elle → **Ek A hazır tohum**.
   KBS‑Sync'in kendi ISO tablosunda hata var (`IND → 33` = British Indian Ocean Territory; doğrusu 101) → kopyalanmaz.
3. **Yabancı misafir için KBS zorunlu alanları pasaportta olmayan bilgileri de içerir:** anne adı, baba adı,
   doğum yeri (yalnızca plaka ve telefon isteğe bağlı). Misafir formunda "KBS için eksik" rozeti gerekir.
4. **Hava durumu:** anahtarsız ve ticari kullanıma açık **tek** sağlam kaynak **MET Norway Locationforecast 2.0**
   (CC BY 4.0 + NLOD; User‑Agent zorunlu). **Open‑Meteo ücretsiz API'si ticari ürüne entegrasyonu açıkça "commercial"
   sayıyor** → varsayılan olamaz. MET'in `compact` yanıtında **yağış olasılığı (%) yok** → G‑113 için sahibe soru.
5. **Simgeler için yeni bağımlılık gerekmez:** `lucide-react` (ISC, shadcn ile zaten gelir) tüm hava simgelerini
   içeriyor; daha zengin görünüm istenirse **Meteocons monochrome** (MIT, `currentColor` → CSS değişkeni) alt kümesi.
6. **Düzeltme (kur):** `MehmetAkgul/currency-api-tr` canlı verisinde dövizlerin `source` alanı **`tcmb`**; yani
   alış/satış = TCMB döviz alış/satış, **piyasa kuru değil** (yalnız gram altın truncgil'den). Önceki raporda
   "piyasa kaynağı #3" diye geçiyordu.

**Nihai seçimler**

| Konu | Seçim | Not |
|---|---|---|
| PMS tasarım referansı (fikir) | **OCA/pms 16.0** | gece satırı, folio ödeme durumu, check‑in kişi durumu, iptal kuralı, polis (SES) + istatistik (INE) modülü = KBS + Bakanlık analoğu |
| PMS referansı (MIT, uyarlanabilir) | **peeraseepat-cell/open-hotel-pms** | çamaşırhane partisi, vardiya defteri, kayıp eşya, konaklama sayısına bağlı bakım, gün sonu özeti |
| PMS referansı (MIT, masaüstü/React) | **siewong007/hotel-app** | depozito/iade, kanal komisyonunun rezervasyonda dondurulması, ödeme idempotency, yedek formatı |
| KBS alan/kural referansı | **tunjayoff/KBS-Sync** (MIT) | entegrasyon **yok** (G‑53, kapsam dışı listesi); yalnızca alan listesi ve uyruk tablosu |
| KBS uyruk → ISO | **Ek A** (bu rapor) | 238 otomatik + 8 elle; Faz 2 tohum verisi |
| Türkçe ülke adları | **`i18n-iso-countries` 7.14.0 `tr`** (MIT) → DB'ye tohum | çalışma zamanında `Intl.DisplayNames` kullanılmaz (Electron sürümüyle değişir) |
| Bakanlık ülke adı | `ministry_name_tr` sütunu, sahibin panel listesinden doldurulur | panel listesi kamuya açık bulunamadı |
| TC / YKN / VKN / IBAN | **kendi kodumuz** `shared/domain/tr-*.ts` | npm paketleri küçük/bakımsız; algoritmalar §2.4 |
| Telefon | **`libphonenumber-js` 1.13.14** (MIT, `min` metadata) | E.164 saklanır |
| Tatil | değişiklik yok: `date-holidays` 3.37.0 + Diyanet yıllık sayfası | 2027 Diyanet tarihleri önceki tabloyla aynı |
| Hava birincil | **MET Norway Locationforecast 2.0 `compact`** | anahtarsız, ticari serbest |
| Hava yedek | **önbellek** + isteğe bağlı (varsayılan **kapalı**) Open‑Meteo | sahip "ticari değil" şartını kabul ederse |
| Hava kullanıcı anahtarı | **Visual Crossing** (ücretsiz plan ticari serbest, 15 gün, `precipprob`) **(doğrula)** | ikinci seçenek OpenWeatherMap (5 gün) |
| Hava simgeleri | **lucide-react** (varsayılan) + isteğe bağlı **Meteocons monochrome** alt kümesi (~25 SVG) | MET'in kendi MIT simgeleri de uygun |
| Konum | paket içi şehir listesi (GeoNames CC BY 4.0) + elle enlem/boylam | çevrimiçi geocoding yok |

---

## 1. Açık kaynak otel PMS / rezervasyon depoları (tasarım referansı, bağımlılık değil)

### 1.1 Arama kapsamı

| Sorgu | Sonuç | Not |
|---|---|---|
| `hotel management system` (yıldıza göre) | 31.790 | QloApps dışındakiler ders projesi (Java/PHP/C#) |
| `property management system hotel pms` | 128 | 2026'da açılmış çok sayıda yapay zekâ destekli TS projesi |
| `hotel pms typescript react` | 12 | hotel-app, BlancaPatagonia, StoyOps … |
| `hostel management system` | 10.489 | öğrenci yurdu (okul) sistemleri — alakasız |
| `tape chart` / `room rack` | 0 | terim GitHub'da kullanılmıyor; takvim kütüphaneleri ayrı araştırıldı (Faz 0 A0.3) |
| `otel otomasyonu` | 216 | en iyisi 11★ (C# + Access) |
| `pansiyon` / `otel yönetim` / `otel rezervasyon` / `otel programı` | 732 | en iyisi 11★ |
| `kimlik bildirim sistemi` | 2 | biri Jandarma KBS'ye çalışan bildirimi yapan Python betiği |
| kod: `"kbs.egm.gov.tr"` | 29 dosya | **KBS-Sync**, Syroce-PMS, GMK360 (sahte/mock SOAP) |
| `channel manager` | atlandı | G‑05 (OTA entegrasyonu yasak) |

### 1.2 İlk 10 depo — değerlendirme

| # | Depo | ★ / son etkinlik | Lisans | Yığın | Ne öğreniriz | Kod alınabilir mi |
|---|---|---|---|---|---|---|
| 1 | **Qloapps/QloApps** | 14.405 / 2026‑10‑01 | OSL‑3.0 (çekirdek), AFL‑3.0 (modüller) | PHP 8.1–8.4, MySQL (PrestaShop 1.6 türevi) | Kısmi ön ödeme %, iade kuralları + iade talep kuyruğu, tarih/hafta günü fiyat kuralları, doluluk bazlı fiyat, hizmet ürünleri, oda kapatma tarihleri, rezervasyon durum geçmişi, belgeler. Sürüm 1.7.0 (PHP 8.4, toplu oda); 1.7.0'da güvenlik açıkları → ≥1.7.1 | Hayır (copyleft); yalnızca fikir |
| 2 | **OCA/pms** (`16.0` dalı; `19.0` dalı başka, gayrimenkul) | 89 / 2026‑09‑26; `pms` 16.0.4.24.0 | AGPL‑3 | Odoo 16 / Python | Bkz. §1.3 — en olgun açık veri modeli | Hayır; fikir |
| 3 | **OCA/vertical-hotel** | 159 / 2026‑10‑01 (Odoo 19) | AGPL‑3 | Odoo / Python | Folio, kat hizmetleri (aktivite + denetçi), rezervasyon özeti, raporlar; OCA/pms'ten basit | Hayır; fikir |
| 4 | **HotelDruid** (`digital-druid/hoteldruid` aynası; ana yer SourceForge) | 17 / 2026‑07‑19 | AGPL‑3 | PHP; MySQL/PostgreSQL/**SQLite** | Dönem × fiyat matrisi; "tek sefer / günlük" ek ücret; fiyat planına bağlı varsayılan depozito; yerleşik yedek. 2.2.3'te SQL enjeksiyonu (CVE deposu var) → parametreli SQL kuralımızı doğrular | Hayır; fikir |
| 5 | **peeraseepat-cell/open-hotel-pms** (aynı içerik `kamalxmax-netizen/…`) | 4 / 2026‑09‑23 | **MIT** | Next.js + Supabase/Postgres + TS + Tailwind | 74 migrasyon: çamaşırhane partileri, vardiya defteri, kayıp eşya, konaklama sayısına bağlı bakım, gün sonu özeti, misafir adı takma adları, planlı oda değişikliği, grup check‑in sihirbazı (§1.4) | **Evet** (MIT; Postgres → SQLite/Drizzle'a çevrilerek, atıfla) |
| 6 | **siewong007/hotel-app** | 0 / 2026‑10‑01 | **MIT** | React 19 + TS (MUI, TanStack), Rust/Axum, Postgres, **Tauri 2 masaüstü** (gömülü Postgres) | Depozito + sınırlı iade, `deposit_forfeited`; ödemede idempotency anahtarı; kanal fiyat/komisyon kuralları **tarihli** ve rezervasyon yazılırken **dondurulur**; şirket (city ledger) tahsilat dağıtımı; gece denetimi; rapor kataloğu; bölümlenmiş denetim günlüğü; `hotel-backup v1` (yükle → önizle → uygula); i18n eşlik testleri; satır detay çekmecesi | Evet (MIT). Dikkat: otomatik güncelleyici, PayPal, e‑posta içerir → bizde yasak/kapsam dışı |
| 7 | **tunjayoff/KBS-Sync** | — / 2026‑08 | **MIT** | Go ajan + TS Chrome eklentisi + Flutter MRZ | PMS değil; KBS portal alanları, uç noktalar, kurallar, uyruk listesi (§2.1–2.2) | Veri tablosu evet (atıfla); ISO eşlemesi **hayır** (hatalı) |
| 8 | **beyinsiz1903/Syroce-PMS** | 0 / 2026‑10‑01 | **lisans yok** (tüm hakları saklı) | React 19 + Tailwind + **shadcn/ui** + FastAPI + Mongo | Türkçe arayüz (8 dil), KBS bildirim kuyruğu ekranı (durum, son hata, "tekrar gönder"), HotelRunner/Exely kanal yöneticisi (bizde yasak) | **Hayır**; yalnızca ekran fikri |
| 9 | **blanca-patagonia/BlancaPatagoniaHotelApp** | 2 / 2026‑09‑24 | lisans yok | Next.js 16 + Supabase + vitest | "Overbooking veritabanı kısıtıyla garanti" (exclusion constraint) — bizdeki `UNIQUE(room_id, night)` ile aynı ilke; "consumos" (ek harcama) akışı | Hayır |
| 10 | **TheProjectSEO/hotel-pms** (OPERA eğitim simülatörü) · **2470185/hotel-property-management-system** (vaka çalışması, kaynak kapalı) | 1 · 0 | yok | Next.js · React + PocketBase(SQLite) | OPERA kısayolları (F2 profil, F3 boş oda, Ctrl+R yeni rezervasyon, Shift+F3 oda durumu) → klavyeyle resepsiyon; **devamdan türetilen bordro**, bordro rakamları varsayılan **maskeli**, rol bazlı tek uygulama | Hayır |

Ek: `JayVora-SerpentCS/OdooHotelManagementSystem` (232★, Odoo 10 varsayılan dal) OCA/vertical-hotel'in atasıdır, eskidir.

### 1.3 OCA/pms 16.0 — çıkarılan veri modeli (dosyalardan okundu)

- `pms.reservation.line` = **bir gece bir satır**: `date`, `room_id`, `price`, `discount`, `cancel_discount`,
  `occupies_availability`, `overbooking`, `sale_channel_id`, `default_invoice_to`. Müsaitlik sorgusu
  `date ∈ [checkin, checkout−1]` ve `occupies_availability = True` → bizim `[giriş, çıkış)` kuralıyla aynı.
- `pms.reservation.state`: `draft` (ön rezervasyon) · `confirm` (gelişi bekleniyor) · `onboard` · `done` · `cancel` ·
  `arrival_delayed` · `departure_delayed`. `reservation_type`: `normal` · `staff` (personel konaklaması) · `out`
  (hizmet dışı) → **oda kapatma, takvimde rezervasyon türü olarak** görünür. `blocked` bayrağı = otomatik taşınmasın.
- `pms.folio.payment_state` (türetilmiş): `not_paid` · `partial` · `paid` · `overpayment` · `nothing_to_pay`;
  ayrıca `pending_amount`, `commission`, `cancelled_reason`, `prepaid_warning_days`.
- `pms.checkin.partner.state`: `dummy` (bilinmeyen misafir — kişi sayısı kadar boş satır) · `draft` (eksik veri) ·
  `precheckin` · `onboard` · `done` · `cancel`; folio'da `pending_checkin_data` / `ratio_checkin_data` (kimlik verisi
  tamamlanma oranı); `possible_existing_customer_ids` + `partner_incongruences` (tekrar kayıt / çelişki uyarısı);
  `partner_relationship` (yakınlık), `signature`.
- `pms.cancelation.rule`: `days_intime`, `penalty_late` %, `apply_on_late` (`first`/`all`/`days` + `days_late`),
  `penalty_noshow` %, `apply_on_noshow` (aynı seçenekler + `days_noshow`).
- `pms.availability.plan.rule` (gün × oda tipi): `min_stay`, `min_stay_arrival`, `max_stay`, `closed`,
  `closed_arrival`, `closed_departure`, `quota`, `max_avail`.
- `pms.sale.channel`: `channel_type` (`direct`/`indirect`), `is_on_line`; `pms.room.closure.reason` (ad + açıklama).
- `pms_l10n_es`: İspanya polis bildirimi (**SES Hospedajes** iletişim kaydı + kuyruk) ve **INE** turizm istatistiği
  sihirbazı → Türkiye'deki **KBS + Bakanlık konaklama istatistiği** ikilisinin birebir benzeri; ayrı modül olarak
  tasarlanmaları iyi ayrımdır (yerelleştirme çekirdeğe gömülmez).

### 1.4 open-hotel-pms (MIT) — doğrudan uyarlanabilir tablolar

- **Çamaşırhane** (Faz 12 ile örtüşüyor): `linen_items` (kategori bed/bath/misc, parça fiyatı), `linen_item_rates`
  (**geçerlilik ayı**, `effective_month` ayın 1'i), `room_linen_setups` (oda tipi başına beklenen çarşaf/havlu adedi →
  tahmini kirli sayısı), `laundry_batches` (iş günü, **alış turu**, tedarikçi, durum `draft → fo_dirty_counted →
  vendor_signed → fo_return_counted → fo_return_signed → closed | partial | disputed`), `laundry_batch_items`
  (`estimated_qty`, `sent_by_hotel`, `received_back`, `damaged_qty`), `laundry_pending_items` (**eksik dönen adet bir
  sonraki partiye devreder**), `laundry_rewash_events` (yeniden yıkama, fotoğraf zorunlu), `laundry_monthly_close`
  (toplam adet/tutar, yeniden açma **en az 10 karakter gerekçe** ile), `linen_variance_config` (yeşil %90–110,
  sarı %70–130), aylık tedarikçi ekstresi.
- **Vardiya defteri**: `shift_log_entries(log_date, hour_slot 0–23, body, created_by, updated_by)`.
- **Kayıp eşya**: `lost_found_items` (oda, rezervasyon, misafir, açıklama, kategori `general/electronics/clothing/
  documents/valuables/other`, durum `pending/claimed`, bulan, yer, teslim alan, imha).
- **Konaklama sayısına bağlı bakım**: `maintenance_tasks(threshold_count, warning_count, applicable_room_types,
  checklist_items)` + `maintenance_logs(stay_count_at_time)`; durum **hesaplanır** (son bakımdan bu yana konaklama
  sayısı) → G‑60 "türetilebilen hesaplanır" ilkesine uygun (ör. "yatak çevirme her 40 konaklamada").
- **Gün sonu**: `daily_snapshots(business_date UNIQUE, occupancy_pct, adr, revpar, by_source, payment_cash/
  transfer/card/other, eod_run_by)` — rapor hızlandırma ve denetim için donmuş özet.
- **Folio ödemeleri**: tutar **daima pozitif**, yön `tx_type`'tan; `paid_date` = **yerel gün** (günlük özet için ayrı
  sütun) → bizim `YYYY-MM-DD` kuralı.
- Ayrıca: `guest_booking_name_aliases` (OTA'dan gelen "SMITH JOHN" / "Mr John Smith" varyantları),
  `guest_profile_conflict_events`, `planned_room_move`, `group_checkin_wizard`, `booking_alarms` / `alert_rules`.

### 1.5 Türk "otel/pansiyon otomasyonu" depoları — ne gösteriyor

- Tipik ekranlar: **renkli oda düğmeleri ızgarası** (dolu kırmızı / boş yeşil), müşteri kayıt formu (TC, ad, soyad,
  telefon, giriş‑çıkış, ücret), "kasa / gelir‑gider", personel maaşı. Sahibin zihnindeki "oda durumu" panosu budur →
  Bugün/oda durumu ekranında takvime ek olarak **kat planı düğme ızgarası** iyi bir tanıdık görünüm.
- Kaçınılacaklar (ör. `eysilmadz/VTYSProje` şeması): `money` türü, `kasadurum` bakiyesi satırda saklı, bir rezervasyon
  = bir oda, `tckimlikno varchar(11)` doğrulamasız, denetim/iptal izi yok, KBS/folio yok.

### 1.6 En iyi fikirler → Bismuth modülleri

| Modül | Fikir | Kaynak |
|---|---|---|
| **Takvim** | Gece satırı + `UNIQUE(room_id, night)`; personel konaklaması ve hizmet dışı kapatma = **rezervasyon türü** (takvimde aynı çubuk, farklı desen); `blocked` (sürüklenmesin); kapalı geliş/çıkış günü (etkinlik günleri); planlı oda değişikliği; F‑tuşu kısayolları; **günübirlik** türü KBS'de ayrı kavram (`gunuBirlikId`) | OCA/pms, open-hotel-pms, OPERA eğitim, KBS-Sync |
| **Folio / ödeme** | Türetilmiş ödeme durumu `not_paid/partial/paid/overpayment/nothing_to_pay` → takvim rengi; iptal/no‑show kuralı (gün eşiği, %, ilk gece/tüm geceler/N gece); depozito: tutulan → uygulanan / iade (tutulanla sınırlı) / **yanan** (`deposit_forfeited`); kanal komisyonu rezervasyonda **dondurulur**; ödeme kaydında `client_request_id` (çift tıklama) | OCA/pms, hotel-app |
| **Kasa / gün sonu** | Donmuş `daily_snapshots` (yöntem × tutar, doluluk, ADR); ay kapama + **gerekçeli yeniden açma** + yeniden kapama izi | open-hotel-pms |
| **Kat hizmetleri** | Oda tipi başına beklenen çarşaf/havlu/ikram seti → çıkış odası için otomatik liste; rol kapsamlı mobil görünüm; denetçi onayı | open-hotel-pms, OCA vertical-hotel, 2470185 |
| **Bakım** | Takvim bazlı (önceki rapor) **+ konaklama sayısı bazlı** önleyici bakım; kapatma nedeni sözlüğü; çözülmemiş arıza → oda satılamaz | open-hotel-pms, OCA/pms |
| **Misafir geçmişi** | Rezervasyon kişi sayısı kadar "bilinmeyen misafir" satırı → check‑in'de doldurulur; **KBS eksik alan oranı**; tekrar kayıt adayı + çelişki olayı; OTA ad varyantları için takma ad tablosu | OCA/pms, open-hotel-pms |
| **Kara liste** | Hassas alan "göster" yetkisi ve her gösterimin denetim kaydı | hotel-app (eKYC reveal) |
| **Raporlar** | Yerelleştirme modülü ayrı: polis listesi (KBS) + resmi istatistik (Bakanlık); rapor kataloğu (kayıt defteri); kanal karması, alacak yaşlandırma, dönem kıyası | OCA/pms_l10n_es, hotel-app |
| **Personel / bordro** | Devamdan türetilen bordro; bordro rakamları ortak ekranda **varsayılan gizli**; KBS'de ayrıca **çalışan bildirimi** sayfası var (§2.1) → işe giriş/çıkışta hatırlatma (öneri) | 2470185, KBS-Sync |
| **Tedarik / çamaşırhane** | Tarihli birim fiyat; parti bazlı gönderilen/dönen/hasarlı; **devreden eksik**; yeniden yıkama; fark eşikleri; aylık kapama + tedarikçi ekstresi; zam uyarısı | open-hotel-pms |

**Lisans kuralı:** AGPL/OSL kodu (Odoo, QloApps, HotelDruid) Bismuth'a kopyalanmaz — yalnızca fikir. MIT
(open-hotel-pms, hotel-app, KBS-Sync, SyncZen-Cloud) parçalar atıf + `docs/plan/bagimliliklar.md` notu ile
uyarlanabilir. Lisanssız depolar (Syroce, BlancaPatagonia, OPERA eğitim, 2470185) yalnızca ekran fikri.

---

## 2. Türkiye'ye özgü depolar ve veriler

### 2.1 KBS (Kimlik Bildirim Sistemi) — alanlar ve kurallar (entegrasyon YOK)

Kaynak: `tunjayoff/KBS-Sync` (MIT) `docs/kbs-dom-research/README.md`, `api-first-research.md`,
`2026-08-11-live-discovery.md` — yetkili oturumda Ağustos 2026'da çıkarılmış, kişisel veriden arındırılmış notlar.
Bismuth KBS'ye bağlanmaz (01-gereksinimler kapsam dışı: "KBS'ye otomatik gönderim"); aşağıdakiler **alan listesi ve
iş kuralı** olarak kullanılır.

**Portal:** Temmuz 2026'da yeni `kbs.egm.gov.tr` (Angular 20 + PrimeNG; duyurular 20.07.2026 tarihli). Giriş: F5
`my.policy` → kullanıcı adı + **TC kimlik no** + şifre (+ TOTP). Sayfalar: `/Konaklayan` (misafir), `/Calisan`
(**çalışan bildirimi** ve alt kullanıcılar), `/GunuBirlikKonaklayan` (yalnız bazı tesis türlerinde). Kadıköy =
Emniyet (EGM) bölgesi; kırsalda Jandarma KBS ayrı sistemdir.

**Türk vatandaşı ekleme:** `kimlikNo` (MERNIS sorgusu ad, soyad, anne/baba adı, doğum yeri/tarihi, cinsiyeti kendisi
doldurur) + **`verilenOda` (zorunlu)** + `aracPlaka` (isteğe bağlı) + cep telefonu (isteğe bağlı).

**Yabancı ekleme** (arayüz metni: plaka ve telefon dışında hepsi zorunlu):

| Alan (portal) | Bismuth alanı (öneri) | Not |
|---|---|---|
| `gecerliBelge` | `document_no` (+ `document_kind`: passport/id/residence) | belge türü portalda ayrı alan değil |
| `adi`, `soyAdi` | `first_name`, `last_name` | |
| `anaAdi`, `babaAdi` | `mother_name`, `father_name` | **pasaportta yok** → resepsiyonda sorulur |
| `ulkeKodu` (açılır liste `seciliUlke`) | `nationality` (ISO) → `kbs_country_id` türetilir | Ek A |
| `cinsiyet` | `gender` | 1 = Erkek, 2 = Kadın |
| `dogumTarihi`, `dogumYeri` | `birth_date`, `birth_place` | |
| `verilenOda` | konaklamadaki oda no | serbest metin |
| `aracPlaka`, `cepTelefonu` | `vehicle_plate`, `mobile` | isteğe bağlı |

**Liste/Excel sütunları:** portal ızgarası `Kimlik No · Geçerli Belge (Yabancı) · Ad · Soyad · Araç Plaka · Verilen Oda ·
Ülke Adı · Geliş Tarihi`; sahibin "EGM Konaklayan Listesi" dosyası (02-excel-analizi §2.4.2): `Tc Kimlik No · Geçerli
Belge · Adı · Soyadı · Araç Plakası · Geliş Tarihi · Çıkış Tarihi · Verilen Oda · Cinsiyet · Uyruğu · Durum`
(Aktif/Pasif). Değerler **maskeli** gelir (`10******146`, `ZZ*****`).

**İşletme kuralları (otel personeline hatırlatma metni olarak değerli):**

- Oda numarası güncelleme yalnızca **girişten sonraki ilk 1 saat** içinde yapılabilir (portal bilgilendirmesi); sonrası
  için çıkış + yeni giriş gerekir **(doğrula)** → Bismuth'ta oda değişikliğinde uyarı.
- Ekleme veya pasife çekmeden sonraki **5 dakika** içinde aynı kişi için yeni işlem reddedilir.
- Dolu odaya ekleme ayrı onay ister ("Bu odada aktif konaklayan bulunmaktadır…").
- Oda bazlı toplu çıkış ve **"Toplu Excel İşlemleri"** (toplu ekleme) var; şablon sütunları bilinmiyor **(doğrula)**.
- Aşırı istek (HTTP 429) oturumu kapatır (otomasyon yapanlar için; bizi ilgilendirmez).

**Bismuth'a etkisi (Faz 2/6):** misafir formunda uyruk ≠ TR ise anne adı, baba adı, doğum yeri, cinsiyet, doğum tarihi,
belge no **"KBS için gerekli"** rozetiyle; Bugün ekranında "KBS girişi bekleyen" (check‑in yapılmış, `kbs_in_at` boş)
ve "KBS çıkışı bekleyen" (çıkmış, `kbs_out_at` boş) listeleri (S‑61); belge no ekranda maskeli, yetkiyle gösterilir.

**Diğer KBS depoları:** `emrahgmrk/kimlik-bildirim-sistemi` (Jandarma KBS'ye Excel'den çalışan bildirimi, Python, 1★),
`muratozcirak-ai/GMK360` (KBS "SOAP" istemcisi **sahte/mock**, gerçek uç nokta değil) — referans değeri yok.

### 2.2 Uyruk eşleme tablosu (`country_map`) — KBS biçimi, kökeni, Türkçe adlar

**KBS listesi:** portal `GET /KbsApiGateway/Ortak/UlkeGetir` → `{ id, adi, kisaAdi, aktif }[]` (~247 kayıt; ör. Norveç
`id 163`, `kisaAdi "NOR"`). KBS-Sync'teki seçenek listesi 248 satır (yer tutucu + "BİLİNMİYOR" dahil). Etiketler
İngilizce büyük harf + parantezli yerel ad: `CHAD (Tchad)`, `CROATIA (Hrvatska)`, `GERMANY (Deutschland)`,
`LIBYA (Libyan Arab Jamahirya)`, `SPAIN (España)`, `SWITZERLAND (Confederation of Helvetia)`, `TAIWAN (Chinese Taipei
for IOC)`; Türkçe istisnalar: `TÜRKİYE` (1), `KUZEY KIBRIS TURK CUMHURİYETİ` (2), `KOSOVA CUMHURİYETİ` (244),
`FİLİSTİN` (246), `ULKE KODU GIRILMEMIS` (250); ayrıca `EUROPEAN UNION` (249).

**Köken:** aynı yazımlar (yazım hatası "Jamahirya" dahil) Russ Rowlett'in "Country Codes" tablosunda var
(ibiblio.org/units/codes/country.htm, eski unc.edu/~rowlett; sütunlar: ad · ISO 3166 alpha‑2 · alpha‑3 · internet ·
taşıt plakası · IOC · UN sayısal · telefon) **(sayfa vekil engelli; doğrula)**. KBS'deki `SERBIA AND MONTENEGRO`,
`NETHERLANDS ANTILLES`, `TIMOR-LESTE (formerly East Timor)` → listenin **2004–2006** sürümünden alındığı anlaşılıyor
(Sırbistan‑Karadağ 2006'da ayrıldı). Tablonun bir kopyası `SAP/sailing-analytics` deposunda
(`…/util/countrycodes.csv`, aslında HTML tablo) duruyor; eşleme için kullanıldı.

**Otomatik eşleme sonucu (bu oturumda betikle):** 246 gerçek KBS ülkesinden **238'i** ad eşleşmesiyle ISO alpha‑2'ye
bağlandı; **8'i elle** (TR, KKTC, GM, Sırbistan‑Karadağ, Kosova, FİLİSTİN, AB, "girilmemiş"). Sonuç **Ek A**.

**Belirsiz/özel durumlar (kural önerisi):**

| Durum | Öneri |
|---|---|
| 192 `SERBIA AND MONTENEGRO` | ISO `RS` ve `ME` → 192 (KBS'ye çıkarken); 192 → içe aktarmada varsayılan `RS`, kullanıcı değiştirebilir |
| 154 `NETHERLANDS ANTILLES` (ISO `AN` geri çekildi) | `CW`, `SX`, `BQ` → 154; Hollanda pasaportu ise 153 |
| 167 `PALESTINIAN TERRITORIES` ve 246 `FİLİSTİN` | ikisi de `PS`; çıkışta hangisi `aktif` ise o **(doğrula: `UlkeGetir.aktif`)** |
| 2 KKTC | ISO yok → özel kod (ISO kullanıcı aralığı, ör. `XC`); Bakanlık adı "Kuzey Kıbrıs Türk Cumhuriyeti"/"KKTC" (doğrula) |
| 244 Kosova | `XK` (fiilî kullanım; ICAO MRZ'de `RKS`) |
| KBS'de olmayan ISO: `AX`, `BL`, `MF`, `IM`, `SS`, `CW`, `SX`, `BQ` | AX→74 (Finlandiya), BL/MF→75 (Fransa), IM→228 (BK), CW/SX/BQ→154, **SS (Güney Sudan) → seçenek yok → 250** (doğrula) |
| 0 `BİLİNMİYOR`, 250 `ULKE KODU GIRILMEMIS` | `nationality = NULL`, raporda "Bilinmiyor" satırı |
| ICAO MRZ kodları (ileride pasaport okuma) | Almanya `D`, Kosova `RKS`, İngiliz varyantları `GBD/GBN/GBO/GBP/GBS`, BM `UNO/UNA` — alias tablosuna `source='icao'` |
| KBS-Sync `ISO_TO_KBS_NATIONALITY` | **kullanmayın**: `IND → 33` hatalı (101 olmalı); yalnız 60 ülke |

**Türkçe ülke adı kaynakları (yerel olarak karşılaştırıldı):**

| Kod | `i18n-iso-countries` 7.14.0 `tr` (MIT, 2025‑02) | `umpirsky/country-list` `tr` (MIT, ham CLDR) | `Intl.DisplayNames('tr')` (Node 22, ICU 77/CLDR 47) |
|---|---|---|---|
| CY | **Güney Kıbrıs Rum Kesimi** | Kıbrıs | Kıbrıs |
| CI | **Fildişi Sahili** | Côte d’Ivoire | Côte d’Ivoire |
| CZ | Çek Cumhuriyeti | Çekya | Çekya |
| HK | Çin Hong Kong ÖYB | Çin Hong Kong ÖİB | Çin Hong Kong ÖİB |
| CD / CG | Kongo - Kinşasa / Kongo - Brazavil | aynı | aynı |
| US | dizi: `ABD`, `A.B.D.`, `Amerika Birleşik Devletleri`, … | Amerika Birleşik Devletleri | Amerika Birleşik Devletleri |
| SZ | Svaziland | Esvatini | Esvatini |
| CV | Cape Verde | Cape Verde | Cabo Verde |
| XK | Kosova | — | Kosova |
| PS | Filistin Bölgeleri | Filistin Bölgeleri | Filistin Bölgeleri |

Karar: **`i18n-iso-countries` `tr` → tohum** (Türkiye resmî kullanımına daha yakın: "Güney Kıbrıs Rum Kesimi",
"Fildişi Sahili"); dizi dönen kodlarda ilk tam ad seçilir; birkaç düzeltme (HK "Hong Kong", MO "Makao", US "Amerika
Birleşik Devletleri"). Adlar **veritabanına yazılır**; çalışma zamanında `Intl.DisplayNames` kullanılmaz (Electron/ICU
sürümüyle "Çek Cumhuriyeti" → "Çekya" gibi değişip anlık görüntü testlerini ve raporları kaydırır). EN/RU arayüz için
aynı paketin `en`/`ru` dosyaları.

**Bakanlık listesi:** panelin ülke açılır listesi (ör. "Özbekistan") kamuya açık bir dosya olarak bulunamadı
(is.kultur.gov.tr erişilemedi). `ministry_name_tr` başlangıçta `name_tr` ile doldurulur; sahip ilk ayki girişte farklı
yazılanları düzeltir (`user_defined=1`). **Soru:** sahip panel listesini bir kez ekran görüntüsü / "sayfayı kaydet" ile
verebilir mi?

**Şema önerisi (03-mimari'deki `country_map(raw_name pk, iso2, ministry_name_tr, user_defined)` ile uyumlu ayrım):**

```text
countries        iso2 pk ('TR','DE'; özel: 'XC'=KKTC, 'XK'=Kosova, 'EU'), iso3?, name_tr, name_en, name_ru,
                 ministry_name_tr?, kbs_id?, kbs_label?, is_active, user_defined
country_map      raw_norm pk, raw_sample, iso2 fk → countries, source ('kbs'|'ministry'|'icao'|'iso'|'user'),
                 created_at, created_by        -- eşleşmeyen değer kullanıcıya sorulur, buraya eklenir
```

Normalleştirme (`shared/domain/country.ts`): `trim` → boşlukları teke indir → `toLocaleUpperCase('tr-TR')` = birincil
anahtar; bulunamazsa ikinci anahtar: aksan/İ‑I farkı kaldırılır (`İ→I`, `Ç→C`, `Ş→S`, `Ğ→G`, `Ö→O`, `Ü→U`, `Â→A`),
parantez içi atılır, harf dışı karakterler silinir. Böylece `KUZEY KIBRIS TURK CUMHURİYETİ` ↔ `Kuzey Kıbrıs Türk
Cumhuriyeti` ve `GERMANY (Deutschland)` ↔ `GERMANY` eşleşir. Test: sahibin Eylül 2026 dosyasındaki 23 uyruk.

### 2.3 Turizm Bakanlığı konaklama istatistiği (TİS) — doğrulananlar

- Sistem: `http://is.kultur.gov.tr/ktbyigm/welcome.xhtml` (il kültür turizm müdürlüğü sayfalarındaki bağlantı;
  arama özeti). Panel adı: "Konaklama Bildirimi"; form alanları **Ülke · Toplam Giriş · Toplam Geceleme** (sahibin
  ekran görüntüsü), doluluk oranını panel hesaplar.
- Süre: **her ayın 1–10'u**, bir önceki ay; **tüm konaklama tesisleri ve kamu misafirhaneleri** (Bakanlık belgeli ve
  belediye belgeli). Dayanak: 2634 sayılı Turizmi Teşvik Kanunu md. 11 (bilgi verme) + 5429 sayılı Türkiye İstatistik
  Kanunu (resmî istatistik).
- Yaptırım: veri girmeyen/eksik‑yanlış giren tesise **idari para cezası**; turizm işletme belgeliye Bakanlık, basit
  konaklama belgeliye valilik (il müdürlüğü) uygular (2026 haberleri; tutar **doğrulanmadı**).
- G‑150 / K‑29 ile uyumlu; ek bilgi yok. Hatırlatıcı tohumu (G‑93) "1'inde başla, 10'unda son".

### 2.4 Kimlik, vergi, telefon, IBAN doğrulama

| İhtiyaç | Seçenek | Karar |
|---|---|---|
| **TC kimlik no** | `tckn` 1.0.4 (ISC, 2025‑05), `turkish-id-validator` 1.0.3 (ISC, 2025‑02), `tckimlik` 0.0.2 (2020); `validator.js` `isIdentityCard` **TR desteklemiyor** (kaynak kontrol edildi) | **Kendi kodumuz** (`shared/domain/tr-id.ts`, ~15 satır) |
| **YKN** (yabancı kimlik no, `99` ile başlar) | aynı sağlama algoritması **(doğrula)** | aynı fonksiyon + `isForeignerId` |
| **VKN** (10 hane, firma kartı) | npm'de olgun paket yok | kendi kodumuz; GİB örnekleriyle test **(doğrula)** |
| **Telefon** | `libphonenumber-js` 1.13.14 (MIT, 2026‑09‑24, 457 sürüm — düzenli metadata güncellemesi) | **seç**; `libphonenumber-js/min`; E.164 sakla, TR için ulusal biçim göster; varsayılan ülke = misafir uyruğu |
| **IBAN** | `ibantools` 4.5.4 (MIT veya MPL‑2.0, 2026‑04); `iban` 0.0.14 (2020) | kendi 20 satırlık mod‑97 fonksiyonu (bağımlılık yok) veya `ibantools` |
| Banka adı (IBAN 5–9. haneler) | TCMB/BKM banka kodu listesi | küçük statik tablo **(doğrula)** — personel/tedarikçi IBAN'ında "Ziraat Bankası" gösterimi |
| İl/ilçe/mahalle | `turkey-neighbourhoods` 4.0.3 (MIT, 2024) | yalnız konaklama belgesi adresi için gerekirse |

Algoritmalar (bu oturumda Python ile sınandı):

```ts
// TC / YKN: 11 hane, ilk hane ≠ 0
d10 = ((d1+d3+d5+d7+d9)*7 − (d2+d4+d6+d8)) mod 10   // JS'de ((x % 10) + 10) % 10
d11 = (d1+…+d10) mod 10
// test: 10000000146 → geçerli; 10000000147 → geçersiz
// IBAN (TR): 26 karakter "TRkk BBBBB 0 HHHHHHHHHHHHHHHH"; ilk 4'ü sona al, harf→sayı (A=10…), mod 97 == 1
// test: TR33 0006 1005 1978 6457 8413 26 → geçerli
// VKN: i=0..8: t=(d[i]+9−i)%10; v=(t·2^(9−i))%9; t≠0 && v==0 ⇒ v=9; Σv; kontrol=(10−Σ%10)%10 == d[9]
```

### 2.5 Tatiller — önceki rapora ek

- npm'de `turkish-holidays`, `tr-holidays`, `resmi-tatiller`, `holidays-tr` **yok**; Hicrî dönüştürücüler
  (`hijri-converter` 2018, `@umalqura/core` 2019, `moment-hijri` 2024) bakımsız/gereksiz → **`date-holidays` kalır**.
- Diyanet resmî yıllık sayfası (ör. `vakithesaplama.diyanet.gov.tr/icerik.php?icerik=154` "2027 dini günler listesi"):
  2027 Ramazan Bayramı arife 8 Mart, 9–11 Mart; Kurban arife 15 Mayıs, 16–19 Mayıs → önceki rapordaki 2026–2036 tablosuyla
  **aynı**. Yayın öncesi her yıl için bu sayfa (çevrimiçi doğrulama kaynağı adayı, anahtarsız; biçim HTML) **(doğrula)**.

### 2.6 Türk kur depoları — bakım ve doğruluk

| Depo | Durum (2026‑10‑01) | Değerlendirme |
|---|---|---|
| `MehmetAkgul/currency-api-tr` | MIT, 6★, **2026‑06‑03'te açıldı** (4 aylık), GitHub Actions ~5 dk; `try-full.json` canlı okundu (raw GitHub): `sources: [tcmb, truncgil, fawaz, nbg, cbu, frankfurter]`; USD 48,9466/49,0348, EUR 55,2967/55,3963, GBP 64,6442/64,9812, RUB 0,58413/0,59178 — **hepsinde `source: "tcmb"`**; gram altın 6.592,64/6.593,44 `truncgil`; `is_stale:false` | **Düzeltme:** döviz alış/satışı TCMB döviz kuru, piyasa kuru değil → "Piyasa alış/satış" zincirinde yeri yok; yalnız altın için ve TCMB yansısı olarak. Tek kişilik, çok genç proje → yedek bile olsa düşük öncelik |
| `mustafagenc/kurlar` | TS, 5★, 14 açık sorun, son 2025‑09 | TCMB XML sarmalayıcı; kendimiz 30 satırda yazarız |
| `hsndmr/tcmb-currency-converter` | TS, 4★, 2023 | aynı; bakımsız |
| truncgil / genelpara / BigPara / doviz.com | önceki rapor (fx-remote-access.md A.1) | değişiklik yok; truncgil bu oturumda da vekil engelli |

Not: önceki rapordaki truncgil örneği (EUR 57,40) temsilîydi; 2026‑10‑01 TCMB EUR/TRY ≈ 55,35.
`raw.githubusercontent.com` jsDelivr'a erişilemeyen ağlarda çalışabilir; ancak uygulama trafiği için GitHub raw'u birincil
kaynak yapmayın (oran sınırı/şartlar; doğrula).

---

## 3. Hava durumu ("Bugün" kartı + 7 günlük sekme) — G‑113, K‑13

İstenen: şimdiki sıcaklık + durum simgesi, bugün en düşük/en yüksek, **yağış olasılığı**, rüzgâr, 7 günlük tahmin;
anahtarsız birincil + yedek; çevrimdışıyken son veri; paket içi simgeler; 60 dk önbellek; şehir kurulumdan (İstanbul
varsayılan).

### 3.1 Sağlayıcı karşılaştırması

| Sağlayıcı | Anahtar | Ücretsiz sınır | Ücretsizde **ticari** kullanım | İstanbul / model / ufuk | Yağış olasılığı | Lisans / atıf | Karar |
|---|---|---|---|---|---|---|---|
| **MET Norway Locationforecast 2.0** | yok; **User‑Agent zorunlu** | ≤ 20 istek/sn **uygulama toplamı** (tüm kurulumlar); `Expires`'a kadar tekrar yok | **Evet** | ECMWF HRES ~9 km, günde 4 güncelleme, 0–10 gün (ilk ~2,5 gün saatlik, sonra 6 saatlik) | `compact`'ta **yok**; `complete`'te bölgeye bağlı **(İstanbul için doğrula)** | CC BY 4.0 + NLOD 2.0; "Data from MET Norway"; "Yr" adı/logosu kullanılamaz | **Birincil** |
| Open‑Meteo (ücretsiz) | yok | 600/dk, 5.000/saat, 10.000/gün | **Hayır** — Şartlar: "Integrating our service into commercial products" = ticari; ücretsiz yalnız kâr amaçsız/kişisel/eğitim | çoklu model, 16 gün | **Var** (`precipitation_probability_max`) | veri CC BY 4.0; kod AGPLv3 | Varsayılan **kapalı**; sahip açarsa yedek |
| Open‑Meteo API Standard | anahtar (`customer-api.open-meteo.com`, `apikey=`) **(doğrula)** | 1 M çağrı/ay | Evet | aynı | var | ~29 €/ay (arama özeti; doğrula) | gereksiz maliyet |
| Visual Crossing | anahtar | 1.000 kayıt/gün (15 günlük tahmin "1 kayıt" sayılıyor — doğrula) | **Evet** (kendi bloglarına göre; doğrula) | 15 gün | **Var** (`precipprob`) | şartlarda atıf **doğrula** | **Kullanıcı anahtarı seçeneği #1** |
| OpenWeatherMap | anahtar | 60/dk, 1 M/ay (current + 5 gün/3 saat); One Call 3.0: 1.000/gün + kredi kartı | Evet (self‑service; ODbL / CC BY‑SA, görünür atıf) | **5 gün** | `pop` | atıf zorunlu | Seçenek #2 (7 günü karşılamaz) |
| WeatherAPI.com | anahtar | kaynaklar çelişkili: 100 K – 1 M/ay **(doğrula)** | Evet (doğrula) | **3 gün** (ücretsiz) | var | atıf? | 7 günü karşılamaz |
| Tomorrow.io | anahtar | 500/gün, 25/saat, 3/sn | **Hayır** (ücretsiz plan ticari değil) | | | | Hayır |
| Meteomatics | anahtar | deneme / sınırlı temel plan | **Hayır** | | | | Hayır |
| Pirate Weather | anahtar | 10 K/ay (bağışla 20–25 K) | ticari ücretli (arama özeti; doğrula) | GFS/ECMWF | var | | Hayır |
| 7Timer! (Şanghay Astronomi Gözlemevi) | yok | belirsiz | ticari dışı (üçüncü taraf özeti; doğrula); README tablosunda HTTPS "No" | GFS, 8 gün, 3 saatlik | yok | | Hayır |
| wttr.in | yok | "makul ol" | belirsiz (veri WorldWeatherOnline/diğer) | 3 gün | yok | | Hayır (tek kişilik hobi sunucusu) |
| Meltema (public‑apis yeni) | yok | ? | ? | GFS, ECMWF AIFS/IFS | ? | ? | Yeni; izleme listesi |
| **MGM** `servis.mgm.gov.tr/web/…` | resmî anahtar yok; yanıt için `Origin: https://www.mgm.gov.tr` **sahte başlık** gerekir | belgesiz | izin yok | İstanbul istasyonları; günlük 5 gün, saatlik, son durum | yok | MGM telif | **Hayır** — resmî siteyi taklit eden başlık (kural ihlali), belgesiz, kırılgan |
| AccuWeather, Weatherbit, Weatherstack, QWeather, Yandex | anahtar | | | | | | Hayır |

**Open‑Meteo hükmü (şartların kaynağından okundu: `open-meteo-website/src/routes/en/terms/+page.svelte`):** ücretsiz API
yalnızca "non‑commercial" (CC NonCommercial yorumu). Ticari örnekler: abonelik/reklamlı uygulamalar, **"Integrating our
service into commercial products or promotional activities"**. Bir otelin ön büro yazılımında hava kartı göstermek,
yazılım ücretsiz olsa bile ticari işletmenin iş amaçlı kullanımıdır → **varsayılan olarak kullanılmaz**. README'deki
"free for open‑source developers" ifadesi bağlayıcı şart metninde yok.

**MET şartları (kaynak: `metno/weatherapi-docs/doc/TermsOfService.md`, `License.md`, `locationforecast/*.md`):**

1. Her istekte tanımlayıcı **User‑Agent**: uygulama adı/sürüm + **şirket e‑postası veya web adresi**; sahte/rastgele
   dize = kalıcı yasak.
2. `Expires` başlığına kadar tekrar sorma; `Last-Modified` varsa **aynen** `If-Modified-Since` gönder; HEAD+GET yapma.
3. İstekleri saat başına yığma; **rastgele dakika** ekle.
4. Koordinat **en çok 4 ondalık** (yeni ürünlerde 5+ ondalık = 403).
5. Uygulama kullanılmıyorken veri çekme; gzip + yönlendirme desteği; yalnız HTTPS.
6. Durum kodları: **203** = ürün eskidi (kaydet + uyarı göster; ~1 ay sonra kapanır), **429** = kısıtlama (hemen yavaşla),
   **403** = genelde tanımlama sorunu.
7. Kişisel veri: istemci IP'si ve koordinat Oslo'daki loglarda tutulur → misafir verisi gönderilmez; koordinat yuvarlanır.
8. "Tarayıcı/mobil doğrudan bağlanmasın" uyarısı yüksek hacim içindir; düşük hacimli, tanımlanmış istemci kabul edilir.
   Bismuth isteği ana süreçten (`src/main/network/weather/`) yapar; toplam trafik (otel sayısı × saatte 1) önemsiz.

**Karar ve sahibe soru:** MET birincil olunca "yağış olasılığı %" büyük olasılıkla gelmez. Seçenekler:
(a) **varsayılan** — % yerine **yağış miktarı (mm)** + "yağış bekleniyor / beklenmiyor" etiketi;
(b) sahip ticari olmayan şartı kendi sorumluluğunda kabul ederse Open‑Meteo'yu açar (% gelir);
(c) sahip Visual Crossing (ücretsiz) anahtarı girer (% gelir, 15 gün).
→ `05-sorular.md`'ye yeni soru önerisi (§5).

### 3.2 İstek biçimleri ve kullanılacak alanlar

**MET (birincil)**

```http
GET https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=40.99&lon=29.03&altitude=20
User-Agent: Bismuth/1.0 (otel-eposta@ornek.com)      ← kurulumdaki otel e-postası/web adresi; boşsa proje adresi
Accept-Encoding: gzip
If-Modified-Since: <önceki yanıttaki Last-Modified, aynen>
```

```json
{ "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [29.03, 40.99, 20] },
  "properties": {
    "meta": { "updated_at": "2026-10-01T19:31:12Z",
              "units": { "air_temperature": "celsius", "precipitation_amount": "mm", "wind_speed": "m/s" } },
    "timeseries": [
      { "time": "2026-10-01T20:00:00Z",
        "data": {
          "instant": { "details": { "air_temperature": 18.2, "relative_humidity": 70.5, "wind_speed": 3.1,
                                    "wind_from_direction": 40.2, "cloud_area_fraction": 55.0,
                                    "air_pressure_at_sea_level": 1016.4 } },
          "next_1_hours":  { "summary": { "symbol_code": "partlycloudy_night" }, "details": { "precipitation_amount": 0.0 } },
          "next_6_hours":  { "summary": { "symbol_code": "rain" },               "details": { "precipitation_amount": 2.1 } },
          "next_12_hours": { "summary": { "symbol_code": "rainshowers_day" },    "details": {} } } } ] } }
```
(Yapı belgeden; sayılar temsilî. `compact` alanları: `symbol_code`, `air_temperature`, `air_pressure_at_sea_level`,
`cloud_area_fraction`, `precipitation_amount`, `relative_humidity`, `wind_from_direction`, `wind_speed`. Min/maks,
olasılık, hamle `complete`'te.) Saatler **UTC**; günlük değerler uygulamada üretilir (§3.3).

**Open‑Meteo (yalnız sahip açarsa)**

```http
GET https://api.open-meteo.com/v1/forecast?latitude=40.99&longitude=29.03
    &current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m
    &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum
    &timezone=Europe%2FIstanbul&forecast_days=7
```
Alanlar: `current.{temperature_2m, weather_code (WMO), is_day, wind_speed_10m (km/sa)}`,
`daily.{time[], weather_code[], temperature_2m_max[], temperature_2m_min[], precipitation_probability_max[]}` —
günler zaten yerel. Atıf: "Weather data by Open‑Meteo.com (CC BY 4.0)".

**Visual Crossing (kullanıcı anahtarı) (doğrula)**

```http
GET https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/40.99,29.03/next7days
    ?unitGroup=metric&include=current,days&iconSet=icons2&contentType=json&key=<KULLANICI_ANAHTARI>
```
Alanlar: `currentConditions.{temp, feelslike, icon, windspeed, humidity}`,
`days[].{datetime, tempmax, tempmin, precipprob, precip, icon}`. Anahtar `safeStorage` ile şifreli saklanır.

### 3.3 Sağlayıcıdan bağımsız model ve günlük toplama

```ts
// shared/domain/weather.ts — saf, Electron/React bağımsız
type WeatherCondition =
  | 'clear' | 'mostly_clear' | 'partly_cloudy' | 'overcast' | 'fog'
  | 'drizzle' | 'rain_light' | 'rain' | 'rain_heavy' | 'showers'
  | 'sleet' | 'snow_light' | 'snow' | 'snow_heavy' | 'thunder' | 'hail' | 'unknown';

interface WeatherNow  { at: string /* ISO UTC */; tempC: number; condition: WeatherCondition; isDay: boolean;
                        windKmh?: number; humidityPct?: number; feelsLikeC?: number }
interface WeatherDay  { date: string /* YYYY-MM-DD yerel */; minC: number; maxC: number; condition: WeatherCondition;
                        precipMm?: number; precipProbPct?: number | null }
interface WeatherSnapshot { provider: 'metno' | 'openmeteo' | 'visualcrossing' | 'owm'; lat: number; lon: number;
                        fetchedAt: string; expiresAt: string; sourceUpdatedAt?: string;
                        now: WeatherNow | null; days: WeatherDay[] /* ≤ 7 */ }
```

MET → günlük (yerel gün `settings.timezone`, İstanbul UTC+3 sabit):
- `minC`/`maxC` = o yerel güne düşen `instant.air_temperature` değerlerinin min/maks'ı (6 saatlik bölümde 4 nokta →
  yaklaşık; `complete` kullanılırsa `next_6_hours.details.air_temperature_min/max`).
- Gün simgesi = yerel **12:00**'a denk gelen kaydın `next_6_hours.summary.symbol_code`'u (İstanbul'da 09:00 UTC); yoksa
  en yakın gündüz kaydı.
- `precipMm` = saatlik bölümde `next_1_hours`, sonrasında `next_6_hours` miktarlarının toplamı (çift sayma yok).
- `now` = `time ≤ şimdi < time + 1 saat` olan kayıt: `instant` + `next_1_hours.summary.symbol_code`; rüzgâr m/s × 3,6 = km/sa.

### 3.4 Durum kodu → Türkçe metin → simge

Metinler `tr.json`'da (`weather.condition.*`; yasak 8). Türkçe sözcükler MGM terimleriyle uyumlu seçildi.

| Durum | Önerilen TR metin | MET `symbol_code` (sonek `_day/_night/_polartwilight` atılmış) | WMO (Open‑Meteo) | Visual Crossing `icon` (doğrula) | lucide (gündüz / gece) | Meteocons |
|---|---|---|---|---|---|---|
| clear | Açık | `clearsky` | 0 | `clear-day/-night` | `Sun` / `Moon` | `clear-day` / `clear-night` |
| mostly_clear | Az bulutlu | `fair` | 1 | — | `CloudSun` / `CloudMoon` | `mostly-clear-day/-night` |
| partly_cloudy | Parçalı bulutlu | `partlycloudy` | 2 | `partly-cloudy-day/-night` | `CloudSun` / `CloudMoon` | `partly-cloudy-day/-night` |
| overcast | Çok bulutlu / kapalı | `cloudy` | 3 | `cloudy` | `Cloudy` | `overcast` |
| fog | Sisli | `fog` | 45, 48 | `fog` | `CloudFog` | `fog-day/-night` |
| drizzle | Çisenti | — | 51, 53, 55 | — | `CloudDrizzle` | `drizzle` |
| rain_light | Hafif yağmurlu | `lightrain` | 61 | — | `CloudDrizzle` | `drizzle` |
| rain | Yağmurlu | `rain` | 63 | `rain` | `CloudRain` | `rain` |
| rain_heavy | Kuvvetli yağmurlu | `heavyrain` | 65 | — | `CloudRainWind` | `extreme-rain` |
| showers | Sağanak yağışlı | `lightrainshowers`, `rainshowers`, `heavyrainshowers` | 80, 81, 82 | `showers-day/-night` | `CloudSunRain` / `CloudMoonRain` | `partly-cloudy-day-rain` / `-night-rain` |
| sleet | Karla karışık yağmurlu | `*sleet*` (sleet, lightsleet, heavysleet, *sleetshowers) | 56, 57, 66, 67 | `sleet`, `rain-snow` | `CloudSnow` | `sleet` |
| snow_light | Hafif kar yağışlı | `lightsnow`, `lightsnowshowers` | 71, 77, 85 | `snow-showers-day/-night` | `CloudSnow` | `partly-cloudy-day-snow` |
| snow | Kar yağışlı | `snow`, `snowshowers` | 73, 86 | `snow` | `CloudSnow` | `snow` |
| snow_heavy | Yoğun kar yağışlı | `heavysnow`, `heavysnowshowers` | 75 | — | `Snowflake` | `extreme-snow` |
| thunder | Gök gürültülü sağanak | `*thunder*` (tüm "…andthunder") | 95 | `thunder-rain`, `thunder-showers-day/-night` | `CloudLightning` | `thunderstorms-day-rain` / `-night-rain` |
| hail | Dolulu fırtına | — | 96, 99 | `hail` | `CloudHail` | `thunderstorms-hail` |
| unknown | Bilinmiyor | diğer | diğer | diğer | `CloudOff` | `not-available` |

MET eşleme algoritması (anahtar sözcük önceliği): sonek at → `thunder` > `sleet` > `snow` (`heavy`/`light` öneki) >
`rainshowers` > `rain` (`heavy`/`light`) > tam ad (`clearsky`, `fair`, `partlycloudy`, `cloudy`, `fog`). MET'in kendi
listesindeki yazım hataları (`lightssleetshowersandthunder`, `lightssnowshowersandthunder`) bu yöntemle sorunsuz
yakalanır; tam tablo `metno/weathericons/weather/legend.csv` (40 sembol, `Variants=1` olanlar gündüz/gece/kutup alacası
sonekli). Ek simgeler: yağış `Umbrella`/`Droplets`, rüzgâr `Wind`, sıcaklık `Thermometer`, nem `Droplet`,
gün doğumu/batımı `Sunrise`/`Sunset` (lucide'de hepsi var; bu oturumda dosyaları doğrulandı).

### 3.5 Simge setleri (çevrimdışı, paket içi)

| Set | Lisans | Durum | Uygunluk |
|---|---|---|---|
| **lucide-react** (shadcn/ui ile zaten gelir) | ISC | 1.49.0, 2026‑09‑29 | **Varsayılan**: yeni bağımlılık yok, tema rengini (`currentColor` → CSS değişkeni) alır, UI ile aynı çizgi dili |
| **Meteocons** (`basmilius/meteocons`, eski adı `basmilius/weather-icons`) | MIT | 1.654★, 2026‑09‑30; `@meteocons/svg-static` 0.1.0 (2026‑04, 2.080 dosya, 9 MB) | **İsteğe bağlı**: yalnız ~25 SVG kopyalanır (her biri ~1,5–2 KB). `monochrome` stili `currentColor` kullanır (kuralla uyumlu); `fill` stili sabit renkli (#F8AF18 vb.) → "renkler CSS değişkeni" kuralına takılır, kullanılmaz |
| `metno/weathericons` (Yr sembolleri) | MIT (© 2015–2017 Yr) | 66★, 2026‑09‑26 | MET kodlarıyla birebir; renkli → yalnız MET'e özel görünüm istenirse |
| `erikflowers/weather-icons` | yazı tipi SIL OFL 1.1, kod MIT | 2015'ten beri durgun | Yazı tipi tabanlı; gerek yok |

Atıf: kart altında `Kaynak: MET Norway · 14:05` (tr.json anahtarı), Hakkında'da "Hava durumu verisi: MET Norway (CC BY
4.0)"; Meteocons kopyalanırsa MIT bildirimi "Üçüncü taraf lisansları"na ve `docs/plan/bagimliliklar.md`'ye (paket olarak
değil, kopya varlık olarak).

### 3.6 Önbellek, yenileme, hata davranışı

| Kural | Değer |
|---|---|
| Tablo | `weather_cache(provider, lat, lon, fetched_at, expires_at, last_modified, http_status, payload_json, normalized_json, fail_count, disabled_until)` |
| İlk çekim | uygulama açılışında, `now ≥ expires_at` ise |
| Periyot | **60 dk + rastgele 0–10 dk**; asla `Expires`'tan önce değil; uygulama simge durumundayken/boştayken çekme yok |
| Zaman aşımı | 5 sn (`AbortSignal.timeout(5000)`), yalnız `src/main/network/weather/` (yasak 1) |
| 304 | önbelleği koru, `expires_at` güncelle |
| 203 | veriyi kullan + Ayarlar'da "kaynak eskiyor" uyarısı (ürün bakımsız kalacağı için önemli) |
| 429 / 403 / şema hatası (zod) | sağlayıcıyı 24 saat devre dışı bırak, sıradakine geç (kur zinciriyle aynı desen) |
| Sağlayıcı sırası | `settings.weather.provider_order` (varsayılan `["metno"]`; sahip `openmeteo` / `visualcrossing` ekleyebilir) — kaynak ölürse kod değişmeden kapatılır |
| Rozet | > 3 saat "X saat önce" (gri), > 12 saat sarı; > 48 saat "şimdi" bölümü gizlenir, yalnız bugünden sonraki günler; gelecek gün kalmadıysa kart gizlenir |
| Koordinat | **2 ondalık** (~1 km; model çözünürlüğü 9 km) → gizlilik + önbellek dostu (MET sınırı 4) |
| Kapatma | `settings.external_data.weather=false` iken hiç istek yok (G‑02, Faz 11 kabul ölçütü) |
| Test | Faz 0'da kaydedilen gerçek MET/Open‑Meteo JSON'ları → vitest fikstür; sahte sunucuyla 304/203/429/bozuk JSON |

### 3.7 Konum (şehir → koordinat), çevrimdışı

- Çevrimiçi geocoding kullanılmaz (Open‑Meteo geocoding ticari değil; GeoNames web servisi kullanıcı adı ister).
- Paket içi küçük JSON: 81 il merkezi + İstanbul ilçeleri (+ isteğe bağlı dünya başkentleri) — kaynak **GeoNames dökümü
  (CC BY 4.0; atıf)** veya Natural Earth (kamu malı) **(indirme bu oturumda denenmedi)**. Kurulumda il/ilçe seçimi +
  "enlem/boylamı elle gir".
- Varsayılan İstanbul (41.01, 28.98); ilk kullanıcı Kadıköy ≈ (40.99, 29.03) **(doğrula)**.

---

## 4. Sahibe soru / öneri satırları (CLAUDE.md gereği kod değil, `05-sorular.md` + `01-gereksinimler.md` §N önerisi)

| Tür | Metin (basit Türkçe) | Varsayılan |
|---|---|---|
| Soru | Hava kartında "yağış olasılığı %" yerine "yağış miktarı (mm) + yağmur bekleniyor/beklenmiyor" yeterli mi? (Ücretsiz ve ticari kullanıma açık tek kaynak yüzde vermiyor.) | Evet, mm + etiket |
| Soru | Open‑Meteo'nun ücretsiz sürümü yalnız ticari olmayan kullanım içindir. Yedek kaynak olarak açılsın mı? (Açarsanız sorumluluk sizde.) | Kapalı |
| Soru | Bakanlık panelindeki ülke açılır listesini bir kez ekran görüntüsü veya "sayfayı kaydet" ile verebilir misiniz? (Ülke adlarını birebir eşlemek için.) | Program kendi Türkçe adlarını kullanır, farkı siz düzeltirsiniz |
| Öneri | KBS'nin "Toplu Excel İşlemleri" için **dosya üretme** (otomatik gönderim değil; siz yüklersiniz). Şablon sütunları önce KBS'den alınmalı. | Yok (soru) |
| Öneri | Personel işe giriş/çıkışında **KBS çalışan bildirimi** hatırlatıcısı (portalda `/Calisan` sayfası var). | Yok (soru) |
| Öneri | **Konaklama sayısına bağlı bakım** ("her 40 konaklamada yatak çevir"). | Takvim bazlı bakım yeterli |
| Öneri | Çamaşırhanede **eksik dönen adedin sonraki teslimata devretmesi**, yeniden yıkama ve % fark eşikleri (Faz 12 kapsamını genişletir). | Faz 12 kapsamı aynen |
| Öneri | Oda durumu için takvime ek **kat planı düğme ızgarası** (Türk otel programlarındaki tanıdık görünüm). | Faz 9/15'te değerlendirilir |

## 5. Kaynaklar

Erişilen (doğrudan okundu):
- QloApps — https://github.com/Qloapps/QloApps (README, LICENSE.md OSL‑3.0)
- OCA/pms 16.0 — https://github.com/OCA/pms/tree/16.0 (`pms/models/*.py`, `pms/__manifest__.py`, `pms_l10n_es`)
- OCA/vertical-hotel — https://github.com/OCA/vertical-hotel
- HotelDruid aynası — https://github.com/digital-druid/hoteldruid
- open-hotel-pms — https://github.com/peeraseepat-cell/open-hotel-pms (`supabase/migrations/*`)
- hotel-app — https://github.com/siewong007/hotel-app (`README.md`, `docs/features.md`)
- KBS-Sync — https://github.com/tunjayoff/KBS-Sync (`docs/kbs-dom-research/*`, `agent/internal/kbs/nationalities.json`, `extension/src/lib/kbsNationalities.ts`)
- Syroce-PMS — https://github.com/beyinsiz1903/Syroce-PMS ; BlancaPatagoniaHotelApp, TheProjectSEO/hotel-pms, 2470185/hotel-property-management-system (README'ler)
- Rowlett tablosunun kopyası — https://github.com/SAP/sailing-analytics (`java/com.sap.sailing.domain/src/com/sap/sailing/util/countrycodes.csv`)
- Türk öğrenci şeması örneği — https://github.com/eysilmadz/VTYSProje
- i18n-iso-countries 7.14.0 (npm tarball), umpirsky/country-list `data/tr/country.json`
- MehmetAkgul/currency-api-tr `v1/currencies/try-full.json` (2026‑10‑01 21:03Z)
- Open‑Meteo — https://github.com/open-meteo/open-meteo (README) ve `open-meteo-website/src/routes/en/terms/+page.svelte`, `…/pricing/+page.svelte`
- MET Norway — https://github.com/metno/weatherapi-docs (`doc/TermsOfService.md`, `doc/License.md`, `doc/locationforecast/HowTO.md`, `datamodel.md`); https://github.com/metno/weathericons (`weather/legend.csv`)
- Meteocons — https://github.com/basmilius/meteocons ; `@meteocons/svg-static` 0.1.0; lucide ikon dosyaları (raw)
- MGM topluluk istemcisi — https://github.com/ekinyuksel12/TurkeyWeather ; aday notu https://github.com/clemensv/real-time-sources (`tools/candidates/weather/turkey-mgm.md`)
- npm kayıtları: libphonenumber-js, ibantools, iban, tckn, turkish-id-validator, tckimlik, validator (kaynak `isIdentityCard.js`), turkey-neighbourhoods, hijri-converter, @umalqura/core, moment-hijri, lucide-react

Yalnızca arama özetinden (doğrula):
- Bakanlık istatistik sistemi: https://balikesir.ktb.gov.tr/TR-171751/kultur-ve-turizm-bakanligi-konaklama-istatistik-sistemi.html , https://istanbul.ktb.gov.tr/TR-278495/konaklama-istatistik-sistemi-yardim-icin-gerekli-tum-be-.html , https://www.haberturk.com/konaklama-tesislerine-turizm-istatistikleri-icin-veri-girisi-uyarisi-3876341-ekonomi
- Jandarma KBS belgesi: https://www.jandarma.gov.tr/kurumlar/jandarma.gov.tr/Jandarma/Uygulamalar/KBS/KBS_Tesis_2_Uygulama_TD.pdf
- Rowlett Country Codes: http://www.ibiblio.org/units/codes/country.htm
- Diyanet 2027: https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=154
- QloApps 1.7.0: https://forums.qloapps.com/topic/8005/ ; Open‑Meteo fiyat: https://openmeteo.substack.com/p/api-subscriptions-for-commercial
- Visual Crossing ücretsiz plan: https://www.visualcrossing.com/resources/documentation/visual-crossing-weather-free-plan-free-weather-data-for-analysts-and-api-developers/
- OpenWeatherMap lisans/fiyat: https://openweathermap.org/full-price , https://old.openweathermap.org/storage/app/media/documents/License_explainer_25%20Feb_25.pdf
- WeatherAPI.com: https://www.weatherapi.com/pricing.aspx ; Tomorrow.io: https://support.tomorrow.io/hc/en-us/articles/20273728362644-Free-API-Plan-Rate-Limits ; Pirate Weather: https://pirateweather.net/ ; 7Timer: https://www.freepublicapis.com/7timer-weather-api ; wttr.in: https://github.com/chubin/wttr.in

---

## Ek A — KBS uyruk kimliği → ISO 3166‑1 alpha‑2 → Türkçe ad (Faz 2 tohum taslağı)

Biçim: `kbs_id;iso2;KBS etiketi (aynen);Türkçe ad (i18n-iso-countries tr + düzeltmeler)`.
238 satır otomatik (Rowlett tablosuyla ad eşleşmesi), 8 satır elle. İşaretler: `XC*` = KKTC için özel kod (ISO kullanıcı
aralığı), `EU*` = özel; `RS+ME` = iki ISO tek KBS kimliği; `AN` = geri çekilmiş ISO (Hollanda Antilleri → CW/SX/BQ);
167 ve 246 ikisi de `PS`; `—` = ülke yok. KBS kimlikleri KBS-Sync'in Ağustos 2026 listesinden; canlı `UlkeGetir` ile
**Faz 0'da yeniden doğrulanmalı** (`aktif` bayrağı dahil). Bakanlık adları ayrı sütunda sonradan doldurulur.

```text
1;TR;TÜRKİYE;Türkiye
2;XC*;KUZEY KIBRIS TURK CUMHURİYETİ;Kuzey Kıbrıs Türk Cumhuriyeti
3;AF;AFGHANISTAN;Afganistan
4;AL;ALBANIA;Arnavutluk
5;DZ;ALGERIA;Cezayir
6;AS;AMERICAN SAMOA;Amerikan Samoası
7;AD;ANDORRA;Andorra
8;AO;ANGOLA;Angola
9;AI;ANGUILLA;Anguilla
10;AQ;ANTARCTICA;Antarktika
11;AG;ANTIGUA AND BARBUDA;Antigua ve Barbuda
12;AR;ARGENTINA;Arjantin
13;AM;ARMENIA;Ermenistan
14;AW;ARUBA;Aruba
15;AU;AUSTRALIA;Avustralya
16;AT;AUSTRIA;Avusturya
17;AZ;AZERBAIJAN;Azerbaycan
18;BS;BAHAMAS;Bahamalar
19;BH;BAHRAIN;Bahreyn
20;BD;BANGLADESH;Bangladeş
21;BB;BARBADOS;Barbados
22;BY;BELARUS;Beyaz Rusya
23;BE;BELGIUM;Belçika
24;BZ;BELIZE;Belize
25;BJ;BENIN;Benin
26;BM;BERMUDA;Bermuda
27;BT;BHUTAN;Butan
28;BO;BOLIVIA;Bolivya
29;BA;BOSNIA AND HERZEGOVINA;Bosna Hersek
30;BW;BOTSWANA;Botsvana
31;BV;BOUVET ISLAND;Bouvet Adası
32;BR;BRAZIL;Brezilya
33;IO;BRITISH INDIAN OCEAN TERRITORY;Britanya Hint Okyanusu Toprakları
34;BN;BRUNEI DARUSSALAM;Brunei
35;BG;BULGARIA;Bulgaristan
36;BF;BURKINA FASO;Burkina Faso
37;BI;BURUNDI;Burundi
38;KH;CAMBODIA;Kamboçya
39;CM;CAMEROON;Kamerun
40;CA;CANADA;Kanada
41;CV;CAPE VERDE;Cape Verde
42;KY;CAYMAN ISLANDS;Cayman Adaları
43;CF;CENTRAL AFRICAN REPUBLIC;Orta Afrika Cumhuriyeti
44;TD;CHAD (Tchad);Çad
45;CL;CHILE;Şili
46;CN;CHINA;Çin
47;CX;CHRISTMAS ISLAND;Christmas Adası
48;CC;COCOS (KEELING) ISLANDS;Cocos (Keeling) Adaları
49;CO;COLOMBIA;Kolombiya
50;KM;COMOROS;Komorlar
51;CG;CONGO - REPUBLIC OF;Kongo - Brazavil
52;CD;CONGO - THE DEMOCRATIC REPUBLIC OF THE (formerly Zaire);Kongo - Kinşasa
53;CK;COOK ISLANDS;Cook Adaları
54;CR;COSTA RICA;Kosta Rika
55;CI;CÔTE DIVOIRE (Ivory Coast);Fildişi Sahili
56;HR;CROATIA (Hrvatska);Hırvatistan
57;CU;CUBA;Küba
58;CY;CYPRUS;Güney Kıbrıs Rum Kesimi
59;CZ;CZECH REPUBLIC;Çek Cumhuriyeti
60;DK;DENMARK;Danimarka
61;DJ;DJIBOUTI;Cibuti
62;DM;DOMINICA;Dominika
63;DO;DOMINICAN REPUBLIC;Dominik Cumhuriyeti
64;EC;ECUADOR;Ekvador
65;EG;EGYPT;Mısır
66;SV;EL SALVADOR;El Salvador
67;GQ;EQUATORIAL GUINEA;Ekvator Ginesi
68;ER;ERITREA;Eritre
69;EE;ESTONIA;Estonya
70;ET;ETHIOPIA;Etiyopya
71;FO;FAEROE ISLANDS;Faroe Adaları
72;FK;FALKLAND ISLANDS (MALVINAS);Falkland Adaları
73;FJ;FIJI;Fiji
74;FI;FINLAND;Finlandiya
75;FR;FRANCE;Fransa
76;GF;FRENCH GUIANA;Fransız Guyanası
77;PF;FRENCH POLYNESIA;Fransız Polinezyası
78;TF;FRENCH SOUTHERN TERRITORIES;Fransız Güney Toprakları
79;GA;GABON;Gabon
80;GM;GAMBIA;Gambiya
81;GE;GEORGIA;Gürcistan
82;DE;GERMANY (Deutschland);Almanya
83;GH;GHANA;Gana
84;GI;GIBRALTAR;Cebelitarık
85;GR;GREECE;Yunanistan
86;GL;GREENLAND;Grönland
87;GD;GRENADA;Grenada
88;GP;GUADELOUPE;Guadalupe
89;GU;GUAM;Guam
90;GT;GUATEMALA;Guatemala
91;GG;GUERNSEY;Guernsey
92;GN;GUINEA;Gine
93;GW;GUINEA-BISSAU;Gine-Bissau
94;GY;GUYANA;Guyana
95;HT;HAITI;Haiti
96;HM;HEARD ISLAND AND MCDONALD ISLANDS;Heard Adası ve McDonald Adaları
97;HN;HONDURAS;Honduras
98;HK;HONG KONG (Special Administrative Region of China);Hong Kong
99;HU;HUNGARY;Macaristan
100;IS;ICELAND;İzlanda
101;IN;INDIA;Hindistan
102;ID;INDONESIA;Endonezya
103;IR;IRAN (Islamic Republic of Iran);İran
104;IQ;IRAQ;Irak
105;IE;IRELAND;İrlanda
106;IL;ISRAEL;İsrail
107;IT;ITALY;İtalya
108;JM;JAMAICA;Jamaika
109;JP;JAPAN;Japonya
110;JE;JERSEY;Jersey
111;JO;JORDAN (Hashemite Kingdom of Jordan);Ürdün
112;KZ;KAZAKHSTAN;Kazakistan
113;KE;KENYA;Kenya
114;KI;KIRIBATI;Kiribati
115;KP;KOREA (Democratic Peoples Republic of [North] Korea);Kuzey Kore
116;KR;KOREA (Republic of [South] Korea);Güney Kore
117;KW;KUWAIT;Kuveyt
118;KG;KYRGYZSTAN;Kırgızistan
119;LA;LAO PEOPLE'S DEMOCRATIC REPUBLIC;Laos
120;LV;LATVIA;Letonya
121;LB;LEBANON;Lübnan
122;LS;LESOTHO;Lesoto
123;LR;LIBERIA;Liberya
124;LY;LIBYA (Libyan Arab Jamahirya);Libya
125;LI;LIECHTENSTEIN (Fürstentum Liechtenstein);Liechtenstein
126;LT;LITHUANIA;Litvanya
127;LU;LUXEMBOURG;Lüksemburg
128;MO;MACAO (Special Administrative Region of China);Makao
129;MK;MACEDONIA (Former Yugoslav Republic of Macedonia);Kuzey Makedonya
130;MG;MADAGASCAR;Madagaskar
131;MW;MALAWI;Malavi
132;MY;MALAYSIA;Malezya
133;MV;MALDIVES;Maldivler
134;ML;MALI;Mali
135;MT;MALTA;Malta
136;MH;MARSHALL ISLANDS;Marshall Adaları
137;MQ;MARTINIQUE;Martinik
138;MR;MAURITANIA;Moritanya
139;MU;MAURITIUS;Mauritius
140;YT;MAYOTTE;Mayotte
141;MX;MEXICO;Meksika
142;FM;MICRONESIA (Federated States of Micronesia);Mikronezya
143;MD;MOLDOVA;Moldova
144;MC;MONACO;Monako
145;MN;MONGOLIA;Moğolistan
146;MS;MONTSERRAT;Montserrat
147;MA;MOROCCO;Fas
148;MZ;MOZAMBIQUE (Moçambique);Mozambik
149;MM;MYANMAR (formerly Burma);Myanmar (Burma)
150;NA;NAMIBIA;Namibya
151;NR;NAURU;Nauru
152;NP;NEPAL;Nepal
153;NL;NETHERLANDS;Hollanda
154;AN;NETHERLANDS ANTILLES;Hollanda Antilleri
155;NC;NEW CALEDONIA;Yeni Kaledonya
156;NZ;NEW ZEALAND;Yeni Zelanda
157;NI;NICARAGUA;Nikaragua
158;NE;NIGER;Nijer
159;NG;NIGERIA;Nijerya
160;NU;NIUE;Niue
161;NF;NORFOLK ISLAND;Norfolk Adası
162;MP;NORTHERN MARIANA ISLANDS;Kuzey Mariana Adaları
163;NO;NORWAY;Norveç
164;OM;OMAN;Umman
165;PK;PAKISTAN;Pakistan
166;PW;PALAU;Palau
167;PS;PALESTINIAN TERRITORIES;Filistin Bölgeleri
168;PA;PANAMA;Panama
169;PG;PAPUA NEW GUINEA;Papua Yeni Gine
170;PY;PARAGUAY;Paraguay
171;PE;PERU;Peru
172;PH;PHILIPPINES;Filipinler
173;PN;PITCAIRN;Pitcairn Adaları
174;PL;POLAND;Polonya
175;PT;PORTUGAL;Portekiz
176;PR;PUERTO RICO;Porto Riko
177;QA;QATAR;Katar
178;RE;RÉUNION;Réunion
179;RO;ROMANIA;Romanya
180;RU;RUSSIAN FEDERATION;Rusya
181;RW;RWANDA;Ruanda
182;SH;SAINT HELENA;Saint Helena
183;KN;SAINT KITTS AND NEVIS;Saint Kitts ve Nevis
184;LC;SAINT LUCIA;Saint Lucia
185;PM;SAINT PIERRE AND MIQUELON;Saint Pierre ve Miquelon
186;VC;SAINT VINCENT AND THE GRENADINES;Saint Vincent ve Grenadinler
187;WS;SAMOA (formerly Western Samoa);Samoa
188;SM;SAN MARINO (Republic of);San Marino
189;ST;SAO TOME AND PRINCIPE;São Tomé ve Príncipe
190;SA;SAUDI ARABIA (Kingdom of Saudi Arabia);Suudi Arabistan
191;SN;SENEGAL;Senegal
192;RS+ME;SERBIA AND MONTENEGRO;Sırbistan / Karadağ
193;SC;SEYCHELLES;Seyşeller
194;SL;SIERRA LEONE;Sierra Leone
195;SG;SINGAPORE;Singapur
196;SK;SLOVAKIA (Slovak Republic);Slovakya
197;SI;SLOVENIA;Slovenya
198;SB;SOLOMON ISLANDS;Solomon Adaları
199;SO;SOMALIA;Somali
200;ZA;SOUTH AFRICA (Zuid Afrika);Güney Afrika
202;GS;SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS;Güney Georgia ve Güney Sandwich Adaları
203;ES;SPAIN (España);İspanya
204;LK;SRI LANKA;Sri Lanka
205;SD;SUDAN;Sudan
206;SR;SURINAME;Surinam
207;SJ;SVALBARD AND JAN MAYEN;Svalbard ve Jan Mayen Adaları
208;SZ;SWAZILAND;Svaziland
209;SE;SWEDEN;İsveç
210;CH;SWITZERLAND (Confederation of Helvetia);İsviçre
211;SY;SYRIAN ARAB REPUBLIC;Suriye
212;TW;TAIWAN (Chinese Taipei for IOC);Tayvan
213;TJ;TAJIKISTAN;Tacikistan
214;TZ;TANZANIA;Tanzanya
215;TH;THAILAND;Tayland
216;TL;TIMOR-LESTE (formerly East Timor);Timor-Leste
217;TG;TOGO;Togo
218;TK;TOKELAU;Tokelau
219;TO;TONGA;Tonga
220;TT;TRINIDAD AND TOBAGO;Trinidad ve Tobago
221;TN;TUNISIA;Tunus
222;TM;TURKMENISTAN;Türkmenistan
223;TC;TURKS AND CAICOS ISLANDS;Turks ve Caicos Adaları
224;TV;TUVALU;Tuvalu
225;UG;UGANDA;Uganda
226;UA;UKRAINE;Ukrayna
227;AE;UNITED ARAB EMIRATES;Birleşik Arap Emirlikleri
228;GB;UNITED KINGDOM (Great Britain);Birleşik Krallık
229;US;UNITED STATES;Amerika Birleşik Devletleri
230;UM;UNITED STATES MINOR OUTLYING ISLANDS;ABD Uzak Adaları
231;UY;URUGUAY;Uruguay
232;UZ;UZBEKISTAN;Özbekistan
233;VU;VANUATU;Vanuatu
234;VA;VATICAN CITY (Holy See);Vatikan
235;VE;VENEZUELA;Venezuela
236;VN;VIET NAM;Vietnam
237;VG;VIRGIN ISLANDS( BRITISH);Britanya Virjin Adaları
238;VI;VIRGIN ISLANDS( U.S.);ABD Virjin Adaları
239;WF;WALLIS AND FUTUNA;Wallis ve Futuna Adaları
240;EH;WESTERN SAHARA (formerly Spanish Sahara);Batı Sahara
241;YE;YEMEN;Yemen
242;ZM;ZAMBIA;Zambiya
243;ZW;ZIMBABWE;Zimbabve
244;XK;KOSOVA CUMHURİYETİ;Kosova
246;PS;FİLİSTİN;Filistin Bölgeleri
249;EU*;EUROPEAN UNION;Avrupa Birliği
250;—;ULKE KODU GIRILMEMIS;(ülke girilmemiş)
```
