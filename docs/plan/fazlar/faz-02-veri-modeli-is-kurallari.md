# Faz 2 · Veri Modeli ve İş Kuralları (Çekirdek)

**Amaç:** Arayüzden bağımsız, test edilebilir bir çekirdek: SQLite şeması, migrasyonlar, servis katmanı, yetki
denetimi, para/tarih tipleri ve Excel'den çıkan tüm iş kuralları. Bu faz bitince hiçbir ekran olmadan, testlerle
"rezervasyon → ödeme → defter → maaş" akışı çalışır.

**Gereksinimler:** G-23, G-24, G-53, G-54, G-60, G-61, G-64, G-66, G-70, G-71, G-81, G-82, G-84–G-87, G-94, G-95 (veri ve kural kısmı), G-131, G-133.
**Ön koşul:** Faz 1.
**Sorular:** yok — S-07, S-09, S-32 (kur kaydın yazıldığı dakikada), S-37 (izin devretmez, ödenir) cevaplandı.
**Referans:** `03-mimari.md` §4 (şema), §5 (yetki matrisi), §6 (iş kuralları).

## Teslimatlar

1. **Şema ve migrasyonlar** (`src/main/db/`): `03-mimari.md` §4'teki tüm tablolar — v2/v4 eklemeleri dahil: `sessions`, `devices`, `room_issues` (maliyet alanı yok), `attachments`, `companies` (+IBAN), `status_tags`, `reservation_tags`, `guests.standing_note`, **`stay_occupants`** (odadaki kişiler + KBS işaretleri; eski `reservation_guests`), `contacts`, `product_categories`, `products`, **`expense_sections`**, **`expense_items`** (ayrı `purchases` ve `expense_categories` yok; K-35), `laundry_*` (giden/gelen), **`task_templates`, `tasks`, `shift_definitions`, `shift_handovers`, `notes`, `lost_items`** (K-34), `kbs_imports`, `kbs_stay_rows`, `country_map` (normalize anahtar), `calendar_generation`, `fx_rates`; ödeme/giderde `fx_rate_at`; `0001_init.sql`'den başlayan sürümlü migrasyonlar; açılışta otomatik; `schema_version`; WAL; yabancı anahtarlar açık.
2. **Tip sistemi** (`src/shared/`): `Money { amountMinor: number; currency: string }` yardımcıları (topla, çevir, biçimle); `LocalDate` (YYYY-MM-DD, saat dilimi yok); `Night` kavramı (giriş günü = gece tarihi; çıkış günü gece değildir); zod şemaları her varlık için (IPC sınırında doğrulama).
3. **Servis katmanı** (`src/main/services/`): her modül için sınıf/fonksiyon seti; her çağrı `ctx = { userId, role, permissions }` alır; **yetki kontrolü burada**; tüm yazmalar transaction içinde; audit log otomatik (before/after JSON).
   - `ReservationService`: oluştur/düzenle/iptal/park/geri al; oda çakışma kuralı; çok oda; gece gece fiyat; day‑use; oda değişikliği.
   - `PaymentService`: ödeme/kapora/iade; **gecelere sıralı dağılım** (ilk gece önce) → gece durumu (ödendi / kısmen / ödenmedi); teslim alma (toplu) + teslim kaydı; mutabakat.
   - `LedgerService`: gün görünümü (gelir+gider), gün notu, sıralama, gün kapatma, kasa paneli (teslim alınmamış matris), kanal toplamları.
   - `ExpenseService`: bölüm (Genel / Yönetici) ve görünürlük filtresi (rol), serbest açıklama + normalize anahtar (otomatik tamamlama, "en çok harcama"), ürün satırları (tedarik), çalışan bağlantısı; hazır kategori yok (S-33).
   - `StaffService`: çalışan, maaş geçmişi, avans, izin, mesai, prim; `computeSalaryPeriod(employee, month, rules, records)`.
   - `RoomService` / `RoomTypeService`: tohum liste, özel tip, oda bloğu, durum.
   - `GuestService` / `BlacklistService`: normalize eşleşme, birleştirme.
   - `CalendarService`: notlar, bayram üretimi (çevrimdışı), toplu ekleme.
   - `TaskService`: görev şablonları ve tekrar (saat, hafta günü, ay günü, **her N konaklama**), görev üretimi (idempotent), durum geçişleri; bakım ve yasal hatırlatıcılar burada (K-34).
   - `ShiftService`: vardiya tanımları, **devir özeti** (`handoverSummary`, §6.16), devir kaydı + okundu, kişisel/pano notları (kişisel not yalnız sahibine döner).
   - `OccupantService`: odadaki kişiler, sonradan kişi ekleme, KBS giriş/çıkış işaretleri, `kbsMissing` (§6.15).
   - `LostItemService`: kayıp eşya kayıtları ve durumları.
   - `CurrencyService`: kur tablosu (kaynak/mod alanlı), **kaydın yazıldığı dakikadaki kur** (tutar/birim değişince yeniden), otel kuru; dış çekme Faz 11.
   - `SettingsService`: anahtar/değer + tipli şema; dil/tema/tutar görünümü; durum etiketleri; politika ayarları.
   - `StatusTagService`: otomatik + özel etiketler; `cellStyle` (§6.14).
   - `GuestHistoryService`: konaklama/ödeme/fiyat geçmişi ve özet (§6.12); `CompanyService` (fatura bilgileri, favori, kopya metni üretimi).
   - `RoomIssueService`: arıza kayıtları, durum geçişleri, oda bloğu etkisi, ek dosya bağlantısı.
   - `ContactService`, `SupplyService` (ürün, kategori, gider satırlarından fiyat geçmişi ve zam §6.13), `LaundryService` (giden/gelen teslimat, bekleyen/eksik, aylık mutabakat).
   - `TourismStatsService`: KBS Excel ayrıştırma (sütun **başlık adıyla**), uyruk eşleme (normalize + takma ad + yazım hatası önerisi + kullanıcı onayı; K-36), giriş/geceleme hesabı (§6.11; otelde kalanlar planlı çıkışa kadar), program verisiyle karşılaştırma. Prototip: `prototypes/kbs-stats`.
   - `AttachmentService`: dosya kaydetme/küçültme/sha256, yol doğrulama (K-25).
   - `UserService` / `AuthService` / `SessionService`: kullanıcı, rol (üç seviyeli yetki), PIN/şifre (scrypt), oturum belirteçleri, cihazlar, boşta kilit.
   - `BackupService`: çevrimiçi yedek (ekler dahil), geri yükle, bütünlük.
   - `AuditService`: okuma ve filtre (cihaz bilgisi dahil).
4. **Tohum veriler** (`src/main/db/seed/`): oda tipleri (çok dilli ad, gruplu), ödeme yöntemleri, satış kanalları, ek hizmetler, gider bölümleri (Genel, Yönetici giderleri), roller + varsayılan üç seviyeli yetkiler (K-38), görev önerileri + bakım örnekleri + yasal hatırlatıcılar (TR), vardiya tanımları (2 × 12 saat örneği), otomatik durum etiketleri (varsayılan renkler Excel'den; kısmen/kapora ayrı renk), çamaşır türleri (geniş liste), ürün kategorileri (geniş liste, temizlik dahil), rehber kategorileri, **ülke eşleme tablosu** (`country_map`: ISO2 + KBS yazımları + bakanlık Türkçe adı), bayram üretici (`date-holidays`, herhangi yıl).
5. **Örnek veri üretici** (`scripts/seed-demo.ts`): Pandora benzeri 19 oda, 1 yıl rezervasyon/ödeme/gider/personel — geliştirme ve testler için (gerçek isim/para içermez).
6. **Testler** (`vitest`): her iş kuralı için (bkz. `03-mimari.md` §6 listesi); Excel'den doğrulanmış örnekler test verisi olarak (31.500, 2.328, 5.333…); yetki testleri (her rol × yasak işlem); migrasyon testi (boş DB → güncel; v0 örnek → güncel).

## Kabul ölçütleri

- [x] `npm test` ile tüm iş kuralı testleri geçer; `domain/` ve `services/` kapsamı ≥ %85.
- [x] Hiçbir servis para tutarını `float` olarak taşımaz (lint kuralı + tip).
- [x] Yetkisiz çağrı `PermissionDenied` hatası döner; UI'siz test ile kanıtlanır.
- [x] Ödeme dağılımı: 6.000 borçlu 3 geceye 2.000 ödeme → 1. gece ödendi, 2–3 ödenmedi; 5.000 → 1–2 ödendi, 3 kısmen.
- [x] Yönetici gideri filtre: Resepsiyon bağlamıyla `getDay()` çağrısı o satırları ve toplamlarını içermez.
- [x] Maaş: Excel'in 12 ayı test olarak geçer; 30 bölen ve ay gün sayısı seçenekleri ayrı testlenir.
- [x] Turizm istatistiği: sentetik KBS satırlarıyla Eylül örneği (607 giriş, 840 geceleme, 248 aynı gün, 23 ülke) yeniden üretilir; otelde kalan için planlı çıkış senaryosu; `TÜRKYİE` / `KUZY KIBRIS…` öneri + onay, `KIBRIS` otomatik eşlenmez (K-36).
- [x] Kur: ödeme kaydedildiği dakikanın kuru dondurulur; yalnız tutar/birim değişince yeniden alınır (test).
- [x] Odadaki kişiler: sonradan eklenen kişi KBS işareti yoksa `kbsMissing` döner; işaretlenince düşer (test).
- [x] Görevler: tekrar üretimi iki kez çalışınca kopya görev oluşmaz; 10. çıkıştan sonra "derin temizlik" görevi açılır (test). Kişisel not başka kullanıcıya (Sahip dahil) dönmez (test).
- [x] Mesai: `overtime_mode=none` → 0; gece yarısını aşan geliş/çıkış süresi doğru (test).
- [x] Tedarik: üç gider kaydının ürün satırlarından zam yüzdesi doğru; çamaşırhane aylık mutabakat farkı ve giden − gelen bekleyen sayısı doğru.
- [x] Durum etiketi önceliği: özel etiket + otomatik durum birlikte doğru stil döner; otomatik etiket kapalıyken geri dönüş kuralı çalışır.
- [x] Migrasyonlar ileri yönde idempotent; uygulanmış migrasyon dosyası değiştirilemez (hook).

## Bu fazda yapılmayacaklar

- Arayüz; dış ağ istekleri (kur çekme Faz 11 — burada yalnızca tablo ve çevrim fonksiyonu).

## Sonuç (2026-10-03)

**Durum:** ✅ tamam — arayüzsüz çekirdek: "rezervasyon → ödeme → defter → maaş" akışı ve diğer tüm modüller testlerle
çalışıyor. Ekran yok; dış ağ isteği yok.

**Yapılanlar**
- **Şema ve migrasyonlar** (yalnız ekleme; `0000` değişmedi): `0001_domain` — §4'teki tüm tablolar + v2/v4 eklemeleri
  (oturum/cihaz, arıza, ek dosya, firma, durum etiketleri, odadaki kişiler, rehber, ürün, gider bölümleri ve ürün satırları,
  çamaşırhane, görev şablonları/görevler, vardiya devri, notlar, kayıp eşya, KBS içe aktarma, ülke eşleme, takvim üretimi,
  kurlar); `0002_fx_observed_roles_indexes` — ödeme/giderde kullanılan kurun kendi zamanı, rol bazında "yalnız kendi
  görevleri" bayrağı, dört dizin; `0003_audit_append_only` — `audit_log` UPDATE/DELETE tetikleyiciyle reddedilir, yeni rol
  bayrağının varsayılanı; `0004_audit_log_no_replace` — var olan kimlikle INSERT OR REPLACE de reddedilir. Toplam 65 tablo,
  83 dizin. Ayrıntılar `03-mimari.md` §4.8a–b.
- **Yetki kataloğu** (`src/shared/permissions.ts`): 52 anahtar × üç seviye, altı sistem rolünün varsayılanları (K-38);
  servis katmanı her çağrıda `ctx.can` ile denetler; Sahip rolü kilitli; kimse kendinde olmayan yetkiyi veremez; ilk
  şifresini değiştirmeyen hesap hiçbir şey yapamaz.
- **İş kuralları** (`src/shared/domain/`, 15 modül, saf ve testli): konaklama/çakışma/blok, ödeme dağılımı (gece gece), hücre
  durumu ve etiket önceliği, kur dondurma, kasa paneli ve ciro, odadaki kişiler + KBS eksikleri, maaş (Excel'in 12 ayı),
  görev tekrarı (her N konaklama dahil), çamaşırhane mutabakatı, tedarik zam yüzdesi, rapor yardımcıları, ad/telefon/belge
  normalizasyonu ve kara liste eşleşmesi, firma kopya metni; bayram üretimi (`date-holidays`, çevrimdışı), KBS okuyucu ve
  bakanlık tablosu.
- **Servisler** (`src/main/services/`, 26 servis; `services/index.ts` hepsini tek veritabanı tutamağına bağlar): oda/oda
  tipi/blok, kur, rezervasyon (çok oda, gece gece fiyat, day‑use, oda değişikliği — ileri tarihli taşınma dahil, iptal/park,
  gelmedi, giriş/çıkış), ödeme (kapora, iade, iptal, "x" teslim ve geri alma, ek hizmet satışı), odadaki kişiler + KBS
  işaretleri, misafir/firma/kara liste/geçmiş, takvim (bayram üretimi, toplu not), görevler, vardiya devri + notlar, gün
  defteri + gün kapatma + ay özeti, gider (bölüm görünürlüğü, ürün satırları, açıklama önerisi), personel (maaş geçmişi, ücret
  kuralları, izin, mesai, avans/ödeme → gider, maaş tablosu ve kilit), kayıp eşya, durum etiketleri, rehber, tedarik,
  çamaşırhane, arıza, ek dosya, kullanıcı/rol, oturum/cihaz/kurtarma kodu, denetim kaydı, yedek/geri yükleme, turizm
  istatistiği. Her yazma tek transaction + `audit_log`; hata mesajları `errors.*` çeviri anahtarı (75 anahtar, üç dil).
- **Tohumlar**: roller + varsayılan yetkiler, ~40 oda tipi, ödeme yöntemleri, 12 satış kanalı, ek hizmetler, gider bölümleri
  (Genel, Yönetici), durum etiketleri, 2 × 12 saat vardiya, 20 çamaşır türü, ürün kategorileri, yasal hatırlatıcılar + görev
  önerileri + bakım örnekleri, ülke eşleme; yeniden tohumlama kopya üretmez.
- **Örnek veri**: `npm run seed:demo` → 19 oda / 38 yatak, bir yıl (≈2.250 rezervasyon, ≈2.460 ödeme, gider, 4 personel,
  çamaşırhane, günlük işler); hepsi servisler üzerinden (yetki + audit), uydurma isim ve rakamlarla.
- **Testler**: 427 test (53 dosya). Kapsam (`domain` + `services`): satır %97,2, ifade %94,1, fonksiyon %97,3, dal %85,5
  (eşik %85, dal %75). Yetki matrisi: 6 rol × ~80 işlem + yetkisiz bağlam; migrasyon: boş DB → güncel, v0 → güncel,
  0000+0001 → güncel, ikinci açılış hiçbir şey değiştirmez; her servis hata anahtarının üç dilde çevirisi var. Paketlenmiş
  uygulama duman testi (Linux) şema sürümü 5 ile açılır, bütünlük "ok", engellenen ağ isteği yok.

**Kabul ölçütleri — kanıt testleri**
1. Testler ve kapsam: `npm test` (427 geçti), `npm run test:coverage` (yukarıdaki oranlar; eşik vitest ayarında).
2. Para kayan sayı değil: ESLint kuralı (`money` adlı tutarlarda `*` `/` `%` yalnız `src/shared/money.ts`'te), `minorSchema`
   tam sayı, `amount_minor INTEGER`; `src/shared/money.test.ts` "kayan sayıyı ve geçersiz para birimini reddeder".
3. Yetkisiz çağrı: `tests/unit/permission-matrix.test.ts` (her rol × yasak işlem → `PERMISSION_DENIED`; arayüzsüz).
4. Ödeme dağılımı: `payment-allocation.test.ts` "6.000 borçlu 3 geceye 2.000 ödeme → 1. gece ödendi, 2–3 ödenmedi",
   "5.000 → 1–2 ödendi, 3 kısmen"; servis üzerinden `reservation-flow.test.ts` (iade sonrası kısmen dahil).
5. Yönetici gideri: `ledger-service.test.ts` "Resepsiyon bağlamıyla getDay yönetici giderini ve toplamını içermez; görünüm
   kısmi işaretlenir".
6. Maaş: `salary.test.ts` "Excel'in 12 ayı (3 çalışan, 30 bölen, devir yok)" ve "günlük bölen (30 ya da ayın gün sayısı)";
   Excel örnekleri 31.500 · 2.328 · 6.667 · 5.333.
7. Turizm istatistiği: `tourism-stats-service.test.ts` "Eylül: 607 giriş, 840 geceleme, 248 aynı gün, 23 ülke…", "otelde
   kalan misafir Bismuth'taki planlı çıkışa kadar sayılır…", "'TÜRKYİE' öneri ile incelemeye düşer… 'KIBRIS' kendiliğinden
   eşlenmez (K-36)".
8. Kur: `reservation-flow.test.ts` "EUR ödeme TL folyoya o dakikanın kuruyla yazılır; yalnız tutar değişince yeni kur
   alınır"; `expenses-service.test.ts` "kur, giderin yazıldığı dakikada donar…".
9. Odadaki kişiler: `reservation-flow.test.ts` "sonradan eklenen kişi KBS işareti yoksa eksik döner, işaretlenince düşer;
   çıkışta KBS çıkışı istenir".
10. Görevler: `tasks-service.test.ts` "'her gün 12:00' şablonu iki kez işlenince kopya oluşmaz…", "her 10 konaklamada bir derin
    temizlik…"; `shift-service.test.ts` "kişisel not yalnız yazana döner — Sahip dahil kimse göremez…".
11. Mesai: `salary.test.ts` "Pandora (overtime_mode=none): ek mesai saati girilse bile ücret 0", "gece yarısını aşan vardiya:
    çıkış < geliş → +24 saat".
12. Tedarik ve çamaşırhane: `supply-laundry.test.ts` "üç alışın ürün satırlarından son zam yüzdesi doğru…", "ay mutabakatı:
    … fatura 2.000 → 30 TL fark", "bekleyen: giden − gelen…".
13. Durum etiketi önceliği: `cell-status.test.ts` "öncelikli özel etiket dolguyu alır, otomatik durum kenarlıkta görünür",
    "otomatik etiket kapalıyken özel etiketle birlikte geri dönüş kuralı çalışır".
14. Migrasyonlar: `migrations-upgrade.test.ts` (iki yükseltme senaryosu, ikinci açılış değiştirmez), `migrations-additive.test.ts`
    (sıra numarası, yıkıcı ifade yok); commit edilmiş migrasyona yazma `db-migration-guard` kancasıyla engellenir.

**Sapmalar ve kararlar** (sahibe sorulmadı; "(varsayılan)" — istenirse ayardan ya da kısa bir değişiklikle değişir)
- Maaş değişikliği ay ortasında geçerliyse o ay eski maaş, ertesi ay yeni maaş uygulanır; kısmi ay hesabı yok (varsayılan).
- Bayramlar takvim ilk açıldığında o yıl için bir kez üretilir; kural seti güncellenirse yeniden üretilir; elle eklenen ya da
  "doğrulandı" işaretli günlere dokunulmaz (varsayılan).
- "Her N konaklama" görevleri tarihsiz açılır (oda dolu); aynı şablon ve oda için tek açık görev (varsayılan).
- Arızada "odayı satışa kapat": blok bugünden bir sonraki satılmış geceye kadar (en çok 365 gün); çözülünce o gün biter.
  Elle blok kaldırma: süren blok bugün biter, başlamamış blok iptal olur, bitmiş blok yalnız gerekçeyle (varsayılan).
- İleri tarihli oda değişikliğinde taşınma günü kişiler KBS işaretleriyle yeni odaya geçer; eski oda için "her N konaklama"
  sayacı işler (varsayılan).
- Personel ödemeleri hangi gider bölümüne düşer: yeni ayar `staff.expenseSection` (varsayılan Genel).
- Kur önceliği şimdilik otel kuru > elle düzeltme > piyasa; Faz 11'de `fx.mode` ayarı belirleyecek. Ana para birimi kayıt
  varken değiştirilemez; bir konaklama en çok 400 gece (varsayılan).
- Kişisel notun metni denetim kaydına da yazılmaz; kimlik belge numarası denetim kaydında yazılırken maskelenir (Sahip de
  tam numarayı yalnız misafir kartında görür). KBS dosyasından cinsiyet de okunmaz (KVKK veri en aza indirme).
- "Yalnız kendi görevleri" artık rolün ayarı (Temizlik, Çalışan varsayılan; Sahip rol düzenleyicide değiştirir).
- Kapalı güne yazma kuralı ödeme iptali, ek satış ve çamaşırhane mutabakatını da kapsar; kasa teslimi yalnız teslim alanın
  görebildiği bölümlerin kasa giderlerini kapatır.

**İnceleme turları**: `security-reviewer`, `db-reviewer` (iki tur), `requirements-tracer` çalıştırıldı; bulgular commit'lerde kapandı
(teslim özetinde maskeleme, güvenli geri yükleme, oturum/ek dosya sertleştirme; oda taşınması + KBS; kapalı gün, kasa teslimi
görünürlüğü, "x"lenmiş gider kilidi, kur önceliği, rezervasyon kuralları; blok kaldırma, yedek budama, denetim maskesi,
kullanıcı–personel bağı, kopya metni etiketleri; 0002–0004 migrasyonları; çağrılmayan yöntemlerin testleri; denetim kaydında
personel avansının gider satırı üzerinden maaş sızıntısı, oda taşınmasında yeni konaklamanın denetim satırı).

**Açık noktalar (sonraki fazlar)**
- Faz 4: PIN için deneme kilidi ve sunucu modunda IP başına hız sınırı (Faz 13 ile); şifre özeti (scrypt) şu an eşzamanlı —
  giriş ekranıyla birlikte arka plana alınacak.
- Faz 5: takvim aralığı (`listInRange`) rezervasyon başına ayrıntı okuyor; şerit takvim için toplu okuma yazılacak.
- Faz 9: arıza fotoğrafında küçültme ve EXIF (konum) temizliği (`processImage` kancası hazır).
- Faz 10: Turizm İstatistiği ekranı (G-150); KBS dosyası için boyut/sıkıştırma sınırı (çok büyük ya da bozuk xlsx).
- Faz 11: `fx.mode` ve dış kur kaynakları; "kur X saat önceki" gösterimi (`fx_rate_observed_at` hazır).
- Faz 14: ek dosyaların artımlı yedeği (şimdi her yedek tüm `attachments/` klasörünü kopyalıyor), zamanlama, Drive kopyası.
- Bazı başvuru sütunlarında (ör. `expenses.vendor_contact_id`, `payments.handover_id`) veritabanı yabancı anahtarı yok;
  SQLite'ta eklemek tablo yeniden kurmayı gerektirir (yalnız-ekleme kuralı) — servisler varlığı denetliyor; gerekirse sahibin
  onayıyla ayrı migrasyon.
