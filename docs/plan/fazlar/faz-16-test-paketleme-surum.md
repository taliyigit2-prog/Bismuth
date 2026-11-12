# Faz 16 · Test, Sertleştirme, Paketleme ve v1.0 Sürümü

**Amaç:** "Bitmiş ürün": gerçek makinelerde kurulur, açılır, yıllarca çalışır. Bağımlılıklar dondurulur; kurulum
yönergesi hazırlanır; v1.0 etiketi ve indirilebilir paketler.

**Gereksinimler:** G-03, G-04, G-07, G-132, G-134; ürün sınırlarının son kabulü: G-01 (çevrimdışı), G-05 (OTA yok), G-06 (fatura yok), G-09 (otel kuralı = ayar) — bu dördü her fazda CLAUDE.md yasaklarıyla zaten uygulanır.
**Ön koşul:** Faz 15.
**Sorular:** S-03, S-04 (cevapları burada uygulanır).

## Teslimatlar

1. **Test tamamlama**: iş kuralı birim testleri (kapsam hedefi: `domain/` ≥ %90), uçtan uca senaryolar (kurulum sihirbazı → rezervasyon → ödeme → defter → teslim → maaş → rapor → yedek/geri yükle), rol testleri (her rol için yasak işlem denemeleri), migrasyon testi (v0 örnek veritabanından v1'e), yedek/geri yükleme testi, çevrimdışı test (ağ kapalı tüm akışlar).
2. **Sertleştirme**: hata yakalama ve kullanıcıya Türkçe açıklama; hata günlüğü dosyası (kişisel veri içermez); çökme sonrası kurtarma (WAL); dosya kilidi (iki kopya aynı anda açılmaz); boşta kilit; şifre sıfırlama kodu; büyük veri testi (10 yıl × 20 oda sentetik).
3. **Paketleme**: Windows `setup.exe` (NSIS, kullanıcı başına kurulum, masaüstü kısayolu, kaldırma), macOS `.dmg` (Intel + Apple Silicon evrensel ya da iki paket), simge seti, sürüm bilgisi penceresi, lisans dosyası (üçüncü taraf bildirimleri).
4. **İmza kararı** (S-04): imzasızsa resimli "ilk açılış" yönergesi (SmartScreen ve Gatekeeper adımları) `docs/kurulum.md`; imzalıysa CI'da imza/noter adımları.
5. **Gerçek makine testi**: sahibin bildirdiği Windows ve Mac'lerde (S-03) kurulum + 15 dakikalık senaryo; sonuç tablosu.
6. **Bağımlılık dondurma**: `package-lock.json` sabit, `overrides` ile sürümler kilitli, "güncelleme kontrolü yok" doğrulanır; derleme tekrarlanabilir (aynı commit → aynı paket).
7. **Belgeler**: `docs/kurulum.md`, `docs/kullanim-kilavuzu.md` (program içi yardımla aynı içerik), `docs/yedek-ve-tasima.md`, `docs/gelistirici.md` (yıllar sonra geri dönen biri için: nasıl derlenir, nerede ne var).
8. **Sürüm**: `v1.0.0` etiketi; GitHub Release'e paketler + SHA256; sürüm notu.

## Kabul ölçütleri

- [x] CI yeşil; tüm testler geçer; kapsam hedefi tutar. (2026-10-05, `1e24845`, CI koşusu 89: typecheck, lint, biçim,
  birim testler, e2e (masaüstü + telefon), Linux paket duman testi, Windows ve macOS paket + duman testi; domain kapsamı
  satır %99,4 / dal %92,8 — P16c. Son kontrol düzeltmeleri birleştikçe her commit'te yeniden doğrulanır.)
- [ ] Temiz Windows 10, Windows 11 ve macOS (Intel + Apple Silicon) kurulumlarında program açılır, sihirbaz tamamlanır, yedek alınır.
- [x] Ağ tamamen kapalıyken tüm akışlar çalışır. — `tests/e2e/electron/offline.spec.ts` "ağ kapalıyken bütün ekranlar ve kayıt akışı çalışır; dışarı tek istek gitmez", `tests/unit/offline.test.ts` "bütün yordamlar, zamanlayıcılar ve elle yenileme dışarı tek istek göndermez" (P16a)
- [x] 10 yıl × 20 oda sentetik veride takvim ve raporlar kabul edilebilir sürede açılır (hedefler Faz 5/10'da). — `tests/unit/large-data.test.ts` "10 yıl × 20 oda sentetik veri" (takvim, misafir listesi/arama/kart, defter ayı, Bugün, raporlar), `src/main/services/reports/reports-perf.test.ts` (P16a)
- [ ] Sahip v1.0'ı kendi makinesinde kurup onayladı.

## v2 eklemeleri (bu fazda zorunlu)

- **Uzaktan erişim kabulü**: sunucu modu + **NetBird** + Mac yedek kopya + Drive kutusu + telefon senaryosu sahibin gerçek cihazlarında (otel PC Windows 10, Mac M2, telefon) 15 dakikalık akışla test edilir; otel PC kapatılınca Mac'te kopyanın göründüğü ve devral tatbikatı gösterilir; kılavuzu sahip kendi başına uygular.
- **Üç dil**: her dilde kurulum sihirbazı + Bugün + takvim + ödeme akışı E2E; Rusça çeviri bizim kontrolümüzden geçti (S-77: sahip için yeterli).
- **Çevrimdışı regresyon**: sunucu makinede ağ tamamen kapalıyken tüm akışlar; istemci bağlantısız salt‑okunur davranışı.
- **Veri koruması**: KBS içe aktarmanın kimlik/ad saklamadığı DB dökümüyle kanıtlanır; ekler yedekte.

## Sonrası (isteğe bağlı, v1.0'dan sonra)

- **Yedek görüntü (G-145)** Faz 13'te yapılmadıysa.

## Sonuç — P16d (belgeler) (2026-10-05)

**Kapsam:** teslimat 4 (imza kararı: imzasız yol için ilk açılış yönergesi) ve teslimat 7'nin üç belgesi. Kabul kutuları
işaretlenmedi: hepsi gerçek makine ya da sahip onayı istiyor.

**Yapılanlar**

- `docs/kurulum.md` (yeni): indirme (Releases → Assets, işlemciye göre dosya seçimi, isteğe bağlı SHA256 denetimi),
  Windows 10/11 kurulumu ve **SmartScreen** adımları ("Windows bilgisayarınızı korudu" → "Ek bilgi" → "Yine de çalıştır"),
  macOS 15+/26 **Gatekeeper** adımları (Sistem Ayarları → Gizlilik ve Güvenlik → "Yine de aç"; Apple çipli ve Intel),
  ilk açılış ve kurulum sihirbazının 12 adımı (adlar `steps.ts` ve `tr.json` `setup.step.*` ile birebir), kurtarma kodları ile
  Bismuth anahtarının ayrımı, anahtarı kâğıda yazma (11×5, K-41), Drive masaüstü uygulaması ve yedek klasörü, yeni sürümü elle
  kurma (güncelleme yok; önce yedek), veri klasörü yolları (Windows/macOS), kaldırma, sorun giderme.
- `docs/yedek-ve-tasima.md` kodla (`backup-service.ts`, `backup-section.tsx`, `drive.ts`, `scheduler.ts`, `tr.json` `backup.*`)
  karşılaştırılıp düzeltildi: ekran adları ve düğme metinleri, "Denetle", "Geri yükleme bekliyor"/iptal, güvenlik yedeği,
  "Şimdi yeniden başlat" ve "Klasörü aç"ın yalnız program penceresinde çalışması, el ile alınan yedeklerin kendiliğinden
  silinmediği (listede silme düğmesi yok), taşımada **düz** `backups` dosyasının kullanılması (Drive'daki şifreli dosya değil),
  yeni bilgisayarda anahtarın her zaman kâğıttan girilmesi, sihirbazda yalnız zorunlu adımların yeterli olduğu, dışa/içe
  aktarmanın tabloları ve sihirbaz adımları; Mac'te kopya + devral bölümü eklendi (Faz 13 planına göre,
  `<!-- doğrula: P13b -->` işaretli).
- `docs/gelistirici.md` yıllar sonra dönen biri için yeniden yazıldı: derleme/paketleme (`electron-builder.yml`, CI, smoke
  modu), klasör haritası (her yol `ls` ile doğrulandı), açılış sırası, veri klasörü, tarifler (API çağrısı: modül sözleşme +
  işleyici dosyaları; ekran; migrasyon; i18n spec; ayar), testler (vitest projeleri, e2e masaüstü + telefon, `E2E_PORT`),
  bağımlılık dondurma, kancalar/ajanlar/beceriler, bilinen tuzaklar (React Compiler kapalı, `vaul` yok, Radix diyalog içi menü,
  ICU farkı, `dataDir` testleri, anahtar zinciri). Eski iskeletteki güncel olmayan tarif (`contract/<alan>.ts` +
  `api/handlers.ts`) modül dosyası düzenine çevrildi.

**Sahip onay paketine**

- Gerçek makinede adımların doğrulanması: otel PC (Windows 10) ve Mac M2 (macOS 26) üzerinde `kurulum.md`'yi izleyip uyarı
  pencerelerinin gerçek metinlerini ve düğme adlarını denemek, ekran görüntüleri eklemek (Faz 16 madde 4 ve 5).
- NSIS "kimin için kurulsun" sayfasının metni; macOS 26'da "Yine de aç" satırı; Mac'te anahtar zinciri sorusunun hangi
  durumlarda çıktığı (imzasız pakette her yeni sürümde çıkabilir).
- Kılavuzu izleyen teknik olmayan birinin kurulumu kendi başına tamamlaması (süre kaydı).

**Belge ile kod/plan arasındaki çelişkiler (P16d'de yazıldığı hâliyle; 1–5 P16b'de çözüldü, aşağıda işaretli; son kontrol)**

1. `CLAUDE.md` ve görev metni dosya adını `Bismuth-Setup.exe` / `Bismuth.dmg` diye anar; `electron-builder.yml` gerçekte
   `Bismuth-Setup-<sürüm>-<mimari>.exe` ve `Bismuth-<sürüm>-<mimari>.dmg` üretir. Belge gerçek adları kullanır.
   **Çözüldü (5c88b1a):** adlar sürümsüz sabitlendi (`electron-builder.yml:48, 93`); CLAUDE.md'deki adlarla uyumlu.
2. `release.yml` `electron-builder --win` ile hem x64 hem arm64 üretir; `nsis.artifactName` içinde `${arch}` olduğundan
   electron-builder ayrıca iki mimariyi birlikte taşıyan bir "birleşik" kurucu da üretir (NsisTarget.finishBuild); adı
   mimari ekinden yoksun olabilir. Release sayfasında kafa karıştırabilir. Çözüm seçenekleri: `nsis.buildUniversalInstaller:
   false` ya da iş akışında `--x64` ile sınırlama. Gerçek bir `v*` etiketiyle doğrulanmadı.
   **Çözüldü (5c88b1a):** `electron-builder.yml:51` `buildUniversalInstaller: false`; kurucu adları sürümsüz (`Bismuth-Setup.exe`, `Bismuth-Setup-arm64.exe`, `Bismuth.dmg`, `Bismuth-Intel.dmg`). Gerçek etiketle doğrulama hâlâ yok.
3. `README.md` Mac için "sağ tık → Aç" der; macOS 15+ bunu artık geçerli saymaz (Sistem Ayarları → Gizlilik ve Güvenlik →
   "Yine de aç"). `kurulum.md` doğrusunu yazar; README'nin güncellenmesi gerekir.
   **Çözüldü (5c88b1a):** `README.md:37-38` "Yine de aç" yolunu anlatır.
4. `release.yml`'in sürüm notu metni ("Windows: Bismuth-Setup-...-x64.exe …") kısa ve Türkçe; kurulum belgesine bağlantı
   yok.
   **Çözüldü (5c88b1a):** `release.yml:91` notta sabit adlar ve `docs/kurulum.md` bağlantısı var; asıl not `docs/surum-notlari/<etiket>.md` dosyasından alınır.
5. Windows güvenlik duvarı kuralı (Faz 13 madde 9: NSIS `installer.nsh`) depoda yok (`build/` içinde yalnız simge);
   `kurulum.md` ilk açılışta çıkabilecek soruyu "doğrula: P13a" işaretiyle anlatır.
   **Çözüldü (5c88b1a):** `build/installer.nsh:8-15` özel ağlar için güvenlik duvarı kuralını ekler ve kaldırır. Gerçek Windows'ta denemek sahip onay paketinde.

## Sonuç — P16c-ci (CI'daki uçtan uca kırmızılar) (2026-10-05)

`5c8beaf`'te CI 90 geçti, 4 kırmızı. Her biri yerelde üretildi; kök nedenler ve çözümler:

1. **[electron] `today.spec.ts:58` gece listesi boş basılıyordu — uygulama hatası.** Raporların yazdırma stili
   (`features/reports/print.css`) `body > :not(.print-root) { display: none !important }` kuralını koşulsuz koyuyordu;
   stil dosyası tek CSS paketinde her ekranda yüklü olduğundan "Otelde kalanlar"ın A4 gece listesi (ve kılavuzun yazdırma
   kopyası) da gizleniyor, kâğıda boş sayfa çıkıyordu (P10a ile geldi). Kural artık yalnız rapor kökü sayfadayken
   uygulanır (`body:has(> .print-root) …`, gece listesi ve kılavuzla aynı yöntem). Birim testi:
   `tests/unit/print-css.test.ts` — "her stil program penceresini yalnız kendi yazdırma kökü sayfadayken gizler".
2. **[mobile] `calendar.spec.ts:6` ve [mobile] `today.spec.ts:20` — test yalıtımı.** Telefon projesi tek sunucuyu
   (tek otel) bütün dosyalarla ve yeniden denemelerle paylaşır; dosyalar "bugün 101 boş", "Gelenler (0)", "6 boş oda"
   varsayıyordu, oysa `booking`, `ledger`, `reports` bugüne rezervasyon yazıyor. Ortak yardımcı `tests/e2e/shared-hotel.ts`:
   `freeRooms/freeRoom` istenen gecelerde boş odayı servisten sorar, yetmezse `rooms.create` ile 9xx odaları ekler;
   `hotelToday`, `shiftDay`, `runTag`. `p9c-seed.ts` `{ freeRooms: true }` ile boş odalara yazar ve hangi odaları
   kullandığını döndürür (masaüstü boş otelle başladığı için 101–103 olarak kalır). Takvim testi kendi gelenini ekler,
   sayıları aynı servisin (`reservations.grid`) cevabıyla karşılaştırır. `booking`, `ledger`, `reports`, `guests` da
   kendi boş odalarını seçer; `ledger` misafir adını denemeye özgü yapar, `guests` aynı misafiri yeniden kullanır. Üretim
   koduna test kapısı eklenmedi.
3. **[mobile] `reports.spec.ts:55` — test yalıtımı + tarih.** Ay sonu ekranı, otelde geçen aydan veri varsa geçen ayla
   açılır (tasarım: ay sonu kontrolü ay başında yapılır); `guests.spec`'in 60 gün önceki konaklaması bunu tetikliyordu. Test
   "Sonraki ay" ile bu aya geçip oradan karşılaştırır.
4. **Yalıtım çalışırken bulunan uygulama hatası: oda seçici listesi ekrandan taşıyordu.** Yeni rezervasyon formundaki oda
   listesinin yükseklik sınırı Radix ScrollArea köküne verilmişti; kök kırpmadığı için yedi ve daha fazla odada liste açılır
   pencereden ve telefon ekranından taşıyor, alttaki odalar seçilemiyordu (19 odalı otelde gerçek sorun). Sınır artık
   kaydırılan öğede (`[&>[data-slot=scroll-area-viewport]]:max-h-80`). Birim testi `room-multi-picker.test.tsx` ("19 oda tek
   kaydırılan listede…"); telefon e2e'si (`mobile/booking.spec.ts`) listenin ekranın içinde kaldığını ölçer.
5. **[electron] `admin.spec.ts:183` (yalnız `c24beb1` koşusunda iki kez kırmızı).** Hata imzası: ikinci "Değişiklikler
   kaydedilmedi" penceresinde düğmenin üstünü açık bir `alert-dialog-overlay` örtüyordu. Yerelde HEAD'de 12 + yük altında
   10, `c24beb1`'in kendisinde 4 koşu, pencere kapanırken yeniden açma (0–250 ms) denemeleri: hiçbiri üretmedi; `5c8beaf`
   CI'ında da yeşil. Kök neden kanıtlanamadı; kod değiştirilmedi (ana oturuma not).

Ölçüm: bütün e2e takımı (iki proje) yerelde tek koşuda, `c14d395` (P13b, P9fix, P10fix birleşmiş) üzerinde **98 geçti,
9 atlandı (yalnız ekran görüntüsü testleri), 0 kırmızı** (12,3 dk). Telefon projesi tek başına da, dosyalar tek tek de yeşil; aynı sunucuya üst üste koşu
(yeniden deneme benzetimi) ikinci turda `guests` (60 gün önceki gece 203'te) ve `ledger` (aynı adlı ikinci ödeme)
kırmızılarını, üçüncü turda oda seçici hatasını (madde 4) gösterdi; üçü de giderildi.

## Sonuç — P16b (paketleme ve sürüm notu taslağı) (2026-10-05)

**Kapsam:** teslimat 3 (paketleme), 6'nın paketleme yanı (bağımlılık dondurma denetimi), 8'in sürüm notu taslağı. Kabul
kutuları işaretlenmedi: "CI yeşil", temiz makinelerde kurulum ve sahip onayı gerçek makine/CI ister. Etiket atılmadı.

**Yapılanlar**

- **Windows NSIS** (`electron-builder.yml`): kullanıcı başına sihirbaz (`oneClick: false`, `perMachine: false`; yönetici
  şifresi yok), masaüstü + Başlat kısayolu, kurulum dili tr/en/ru. `nsis.buildUniversalInstaller: false`: x64 ve arm64
  için ayrı kurucular; iki mimariyi birlikte taşıyan, iki kat büyük üçüncü kurucu artık üretilmez. Gerekçe: otel PC
  Windows 10 x64 yalnız x64 kurucuyu ister; ARM Windows (G-04) kendi kurucusunu alır, bu yüzden "yalnız x64" yerine
  ayrı kurucular seçildi. Kaldırma: `deleteAppDataOnUninstall: false` korundu; kaldırıcının ilk sayfası artık üç dilde
  "Kayıtlarınız silinmez … veri klasöründe kalır" der (`build/installer.nsh` `customUnWelcomePage`, yalnız kaldırıcı
  derlemesinde; sessiz güncellemede görünmez). P13a'nın güvenlik duvarı kuralı (`customInstall`/`customUnInstall`) aynen.
- **macOS:** iki DMG (arm64 + x64; K-07: evrensel tek paket iki kat büyük olur ve better-sqlite3 yerel modülünü
  birleştirmek gerekir), ad-hoc imza, noter yok; yerel ağ izni metni ve Bonjour hizmeti korundu.
- **Paket adları (karar):** Release sayfasında sürüm numarasız sabit adlar — `Bismuth-Setup.exe` (Windows x64),
  `Bismuth-Setup-arm64.exe`, `Bismuth.dmg` (Apple çipli), `Bismuth-Intel.dmg` + `SHA256SUMS.txt`. electron-builder mimari
  ekli ad yazar (`Bismuth-Setup-x64.exe`, `Bismuth-arm64.dmg` …); yeni `scripts/release-names.mjs` CI'da (ci.yml paket işi
  ve release.yml) bunları sabit adlara çevirir, SHA256SUMS.txt yazar ve belgelenmemiş bir kurulum dosyası çıkarsa durur.
  Sürüm Release başlığında ve Hakkında'da; `…/releases/latest/download/Bismuth-Setup.exe` bağlantısı her sürümde çalışır.
  G-03 ve CLAUDE.md'deki `Bismuth-Setup.exe` / `Bismuth.dmg` adları böylece gerçek adlar oldu; `docs/kurulum.md`,
  `README.md`, `docs/gelistirici.md`, `docs/yedek-ve-tasima.md` aynı adlara çevrildi.
- **release.yml:** etiket `package.json` sürümüyle aynı değilse durur (Hakkında yanlış sürüm göstermesin); sürüm notu
  `docs/surum-notlari/<etiket>.md` dosyasından (`--notes-file`), yoksa kısa bir satır; dört dosyanın varlığı denetlenir;
  SHA256SUMS.txt yayın işinde bütün dosyalar için yeniden hesaplanır. İki iş akışı YAML olarak ayrıştırıldı (hata yok);
  gerçek bir `v*` etiketiyle çalıştırılmadı.
- **README.md:** macOS "sağ tık → Aç" kaldırıldı → Sistem Ayarları → Gizlilik ve Güvenlik → **Yine de aç**; dosya tablosu,
  kaldırmanın veriyi silmediği.
- **Hakkında (sürüm bilgisi penceresi):** sürüm, Electron/Chromium/Node/SQLite, sistem, veritabanı sürümü ve denetimi zaten
  vardı. Eklenenler: **Derleme tarihi** ve **Derleme kimliği** (commit kısa kimliği; `electron.vite.config.ts` →
  `__BISMUTH_BUILD__`, `src/main/build-stamp.ts`, `app.getInfo` çıktısında `build`). Tarih commit'in günüdür (ya da
  `SOURCE_DATE_EPOCH`), derleme saati değil: aynı commit aynı paketi verir (madde 6). Kaydedilmemiş değişiklikle derlenirse
  kimlik `-dirty` ekler. Üçüncü taraf bildirimleri: liste vardı; **Lisans metinlerini göster** düğmesi
  `THIRD_PARTY_NOTICES.md`'nin tamamını bir pencerede açar (ayrı parça olarak yalnız açılınca yüklenir; telefonda ve
  istemci modunda da çalışır). `npm run notices` çalıştırıldı: dosyalar günceldi (fark yok).
- **Bağımlılık dondurma:** `.npmrc` `save-exact=true`; bütün `package.json` sürümleri tam sabit ve kilit dosyasıyla aynı;
  kilit dosyasında güncelleme/telemetri paketi yok — testle. `overrides` gerekmedi (alt bağımlılık sürümleri
  `package-lock.json` ve `npm ci` ile zaten sabit; bilinen bir güvenlik/uyumluluk zorlaması yok).
- **Sürüm notu taslağı:** `docs/surum-notlari/v1.0.0.md` (Türkçe, sahip için: hangi dosya, ilk açılış uyarıları, neler var,
  bilerek yapılmayanlar). Taslak notu HTML yorumunda; Release sayfasında görünmez.
- **Yedek listesinde silme düğmesi:** eklenmedi. G-120 yalnız otomatik yedeklerin 30 gün sonra kendiliğinden silinmesini,
  G-121 elle yedek / geri yüklemeyi ister; elle alınan yedeği programdan silmek gereksinimde yok ve "veri silinmez"
  ilkesiyle örtüşmez. Yer gerekirse sahip **Klasörü aç** ile dosyayı elle siler (`docs/yedek-ve-tasima.md` bunu
  anlatıyor). (varsayılan)

**Testler:** `tests/unit/packaging.test.ts` (NSIS kullanıcı başına + kısayollar; birleşik kurucu yok; kaldırıcı veriyi
silmez ve üç dilde söyler; güvenlik duvarı kuralı; iki DMG, ad-hoc; yerel ağ metni; sabit adlar + SHA256SUMS + ikinci
çalışma + beklenmeyen dosyada durma; belgeler aynı adları kullanır; iş akışları `--publish never`, sürüm denetimi, not
dosyası; derleme damgası; save-exact ve yasaklı paketler), `src/renderer/features/about/about-page.test.tsx` (derleme
tarihi/kimliği tr ve ru, damga yoksa satır yok, yükleniyor/hata, lisans metinleri penceresi), e2e
`tests/e2e/electron/shell.spec.ts` ilk testine damga ve lisans penceresi adımları.

**Doğrulama:** Linux'ta `electron-builder --linux dir` paketi kuruldu ve `--smoke` ile açıldı: `ok: true`,
`db.integrity: ok`, engellenen istek yok, açılış 1,4 sn. Windows x64 NSIS kurucusu da Linux'ta derlendi (`installer.nsh`
`-WX` ile hatasız; ayrıntı aşağıda). macOS DMG ve Windows'ta gerçek kurulum CI'da / sahibin makinesinde.

**Sahip onay paketine:** otel PC'de (Windows 10 x64) `Bismuth-Setup.exe` ile kurulum, kısayollar, kaldırıcının ilk sayfası ve
verinin kaldığı; Mac M2'de (macOS 26) `Bismuth.dmg` ve "Yine de aç"; Hakkında'da sürüm/derleme satırları; sürüm notu
metninin onayı; ardından `/release 1.0.0` (package.json 1.0.0 + etiket).

## Sonuç — P16a (sertleştirme ve dayanıklılık testleri) (2026-10-05)

**Kapsam:** teslimat 2 (sertleştirme) ve 6 (bağımlılık dondurma) tamamı; teslimat 1'den migrasyon testi ve çevrimdışı test.
Karşılanan: G-01, G-03, G-04, G-07, G-132, G-134. Kabul kutularından "ağ kapalı" ve "10 yıl × 20 oda" işaretlendi.

**Yapılanlar (madde 2 — sertleştirme)**

- **Servis hataları:** var olan düzen doğrulandı (her servis hatası `AppError` + `errors.*` anahtarı; `tests/unit/error-keys.test.ts`).
  `errors.internal` metnine "ne yapmalı" eklendi ("…sorun sürerse programı yeniden başlatın").
- **Beklenmeyen hatalar:** ana süreçte `uncaughtException` → günlük + "Yeniden başlat / Devam et" (dakikada en çok bir soru),
  `unhandledRejection` → yalnız günlük, çöken pencere (`render-process-gone`) → "Pencereyi yeniden aç"
  (`src/main/app/crash.ts`, `crash-wiring.ts`). Arayüzde yönlendiricinin `defaultErrorComponent`'i ve pencereyi saran
  `CrashBoundary` → "Bu ekranda beklenmeyen bir sorun oluştu" ekranı ("Tekrar dene" bozuk veriyi atıp yeniden yükler,
  "Ekranı yeniden yükle"); pencere düzeyindeki hata/promise için tek kısa bildirim (`src/renderer/components/crash-screen.tsx`,
  `lib/crash-report.ts`). Arayüz hataları yeni `system.reportError` yordamıyla ana sürecin günlüğüne yazılır (dakikada ≤ 20;
  ağdan yalnız oturum açmış kullanıcı).
- **Hata günlüğü** `userData/logs/main.log`: her satır `src/main/app/log-redact.ts` süzgecinden geçer — ad, telefon, e-posta,
  kimlik/pasaport, not ve serbest metin alanları `[gizli]`; metinde 7+ haneli sayılar, e-posta, IBAN, belge numarası maskeli.
  Test gerçek electron-log (Node) ile dosyaya yazıp okur.
- **Çökme sonrası kurtarma:** WAL + `synchronous=FULL` + açılışta `integrity_check` vardı (doğrulandı). Yeni: veri dosyası diskte
  bozuksa (açılmıyor ya da denetim başarısız) açılış en yeni **sağlam** yerel yedeği önerir; seçilince geri yükleme işareti
  yazılır, program yeniden başlar, bozuk dosya `bismuth-safety_…` klasörüne kopyalanır (silinmez)
  (`src/main/backup/startup-recovery.ts`). Bozuk yedek atlanır, yeni sürümle alınmış yedek önerilmez.
- **Tek örnek kilidi** (`security/policy.ts` `requestSingleInstanceLock`), **boşta kilit** (Faz 4, `app.test.tsx` "boşta kalınca
  (ayardaki dakika) pencere kilitlenir") ve **kurtarma kodu** (Faz 4, `auth-service.test.ts` "kurtarma kodu bir kez çalışır…")
  vardı; doğrulandı, değişiklik gerekmedi.
- **Büyük veri:** `tests/factories/big-hotel.ts` (10 yıl × 20 oda; ~18 300 rezervasyon, ~21 000 misafir, ~55 000 gece,
  ~24 000 ödeme, ~7 400 gider; uydurma adlar). Erken hata avının gözlemi doğrulandı: misafir listesi boş aramada bütün geçmişi
  (gece, masraf, ödeme satırları) okuyordu (~1,3 sn). Liste artık yalnız özetin gerektirdiğini SQL'de toplar (`listStays`;
  kartla aynı kural, test: `guests-service.test.ts` + `large-data.test.ts`): ~0,65 sn (yük altındaki 4 çekirdekte; hedef
  0,5 sn, sınır ×3). Yeni dizin gerekmedi (migrasyon yok).
- **Migrasyon:** `migrations-upgrade.test.ts` "0000'dan son sürüme adım adım…": her migrasyon tek tek uygulanır, her adımda
  bütün tablolara örnek satır eklenir ve sonraki her adımda önceki satırların bütün sütunları aynen durur; yabancı anahtar
  denetimi temiz.

**Ölçümler** (`BISMUTH_PERF_LOG=1 npx vitest run tests/unit/large-data.test.ts`, IPC yolu + zod, en iyi 3 çağrı, yük ~6–8):
takvim bir ay 20–34 ms · misafir listesi 580–665 ms · ad araması 640 ms · misafir kartı 330 ms · geçmiş 52 ms · defter ayı
14–18 ms · Bugün 26 ms · otelde kalanlar 15 ms · takvimde arama 24 ms · raporlar 10 yıl: özet 730–830, doluluk 560–590,
aylık 385–460, gider 150–220, kasa 165 ms.

**Yapılanlar (madde 6 — bağımlılık dondurma)**

- `tests/unit/dependencies.test.ts`: her sürüm tam (`save-exact`), kilit dosyası tam (`resolved` + `integrity`) ve package.json
  ile aynı, bağımlılık ağacında güncelleyici/telemetri paketi yok, CI ve sürüm iş akışı `npm ci`, `electron-builder.yml`
  `publish: null`, kodda `autoUpdater`/`checkForUpdates` yok.
- Ağ sınırı: ESLint'e `no-restricted-imports` (http/https/net/tls/dgram/dns, undici/axios/ws…, electron `net`) eklendi;
  `tests/unit/network-boundary.test.ts` kaynakları tarar ve kuralı ESLint API'siyle dener.
- Tekrarlanabilir derleme: iki ardışık `npm run build` → `out/` (204 dosya) sha256 aynı; not `docs/gelistirici.md` §7.
  `overrides` gerekmedi (alt bağımlılıklar kilit dosyasında sabit) (varsayılan).

**Kalanlar / sahip onay paketine**

- Gerçek makinede çökme/kurtarma tatbikatı (otel PC'de bozuk dosya senaryosu ve geri yükleme penceresi) — sahip onay paketine.
- `src/main/discovery` (yerel ağ duyurusu, mDNS) ağ kuralında izinli klasörlere eklendi: sunucu modunun parçası, internete
  çıkmaz. CLAUDE.md yasak 1'deki üç klasör listesi buna göre güncellenmeli mi, ana oturum karar versin.

## Sonuç — P16c (uçtan uca senaryolar, üç dil, rol testleri, kapsam) (2026-10-05)

**Kapsam:** teslimat 1'in uçtan uca senaryo, rol testi ve kapsam parçaları; v2 eklemelerinden "Üç dil" ve "Veri koruması".
Uygulama kodu değişmedi (yalnız testler, test yardımcıları ve `vitest.config.ts` eşiği). Kabul kutuları işaretlenmedi:
"CI yeşil" CI koşusu, diğerleri gerçek makine ister; bu paketin payı aşağıda.

**Yapılanlar**

- **Tek uzun senaryo** `tests/e2e/electron/full-day.spec.ts` ("tam gün: kurulum → … → geri yükle"): boş veri klasörü →
  kurulum sihirbazı (arayüzden, 12 adım) → iki rezervasyon (takvim formu) → giriş + ikinci kişi + KBS işaretleri → TL ödeme
  ve €50 döviz ödemesi (internet yok, elle kur 50,00) → defter (satırlar, para birimi toplamları, TL karşılığı ₺5.000, kasa)
  → ₺400 kasadan gider (+ PDF fiş eki) → kasa teslimi (₺2.500 + €50, kasa boş, "x" işaretleri) → çalışan + ₺1.000 avans +
  ₺2.000 maaş ödemesi (maaş tablosu ₺45.333 → ₺42.333; ikisi de defterde gider, G-69) → ay sonu (ciro ₺5.000, gider
  ₺3.400, kalan maaş ₺42.333) → özet rapor (ciro ₺5.000, kâr ₺1.600, gider ₺3.400, satılan gece = takvimin gece sayısı) →
  takvimin kendi verisi (`reservations.grid`: iki gece, ikisi ödendi, toplam ₺5.000) ve ızgarada iki misafir → defter ay
  görünümü (₺5.000, net ₺1.600) → KBS listesi + bakanlık tablosu + "bildirildi" → elle yedek → yedekten sonra bir gider ve
  fiş dosyasının kaybı → geri yükle + yeniden başlatma → defter, rapor, maaş borcu, KBS geçmişi yedekteki gibi; **fiş eki
  aynı baytlarla geri geldi** (ekler yedekte) → kapandıktan sonra `bismuth.db` dökümü (her tablonun her satırı) ve dosya
  baytlarında (WAL dahil) KBS dosyasının ad/soyad/kimlik değerleri yok, uyruk satırları var (**veri koruması**, birim
  testindeki döküm kanıtı artık e2e'de de).
- **Üç dil** `tests/e2e/electron/languages.spec.ts` (tr/en/ru, masaüstü): sihirbazın her adımı (başlık o dilin
  `setup.step.*.title` metni), kurtarma kodları, Bugün, takvim, yeni rezervasyon formu, panel, ödeme diyaloğu ve Para sekmesi;
  her ekranda ham anahtar / doldurulmamış `{{…}}` yok, sayfa yana taşmıyor, düğme/sekme etiketi kesilmiyor. Denetimin
  kendisi sınanır (sayfaya konan `ledger.summary.title {{count}}` yakalanır). `tests/e2e/mobile/languages.spec.ts`: telefonda
  Bugün ve takvim gün listesi üç dilde, aynı denetimler; ortak otelde kendi boş odasına (`shared-hotel.ts`) yazar, dili her
  testten sonra Türkçeye döndürür. Yardımcı: `tests/e2e/i18n-guard.ts` (dil dosyasından metin, ham anahtar raporu, kesik
  etiket raporu).
- **Rol testleri** `tests/unit/permissions-summary.test.ts`: (1) `procedures/*.ts`'deki 252 yordamın her biri en az bir
  `permission*.test.ts` dosyasında adıyla geçer — geçmeyenleri listeleyen test (başlangıçta 77 yordam yalnız servis
  düzeyinde sınanıyordu); (2) bunların 72'si burada tek yönlendiriciden 6 rol × yordam matrisiyle (yalnız yetkisi yetmeyen
  403), bilgisayarın kendisini değiştiren 5'i (`backup.setRecoveryText`, `remote.setMode/becomeClient/relayRun/
  saveConflicts`) gerekçesi ve kapsayan test adıyla listede; (3) **menü ⇔ servis**: 6 rol × 23 ana ekran — ekran menüde
  ⇔ ekranın ana okuması 403 değil (tek bilinçli istisna: takvim notları Bugün'de de görünür). Arayüz tarafı
  `src/renderer/layouts/role-menu.test.tsx`: her sistem rolünün kenar menüsü tam olarak yetkili ekranlar; menüde olmayan
  ekran adresle açılınca "Bu ekrana yetkiniz yok". Uyuşmazlık bulunmadı.
- **Kapsam:** `vitest.config.ts`'e `src/shared/domain/**` için ayrı eşik (satır/deyim/fonksiyon %90, dal %85). Eksik
  dosyalar için testler: `weather.test.ts` (MET simgeleri, WMO çevirisi, saat dilimi, tahmin modeli, rozet), `cities.test.ts`,
  `company-copy.test.ts`, `external.test.ts`'e kaynak/izlenen birim kuralları. Maaş rakamları Excel'den doğrulanmış
  örnekle (40.000 + 4 × 40.000 ÷ 30 = 45.333, §6).

**Ölçümler**

- `npm run test:coverage` (node projesi, 131 dosya, 1209 test): toplam deyim %94,36, dal %84,53, fonksiyon %96,41, satır
  %96,97; `src/shared/domain` deyim %97,87, dal %92,8, fonksiyon %98,95, satır %99,37 (yalnız domain testleriyle önce
  %86,8 / %80,8; `cities`, `company-copy`, `weather` %0'dı); `src/main/services` %93,97 / %84,19 / %96,84 / %97,04.
- Tam gün senaryosu ~45 sn; üç dil masaüstü ~45 sn, telefon ~15 sn.
- Bütün e2e takımı (iki proje, tek koşu, `5c88b1a` + bu paket): **115 geçti, 10 atlandı (yalnız ekran görüntüsü testleri), 0 kırmızı** (21,9 dk; makine başka ajanlarla yüklüyken).

**Bulgular (kod değiştirilmedi; ana oturum karar versin)**

- Rusçada 1366 px masaüstü kenar menüsünde "Передача смены и заметки" (`nav.shift`) sonu "…" ile kesiliyor
  (ekran görüntüsü). Kesme bilinçli (`truncate`), ama sözlük kısaltması ("Смена и заметки") daha okunur olur.
  Telefon üst çubuğunda tarih satırı ("Сегодня понедельник, …") de kesik; tasarım gereği.
- `permission-matrix.test.ts`'deki `EXPECTED_UNPROBED` hâlâ `remote.settings` diyor; özet matris bu anahtarı yönlendirici
  üzerinden sınıyor (`remote.hostStatus` … `remote.setOpenAtLogin`), o liste güncellenebilir.

**Sahip onay paketine:** —

## Son kontrol düzeltmesi (QA2c, 2026-10-05)

Faz 15 + 16 hata avının Faz 16 bulguları (bulgu → test):

- **#1 (yüksek) çökme döngüsü** → soru bastırıldığında pencere kendiliğinden yeniden açılır (5 dakikada en çok 3 kez;
  sonra "Yeniden başlat / Programı kapat" sorusu); ana süreç soru kutusu açıkken gelen pencere çökmesi sıraya girer;
  program ikinci kez çalıştırılınca çökmüş pencere yeniden yüklenir (`focusMainWindow`) (varsayılan) — `crash.test.ts`
  ("çökme döngüsü: pencere her zaman geri gelir", 4 test), e2e `crash-loop.spec.ts` ("pencere bir dakikada iki kez
  çökerse ikincisinde soru sorulmadan yeniden açılır").
- **#2 kişisel görünüm ayarı otel penceresine sızıyordu** → `settings.onChange` çağıranı (`ctx`) da verir;
  `app/display-follow.ts` yalnız bu pencereden (IPC) ve pencerede oturum açmış kişinin (ya da kurulum sihirbazının)
  değişikliğini uygular — `display-follow.test.ts`.
- **#5 bozuk veri penceresi yanlış yedeğin saatini söylüyordu** → önce yedek açılıp denetlenir
  (`prepareRecoveryRestore`), metin o yedeğin tarihiyle kurulur (`app/recovery-text.ts`); "Vazgeç" açılmış kopyayı
  siler; hiç sağlam yedek yoksa soru sorulmadan "yedeklerin hiçbiri açılamadı" denir. Metin "Kullanılabilir en yeni
  yedekten…" oldu — `startup-recovery.test.ts` ("en yeni yedek bozuksa soru, gerçekten geri yüklenecek eski yedeğin…").
- **#7 günlük süzgecinden kaçan biçimler** → etikete bitişik numara (`Tel:`, `T.C.`, `kimlik-`), bölünmez boşluk,
  küçük harfli/tireli IBAN, küçük harfli ve üç harf önekli pasaport; `description`, `q`, `query`, `search`, `returned…`
  alanları gizli — `log-redact.test.ts` ("hata günlüğü süzgeci: bitişik, bölünmez boşluklu, küçük harfli biçimler").
- **#12 `reportError` oran sınırı paylaşılıyordu** → bu bilgisayarın pencereleri bir pay, uzaktaki her kişi ayrı pay —
  `diagnostics-service.test.ts`.
