# 14 — Antigravity Devir Sonrası Kapsamlı Hata ve Darboğaz Raporu

> **Tarih:** 2026-11-24  
> **Kapsam:** Güvenlik ve Altyapı, Electron ve Python Kamera Yan Süreci (`otel-kamera/`), İş Mantığı ve Servisler, Arayüz (Renderer UI) ve Performans Darboğazları  
> **Yöntem:** 4 alan denetçisiyle statik kod taraması + etkilenen kaynak satırlarının doğrudan doğrulanması + yerel test çalıştırmaları (`node`, Mac ortamı)

---

## 1. Otel Sahibi İçin Sade Özet

1. Programın temel iş akışları ve mevcut 342 birim test dosyası genel olarak sağlamdır; ancak **2 kritik**, **27 yüksek**, **33 orta** ve **16 düşük** öncelikli hata ile **13 performans darboğazı** tespit edilmiştir.
2. **En acil iki konu (Kritik):**
   - **İstemci kopyasında yetki ve kilit açığı (`S-1`):** İstemci modu kopyalama/anahtar/devralma işlemlerinde ekran kilidi ve yetki denetimi atlanabilmektedir.
   - **Kamera okuyucuda çökme riski (`C-1`):** Python kamera yan sürecinde OpenCV bağlantısı okuma sırasındayken başka iş parçacığından eşzamanlı kapatılabilmekte, bu da C++ bellek çökmesine (segfault) yol açabilmektedir.
3. **Bu çalışmada hemen giderilen 2 altyapı sorunu (`Düzeltildi`):**
   - Antigravity durdurma kancası (`stop-gate.mjs`) macOS'ta `/var` → `/private/var` yol farkı yüzünden takılıyordu; `realpathSync` ile düzeltildi.
   - Vitest birim testleri Mac'te kullanıcının gerçek Google Drive klasörüne erişmeye çalışıyor ve `backup-service.ts` klasör okuma hatasında `500` üretiyordu; `vitest.config.ts` testleri geçici klasöre yalıtıldı ve `archivesIn` hata koruması eklendi.
4. **Önerilen yol:** Hataların tek tek rastgele değil, aşağıdaki **3 dalgalı plan** ile (önce güvenlik ve veri bütünlüğü, sonra iş kuralları, ardından arayüz cilası) düzeltilmesi ve her dalga sonunda `npm run check` çalıştırılmasıdır.

---

## 2. Özet Sayı Tablosu

| Öncelik / Durum | Güvenlik & Altyapı | Electron & Kamera | İş Mantığı & Servisler | Arayüz (Renderer UI) | Toplam |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Düzeltildi (Devir paketi içinde)** | 2 (`G-1`, `D-0`) | 0 | 0 | 0 | **2** |
| **Kritik** | 1 | 1 | 0 | 0 | **2** |
| **Yüksek** | 6 | 7 | 8 | 6 | **27** |
| **Orta** | 9 | 7 | 7 | 10 | **33** |
| **Düşük** | 3 | 2 | 5 | 6 | **16** |
| **Toplam Açık Hata (Kritik–Düşük)** | **19** | **17** | **20** | **22** | **78** |
| **Performans Darboğazı (Ayrı sınıf)** | 3 | 0 | 7 | 3 | **13** |

---

## 3. Devir Çalışmasında Şimdiden Düzeltilenler

| Kod | Konum | Sorun ve Uygulanan Düzeltme |
| :--- | :--- | :--- |
| **`G-1`** | `scripts/guards/stop-gate.mjs` | macOS'ta `/var` ile `/private/var` sembolik bağ farkı nedeniyle geçici depolardaki kök eşleşmesi bozuluyor, 8 kanca testinden 7'si takılıyordu. `realpathSync` normalleştirmesi ile giderildi. |
| **`D-0`** | `vitest.config.ts`, `src/main/services/backup-service.ts:350-363` | Vitest `node` projesi `BISMUTH_DRIVE_HOME` ayarı olmadan çalıştığı için `store.test.ts` ve `offline.test.ts` macOS'ta gerçek Google Drive CloudStorage klasörünü tarıyordu; ayrıca `archivesIn` içinde `readdirSync(dir)` `try/catch` sarması olmadığı için klasör okuma hatasında `500 INTERNAL` fırlatıyordu. Vitest `node` ortamı `tmpdir()/bismuth-vitest-no-drive` yoluna yalıtıldı ve `archivesIn` güvenli hâle getirildi. |

---

## 4. Kritik Hatalar (2 Adet — Dalga 1 En Başta)

### `S-1` — İstemci Kopyasında Oturum/Yetki Kontrolsüz Anahtar Değişimi ve Sahip Devralma
- **Dosyalar:** `src/main/server/client-app.ts:207-242, 251-252, 266-268`, `src/main/server/replica-client.ts:224-234, 254-305`
- **Etki:** Kilitli istemci ekranında veya `remote.settings` yetkisi olmayan bir kullanıcıyla mevcut Bismuth şifreleme anahtarı ezilebilir ve anahtar doğrulanmadan sahip devralma (`remote.takeOver`) tetiklenebilir.
- **Kök Neden:** `remote.replicaStatus`, `remote.replicaSync`, `remote.replicaSetKey`, `remote.replicaSetFolder`, `remote.replicaPickFolder` ve `remote.takeOver` yolları `replicaCall()` üzerinden oturum, kilit ekranı ve yetki denetimi olmadan çalışıyor. `setKey(..., replace=true)` doğrudan anahtar üzerine yazıyor; `takeOver` ise girilen anahtarın Drive kutusunu gerçekten çözdüğünü kontrol etmiyor. Ek olarak `mayChangeHotels` (`client-app.ts:251-252`), `!link.hasSession(windowId)` iken `true` döndürüyor.
- **Düzeltme Yönü:** Tüm `replica*` ve `takeOver` çağrılarına aktif oturum + kilitli-değil + `remote.settings` yetki denetimi eklemek; `takeOver` ve `replace=true` öncesinde anahtar doğrulamasını zorunlu kılmak; `mayChangeHotels` varsayılanını `!link.hasSession` durumunda `false` yapmak.

### `C-1` — Python Kamera Okuyucuda Eşzamanlı `VideoCapture.release()` Yarış Durumu
- **Dosyalar:** `otel-kamera/camera_grabber.py:91-124, 154-169, 183-187`
- **Etki:** Kamera akışı takıldığında veya durdurulurken OpenCV C++ katmanında use-after-free segfault (yan sürecin aniden çökmesi) ve watchdog körleşmesi oluşabilir.
- **Kök Neden:** `_reader_loop` C++ `cap.read()` çağrısında blokluyken `_watchdog_loop` ve `stop()` aynı `VideoCapture` nesnesi üzerinde eşzamanlı `cap.release()` çağırıyor. Ayrıca eski kuşak bir okuyucu bloktan çıktığında `_stale(gen)` kontrolü yapmadan `_busy_since = None` sıfırlayarak watchdog zamanlayıcısını temizliyor.
- **Düzeltme Yönü:** `VideoCapture` yaşam döngüsünü tek okuyucu iş parçacığına veya kilitli/üretim-nesli korumalı serbest bırakmaya almak ve `_busy_since` sıfırlamasını `_stale(gen)` kontrolüne bağlamak.

---

## 5. Yüksek Öncelikli Hatalar (27 Adet)

### 5.1 Güvenlik ve Altyapı (6 Adet)

| Kod | Konum | Bulgular |
| :--- | :--- | :--- |
| **`S-2`** | `src/main/server/replica-routes.ts:133-209, 247-266` | Kopya SSE akışı `authorise` ve `deps.replaced()` denetimini yalnızca bağlantı kurulurken yapıyor; cihaz iptali, kullanıcı pasifleştirme veya yetki kaldırma sonrasında 10 dakikaya kadar (`id_doc_number` dahil) canlı veri akışı devam edebiliyor. |
| **`S-3`** | `src/main/services/auth-service.ts:389-410, 535-587, 757-798, 822-826, 1034-1085, 1100-1105` | Asenkron TOCTOU: `users` ve `recovery_codes` satırları ~100–300 ms süren `await verifySecretAsync(...)` öncesinde okunuyor; `recoverFinish` güncellemesinde `AND used_at IS NULL` koşulu olmadığı için eşzamanlı isteklerde aynı kurtarma kodu birden fazla kez kullanılabiliyor ve kilitleme sayacı atlanabiliyor. |
| **`S-4`** | `src/main/services/tourism/kbs-reader.ts:132-143`, `src/main/backup/archive.ts:144-204, 264-274` | `kbs-reader`, `table-reader.ts`'in aksine `wb.xlsx.load(bytes)` sırasında dosya/satır/sütun sınırı koymuyor. `archive.ts` `Unpacker` tamsayı `f.size >= 0` doğrulaması yapmıyor (kesirli boyutta sonsuz döngü), `createGunzip()` için `maxOutputLength` vermiyor ve GCM etiketi doğrulanmadan çözülen baytları diske/JSON'a yazıyor. |
| **`D-1`** | `src/main/server/replica-sync.ts:128-142`, `replica-routes.ts:183`, `src/main/replica/apply.ts:198-201`, `triggers.ts:20, 118-119`, `relay/reader.ts:128-151` | Geriye alınan sistem saati + 30 günlük `pruneChangeLog` değişim günlüğünde `seq` boşlukları oluşturur; `applyChanges` `{ status: 'applied', complete: false }` döndüğünde `replica-sync.ts` bunu yoksayıp imleci ilerletiyor ve sahte `'live'` durumuna geçerek eşitlemeyi kalıcı olarak aksatabiliyor. |
| **`D-2`** | `src/main/db/client.ts:92-115` | `openDatabase`, `openReplicaDatabase`'ten farklı olarak daha yeni şema sürümünden gelen (`pending < 0`) veritabanını uyarı veya hata vermeden açıyor. |
| **`D-3` / `E-6`** | `src/main/index.ts:314, 396, 424, 435, 444, 521-563, 573, 629-643, 825` | `app.on('will-quit', () => database?.close())` `start()` öncesinde kaydedildiği için FIFO sırasıyla SQLite'ı HTTP sunucusu, aktarıcı, kamera ve zamanlayıcılar durdurulmadan önce kapatıyor; async `host.stop()`/`camera.stop()` beklenmiyor; `external`/`taskScheduler`/`startAttachmentRetention` kapatılmıyor. |

### 5.2 Electron Kabuk ve Kamera Yan Süreci (7 Adet)

| Kod | Konum | Bulgular |
| :--- | :--- | :--- |
| **`C-2`** | `otel-kamera/tracker.py:27, 76-88, 182-199`, `otel-kamera/bytetrack_lite.py:85, 137-138` | Kişi takip ID'leri artarak `FACE_ID_BASE = 1000` sınırını geçtiğinde ortak takip sözlüklerinde kimlik çakışması oluyor; yabancı bir kişi doğrulanmış misafir kimliğini devralabiliyor veya alarm bastırılabiliyor. |
| **`C-3`** | `otel-kamera/security_service.py:400-406`, `otel-kamera/tracker.py:184-199` | `ZONE_POLYGON` içinde en az bir kişi varken (`len(valid) > 0`), bölge dışında tespit edilen yüzlere de `1000+` yüz-tabanlı ID atanıp alarm üretilebiliyor. |
| **`E-7`** | `src/main/index.ts:717-739, 820-824` | Pencere yokken Hafif Mod kapatıldığında veya Standalone moduna geçildiğinde `syncTray()` sistem tepsisi simgesini kaldırıyor ancak yeni pencere açmıyor ve uygulamayı kapatmıyor; kullanıcıya görünmeyen bir arka plan süreci kalıyor. |
| **`E-8`** | `src/main/index.ts:316, 411-416, 425-455` | İstemci modundan çıkışta başlangıçtaki eski `initial['app.mode'] !== 'client'` koşulu okunduğu için `services.external`, `taskScheduler` ve kamera çalışma zamanı program yeniden başlatılana kadar hiç başlamıyor. |
| **`E-12`** | `src/main/camera/sidecar.ts:328-377` | `restart()` `stop()` bekledikten sonra `generation` ve `wantRunning` kontrolü yapmadan `start()` çağırıyor (devre dışı bırakma veya kapanış sonrası yan süreç yeniden doğabiliyor); eşzamanlı `start()`/`stop()` çağrıları iç durumu bozabiliyor ve yetim süreç bırakabiliyor. |
| **`E-13`** | `src/main/services/camera-service.ts:450-463`, `src/main/camera/addon-install.ts:26, 102, 127-141, 155` | Windows'ta kamera eklentisi yükseltilirken çalışan yan süreç durdurulmuyor (`rename` `EPERM` hatası `catch` içinde yutuluyor); `pick()`/`start()` yarışabiliyor; `entry.fileName.endsWith('/')` ters eğik çizgili (`\`) zip dizinlerini tanımıyor. |
| **`E-16`** | `src/main/app/log-redact.ts:16-49`, `src/main/index.ts:153` | Kullanıcı adı/parola içeren kamera/HTTP URL'leri, 10 haneli bot belirteçleri, harf ön ekli 11 haneli kimlikler, ASCII dışı belge numaraları ve engellenen URL'lerdeki `?st=` akış anahtarları günlük maskelemesinden sızabiliyor. |

### 5.3 İş Mantığı ve Servisler (8 Adet)

| Kod | Konum | Bulgular |
| :--- | :--- | :--- |
| **`B-1`** | `src/main/services/rooms-service.ts:260-302`, `room-capacity.ts:82-86` | Kapasite değişikliğiyle aynı gün oda yeniden kaydedildiğinde önceki değişiklik iptal edilip geri alınıyor; aynı gün oda oluşturup pasifleştirme işlemi `activeBetween` ile çakışan `C1` (`active: true`) kaydı bırakabiliyor. |
| **`B-2`** | `src/main/services/laundry-service.ts:453-481` | `laundry.settle` çağrısı `assertMonthOpen` ve `laundry.reopen` yetki denetimini atlıyor; kapatılmış ayların üzerine gerekçe almadan yazabiliyor veya iptal edebiliyor. |
| **`B-3`** | `src/main/services/reservations-service.ts:963-973`, `reservation-view.ts:686-698`, `occupants-service.ts:353-367, 392-402` | Kara liste kontrolü `mergedIntoId` birleştirme zincirini takip etmiyor; `occupants.update` ise kara liste ve konaklama durumu kontrollerini hiç çalıştırmıyor. |
| **`B-4`** | `src/main/services/staff-service.ts:763-773, 1121-1124, 1222-1246`, `src/shared/domain/salary.ts:309-318` | Açık dönemde farklı para biriminde mevcut `staff_transactions` kaydı varken başka para biriminde maaş tanımlanması `salaryTable` ekranında yakalanmayan `TypeError` (HTTP 500) üretiyor. |
| **`B-5`** | `src/main/services/staff-service.ts:428-470` | `carriedLeave` hesaplaması `employedIn` kontrolü olmadan tüm takvim ayları üzerinden dönüyor; kısmi ilk ay ve işten çıkış-giriş arasındaki boş aylar için hayalet izin devri biriktiriyor. |
| **`B-6`** | `src/main/services/fees-service.ts:318-335` | `fees.settleDeposit(undoConvert)` açık bir `convertedPaymentId` bağlantısı olmadan sezgisel eşleştirme yapıyor; farklı bir misafir ödemesini yanlışlıkla iptal etme riski taşıyor. |
| **`B-7`** | `src/main/services/reservations-service.ts:1384, 1459` | `changeDates` ve `moveDates` işlevleri `assertSellable` kontrolünü atlayarak satılamaz oda tarihlerine izinsiz rezervasyon uzatmasına izin veriyor. |
| **`B-8`** | `src/main/services/reservations-service.ts:1510-1537` | `setNightPrices`, çıkış yapmış (`checked_out` / `done`) geçmiş konaklamaların gecelik fiyatlarını durum ve kapalı gün kontrolü olmadan değiştirebiliyor. |

### 5.4 Arayüz / Renderer UI (6 Adet)

| Kod | Konum | Bulgular |
| :--- | :--- | :--- |
| **`U-1`** | `calendar/payment-dialog.tsx`, `fees-panel.tsx`, `stay-dialogs.tsx`, `new-reservation-dialog.tsx`, `hourly-stay-dialog.tsx` | Onay düğmelerinde ve gönderim işleyicilerinde `isPending` koruması eksik; hızlı çift tıklama veya Enter tuşu mükerrer ödeme ve rezervasyon oluşturabiliyor. |
| **`U-2`** | `calendar/stay-dialogs.tsx:115-130` | `checkOut` mutasyonunun `onSuccess` bloğunda `booking.addLateCheckout` çağrısı `await` edilmiyor; folyo/kasa ekranı eski kalabiliyor ve `errors.dayClosed` hatası sessizce yutuluyor. |
| **`U-3`** | `components/money-input.tsx:180`, `ledger/payment-dialog.tsx:268` | Para birimi değiştirildiğinde ham tamsayı `amountMinor` korunuyor; alt basamak sayısı farklı birimler (`TRY` ↔ `KWD`/`JPY`) arasında tutar 10×–100× hatalı ölçekleniyor. |
| **`U-4`** | `calendar/group-panel.tsx:396-399`, `reservation-panel.tsx:74, 126, 179-191`, `panel-tabs.tsx:84-88` | `GroupPanel` içindeki "Ödeme al" zaten bir `openId` seçiliyse yanlış rezervasyonu açıyor; `Panel` bileşenine `key={view.reservation.id}` verilmediği için önceki rezervasyonun form/sekme durumu yeni açılana sızıyor. |
| **`U-5`** | `calendar/fees-panel.tsx:328, 332-333` | Ana para biriminde (`TRY`) kayıtlı hasar depozitosu önayarı yabancı para birimli (`EUR`) folyoya kur dönüşümü olmadan doğrudan yazılıyor. |
| **`U-6`** | `settings/fees-card.tsx:34, 53-58, 99, 113, 154, 171` | Geçersiz `MoneyInput` (`null`) değerinin `0`'a zorlanması doğrulama hatasını silip `0` kaydetmeye yol açıyor; `deferForPendingAmount` korunmuyor; `/^\d{1,3}$/` ifadesi `1000%` gibi geçerli üst değerleri reddediyor. |

---

## 6. Orta Öncelikli Hatalar (33 Adet)

### 6.1 Güvenlik ve Altyapı (9 Adet)
- **`S-5` (`ministry-export.ts:12-15`):** Dışa aktarılan Bakanlık CSV dosyasında formül enjeksiyonu (`=`, `+`, `-`, `@` kaçışı) temizliği yok.
- **`S-6` (`attachments-service.ts:120-126`):** `general` bölümü üzerinden ek dosyalar listelenirken `staff.salary` yetki kontrolü atlanabiliyor.
- **`S-7` (`users-service.ts:365-434`):** `roles.update`/`roles.create` yollarında kullanıcının kendi rolünün `remoteAccess` ve `tasksOwnOnly` bayraklarını yükseltmesine karşı engel eksik.
- **`D-4` (`backup-service.ts:922-931`):** Anahtar değişimi sırasında güvenlik yedeği başarıyla tamamlanmadan önce mevcut Bismuth anahtarının üzerine yazılıyor.
- **`D-5` (`backup-service.ts:256-266, 999`):** Checkpoint edilmemiş WAL varken `dbFile` üzerinde `readonly: true` okuma yapıldığı için `previousTerm = 0` dönebiliyor.
- **`D-6` (`backup-service.ts:665-670`, `archive.ts:81-108`):** Kademeli yedekleme sırasında eşzamanlı silinen ek dosya `ENOENT` fırlatarak yedeği bozabiliyor.
- **`D-7` (`attachments-service.ts:244`):** Eksik dosya veya istemci kopyası durumunda yakalanmayan `ENOENT` hatası HTTP `500` üretiyor.
- **`D-8` (`setup-service.ts:415-424`):** `doneCache = true` bayrağı `ensureYearGenerated` öncesinde işaretleniyor; kurulum yarım kaldığında sessiz `PERMISSION_DENIED` hataları doğabiliyor.
- **`D-9` (`data-import-service.ts:321-324, 1292-1334`):** >120 bin CSV satırında `Math.max(...rows)` çağrı yığını taşması (stack overflow) yapar; ayrıca geri alınan savepoint içinde `report.salaries++` sayacı artırılmış kalıyor.

### 6.2 Electron Kabuk ve Kamera Yan Süreci (7 Adet)
- **`C-4` (`otel-kamera/security_service.py:126-133, 300-364`, `web_app.py:87-101`):** Windows uyku engellemesi kapanan boot iş parçacığında çalışıyor ve analiz iş parçacığı 1 saat kadar bekleyebiliyor.
- **`C-5` (`otel-kamera/config.py:14-17`):** FFmpeg açılışında `protocol_whitelist` verilmiyor ve kullanımdan kaldırılmış `stimeout` seçeneği kullanılıyor.
- **`E-9` (`server/electron-wiring.ts:87-91, 310-314`, `index.ts:787-791`, `crash-wiring.ts:35-38`):** `app.exit(0)` çağrısı `before-quit` ve `will-quit` veritabanı kapatma kancalarını atlayarak çıkıyor.
- **`E-10` (`index.ts:76, 101-109, 158-161, 776-814`):** İstemci modunda `reopenWindow`, `setMainLocale` ve `powerMonitor` bağlantıları hiç kurulmuyor.
- **`C-14` (`services/camera-sync.ts:203-210, 259-283`):** `pushNow()` çağrısı arka plandaki `tick()` ile yarışıyor; K-52 yüz silme işleminden sonra eski liste geri yazılabiliyor.
- **`C-15` (`camera/secrets.ts:37-43`):** Parola içinde `@` karakteri barındıran kamera akış URL'leri ilk `@` işaretinde kesilerek parolayı bozuyor.
- **`E-17` (`notifications/index.ts:9-20`):** Penceresiz Hafif Mod'da işletim sistemi bildirimine tıklanınca pencere açılmıyor.

### 6.3 İş Mantığı ve Servisler (7 Adet)
- **`B-9` (`payments-service.ts:142-158, 283-333`):** `deposit` ve `payments.update` işlemleri iptal (`cancelled`) ve gelmedi (`no_show`) tavan sınırını atlıyor.
- **`B-10` (`room-blocks.ts:44-51`):** `openAutoBlock` fonksiyonu `slot = 'day'` gündüz konaklamalarını yoksayıyor.
- **`B-11` (`shared/domain/reports.ts:153-158`, `guests-service.ts:1071, 1140`):** `guestHistorySummary` içindeki `lastStayDate`, en yeni konaklama gündüz kullanım (`day_use`) olduğunda tutarsız tarih döndürüyor.
- **`B-12` (`staff-service.ts:924-962`, `salary.ts:371-373, 411-415`):** `addLeaveDays` çalışanlık dönem kontrolünü (`assertEmployedOn`) atlıyor; `rest_day` ve `holiday_worked` günleri ay içindeki çalışma aralığını hesaba katmadan tüm ayı sayıyor.
- **`B-13` (`fees-service.ts:535-545, 593-598`):** `nightReport` geçmiş tarihler için doluluk, toplam ve depozito sayılarını yanlış hesaplıyor.
- **`B-14` (`staff-service.ts:682-703`, `salary.ts:262-282`):** `updateEmployee` örtüşen çalışma dönemlerine izin veriyor ve bu durumda `employedDays > monthDays` ortaya çıkabiliyor.
- **`B-15` (`currency-service.ts:174-185`, `fx.ts:127`):** `convertViaBase` zayıf hedef para birimlerine dönüşümde hassasiyet kaybı veya hata üretebiliyor.

### 6.4 Arayüz / Renderer UI (10 Adet)
- **`U-7` (`cash-drawer-panel.tsx:204,208`, `handover-history.tsx:50,145`, `panel-tabs.tsx:302`, `month-end-page.tsx:232`, `camera/alert-groups.ts:13`, `use-format.ts`, `fees-panel.tsx:216`):** UTC `.slice(0,10)` kesimi ve otel saat dilimi (`Europe/Istanbul`) olmadan yerel `f.time` kullanımı 00:00–02:59 TR saatlerinde tarihleri 1 gün kaydırabiliyor; `fees-panel.tsx` işletim sistemi yerel saatini kullanıyor.
- **`U-8` (`calendar-page.tsx:405-411, 469`):** Takvim bugünden başka bir aya kaydırıldığında "Bugün X/Y oda dolu" göstergesi `0/N` değerine düşüyor.
- **`U-9` (`use-global-shortcuts.ts:13-25`):** Sağ tık bağlam menüsü (`ContextMenu`) açıkken genel klavye kısayolları hâlâ tetikleniyor.
- **`U-10` (`date-input.tsx:52-64, 88, 100, 138-142`):** Ay değişimi veya devre dışı ok düğmeleri `Tab` odak sırasını hapsediyor.
- **`U-11` (`guest-combobox.tsx:77-96`):** Modal diyalog içinde portal edilen `Popover` listesinde tekerlek/kaydırma olayı engelleniyor.
- **`U-12` (`calendar/selection-bar.tsx:113-129`):** Toplu işlemlerde 401 oturum yenileme işleyicisini atlıyor ve başarısız grup kontrollerini hatalı sayıyor.
- **`U-13` (`group-panel.tsx:584-627`):** `GroupPayDialog` kapalı gün uyarısını (`dayClosed` / `ClosedDayReason`) göstermiyor.
- **`U-14` (`transport/connection.ts:80-87`):** `useWritesBlocked` kancası bağlı değil; `offline`, `outdated` ve `readonly` durumlarında yazma düğmeleri etkin kalıyor.
- **`U-15` (`record-photos.tsx:30, 221-231`):** PDF ekleri base64 olarak belleğe yükleniyor ancak arayüzden açılamıyor.
- **`U-16` (`tape-chart.tsx:273-281`):** Takvim şeridinin son sütununa denk gelen `dayUse` çubuğu `0` piksel genişlikle çiziliyor (görünmüyor).

---

## 7. Düşük Öncelikli Hatalar (16 Adet)

1. **`reports/queries.ts:204`:** `inArray(expenses.id, [...withItems])` çağrısında `inChunks` kullanılmadığı için >999 ürünlü tedarik alımında SQLite parametre sınırı aşılabiliyor.
2. **`D-10` (`external-service.ts:401-410`):** Türkiye dışındaki oteller için de sabit TR resmî tatil beslemeleri sorgulanıyor.
3. **`D-11` (`replica-routes.ts:175-195`):** `snapshotNeeded` gönderildikten sonra gereksiz `setInterval` açık kalabiliyor.
4. **`E-11` (`main-window.ts:45`):** `ready-to-show` olayından önce `maximize()` çağrılıyor ve `1366×820` başlangıç boyutu küçük ekranlara göre kırpılmıyor.
5. **`E-18` (`telegram/index.ts:94`, `http.ts:95,102`):** Başarısız/erken çıkış yollarında `fetch` yanıt gövdesi (`res.body`) tüketilmeden veya iptal edilmeden bırakılıyor.
6. **`payments-service.ts:504-506`:** `sellExtra`, `assertExpenseDateNear` ve iptal rezervasyon korumasını atlıyor.
7. **`guests-service.ts:1350`:** `companies.detail` içindeki `stayCount` konaklama dışı durumları da sayıyor.
8. **`shared/domain/reports.ts:7-10`:** `basisPoints` negatif değerlerde asimetrik yuvarlama yapıyor.
9. **`reports/queries.ts:229-233`, `ledger-service.ts:1182-1186`:** Ürün satırı yuvarlaması nedeniyle `-1` kuruş grubu oluşabiliyor.
10. **`shared/money.ts:253`:** `parseAmountText` `"0.500"` metnini `500` kuruş olarak yorumlayabiliyor.
11. **`panel-tabs.tsx:600, 645-653`:** `AddRoomForm` içinde Enter tuşuyla kaydetme engellenmiş durumda.
12. **`night-price-table.tsx:57-61`:** Üst bileşen verisi değiştiğinde eski taslak fiyat durumu sıfırlanmıyor.
13. **`fees-panel.tsx:356`:** `TakeDialog` içinde sıfır değer sessizce gönderilebiliyor.
14. **`handover-history.tsx:121-140`, `group-panel.tsx:305`, `reservation-panel.tsx:462, 500`:** Diyalog yeniden açıldığında önceki form girişi temizlenmiyor.
15. **`attachment-picker.tsx:93`:** Dosya seçildikten sonra `e.target.value = ''` sıfırlanmadığı için aynı dosya arka arkaya seçilemiyor.
16. **`lib/session/idle.ts:18-22`:** `auth.lock` bir kez hata döndürürse boşta kilitleme zamanlayıcısı kalıcı olarak duruyor.

---

## 8. Performans Darboğazları (13 Adet)

| Alan | Dosya / Konum | Darboğazın Nedeni |
| :--- | :--- | :--- |
| **Satılabilir Gün Döngüsü** | `src/shared/domain/reports-period.ts:119-161` | `forEachSellableDay` her oda × gün için aktiflik, kapasite geçmişi ve blokaj dizilerini doğrusal tarıyor (10 yılda ~73 bin adım). |
| **Misafir Listesi** | `src/main/services/guests-service.ts:539-691` | `guests.list` sorgusu $O(G \times B) + O(T^2)$ birleştirme maliyeti ve sayfalamasız geçmiş yüklemesi içeriyor. |
| **Takvim Izgarası** | `src/main/services/calendar/grid.ts:195-256` | Tarih aralığına göre konaklama ve blokajları hücrelere yayarken $O(N^2)$ döngü maliyeti üretiyor. |
| **En Büyük Giderler** | `src/main/services/reports/queries.ts` (`expensesForTop`) | Gider kalemlerini gider başına $O(E \times L)$ karmaşıklıkla tarıyor. |
| **Bakım Aralığı Hesabı** | `roomsDueEveryNStays` | Oda × konaklama ($O(R \times C)$) taraması yapıyor. |
| **Turizm İstatistikleri** | `tourism-stats-service.ts` (`capacityOf`) | Gün/oda kapasitesi için N+1 ayrı SQL sorgusu atıyor. |
| **Kur Dönüşümleri** | `currency-service.ts` (`ratesFor`) | Kur geçmişi okumasında N+1 SQL sorgusu çalıştırıyor. |
| **Yedekleme `VACUUM`** | `src/main/services/backup-service.ts:654` | Büyük veritabanında `VACUUM` işlemini ana iş parçacığında eşzamanlı çalıştırıyor. |
| **Kopya Paketleme (Relay)** | `relay/format.ts` | Senkron `gzip` + JSON serileştirme ana olay döngüsünde CPU/bellek tepe noktası yaratıyor. |
| **Kopya Akışı Okuma** | `src/main/server/replica-sync.ts:86` | Akışsız `res.text()` kullanımı büyük eşitleme yanıtlarında yüksek bellek tüketimine yol açıyor. |
| **Takvim Satır Çizimi** | `calendar-grid.tsx:830` (`GridRow`) | `selected` `Set` nesnesi her seçimde yeni referans aldığı için `memo` optimizasyonu boşa düşüyor. |
| **Belge Önizleme** | `record-photos.tsx:45` | Oluşturulan `ImageBitmap` nesneleri kapatılmadan birikiyor. |
| **Önbellek Yenileme** | `booking-api.ts:26`, `ledger-api.ts:27` | Ekranlar arası eksik React Query geçersizleştirmeleri (ya gereksiz tekrar sorgu ya da bayat veri) bulunuyor. |

---

## 9. Önerilen 3 Dalgalı Düzeltme Sırası

1. **Dalga 1 — Güvenlik, Çökme ve Veri Bütünlüğü (Önce yapılmalı):**
   - `S-1`, `S-2`, `S-3`, `S-4`, `C-1`, `C-2`, `C-3`, `D-1`, `D-2`, `D-3`/`E-6`, `E-7`, `E-8`, `E-12`, `E-13`, `E-16`.
2. **Dalga 2 — Muhasebe, Personel, Oda/Rezervasyon Kuralları:**
   - `B-1`..`B-15`, `S-5`..`S-7`, `D-4`..`D-9`.
3. **Dalga 3 — Arayüz Güvenilirliği, Hız ve Cila:**
   - `U-1`..`U-16`, düşük öncelikli maddeler ve Bölüm 8'deki performans iyileştirmeleri (özellikle `forEachSellableDay` pencerelemesi, `guests.list` / `capacityOf` / `ratesFor` toplu SQL sorguları ve `calendar/grid.ts` indekslemesi).
