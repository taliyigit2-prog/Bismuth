# 06 — Kamera sistemi (otel-kamera) entegrasyon araştırması

> Hazırlayan: Fable (2026-11-12). Kaynaklar: `otel-kamera/` kodunun satır satır okunması (yardımcı ajan notu), web
> araştırması (lisans ve KVKK; bakıldığı tarih 2026-11-12), Bismuth mimarisi (`01-mimari-ve-kod-haritasi.md`).
> **Bu belge hukuki tavsiye değildir.** Hukuk ve lisans maddeleri bir KVKK avukatına ve lisans sahiplerine doğrulatılmalıdır.
> Ölçülmeyen CPU/RAM/boyut rakamları "tahmin" diye işaretlidir.

## 0. Net öneri (özet)

1. **Yöntem: A' — Python yan süreç (sidecar), ama ONNX-only ve Bismuth'un içinde bir sekme.** Electron ana süreci,
   paket içindeki gömülü Python servisini başlatır/durdurur; renderer'daki **Kamera sekmesi** canlı yayını ve alarmları
   gösterir. İletişim yalnız `127.0.0.1` ve tek kullanımlık oturum belirteciyle. Bu sahibin "program içinde sekme"
   tercihini karşılar; Python bağımlılığı kullanıcıya görünmez.
2. **Modeller değişmeli (lisans engeli):** Ultralytics YOLO11 (AGPL-3.0) ve InsightFace `buffalo_s` ağırlıkları
   (yalnız ticari olmayan araştırma) **satılacak kapalı kaynak ürüne gömülemez.** Yerine YuNet (MIT) + SFace (Apache-2.0)
   ya da AuraFace (Apache-2.0) + gerekiyorsa YOLOX-Nano (Apache-2.0) + ByteTrack (MIT), hepsi `onnxruntime` ile.
   Torch ve Ultralytics paketi kalkınca Python yan sürecin boyutu tahminen 1,5–3 GB'tan 150–250 MB'a iner.
3. **Telegram kaldırılır ya da Bismuth bildirimine dönüşür:** fotoğraflı Telegram mesajı KVKK yurt dışı aktarımı
   riski taşır ve G-07/ağ kuralıyla çelişir. Alarm Bismuth bildirim merkezine düşer (`notifications` tablosu); sahibe
   telefon bildirimi mevcut uzaktan erişimle (NetBird + telefon arayüzü) gider. İsteğe bağlı, **fotoğrafsız** metin
   bildirimi `src/main/network/` altında ayarla açılır.
4. **Veri tek yerden (G-60):** kamera panelindeki elle misafir girişi kalkar; yüz kaydı Bismuth'ta "Kişiler" sekmesinden
   "Kameradan yüz al" düğmesiyle yapılır; çıkışta otomatik pasifleşir; yüz vektörü ve kırpma şifreli (`safeStorage`
   anahtarı ile AES-GCM) `userData/camera/` altında, Drive yedeğine **girmez**.
5. **Hukuk önce:** açık rıza + alternatif yöntem + aydınlatma tabelası şart; çalışanlar yüz tanımadan dışlanmalı;
   saklama süresi "konaklama boyunca", kayıtsız kişi görüntüsü en çok 72 saat (ayar). Sahip bir KVKK avukatına
   danışmadan bu modül **ürünleştirilmemeli**; geliştirme sürebilir.
6. **Aşamalı plan (§8):** 0) lisans/hukuk kararı → 1) kamera sekmesi (webview değil, kendi React arayüzü + MJPEG)
   → 2) yan süreç yaşam döngüsü ve belirteç → 3) misafir eşlemesi ve alarm bildirimi → 4) model değişimi → 5) KVKK
   paketi (rıza, silme, rapor) → 6) paketleme (Windows/macOS) ve gerçek otel denemesi.

## 1. Mevcut sistem (otel-kamera/) nedir?

Tek Python süreci: `web_app.py` (FastAPI + uvicorn, `127.0.0.1:8000`), `security_service.py` (kamera okuyucu
iş parçacığı + analiz döngüsü), `face_engine.py` (InsightFace `buffalo_s`, CPU), `tracker.py` (yüz↔kişi eşleme,
alarm sayaçları), `database.py` (SQLite `hotel_guests.db`: `guests`, `alert_logs`), `notifier.py` (Telegram
`sendPhoto`), `config.py` (`.env`), `static/index.html` (1.617 satırlık panel). Başlatma: Windows `.bat` bekçi döngüsü,
Mac `tmux`.

Akış (`security_service.py:548-640`): her 3. kare → CLAHE → YOLO (kişi) → izleme → bölge → **kişi kutusu varsa** yüz
tespiti → yüz↔kişi eşleme → kayıtlı misafir eşleşmesi (kosinüs ≥ 0,36) → kayıtsızsa 3 kare onay + 60 sn soğuma →
alarm (yerel JPEG + Telegram).

"KBS kayıtlı misafir" **KBS'den gelmez**; resepsiyoncu panelde ad + oda + gün sayısı girer, yüz canlı kameradan ya da
fotoğraftan alınır (`web_app.py:186, :221, :260`). Yüz vektörü (512 float32) `guests.embedding` BLOB olarak **şifresiz**,
vesikalık kırpma `guest_photos/` altında **düz JPEG** (`web_app.py:117-121`). Çıkışta fotoğraf silinir, vektör satırı
30 gün sonra silinir (`database.py:123-164, :327-338`).

Belge ile kod arasındaki farklar: `AI_GELISTIRICI_NOTLARI.md` `guest_face_profiles` tablosu, watchdog iş parçacığı ve
`.env.example` dosyasından söz eder; **üçü de kodda yok.** README "ByteTrack" der; kodda `model.track()` hiç
çağrılmaz, merkez-yakınlığı izleyici çalışır (`security_service.py:557`, `tracker.py:179-218`).

## 2. Seçenekler

| | A — Python yan süreç | A' — Python yan süreç, ONNX-only (öneri) | B — Node/ONNX (onnxruntime-node) | C — Ayrı uygulama, gevşek bağ |
|---|---|---|---|---|
| Sahibin "sekme" tercihi | ✅ | ✅ | ✅ | ❌ (ayrı pencere/site) |
| Kurulum (Win/mac) | Orta: gömülü Python + 1,5–3 GB bağımlılık (torch); PyInstaller'da `insightface` derleme, `onnxruntime` DLL toplama sorunları | Kolay-orta: gömülü Python 3.12 + onnxruntime + opencv + fastapi (tahmin 150–250 MB); tek klasör | Kolay: npm paketi; ama `onnxruntime-node` yerel ikili, Electron ABI eşleşmesi, arm64/x64 ayrı | Kolay değil: iki kurulum, iki güncelleme |
| Paket boyutu | +1,5–3 GB (tahmin) | +150–250 MB (tahmin) | +60–120 MB | Bismuth değişmez |
| CPU/RAM (zayıf otel PC) | Yüksek (torch RSS 1,5–2,5 GB tahmin) | Orta (onnxruntime RSS 300–600 MB tahmin) | Orta; ana süreçte çalışırsa UI donar → worker/utility process şart | Aynı makinede iki program |
| Çökme yalıtımı | ✅ ayrı süreç; Electron yeniden başlatır | ✅ | ⚠ utility process ile mümkün; ana süreçte çökme Bismuth'u götürür | ✅ |
| Güncelleme | Bismuth sürümüyle birlikte | aynı | aynı | iki ayrı sürüm, uyumsuzluk riski |
| Test edilebilirlik | Python testleri + e2e (Playwright kamerayı taklit eder) | aynı | vitest ile birim test kolay | zayıf |
| Bakım yükü | İki dil, iki bağımlılık ağacı | İki dil ama küçük yüzey | Tek dil; ama görüntü işleme (RTSP çözme!) Node'da zor: ffmpeg ikilisi gerekir | iki ürün |
| RTSP çözme | OpenCV/FFmpeg hazır | hazır | `ffmpeg` alt süreci ya da `node-rtsp-stream`; ek ikili ve lisans (LGPL) | hazır |
| Çevrimdışı (G-01/02) | Modeller paket içinde olmalı (bugün ilk açılışta GitHub'dan iner: `face_engine.py:12`, `yolo11n.pt` yok) | aynı kural, kolay | aynı | aynı |
| Lisans | YOLO11 AGPL ❌, InsightFace ağırlıkları ticari değil ❌ | Açık lisanslı modeller ✅ | aynı modeller ✅ | aynı sorun |
| Geliştirme eforu | S (mevcut kod) + paketleme L | M (model değişimi) + paketleme M | L (her şey yeniden) | S |

**Neden A' ve B değil?** B tek dil avantajı sunar ama RTSP çözme ve kare işleme için yine FFmpeg ikilisi gerekir, ana
süreçte çalıştırılamaz (UI donar) ve mevcut Python kodunun bilgi birikimi kaybolur. A' mevcut kodu %60 korur, lisans
sorununu çözer, boyutu düşürür. İleride B'ye geçiş kapısı: Bismuth↔kamera sözleşmesi (§4) taşımadan bağımsız
tanımlanır; yan süreç yerine worker konursa renderer değişmez.

**Neden C değil?** Sahibin açık tercihi sekme; iki ayrı program iki kurulum ve "tek giriş" ihlali demek.

## 3. Mimari (A')

```
Electron main
 ├─ src/main/camera/            (YENİ izinli klasör; bkz. §5)
 │   ├─ sidecar.ts              Python yan sürecini başlat/durdur/izle (child_process.spawn, yeniden başlatma, sağlık)
 │   ├─ bridge.ts               127.0.0.1:<rastgele port> + X-Bismuth-Token; JSON uçları; olay akışı (SSE)
 │   ├─ camera-service.ts       yetki (ctx) + audit + Bismuth tablolarına yazma (camera_events, guest_faces)
 │   └─ crypto.ts               safeStorage anahtarı ile AES-GCM (yüz vektörü/kırpma)
 ├─ src/main/api/handlers/camera.ts, src/shared/contract/procedures/camera.ts
 └─ renderer: src/renderer/features/camera/ (Kamera sekmesi: canlı yayın <img src=mjpeg>, alarm listesi, kişi kartı)
Python sidecar (resources/camera/, gömülü Python 3.12 + venv yok, site-packages paket içinde)
 ├─ web_app.py (FastAPI)  → yalnız 127.0.0.1, belirteç zorunlu, CORS kapalı, Origin denetimi
 ├─ security_service.py  → onnxruntime: YuNet (tespit) + SFace/AuraFace (tanıma) [+ YOLOX-Nano kişi, isteğe bağlı]
 ├─ tracker.py           → ByteTrack (MIT) gerçek uygulama ya da IoU izleyici
 └─ database.py          → yalnız geçici önbellek; kalıcı veri Bismuth DB'de (tek giriş)
```

- **Canlı yayın renderer'da:** MJPEG `<img>` ile; CSP'ye `img-src http://127.0.0.1:<port>` eklenir (yalnız bu kaynak,
  yalnız kamera etkinse). `webview` ve `iframe` kullanılmaz (güvenlik, G-23).
- **Belirteç:** Electron başlangıçta 32 bayt rastgele üretir, yan sürece ortam değişkeniyle verir; renderer'a yalnız
  yayın adresi + kısa ömürlü imzalı sorgu parametresi gider.
- **Yaşam döngüsü:** Bismuth açılınca `camera.enabled` ayarı açıksa yan süreç başlar; 5 çökme/10 dk → durur ve bildirim.
  Bismuth kapanınca `SIGTERM` + 5 sn sonra `kill`. İstemci modunda (telefon/Mac) yan süreç **çalışmaz**; görüntü ana
  bilgisayardan HTTP ile (mevcut sunucu modu) sunulur ya da yalnız alarm listesi gösterilir (karar S-108).

## 4. Veri entegrasyonu (tek giriş, G-60)

| Olay | Kaynak | Hedef | Kural |
|---|---|---|---|
| Check-in (`reservations.checkIn`) | Bismuth | kamera | Oda + rezervasyon kişileri kameraya "aktif izlenen" listesi olarak itilir; yüz kaydı **ayrı adım** (rıza) |
| "Kameradan yüz al" (Kişiler sekmesi, `stay_occupants` satırı) | Bismuth UI → kamera `POST /faces/capture` | Bismuth `guest_faces` (şifreli vektör, model sürümü, kırpma yolu+sha256, rıza zamanı) | Yetki `in_house.edit` + yeni `camera.enroll`; audit |
| Check-out / oda değişikliği | Bismuth | kamera | Aktif liste güncellenir; vektör Bismuth'ta pasif, **saklama süresi** sonunda silinir (ayar `camera.faceRetentionDays`, varsayılan 0 = çıkışta sil) |
| Tanındı | kamera → SSE | Bismuth `camera_events` (kind=recognized; yalnız ilk görülme/saat başı) | Bildirim yok; kişi kartında "son görülme" |
| Kayıtsız giriş (alarm) | kamera → SSE | `camera_events` (kind=unregistered, kırpma şifreli) + `notifications` | Bildirim merkezi + telefon; "Misafir olarak kaydet" → mevcut kişi ekleme akışı |
| Kamera koptu / kapandı / kapatıldı | kamera | `notifications` | Bugün ekranında rozet |

- Yüz vektörü **yalnız** Bismuth DB'de şifreli saklanır; yan süreç başlangıçta aktif listeyi alır ve bellekte tutar
  (disk önbelleği yok). Böylece "KBS/kimlik verisi depoya girmez" kancası ve K-25 ek kuralı korunur; Drive yedeğine
  `guest_faces` **dahil edilmez** (dışa aktarma kataloğundan çıkarılır; `data-transfer/export-catalog.ts`).
- Oda numarası eşlemesi: `rooms.number` → kamera etiketi; bölge (ZONE_POLYGON) oda değil kamera konumudur; birden çok
  kamera için `cameras` ayar listesi (`camera.sources[]`, RTSP adresi `safeStorage` ile şifreli).
- Panel yazıları (`cv2.putText`) Türkçe/Kiril karakterleri bozuyor (`security_service.py:360, :395-399`); etiket
  çizimi kaldırılıp renderer'da üstbilgi olarak gösterilir.

## 5. Proje kurallarıyla çatışmalar ve karar taslakları

| Çatışma | Bugün | Öneri (K-xx taslağı) |
|---|---|---|
| Ağ kodu yalnız dört klasörde | RTSP (`cv2.VideoCapture`) ve `127.0.0.1` HTTP yeni yüzey | **K-49:** `src/main/camera/` beşinci izinli klasör; yalnız `127.0.0.1` ve RTSP (yerel ağ) hedefleri; `no-network-guard` kancası bu klasörde yalnız `127.0.0.1`/`rtsp://` desenlerine izin verir, `fetch` dış adres yasak |
| Telegram = dış servis (G-07, çevrimdışı ilke) | `api.telegram.org`'a fotoğraf | **K-50 (kesin, sahip S-109):** Telegram **kalır**, G-07/yasak 14'e tek ayarlı istisna: alarm her zaman Bismuth bildirim merkezine; `camera.telegram.enabled` açıksa Bismuth `src/main/network/telegram/` üzerinden Telegram'a da gönderir (fotoğraf eki `camera.telegram.photo`, varsayılan açık — mevcut davranış); 5 sn zaman aşımı, sessiz başarısızlık, kuyruk yok, `network.enabled=false` ile kapanır; Python yan süreç dış servise bağlanmaz |
| KBS/kimlik verisi depoya girmez | Yüz = biyometrik, kimlikten hassas | **K-51:** yüz vektörü/kırpma `userData/camera/` ve `guest_faces` tablosunda AES-GCM şifreli (anahtar `safeStorage`); yedek/dışa aktarma dışı; kanca `camera-data-guard` (mevcut) `.npy/.onnx-embedding/guest_photos` desenlerini engeller; test verisi sentetik |
| Veri silinmez (yasak 11) | Kamera 30 günde siler | **K-52:** biyometrik veri bu kuralın **istisnasıdır** (KVKK ölçülülük): `guest_faces` çıkışta/sürede fiziksel silinir, `audit_log`'a "face.deleted" yazılır; `camera_events` kırpmaları `camera.alertRetentionDays` (varsayılan 3) sonra silinir, olay satırı kalır |
| Tek giriş (G-60) | Kamera panelinde elle ad/oda | **K-53:** kamera tarafında misafir girişi yok; tek kaynak Bismuth |
| Otele özel kural = ayar | Eşikler `.env` | Tüm eşikler Bismuth ayarları (`camera.*`), kamera sürecine başlangıçta JSON ile iletilir |
| Yetki servis katmanında | Panelde kimlik doğrulama yok | Tüm kamera işlemleri Bismuth yordamları üzerinden `ctx` ile; yeni yetki alanı `camera` (view/edit/enroll) |
| Fontlar paket içi | `static/index.html:7-9` Google Fonts | Panel kaldırılır; renderer kendi fontunu kullanır |
| Bağımlılıklar sabit | `requirements.txt` `>=` | `==` ile sabitlenir, `docs/plan/bagimliliklar.md`'ye kamera bölümü |

## 6. Hukuk ve lisans (doğrulama gerekli)

### 6.1 KVKK (özet; kaynaklar ve tarihler `ekler/kamera-kaynaklar.md`'de)

- Yüz verisi **biyometrik = özel nitelikli kişisel veri** (6698 m.6). 7499 sayılı Kanun (RG 12.03.2024, yürürlük 01.06.2024; **doğrulandı**, Resmî Gazete metni) m.6/3'ü yedi şarta
  çıkardı: açık rıza, kanunda öngörülme, hayat/beden bütünlüğü, alenileştirme, hak tesisi, sağlık, istihdam/İSG, vakıf-dernek.
  "Sözleşmenin ifası" listede **yok**; "misafir tanıma" bu şartlardan hiçbirine açıkça girmiyor → fiilen **açık rıza** gerekir;
  rıza serbest olmalı, yani **kamerasız alternatif** sunulmalı (Kurul "Biyometrik Verilerin İşlenmesinde Dikkat Edilmesi
  Gereken Hususlara İlişkin Rehber", Eylül 2021 — tarih ikincil kaynaktan; PDF 10 MB üstü olduğu için bu oturumda okunamadı).
- Kurul 2026/921 ilke kararı (29.04.2026; kvkk.gov.tr duyurusu, **doğrulandı**): **mesai takibinde yüz tanıma, açık rıza olsa bile ölçüsüz.** Kamera çalışanları da
  görüyorsa yüz tanıma çalışanlara uygulanmamalı (çalışan yüzleri "tanınmayan ama alarm üretmeyen" listede).
- Aydınlatma: kamera olan her yerde tabela + metin; VERBİS: 50 çalışan / 100 milyon TL altı muaf (2025/1572; ana
  faaliyet biyometri değilse), yine de aydınlatma, güvenlik ve imha politikası zorunlu.
- **Yurt dışı aktarım:** Telegram sunucularına fotoğraf göndermek aktarım sayılma riski taşır (WhatsApp kararı
  2021/891 emsal); yeterlilik kararı yok, standart sözleşme Telegram ile imzalanamaz → **fotoğraf gönderme kaldırılmalı.**
- Saklama: amaçla sınırlı; öneri vektör konaklama boyunca, kayıtsız kişi görüntüsü ≤ 72 saat, periyodik imha kaydı.
- 1774 sayılı Kimlik Bildirme Kanunu yüz tanımayı kapsamaz; Kurul Aralık 2025 kararı kimlik fotokopisi saklamayı
  aykırı buldu → yüz fotoğrafı + kimlik eşleştirmesi aynı gerekçeyle sorgulanabilir.

**Sahibin hukuki değerlendirmesi (S-111, 2026-11-13, K-58):** Sahip avukatıyla görüştü; "Bu otelde kamera ile kayıt
alınmaktadır" tabelasının yeterli olduğunu, yazılı rıza gerekmediğini bildirdi. Program buna göre rıza akışı yapmaz;
aydınlatma metni şablonu sunar; şifreleme ve saklama süreleri (K-51, K-52) aynen uygulanır. Fable'ın notu (yukarıdaki
Kurul rehberi ve 7499 analizi: yüz tanıma için fiilen açık rıza beklentisi) **sahibin kararından farklıdır** ve burada
kayıt için kalır; sorumluluk sahibin avukat görüşündedir. Telegram fotoğraf eki de (K-50) aynı değerlendirmeye bağlıdır.

### 6.2 Lisanslar

| Bileşen | Lisans | Kapalı kaynak ticari ürüne gömme | Kaynak (2026-11-12) |
|---|---|---|---|
| Ultralytics YOLO11 (kod + ağırlık) | AGPL-3.0 | ❌ Enterprise lisans olmadan olmaz: resmî sayfa "ticari ürün, kapalı kaynak yazılım, gömülü kamera/cihaz" için Enterprise lisans şart diyor; ayrıca `settings.sync=True` varsayılanıyla anonim analitik gönderir (G-07 ihlali) | ultralytics.com/license, docs.ultralytics.com/usage/settings (doğrulandı) |
| InsightFace kodu | MIT | ✅ | github deepinsight/insightface |
| InsightFace `buffalo_s/l`, `antelopev2` ağırlıkları | yalnız ticari olmayan araştırma | ❌ (ticari lisans e-posta ile) | README "non-commercial research" |
| ByteTrack | MIT | ✅ | github ifzhang/ByteTrack LICENSE (doğrulandı) |
| onnxruntime / OpenCV / FastAPI | MIT / Apache-2.0 / MIT | ✅ (`opencv-python` tekerlekleri FFmpeg'i **LGPL 2.1** ile taşır; dinamik bağ + bildirim dosyası yeterli) | **doğrulandı** (LICENSE dosyaları: microsoft/onnxruntime, opencv/opencv 4.x, fastapi/fastapi; opencv-python README "Licensing"; ffmpeg.org/legal) |
| **YuNet** (yüz tespiti) | MIT (Shiqi Yu, 2020) | ✅ | opencv_zoo `models/face_detection_yunet/LICENSE` (doğrulandı) |
| **SFace** (tanıma) | Apache-2.0 (eğitim verisi lisansı belirsiz) | ✅ (veri riski notu) | opencv_zoo `models/face_recognition_sface/LICENSE` (doğrulandı) |
| **AuraFace** (tanıma) | Apache-2.0, ticari veriyle eğitilmiş | ✅ (ağır: ResNet100) | huggingface fal/AuraFace-v1 |
| YOLOX-Nano/Tiny (kişi) | Apache-2.0 | ✅ | github Megvii |
| YOLO-NAS | ticari yasak | ❌ | super-gradients |
| MediaPipe | Apache-2.0 | yalnız tespit, tanıma yok | — |

**Önerilen kombinasyon:** YuNet + SFace (hız) ya da YuNet + AuraFace (doğruluk) + ByteTrack; kişi tespiti şart değilse
YOLOX hiç eklenmez (CPU ve lisans yükü düşer). Mevcut eşikler (0,36) ArcFace için gevşek; yeni modelde sahada
FAR/FRR ölçümü yapılıp tek ayarlı eşik + "emin değil" bandı kullanılmalı.

#### 6.2.1 Alternatif model geçiş planı (YuNet + SFace) — yalnız belge, uygulanmadı (P20d, K-57)

**Ne zaman uygulanır:** programı başka bir otele vermek/satmak gündeme gelirse, InsightFace'ten yazılı izin çıkmazsa ya da
Ultralytics Enterprise lisansı alınmayacaksa. Kendi otelinde kullanım sürdükçe K-57 gereği mevcut modeller kalır.

**Kod yapısı buna hazırdır (P20d):** model yükleme tek yerde (`otel-kamera/model_loader.py`), izleme model bağımsız
(`bytetrack_lite.py`), kişi kutusu yokken yüz arama yolu var (`IDLE_FACE_SCAN_EVERY`), eşikler ayarda, çizim yok. Değişecek
yerler:

| Adım | Değişiklik | Dokunulan dosya | Not |
|---|---|---|---|
| 1 | Yeni model dosyaları `resources/camera/models/` içine: `face_detection_yunet_2023mar.onnx` (MIT), `face_recognition_sface_2021dec.onnx` (Apache-2.0; eğitim verisi lisansı belirsiz) — opencv_zoo | `resources/camera/models/README.md` | dosya adları ve sürüm paketleme sırasında doğrulanır; sha256 `SHA256SUMS`'a |
| 2 | `load_insightface` yerine `load_face_models`: OpenCV `cv2.FaceDetectorYN` ve `cv2.FaceRecognizerSF` (`opencv-python-headless` içinde, ek paket yok) | `model_loader.py`, `face_engine.py` | `FaceEngine.app.get()` yüzeyi (bbox, det_score, embedding) korunur → servis ve izleyici değişmez |
| 3 | Kişi tespiti: iki yol — (a) YOLOX-Nano/Tiny (Apache-2.0) + onnxruntime, (b) kişi tespiti hiç yok, yalnız yüz izleme (`IDLE_FACE_SCAN_EVERY=1` gibi; izleyici yüz izini zaten tutar) | `security_service.build_person_detector` | (b) CPU ve lisans yükünü en çok azaltan yoldur; kişi kutusuyla bölge süzmesi yerine yüz merkezi bölgesi (`face_in_zone`) kullanılır |
| 4 | `ultralytics`, `insightface`, `torch*` bağımlılıkları `requirements.txt`'ten çıkar; `onnxruntime` kalır | `requirements.txt`, `THIRD_PARTY_NOTICES` (`scripts/notices.mjs`), `docs/plan/bagimliliklar.md` | paket ~1–1,5 GB → ~300 MB tahmini (ölçülmedi); AGPL ve "ticari olmayan" uyarıları kalkar |
| 5 | Yüz vektörü boyutu değişir (SFace 128 boyut, ArcFace 512): kayıtlı `guest_faces` vektörleri geçersiz olur; `guest_faces.model` sütunu farklı modeli ayırt eder → geçişte aktif misafirler yeniden "Kameradan yüz al" ile kaydedilir | `src/main/camera` (P20c servisi) | karışık boyut karşılaştırması zaten reddedilir (`shape` denetimi); eski vektörler çıkışta/saklama süresinde silinir |
| 6 | Eşikler yeniden ayarlanır: SFace için OpenCV belgesindeki kosinüs eşiği 0,363 başlangıçtır (doğrulanmalı); yine sahada FAR/FRR ölçümü | `camera.similarityThreshold`, `camera.uncertainMargin` | "emin değil" bandı korunur |
| 7 | Test: sahte yükleyici + ağ kapalı testi (`tests/test_models_offline.py` kalıbı), eşik ayarı testleri aynen | `otel-kamera/tests/` | kabul: ağ yamalı ortamda açılır, indirme yok |

Maliyet tahmini: 1–1,5 geliştirme günü (ölçüm sahada ayrıca). Doğruluk SCRFD + ArcFace-MBF'ye göre düşebilir; sahibin gerçek
kamerasıyla karşılaştırma yapılmadan "eşdeğer" denmez.

### 6.3 Sahibin kararı: mevcut modeller korunur (S-110, K-57) — lisans değerlendirmesi (2026-11-13, resmî kaynaklar)

Sahip: "Mevcut sistemin ticariye uygun olduğunu biliyorum… Kendi otelimde kişisel olarak kullanacağım, şimdilik satmayı
düşünmüyorum." Yeniden araştırma (`researcher`, kaynaklar aşağıda; hukuki tavsiye değildir):

| Bileşen | Lisans metni ne diyor | Kendi otelinde kullanım | Satış / başka otele verme |
|---|---|---|---|
| **Ultralytics YOLO11n** (AGPL-3.0) | AGPL §2: "You may make, run and propagate covered works that you do not convey, without conditions"; §0: ağ üzerinden etkileşim kopya aktarmıyorsa "conveying" değildir; §13: **değiştirilmiş** sürümle ağ üzerinden etkileşen kullanıcılara kaynak sunma yükümlülüğü | AGPL metnine göre **dağıtım yok = yükümlülük yok**. Ancak Ultralytics'in kendi lisans sayfası "Internal business tools or private company applications" ve "R&D projects that are not fully open-sourced" için Enterprise lisans gerekir diyor — şirketin ticari tutumu metinden katı; bağlayıcılığı hukuki soru. Yan süreç olarak ayrı tutmak (Bismuth koduyla aynı süreçte bağlanmaz) riski düşürür. Telefon/sunucu modundan personel erişimi "uzak kullanıcı" sayılabilir; §13 yalnız ultralytics kodu değiştirilmişse işler — **ultralytics kodu değiştirilmez** (yalnız çağrılır) | Enterprise lisans ya da model değişimi (eski P20d planı, §6.2) |
| **InsightFace kodu** (MIT) | "no limitation for both academic and commercial usage" | serbest | serbest |
| **InsightFace `buffalo_s` ağırlıkları** | "available for **non-commercial research purposes only**"; elle ya da otomatik indirilen modeller aynı kurala tabi; iletişim: `recognition-oss-pack@insightface.ai` (açık kaynak tanıma modelleri), `contact@insightface.ai` | Otelde güvenlik amaçlı kullanım "araştırma" değildir; metin ticari/ticari olmayanı tanımlamıyor → **risk var**. Öneri: sahip lisans sahibine tek e-posta yazıp yazılı izin ister (metin §6.4); cevap gelmezse risk sahibin kararıyla kabul edilir | izin olmadan verilemez |
| **Ultralytics telemetrisi** | `settings.sync` varsayılan `True` ("Send anonymized analytics and crash reports"); `settings.update({"sync": False})` kapatır, Sentry de kapanır (docs.ultralytics.com/help/privacy) | P20d'de zorunlu; ağ kapalı test | — |
| **Paket boyutu** | `ultralytics` 8.4.x wheel ~1,4 MB ama `torch` (CPU) + `torchvision` + `opencv` ile yüz MB'lar; `ultralytics-platform` bağımlılığının ağ davranışı incelenmeli | P20f paketleme büyür (~1–1,5 GB); gerekirse ayrı kamera eki kurulumu | — |

**Sonuç (tek paragraf, sahibe):** Kendi otelinizde, kimseye vermeden kullanmak AGPL metnine göre serbesttir; Ultralytics
şirketi iç kullanımı da ücretli saymak istiyor ama bu lisans metninden değil, şirket politikasından geliyor. Asıl risk
InsightFace model dosyalarıdır: "yalnız ticari olmayan araştırma" yazıyor ve otelde güvenlik kullanımı buna girmez.
Program mevcut modellerle devam edecek (kararınız), telemetri kapatılacak, ve satış gündeme gelirse açık lisanslı
modellere geçiş planı (§6.2) hazır. Tavsiye: InsightFace'e kısa bir e-posta ile izin isteyin.

Kaynaklar: https://www.gnu.org/licenses/agpl-3.0.html · https://www.ultralytics.com/license ·
https://github.com/deepinsight/insightface/blob/master/README.md · https://docs.ultralytics.com/help/privacy/ ·
https://docs.ultralytics.com/usage/settings/ · https://pypi.org/pypi/ultralytics/json (2026-11-13).

### 6.4 InsightFace izin e-postası taslağı (İngilizce; sahip gönderir)

> Subject: Permission request — buffalo_s models, single-hotel internal use
> Hello, I run a small hotel in Istanbul and use InsightFace `buffalo_s` (via the Python package) only inside my own
> hotel for door security; the software is not sold or distributed. Could you confirm whether this use is permitted
> under the model license, or what a commercial license for this scope would cost? Thank you.

## 7. Kamera kodunun kalitesi (en önemli 15 bulgu; tam liste 28 madde ajan notunda, `ekler/kamera-kod-bulgulari.md`)

| Önem | Yer | Sorun | Öneri |
|---|---|---|---|
| Kritik | `security_service.py:572-628`, `notifier.py:504` | Telegram'a giden karede **kayıtlı misafirin adı ve oda numarası** çizili | Telegram kaldır (K-50); kalırsa etiketsiz ham kare |
| Kritik | `security_service.py:465-654` | Analiz döngüsünde hiç `try/except` yok; tek istisna iş parçacığını sessizce öldürür, panel "bağlı" görünür, `.bat` bekçisi süreç yaşadığı için yeniden başlatmaz | Döngü gövdesi try/except + hata sayacı + `/api/status` sağlık alanı; Electron yan süreç denetimi |
| Yüksek | `security_service.py:557`, `tracker.py:179-218` | ByteTrack kullanılmıyor; 380 px merkez-yakınlığı izleyici iki kişiyi karıştırabilir | Gerçek ByteTrack ya da IoU |
| Yüksek | `tracker.py:294-299, :324` | `verified_tracks` hiç temizlenmez: kayıtlı misafirin yanından geçen yabancı aynı kimliği alırsa alarm üretilmez (tailgating) | Doğrulamaya TTL; kimlik kopunca sil |
| Yüksek | `tracker.py:327-331` | Kayıtsız sayaç "üst üste" değil toplam; sözlükler sınırsız büyür | Zaman pencereli sayaç + temizlik |
| Yüksek | `security_service.py:562-564` | Yüz yalnız kişi kutusu varsa aranır; YOLO kaçırırsa alarm hiç üretilmez | Kişi yoksa da düşük frekansta yüz tespiti |
| Yüksek | `config.py:34`, `tracker.py:349`, `config.py:56` | Üç farklı eşik (0,36 / 0,40 / 0,46) aynı kavram için; 0,36 gevşek | Tek ayarlı eşik + saha ölçümü |
| Yüksek | `web_app.py` (tümü) | Panelde kimlik doğrulama yok; `WEB_HOST=0.0.0.0` yapılırsa tüm Wi-Fi yayını ve misafir listesini görür/siler; gövdesiz POST'larda CSRF | Belirteç + Origin denetimi (A' mimarisi) |
| Yüksek | `.gitignore` (otel-kamera) | `.env`, `hotel_guests.db`, `guest_photos/` kapsanmıyor (kök `.gitignore` kapsıyor; klasör taşınırsa korunmaz) | Klasörün kendi `.gitignore`'una ekle (bu dalda yapıldı) |
| Yüksek | `face_engine.py:12`, `security_service.py:121` | Modeller ilk açılışta GitHub'dan iner; internet yoksa servis açılışta çöker, `.bat` 5 sn'de bir yeniden başlatır | Modeller paket içinde |
| Orta | `web_app.py:78-85`, `database.py:171-181` | `check_out_date` serbest metin; "12.05.2025" anında "süresi dolmuş" sayılır, fotoğraf silinir | `strptime` doğrulama (422) |
| Orta | `database.py:140-157`, `security_service.py:306-326` | Çıkış ad+oda eşitliğiyle toplu; kameradan çıkış gevşek eşikle başkasını çıkarabilir | Onay adımı; Bismuth tek kaynak |
| Orta | `web_app.py:186-257` | `async def` içinde bloklayan InsightFace/DB; MJPEG donar; `_engine_lock` alarm hattını bekletir | `def` (thread pool) |
| Orta | `notifier.py:465, :481` | İstisna mesajı bot token'ını içerir, log'a yazılır | Maskele / kaldır |
| Orta | `security_service.py:643-652` | Her turda tam çözünürlük çizim + JPEG q82, tüketici yokken de | Analiz için küçültülmüş kare; yayın yalnız izleyici varken |

Performans tahmini (ölçülmedi): YOLO11n CPU 60–150 ms/kare, SCRFD 30–60 ms, ArcFace-MBF 10–30 ms/yüz; i5-8. nesil
sınıfı bilgisayarda ~5–8 analiz/sn, 4 çekirdek %60–100; RAM 1,5–2,5 GB (torch). ONNX-only ile RAM 300–600 MB.

## 8. Aşamalı entegrasyon planı

| Aşama | İçerik | Kabul ölçütü | Büyüklük |
|---|---|---|---|
| K0 Karar | ✅ 2026-11-13: sahip cevapları geldi; modeller korunur (K-57), Telegram kalır (K-50), aydınlatma yeterli (K-58), kurulum sihirbazı (K-59) | K-49…K-53, K-57…K-59 kesin | — |
| K1 Depo ve güvenlik hijyeni (**hemen, kod yazmadan**) | `otel-kamera/.gitignore` tamamlama, `.env.example`, `requirements.txt` sabitleme, yerel yolların belgelerden silinmesi, kanca (`camera-data-guard`) | Kanca testleri geçer; depoda `.env`/db/foto yok | S |
| K2 Yan süreç iskeleti | `src/main/camera/sidecar.ts` + `bridge.ts`; Python tarafına belirteç ve `127.0.0.1` zorunluluğu; Electron'dan başlat/durdur; sağlık | Bismuth kapanınca süreç ölür; 3 çökme → bildirim; e2e sahte sidecar ile | M |
| K3 Kamera sekmesi | `features/camera/` canlı yayın + durum + alarm listesi; CSP istisnası; yetki `camera.view`; telefon: yalnız alarm listesi | ui-reviewer + turkish-ui-copy; 1366 ve 390 ekran görüntüleri | M |
| K4 Veri entegrasyonu | `guest_faces`, `camera_events` tabloları (migrasyon), "Kameradan yüz al", check-in/out eşitlemesi, alarm → bildirim, "misafir olarak kaydet" | Birim testler (şifreleme, silme, yetki), e2e: giriş→yüz kaydı→alarm→çıkış→silme | L |
| K5' Model sabitleme (P20d) | Mevcut modeller kalır (K-57); `ultralytics` `sync=False`, çevrimdışı test, model dosyaları paket içinde, lisans notları; eski K5 (YuNet + SFace) yalnız belge | Telemetri kapalı testi; ağ kapalı çalışır; `THIRD_PARTY_NOTICES` | S/M |
| K6' KVKK paketi (P20e) | Aydınlatma metni şablonu (3 dil; sihirbaz + sekme), saklama/imha ayarları ve raporu, çalışan dışlama listesi; rıza kaydı yok (K-58) | decision-auditor + privacy-auditor geçer | M |
| K8 Kamera kurulum sihirbazı (P20g) | Donanım otomatik → profil; ONVIF/SADP keşif; Hikvision RTSP kalıbı; görüntü testi; şifre `safeStorage` (K-59) | Sahte keşif yanıtıyla e2e | M |
| K7 Paketleme | Gömülü Python + bağımlılıklar `resources/camera/` (Windows x64, macOS arm64/x64), electron-builder `extraResources`, boyut ve açılış süresi ölçümü, kurulum kılavuzu bölümü | Paket Codespace'te üretilir (Windows: wine gerekebilir, doğrulanmadı); gerçek otel bilgisayarında deneme (sahip) | L |

Bağımlılık: K2 → K3 → K4; K5' K2'den sonra paralel; K6' ve K8 K4'ten sonra; K7 en son. Toplam: 7 paket (P20a–P20g), dalga 7–11.

**K7 — kabul edilen risk (P20ffix, 2026-11-14):** kamera eki (`camera-addon/`: Python, kütüphaneler, kod ve model dosyaları) kullanıcının
yazabildiği `userData` klasöründedir; aynı kullanıcı hesabında çalışan başka bir program ekteki Python dosyalarını
değiştirebilir ve Bismuth onları çalıştırır. Windows kurulumu da kullanıcı başına olduğu için `Bismuth.exe`'nin kendisi aynı
yazma erişimi altındadır: tehdit modeli aynıdır (bilgisayarın o kullanıcı hesabına sızan kötü amaçlı program zaten uygulamayı
da değiştirebilir). Kısmi önlemler: ek yalnız bu klasörden çalışır, ortam değişkeni ya da `PATH` ile başka Python seçilmez,
paketli yan süreç ortamı izin listesiyle kurulur (`PYTHON*`, `LD_*`, `DYLD_*`, proxy değişkenleri geçmez), model dosyaları her
açılışta `models/SHA256SUMS` ile denetlenir. İmza ve sağlama toplamı doğrulaması (ek + imzalı bildirim) ürün sonrası
iyileştirmedir; şimdilik yapılmaz.

## 9. Sahibe sorular (bu rapor; numaralar `00-ozet.md` ile aynı) — **cevaplandı 2026-11-13, `06-kararlar.md` 7. tur**

S-107 Kameralar personeli de görüyor mu? · S-108 Kamera görüntüsü telefonda/Mac'te de görünsün mü yoksa yalnız alarm
listesi mi? · S-109 Telegram'ı tamamen kaldırmayı kabul ediyor musunuz (fotoğrafsız metin bildirimi seçeneğiyle)? ·
S-110 Açık lisanslı modellere geçiş mi, Ultralytics/InsightFace ticari lisans teklifi mi? · S-111 Misafirden yazılı
rıza alıp rıza vermeyene kamerasız giriş sunmayı kabul ediyor musunuz? · S-112 Kaç kamera, hangi marka/RTSP, otel
bilgisayarının işlemcisi ve RAM'i?
