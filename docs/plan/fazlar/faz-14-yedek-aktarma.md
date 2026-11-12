# Faz 14 · Yedekleme, Geri Yükleme, Dışa/İçe Aktarma

**Amaç:** Sahibin yılların verisi tek dosyada; kaybolmasın, taşınabilsin, Excel'e dökülebilsin; isterse mevcut 2026
tablosu içeri alınabilsin.

**Gereksinimler:** G-120 … G-123.
**Ön koşul:** Faz 7–13 (dışa aktarılacak tablolar ve sunucu modu hazır; yedek ekleri ve `kbs_stay_rows` dahil, kimlik verisi yok).
**Sorular:** yok — S-08 (2026 verisi taşınacak), S-42 (program klasörü + otel Gmail Drive, 30 gün, yavaş/parçalı), S-43 (hepsi) cevaplandı.

## Teslimatlar

1. **Otomatik yedek** (G-120, K-32): günde bir, **sessiz saatte** (varsayılan 04:00) + kapanışta; SQLite çevrimiçi yedek API'si ile tutarlı kopya (ekler dahil); **zayıf PC için düşük öncelik ve parça parça** (sayfa adımlı `backup()` + bloklar arası bekleme; kullanıcı çalışırken duraklar); sıkıştırılmış dosya `bismuth-yedek-YYYY-MM-DD-HHmm`; iki yer: **program klasörü** + **otelin Google Drive klasörü** (`Drive'ım/Bismuth/yedekler/`; Drive masaüstü uygulaması eşitler, Bismuth buluta bağlanmaz) — Drive kopyası **şifreli** (AES‑256‑GCM, Bismuth anahtarı; K-05); **30 gün** saklama, yeni yedek gelince en eskisi silinir (S-42); Drive klasörü yoksa sessizce atlanır ve rozet çıkar.
2. **Elle yedek / geri yükle**: Ayarlar → Yedek; geri yüklemede önce mevcut veri otomatik yedeklenir; Faz 1'in migrasyon öncesi yedekleri (`backups/bismuth-pre-migration_*.db`, şimdilik sabit 10 adet) listede görünür ve saklama sayısı ayara taşınır (G-09); bütünlük kontrolü (`PRAGMA integrity_check`) ve sürüm uyumu (eski yedek → migrasyon çalışır; yeni sürüm yedeği → ret + açıklama).
3. **Dışa aktarma** (S-43: **tüm tablolar**): rezervasyonlar (gece bazlı ve rezervasyon bazlı), defter (gelir/gider + ürün satırları), maaş tabloları, misafirler, firmalar, rehber, tedarik, çamaşırhane, görevler, arızalar, kayıp eşya, raporlar → CSV ve XLSX (Türkçe başlıklar, tarih/para biçimleri doğru; tanıtıcı notlar ve kimlik no yalnız yetkili rolde).
4. **İçe aktarma yardımcısı** (S-08: taşınacak — zorunlu, G-123, K-30): CSV yükle → sütun eşleştirme → önizleme → hata listesi (bilinmeyen oda, boş isim, tarih biçimi) → içe al; misafir adları normalize edilir ve olası tekrarlar birleştirme için işaretlenir. Sahibin iki dosyası için hazır şablon: "Rezervasyon (oda × gün)" ve "Defter (günlük satırlar)". *(P14fix #10: G-123 "… ve Maaşlar" — üçüncü şablon "Maaşlar (çalışan × ay)": personel, ay, maaş, ödenen, yöntem; isteğe bağlı ödeme tarihi ve para birimi; P8 maaş servisinden yazılır; her şablonun örnek dosyası indirilir.)*
5. **Veri klasörü** bilgisi ekranda (yol, boyut, son yedek zamanı) ve "klasörü aç" düğmesi.
6. **Felaket senaryosu kılavuzu**: yeni bilgisayara taşıma adımları (kur → yedeği geri yükle).

## Kabul ölçütleri

- [x] Program açık ve yazarken alınan yedek bozulmaz (test: yoğun yazma sırasında yedek + integrity_check).
- [x] Geri yükleme sonrası tüm ekranlar aynı veriyi gösterir; audit kaydı düşer.
- [x] XLSX'te "₺2.500,00" gibi biçimler ve Türkçe karakterler doğru; Excel/Numbers/LibreOffice'te açılır.
- [x] İçe aktarma: örnek CSV'den 19 oda × 30 gün rezervasyon ve 100 defter satırı hatasız içe alınır; hatalı satırlar raporlanır, sağlamlar alınır.
- [x] Drive klasörü erişilemezse sessizce atlanır ve Bugün ekranında uyarı rozeti çıkar; 31. gün en eski yedek silinir (saat ilerletilmiş test).
- [ ] Zayıf PC profili (CPU sınırlı test makinesi): yedek sırasında takvim kaydırma ve ödeme girişi takılmaz; Drive'daki yedek anahtarsız açılamaz, anahtarla geri yüklenir.

## Sonuç (2026-10-05)

**Durum:** ✅ teknik olarak tamam (paket P14). Son ölçütün "zayıf PC" ölçümü ve Excel/Numbers/LibreOffice'te elle açma
sahip onay paketine kaldı.

**Yapılanlar**

- **Otomatik yedek** (G-120, K-32): her gün `backup.autoTime` (04:00) ve kapanışta (son otomatik yedek 6 saatten
  yeniyse kapanışta yeniden alınmaz); program o saatte kapalıysa açılıştan 5 dk sonra. Çevrimiçi yedek **parça parça**
  (`src/main/backup/stepped-backup.ts`: ~4 MB adım, adım arası bekleme, pencerelerden çağrı geldikçe en çok 10 dk
  duraklar; aynı bağlantı üzerinden yazılan değişiklik kopyaya taşınır, kopya tutarlı kalır). Kopya
  `integrity_check`ten geçer, eklerle birlikte tek sıkıştırılmış dosya olur: `bismuth-yedek-YYYY-MM-DD-HHmm.bmy`
  (elle: `-elle`, geri yükleme öncesi: `-guvenlik`). Aynı dosya **AES-256-GCM** ile şifrelenip Drive klasörüne
  yazılır (`Drive'ım/Bismuth/yedekler`, kendiliğinden bulunur ya da `backup.driveFolder`); Drive yoksa ya da anahtar
  saklanamıyorsa sessizce atlanır, durum uyarı verir. **30 gün** (`backup.keepDays`) saklama, burada ve Drive'da;
  en yeni otomatik yedek her zaman kalır.
- **Bismuth anahtarı** (K-05; Faz 13 ile ortak modül `src/main/security/bismuth-key.ts`): 256 bit anahtar, Electron
  `safeStorage` ile `userData/bismuth-key.json`'da (açık hâli dosyada yok); kâğıt için 11×5 Crockford base32 metin
  (sağlama baytlı; harf hatası yakalanır). Göster (denetim kaydına yazılır) / gir; yeni bilgisayarda Drive yedeğini
  geri yüklerken girilen anahtar saklanır.
- **Elle yedek / geri yükle** (G-121): Ayarlar → Yedek; geri yüklemede seçilen yedek açılır ve denetlenir
  (`integrity_check`, sürüm: yeni sürümün yedeği `errors.backupNewerVersion` ile reddedilir, eskisi açılışta göç
  eder), önce güvenlik yedeği alınır, değişim bir sonraki açılışta yapılır ("Şimdi yeniden başlat"), denetim kaydı
  düşer. Güncelleme öncesi kopyalar listede ve geri yüklenebilir; saklama sayısı ayar (`backup.preMigrationKeep`).
- **`backup.status`** (Bugün rozeti için, P9c): `today` ya da `settings.backup` görme yetkisiyle; uyarılar `stale`
  (48 saattir yedek yok), `drive`, `failed`.
- **Dışa aktarma** (G-122, S-43): 20 tablo (rezervasyon gece/rezervasyon bazlı, odadaki kişiler, defter gelir/gider,
  gider ürün satırları, personel, maaşlar, maaş/avans ödemeleri, izinler, çalışma saatleri, misafirler, firmalar,
  kara liste, rehber, tedarik ürünleri, çamaşırhane, görevler, arızalar, kayıp eşya) CSV ya da XLSX; "tüm tablolar"
  tek çalışma kitabı. Başlıklar kişinin dilinde; XLSX'te gerçek tarih ve sayı + biçim (`"₺"#,##0.00`), CSV'de
  `₺2.500,00`, UTF-8 BOM, tr/ru'da `;`. Kimlik no ve tanıtıcı not yalnız `guests.identity` ile; sahip gizli gider
  bölümü ekrandaki gibi gizli. Her dışa aktarma denetim kaydına (`export`) yazılır. Programın penceresinde "Farklı
  kaydet" penceresiyle, telefonda/tarayıcıda indirme.
- **İçe aktarma sihirbazı** (G-123, K-30): dosya (CSV ya da XLSX) → sütunlar → önizleme + sorunlu satırlar + olası
  tekrar misafirler → içe al → sonuç. Şablonlar: "Rezervasyon (oda × gün)" (ardışık günler tek konaklama; "A sonra B";
  SATILMAZ atlanır; XLSX'te kırmızı = ödendi → seçilen yöntemle ödeme; biten konaklamalar "çıkış yaptı") ve "Defter
  (günlük satırlar)" (gelir → ödeme; oda+gün+ad bir rezervasyona uyarsa onun ödemesi, yoksa satış folyosu; gider →
  gider; "x" → teslim/kasadan). Yazma servisler üzerinden (yetki, kapalı gün, denetim kaydı). Misafir adları
  düzeltilir, aynı ad tek kart; benzer adlar işaretlenir (birleştirme Misafirler ekranında).
- **Veri klasörü**: yol, boyut, "Klasörü aç" (yalnız programın kendi penceresinde).
- **Kılavuz**: `docs/yedek-ve-tasima.md`.

**Kararlar (varsayılan)**

- Kapanış yedeği, son otomatik yedek 6 saatten eskiyse alınır (sık yeniden başlatmada yedek yığılmasın).
- Rezervasyon şablonunda renk → ödeme yazımı isteğe bağlı; defter de içe alınacaksa kapatılmalı (gelir iki kez
  sayılmasın) — sihirbaz bunu söyler.
- Tanıtıcı notlar (`descriptor_note`) görev metnine uyularak yetkili rolde dışa aktarılır; §4.9-13 "hiç dışa
  aktarılmaz" diyordu (ana oturum karar versin).
- "Raporlar" dışa aktarımı Faz 10'un rapor ekranına kaldı (yazıcılar `services/data-transfer/writers.ts` hazır).

**Sahip onay paketine**: zayıf PC'de yedek sırasında takvim/ödeme akıcılığı; XLSX'in Excel, Numbers ve
LibreOffice'te açılması; gerçek Drive masaüstü uygulamasıyla eşitleme; Windows/macOS anahtar deposu.

### Hata avı düzeltmeleri (P14fix, 2026-10-05)

Bulgu → test (her biri önce kırmızı yazıldı; #1, #3, #7 P13sec'te):

- #2 içe aktarma tekrarı: her kayıt bir parmak izi alır (şablon + kaydın içeriği + dosyadaki eş kayıtlar arasındaki sırası;
  sha256), her çalıştırma bir aktarım (`import_batches`, `import_rows`; migrasyon `0015_import_batches`). Yürürlükteki bir
  aktarımın aldığı kayıt atlanır, önizleme "Alınmış" der ve aynı dosyanın ne zaman alındığını yazar. "Aktarımı iptal et"
  (gerekçe ≥ 3 harf, `settings.backup` düzenleme + kaydın kendi servis yetkileri): teslimler geri alınır, ödemeler/giderler/
  maaş ödemeleri/satış masrafları iptal, rezervasyonlar iptal (geceler boşalır); tek işlemde, bir yerde takılırsa hiçbir
  şey değişmez; denetim kaydı `import_batch`. → `data-import-fixes.test.ts` "aynı defter dosyası ikinci kez alınınca…",
  "dosyada düzeltilip yeniden alınınca…", "Bu aktarımı iptal et…", "rezervasyon tablosu: ikinci kez alınınca atlanır…",
  "iptal bir parçada takılırsa hiçbir şey değişmez"; yetki `permissions-data-import.test.ts`; arayüz
  `backup-section.test.tsx` "daha önce alınmış kayıtlar…", "içe aktarmalar listelenir…". (varsayılan) Parmak izine dosyanın
  sha256'sı katılmadı: katılsaydı düzeltilip yeniden kaydedilen dosyada bütün satırlar ikinci kez girerdi; dosya sha256'sı
  aktarımda saklanır ve "aynı dosya" uyarısı için kullanılır. Maaş tutarları (geçmiş yeniden yazılmaz) ve oluşan misafir
  kartları iptalde kalır.
- #4 açılışta yapılamayan geri yükleme `restore-pending.json.failed`'a nedeniyle yazılır; Yedek'te kutu + "Tamam", Bugün'de
  uyarı (`restoreFailed`); başarılı geri yüklemede yedek kaydına `restored_at` → `backup-fixes.test.ts` "sağlaması tutmayan
  kopya geri yüklenmez…", "geri yüklenen yedeğin kaydına geri yükleme zamanı yazılır"; `today-page.test.tsx`,
  `backup-section.test.tsx` "açılışta yapılamayan geri yükleme…".
- #5 başarısız otomatik yedek her dakika değil 30 dk, 1, 2, 4, en çok 6 saat arayla yeniden denenir → `backup-parts.test.ts`
  "başarısız yedek her dakika yeniden denenmez…".
- #6 kopyanın `integrity_check`'i ve sürüm okuması `worker_threads` içinde ayrı salt okunur bağlantıyla
  (`db/client.ts` `integrityOfFileAsync`, `schemaVersionOfFileAsync`; işçi açılamazsa eskisi gibi ana süreçte); geri yüklemenin
  sha256'sı akışla → `off-thread.test.ts`. Ölçüm (250 bin satır, ~16 MB): ana süreçte olay döngüsü 442 ms durdu, işçide en
  uzun duraklama 6 ms.
- #8 sessizce oluşan Bismuth anahtarı gösterilene (ya da kâğıttan girilene) kadar Yedek ve Bugün'de `keyNotShown` uyarısı →
  `backup-fixes.test.ts` "ilk Drive yedeğinde sessizce yapılan anahtar…", "kâğıttan girilen anahtar için uyarı çıkmaz".
- #12 "Geri yükle" ile yeniden başlatma arasında girilenlerin açılış kopyası (`bismuth-safety_…`) listede "Geri yükleme
  öncesi" olarak görünür, denetlenir ve geri yüklenir (WAL'i dosyaya katılarak); metinler düzeltildi → `backup-fixes.test.ts`
  "açılıştaki güvenlik kopyası listede görünür ve ondan geri yüklenebilir".
- #10 maaş şablonu → `data-import-fixes.test.ts` "çalışan, ay, net maaş, ödenen ve yöntem okunur…", "maaş şablonu maaş
  yazma yetkisi ister; örnek dosya…"; `backup-section.test.tsx` "maaş şablonu seçilir ve örnek dosyası indirilir".
- #14 otelin günü: içe aktarmada biten konaklama → `data-import-fixes.test.ts` "biten konaklama otelin gününe göre…";
  dışa aktarmanın zaman damgalı tablo süzgeci → `data-transfer.test.ts` "zamanı olan tablolarda tarih süzgeci otelin
  gününe göredir…".
- #15 `guests` satır sayısı birleştirilmiş kartları saymaz → `data-transfer.test.ts` "misafir satır sayısı…".
- #16 rezervasyon ve odadaki kişiler aynı `[giriş, çıkış)` süzgeci → `data-transfer.test.ts` "tarih aralığı konaklamada…".
- #17 defter geliri iptal/gelmedi rezervasyona ve bırakılmış odaya bağlanmaz → `data-import-fixes.test.ts` "gelir satırı
  iptal edilmiş rezervasyona bağlanmaz".
- #18 eşleşmeyen gelirin satış folyosu + masrafı ödemesiyle tek işlemde, kapalı gün denetimiyle → `data-import-fixes.test.ts`
  "eşleşmeyen gelirin satış folyosu ödemeyle tek işlemde yazılır…".
- #21 `docs/yedek-ve-tasima.md` koda uyduruldu (QR + Yazdır, yeni uyarılar, açılış kopyası, yeniden deneme aralığı, maaş
  şablonu, tekrar ve aktarım iptali). **(varsayılan) Yerel yedeği şifreleme ayarı yok**: bu bilgisayardaki yedek canlı
  veritabanı dosyasıyla aynı yerde duruyor (bilgisayara erişene karşı bir şey katmaz), anahtar kaybolursa en hızlı geri dönüş
  yolunu kapatır; bilgisayardan çıkan Drive kopyası her zaman şifreli (K-05'in "isteğe bağlı" kısmı uygulanmadı, kılavuzda
  yazılı).

Bu turda e2e'de doğrulanmayanlar sahip onay paketine: gerçek Electron paketinde (asar) işçi iş parçacığının better-sqlite3'ü
açması (açamazsa denetim ana süreçte yapılır, yedek yine alınır).


### Son kontrol (QA2x): dışa aktarılan / bilerek dışarıda bırakılan tablolar (2026-10-05)

S-43 / G-122 "dışa aktarma **hepsi**": ilk listede olmayan 17 tablo eklendi (toplam 37 veri kümesi). Her biri
`src/main/services/data-transfer/export-catalog.ts`'te: sütun başlıkları dosyanın dilinde (`dataTransfer.*`), liste
adları `listLabel` ile, tarih süzgeci konaklama gibi `[ilk gün, boş gün)` ya da otelin gününe göre, yetki ekrandaki
anahtarla. Ayarlar → Yedek → **Dışa aktar** listesinde ve **Tüm tablolar** XLSX dosyasında (her tablo bir sayfa)
görünürler. Görev ve arıza dosyalarında başlık sütunu "Unvan" yazıyordu; "Başlık" oldu. Rezervasyon dosyasına otelin
renk etiketleri (`reservation_tags`) sütunu eklendi.

**Dışa aktarılan** (tablo → veri kümesi · yetki):

| Tablo | Veri kümesi | Yetki | Not |
|---|---|---|---|
| `room_nights` | Rezervasyon geceleri | `calendar` | |
| `reservations`, `reservation_rooms`, `folios`, `reservation_tags` | Rezervasyonlar | `calendar` | toplam/ödenen/bakiye hesaplanır; etiket adları tek sütunda |
| `charges` | Ücret kalemleri (yeni) | `calendar` | gece ücreti, ek hizmet, indirim, ceza, düzeltme |
| `reservation_notes` | Rezervasyon notları (yeni) | `calendar` | |
| `stay_occupants` | Odadaki kişiler | `in_house` | tanıtıcı not hiç çıkmaz (K-46 (4)); kimlik no yalnız `guests.identity` |
| `payments` | Defter gelirleri | `ledger` | |
| `expenses`, `expense_items` | Defter giderleri, Gider ürün satırları | `expenses` | gizli bölüm ve maaş yetkisi yoksa personel parası çıkmaz (G-67, K-42) |
| `cash_handovers` | Kasa teslimleri (yeni) | `cash` | teslim × para birimi; K-42 kısmi görünümde kasa tutarı görülebilen satırlardan yeniden hesaplanır |
| `business_days` | Defter günleri (yeni) | `ledger` | gün kapatma ve sahibin gün notu |
| `employees` | Personel | `staff` | |
| `employment_periods` | Çalışma dönemleri (yeni) | `staff` | |
| `employee_salaries`, `staff_transactions` | Maaşlar, Maaş ve avans ödemeleri | `staff.salary` | |
| `leave_records`, `work_records` | İzinler, Çalışma saatleri | `staff.leave`, `staff.overtime` | |
| `guests`, `guest_tags`, `guest_tag_links` | Misafirler | `guests` | etiket adları tek sütunda; birleştirilmiş kartlar yok |
| `companies`, `blacklist`, `contacts` | Firmalar, Kara liste, Rehber | kendi anahtarları | |
| `products` | Tedarik ürünleri | `supplies` | |
| `product_categories` | Ürün kategorileri (yeni) | `supplies` | |
| `laundry_deliveries`, `laundry_delivery_items` | Çamaşırhane | `laundry` | |
| `laundry_prices`, `laundry_settlements` | Çamaşırhane fiyatları, Çamaşırhane ay hesapları (yeni) | `laundry` | |
| `tasks`, `room_issues`, `lost_items` | Görevler, Arızalar, Kayıp eşya | kendi anahtarları | |
| `room_types`, `rooms`, `room_capacity_changes` | Oda tipleri, Odalar, Oda kapasite geçmişi (yeni) | `settings.rooms` | K-27 geçmişi |
| `room_blocks` | Satışa kapalı odalar (yeni) | `calendar` | takvimde görünen kapatma; dosyada son gün |
| `shift_handovers` | Vardiya devirleri (yeni) | `shift_notes` | elle not + otomatik özet sayıları + okundu; özet okuyanın yetkisiyle yeniden süzülür (kasa K-42 (3)) |
| `notes` (yalnız `kind='board'`) | Pano notları (yeni) | `shift_notes` | kişisel not (`kind='personal'`) hiçbir dosyada yok (§4.9-12) |
| `calendar_days` | Özel günler ve takvim notları (yeni) | `calendar` | |
| `fx_rates` | Kur geçmişi (yeni) | `currency` | tarih, para birimi, karşılığı, kur, kaynak |
| `import_batches` | İçe aktarmalar (yeni) | `settings.backup` | tarih, şablon, dosya adı, özet sayıları, iptal |

**Bilerek dışarıda bırakılan** (tablo → gerekçe):

| Tablo | Gerekçe |
|---|---|
| `sessions`, `devices`, `recovery_codes` | Oturum ve cihaz güvenliği; çalışma verisi değil. |
| `users`, `roles`, `role_permissions` | Parola/PIN özeti ve yetki tablosu; kullanıcı ve roller Ayarlar'da görünür, tam hali yedekte. Dosyalarda kişi adları "Yazan / Teslim alan / Okuyan" sütunlarında yer alır. |
| `change_log`, `replica_grants` | Yedek kopya eşitlemesinin iç kaydı. |
| `user_preferences`, `settings`, `pay_policies` | Ayarlar; tam hali yedekte. |
| `sales_channels`, `payment_methods`, `extra_services`, `expense_sections`, `laundry_item_types`, `status_tags`, `shift_definitions`, `task_templates` | Ad listeleri ve şablonlar: satırlarda adlarıyla yer alırlar (kanal, yöntem, bölüm, parça, etiket, vardiya); tam hali yedekte. |
| `audit_log` | Denetim ekranında okunur (yalnız Sahip). Öncesi/sonrası içeriği okuyanın yetkisine göre maskeleniyor (kimlik, maaş, gizli bölüm); bu maskeleme dışa aktarmada yeniden kurulmadı, denetim ekranının kendi dışa aktarması yok. Tam hali yedekte. Ana oturum kararı: Denetim ekranına dışa aktarma ayrı iş olarak açılabilir. |
| `calendar_generation`, `reservation_code_sequences` | Program iç sayaçları. |
| `notifications` | Geçici bildirim. |
| `backups` | Yedek listesi Ayarlar → Yedek'te; iç kayıt. |
| `import_rows` | İçe aktarılan her kaydın parmak izi (tekrar denetimi); özeti İçe aktarmalar dosyasında. |
| `kbs_imports`, `kbs_stay_rows`, `country_map` | Turizm istatistiği ekranının kendi bakanlık XLSX çıktısı var; KBS satırlarında isim/kimlik yok. |
| `salary_periods` | Kilitlenmiş ayın maaş tablosu görüntüsü: Maaşlar ve Maaş ve avans ödemeleri dosyalarından hesaplanır. |
| `attachments` | Dosyalar `userData/attachments/` klasöründe, tabloda yalnız yol + sha256 (K-25); yedekte. |
| `stay_occupants.descriptor_note` (sütun) | Tanıtıcı not dışa aktarılmaz (K-46 (4), 03-mimari §4.9-13). |

Testler: `data-transfer-tables.test.ts` "her yeni tablo en az bir satırla, başlıkları dosyanın dilinde dışa
aktarılır" (tr/en/ru; listedeki sayı dosyadakiyle aynı), "\"Tüm tablolar\" XLSX dosyası yeni tabloları da ayrı sayfa
olarak içerir; kur sayı olarak yazılır", "K-42: Sahip bölümü ve personel parası görmeyen rolün kasa teslimi ve vardiya
devri dosyasında gizli tutar yok", "kişisel not (kendime not) hiçbir dosyada yok; pano notu kendi tablosunda", "tarih
aralığı: oda bloğu [ilk gün, boş gün) gibi süzülür; kur ve teslimler otelin gününe göre";
`tests/unit/permissions-backup.test.ts` "eklenen tablolar ekrandaki yetkiyi ister: yetkisi olmayan listede görmez, dışa
aktaramaz (QA2x)"; `data-transfer.test.ts` sayfa sayısı artık `EXPORT_DATASETS.length`. Kılavuz `17-backup` (üç dil)
dışa aktarma paragrafı güncellendi.
