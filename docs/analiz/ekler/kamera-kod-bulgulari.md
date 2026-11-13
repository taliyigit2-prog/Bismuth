# Ek — otel-kamera kod bulguları (yardımcı ajan notu, 2026-11-12; satır numaraları o günkü koda aittir)

Kök: /workspaces/Bismuth/otel-kamera/. Kısaltma: SS=security_service.py, WA=web_app.py, DB=database.py, NT=notifier.py, TR=tracker.py, FE=face_engine.py, CF=config.py.
Önemli genel gözlem: Belgeler (README + AI_GELISTIRICI_NOTLARI) koddan ileride/farklı anlatıyor; aşağıda "DOKÜMAN≠KOD" ile işaretli.

## 0. Paket eşlemesi (§3'teki 28 madde → Faz 20 paketi; 2026-11-12 2. oturum)

| Paket | Maddeler | Not |
|---|---|---|
| **P20a** (yan süreç + Python hijyeni, dalga 7) | 1, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 25, 26, 27, 28 | Telegram kaldırma (1, 9), sağlamlık (3, 4, 7, 8, 10–19), saat dilimi (21), SQLite (22), küçükler (25–28); kabul: her madde için Python testi ya da "kaldırıldı" notu |
| **P20d** (model değişimi, dalga 8) | 2, 5, 6, 20, 23, 24 | ByteTrack/IoU (2), yüz arama kapsamı (5), eşikler (6), Türkçe etiket → renderer (20), MJPEG/çizim performansı (23, 24) |
| P20b / P20c | — | 06 §7 tablosundaki panel/veri maddeleri bu iki pakette örtük (panel kalkıyor, veri Bismuth'a taşınıyor) |

## 1. Mimari özeti
**Süreç/iş parçacığı.** Tek Python süreci (`python web_app.py` → uvicorn, WA:436-443). Parçalar:
- Uvicorn event-loop iş parçacığı (FastAPI; tüm uç noktalar `async def` ama içleri eşzamanlı/bloklayıcı: DB, OpenCV, InsightFace).
- `_ResilientCameraGrabber._reader_loop` daemon thread (SS:40-95): cv2.VideoCapture okur, son kareyi tutar.
- `SecurityService._run_loop` daemon thread (SS:465-654): ana analiz+çizim+JPEG hattı.
- Telegram gönderimi: her alarm için ayrı daemon thread (NT:519-524).
- Kilitler: `_lock` (kare/misafir listesi), `_engine_lock` (YOLO+InsightFace çıkarım serileştirme; SS:112-113).
- Dışarıda: Windows `.bat` sonsuz bekçi döngüsü (Otel_Baslat_Windows.bat:17-21, çökerse 5 sn'de yeniden başlatır); Mac'te tmux. Otomatik başlangıç: Startup klasörüne `.vbs` (Otomatik_Baslangica_Kur.bat:6-15).
- Süreç başlarken `SecurityService.__init__` modelleri yükler + depolama bakımı çalıştırır (SS:115-136) → lifespan içinde, yani panel modeller yüklenene kadar açılmaz.

**FastAPI uç noktaları (WA).** Kimlik doğrulama yok (bkz. §4).
| Yol | Yöntem | İş | Satır |
|---|---|---|---|
| `/` | GET | static/index.html döner | 141 |
| `/api/status` | GET | kamera bağlı/örtülü, misafir sayısı, fps, son tespit, telegram_configured | 150 |
| `/api/stream` | GET | MJPEG canlı yayın (`latest_jpeg`, 20 Hz döngü) | 157 |
| `/api/guests` | GET | aktif misafirler (ad+oda gruplu, angle_count, photo_url) | 178 |
| `/api/guests/from-camera` | POST (JSON: name, room_number, days, check_out_date) | canlı kareden yüz alıp misafir kaydı | 186 |
| `/api/guests/from-photo` | POST (multipart, ≤10 MB) | yüklenen fotoğraftan kayıt | 221 |
| `/api/guests/checkout-from-camera` | POST | kameradaki yüzü tanıyıp çıkış yapar | 209 |
| `/api/guests/{id}/checkout` | POST | misafiri (+aynı ad/oda satırlarını) pasife alır | 321 |
| `/api/alerts` | GET (limit ≤100) | son alarmlar (+URL'ler) | 340 |
| `/api/alerts/{id}` | DELETE | alarm kaydı + dosyaları siler | 360 |
| `/api/alerts/clear` | POST | tüm alarm geçmişi silinir | 372 |
| `/api/alerts/{id}/register` | POST | alarmdaki yüzü misafir olarak kaydet, alarmı sil | 260 |
| `/api/system/cleanup-storage` | POST | depolama bakımı elle | 384 |
| `/api/system/toggle-alarms` | POST | alarmları duraklat/aç | 398 |
| `/api/system/test-telegram` | POST | Telegram test fotoğrafı | 411 |
| `/alerts/*`, `/guest_photos/*`, `/static/*` | GET (StaticFiles) | doğrudan jpg sunumu | 61-63 |
Frontend (static/index.html, 1617 satır): 2,5 sn'de `/api/status`, 4 sn'de `/api/alerts` yoklaması (satır 1613-1614).

**SQLite (DB:21-59).** Dosya `hotel_guests.db` (CF:49), WAL + synchronous=NORMAL (DB:17-18), her çağrıda yeni bağlantı, timeout 20 sn.
- `guests(id, name, room_number, check_in_date TEXT, check_out_date TEXT, embedding BLOB NOT NULL, photo_path, is_active, created_at)` — tarihler "YYYY-MM-DD HH:MM:SS" yerel metin.
- `alert_logs(id, alert_time TEXT, image_path, face_crop_path, embedding BLOB, details)`.
- DOKÜMAN≠KOD: AI_GELISTIRICI_NOTLARI §5 `guest_face_profiles` tablosunu (çoklu açı) anlatıyor; database.py'de YOK. Çoklu açı = aynı ad+oda ile birden çok `guests` satırı (DB:210-244, `angle_count`). Ayrıca notlardaki `.env.example` dosyası da yok (§7).
- Şema göçü: yalnızca `PRAGMA table_info` + ALTER (DB:37-57); sürüm tablosu yok.

**Kamera girişi.** `CAMERA_SOURCE` rakamsa webcam indeksi, aksi halde RTSP URL (SS:34). FFmpeg seçenekleri env ile: `rtsp_transport;tcp|stimeout;5000000|rw_timeout;5000000|fflags;nobuffer|flags;low_delay` (SS:10-12). Tampon 1, açma/okuma zaman aşımı 5000 ms (SS:46-52). Kopunca 3 sn bekleyip yeniden aç (SS:74-85).

**Yüz tanıma hattı.** InsightFace `FaceAnalysis(name='buffalo_s', providers=['CPUExecutionProvider'])`, `det_size=(640,640)` (FE:12-13). Eşikler (CF:34-37,56): tespit skoru ≥0.62, yüz ≥55 px (kayıt sırasında 0.48/30 px, kenar dolgulu yeniden denemede 0.38/24 px: FE:44-75), kosinüs eşleşme ≥0.36 (FE:114-126; en iyi tek eşleşme, tek vektör/ misafir), CONFIRMATION_FRAMES=3, alarm cooldown 60 sn (hem tracker_id hem embedding benzerliği ≥0.40 sabit kodlu: TR:349), tekilleştirme 0.46/12 sa (DB:269-283). Düşük ışık: ortalama parlaklık 14-72 arası CLAHE (SS:154-169); <14 ya da (<24 ve std<7,5) ise "kamera kapalı", analiz atlanır (SS:196-209).
Akış (SS:548-640): her `PROCESS_EVERY_N_FRAMES=3` karede → CLAHE → YOLO(person) → izleme → bölge filtresi → **yalnızca kişi kutusu bulunduysa** tam karede yüz tespiti → yüz↔kişi eşleme (TR:226-292) → misafir eşleşmesi → kayıtsızsa sayaç/cooldown → alarm.

**YOLO11n + ByteTrack.** `YOLO("yolo11n.pt")` (SS:121), `self.yolo_model(analysis_frame, classes=[0], verbose=False)` (SS:557) → `sv.Detections.from_ultralytics`. BULGU: `.track()` hiç çağrılmıyor, yani **ByteTrack fiilen KULLANILMIYOR** (belge/README "ByteTrack" diyor). `tracker_id` None geldiği için TR:179-218'deki yedek "merkez yakınlığı" izleyici devreye giriyor (yarıçap 380 px, 6 sn bellek). Yüz kutusu kişi kutusuna düşmezse ayrı 1000+ ID'li yüz izleyici (TR:274-292). supervision yalnızca Detections/PolygonZone için kullanılıyor.

**Telegram (NT).** `https://api.telegram.org/bot<TOKEN>/sendPhoto`, multipart, 12 sn zaman aşımı, sohbet başına 3 deneme (0/3/8 sn; NT:466-481). Dışarı giden veri (yalnızca KAYITSIZ alarmında + test düğmesi):
- FOTOĞRAF: tam sahne JPEG (SS:620-628: `draw_overlays(include_pip=False)`; sağ üste kayıtsız kişinin 160 px yakın yüz kırpması, NT:400-427) — **kareye çizilmiş etiketler dahil**: aynı karede tanınan kayıtlı misafirin kutusu `"KAYITLI: {ad} (Oda {no}) %skor"` (SS:572-576, 593-598) ve üst şeritte kamera konumu, tarih-saat, "Kayıtlı KBS Misafir: N" (SS:358-360) görüntüye yazılıyor → **misafir adı + oda numarası Telegram'a (üçüncü taraf bulut) sızabilir**.
- CAPTION: başlık, konum (`CAMERA_LOCATION`), zaman, takip no, sabit metin (NT:504-510). Ad/oda caption'da YOK. Yüz vektörü gitmez.
- Yerelde de kaydedilir (alerts/alert_*.jpg + face_*.jpg).
- Telegram HTTPS çağrısı Bismuth'un "ağ kodu yalnızca 4 yerde" kuralıyla çelişir (entegrasyonda dikkat, §8).

**config.py ortam değişkenleri (python-dotenv `.env`, CF:25).** Sır olan: CAMERA_SOURCE (RTSP URL'de kullanıcı:şifre olabilir), TELEGRAM_BOT_TOKEN, (TELEGRAM_CHAT_ID yarı-hassas). Diğerleri sır değil.
| Ad | Varsayılan |
|---|---|
| CAMERA_SOURCE (SIR) | `0` |
| CAMERA_LOCATION | `Merdiven / Kat Girisi` |
| FACE_SIMILARITY_THRESHOLD | 0.36 |
| MIN_FACE_DET_SCORE | 0.62 |
| MIN_FACE_SIZE_PX | 55 |
| CONFIRMATION_FRAMES | 3 |
| PROCESS_EVERY_N_FRAMES | 3 |
| ALARM_COOLDOWN_SECONDS | 60 |
| HEADLESS | false (kodda hiçbir yerde kullanılmıyor: ölü ayar) |
| TELEGRAM_BOT_TOKEN (SIR) | "" |
| TELEGRAM_CHAT_ID | "" (virgülle çoklu) |
| DB_PATH | hotel_guests.db |
| ALERTS_DIR | alerts |
| GUEST_PHOTOS_DIR | guest_photos |
| ALERT_RETENTION_DAYS | 30 |
| MAX_ALERT_COUNT | 500 |
| DEDUP_SIMILARITY_THRESHOLD | 0.46 |
| DEDUP_WINDOW_HOURS | 12 |
| WEB_HOST | 127.0.0.1 |
| WEB_PORT | 8000 |
| INSIGHTFACE_MODEL_NAME | buffalo_s |
| ZONE_POLYGON | "" (`x1,y1;x2,y2;...`, piksel) |
Sabit kodlu, ayar olmayanlar: embedding cooldown 0.40 (TR:349), YOLO dosyası `yolo11n.pt` (SS:121), 8 sn kare bayatlama (SS:106), 10 sn misafir tazeleme (SS:508), 3600 sn bakım (SS:514), det_size 640, karanlık eşikleri, 380/280 px izleme yarıçapları, 95 px "küçük yüz" sınırı (TR:271).

## 2. "KBS kayıtlı misafir" nereden geliyor, nasıl saklanıyor
- KBS'den veri ÇEKİLMİYOR. "KBS kayıtlı" = resepsiyoncunun panelde elle girdiği liste. Kaynaklar: (a) canlı kameradan "Kaydet" (WA:186), (b) yüklenen fotoğraf (WA:221), (c) alarm kartından "KBS'ye kaydet" (WA:260). Ad + oda + gün sayısı (varsayılan 30, 1-3650) ya da çıkış tarihi girilir (WA:66-70).
- Giriş tarihi = kayıt anındaki `datetime.now()` (DB:87), gerçek giriş tarihi girilmez.
- Yüz vektörü: `guests.embedding` BLOB, 512 float32 (2 KB), **şifresiz**, SQLite dosyasında (DB:86,91). Fotoğraf: 240x240 vesikalık kırpma `guest_photos/guest_<id>_<epoch>.jpg`, JPEG q88, **düz dosya, şifresiz** (WA:117-121); DB'de yol saklanır.
- Silme/süre: (1) çıkış yapılınca (`deactivate_guest`) `is_active=0` ve fotoğraf diskten silinir, **embedding satırı DB'de kalır** (DB:123-164). (2) `check_out_date` geçince 10 sn'lik tazelemede otomatik pasif + foto silme (DB:166-187, 194, 216). (3) Pasif satır, çıkış tarihinden 30 gün sonra tamamen silinir (bakım, DB:327-338; saatlik). (4) Alarm kayıtları 30 gün/500 adet (DB:340-399) — alarm embedding'leri de burada. Yani "veri silinmez" kuralıyla (Bismuth) çelişen gerçek silmeler var ama KVKK açısından olumlu.
- Çoklu çekim: aynı kişiye ikinci yüz eklemek için ayrı kayıt gerekiyor; arayüzde tekrar kayıt aynı ad+oda ile gruplanır. Ad/oda `_sanitize_text` ile `<>"'` ve kontrol karakterleri silinir (WA:73-75) → "O'Brien" gibi adlar bozulur.

## 3. Hatalar (dosya:satır — önem — öneri)
**Kritik/Yüksek**
1. **Kimlik/KVKK sızıntısı Telegram'da** — NT:504 + SS:620-628, SS:572-598 — Yüksek: kayıtlı misafirin ad+oda etiketi fotoğrafa gömülü gidiyor. Öneri: Telegram karesinde yalnızca ham kare + kayıtsız kutu; etiketsiz.
2. **Gerçek ByteTrack yok; merkez-yakınlığı izleyici** — SS:557, TR:179-218 — Yüksek: 380 px yarıçapla yan yana iki kişi aynı ID'yi alabilir; sıra-bağımlı atama (`tid not in assigned_ids` yalnızca bu karede). Öneri: `model.track(..., tracker='bytetrack.yaml', persist=True)` ya da IoU tabanlı izleme.
3. **Doğrulanmış kimlik asla sona ermez / devralınır (tailgating)** — TR:294-299, 160 — Yüksek: `verified_tracks` hiç temizlenmiyor; kayıtlı misafirin 6 sn içinde 380 px yakınındaki yabancı aynı ID'yi alırsa "KAYITLI" sayılır, alarm üretilmez (TR:324). Öneri: doğrulamaya TTL, kutu-ID kopunca silme; yabancıya her karede yüz eşleştirmesi.
4. **`unknown_counts` "üst üste" değil** — TR:327-331 — Orta/Yüksek: kare sıfırlanmıyor; tanınan kare gelince ancak `register_verified` sıfırlar. Aynı ID'de 3 toplam kayıtsız kare (günlerce bile) alarm sayılır; ID hiç temizlenmediği için sözlükler sınırsız büyür (bellek). Öneri: zaman damgalı pencere + periyodik temizlik.
5. **Yüz yalnızca kişi kutusu varsa aranıyor** — SS:562-564 — Orta/Yüksek: YOLO kaçırırsa (yakın çekim, kısmi beden, gece) yüz hiç işlenmez → alarm hiç üretilmez; TR:269-292'deki "yakın çekim yüz" yolu bu yüzden çoğu zaman erişilemez. Öneri: person boş olsa bile yüz tespiti (düşük frekansla).
6. **Eşleşme eşiği 0.36 gevşek, tutarsız eşikler** — CF:34, TR:349, CF:56 — Yüksek (yanlış-kabul = yabancı "kayıtlı"): ArcFace/w600k_mbf için tipik güvenli eşik ~0.4-0.5 (tahmin; sahada ölçülmeli). Üç ayrı eşik (0.36 / 0.40 / 0.46) aynı kavram için. Öneri: tek ayarlı eşik + sahada ROC (FAR/FRR) ölçümü; "emin değil" ara bölgesi.
7. **Bakım "çoğaltma tekilleştirmesi" tüm geçmişe uygulanıyor** — DB:354-386 — Orta: 12 sa penceresi yalnızca `log_alert`te (DB:269); bakım tüm 30 günlük alarmları 0.46'ya göre birleştirip eskileri siliyor, farklı iki kişiyi (benzer) silebilir, kanıt kaybı. Öneri: bakımda da pencere uygula ya da kaldır.
8. **Orphan dosya temizliği yarış** — DB:424-434, WA:384-395, WA:117-122 — Orta: `/api/system/cleanup-storage` (event-loop thread) çalışırken analiz thread'i `alerts/`e dosyayı yazıp henüz `log_alert` yapmamışsa ya da WA kayıtta `imwrite` ile `update_guest_photo` arası dosya "sahipsiz" silinir. Öneri: dosya yaşı < 5 dk ise silme + tek yazıcı kilidi.
9. **Telegram token düz metin loglanabilir** — NT:465, 481 — Orta: `requests` istisna mesajı URL'yi (token dahil) içerir; konsol/`sentinel.log`'a (Baslat_Mac:38) yazılıyor. Öneri: istisna mesajından token'ı maskele.
10. **Watchdog thread yok (DOKÜMAN≠KOD)** — SS:102-107, notlar §4.4 — Orta/Yüksek: yalnızca `get_latest_frame` bayat kareyi gizliyor; `cap.read()` sonsuz takılırsa (FFmpeg bazı sürümlerde `stimeout`'u yok sayabilir; OPENCV_FFMPEG_CAPTURE_OPTIONS, web_app.py `import cv2`i security_service'ten ÖNCE yaptığı için env'in etkisi doğrulanmadı) reader thread asla yeniden bağlanmaz. Öneri: ayrı watchdog ile cap.release()+yeniden aç; ya da alt süreç.
11. **Yeniden bağlanma geri çekilmesi sabit** — SS:56,67-69 — Düşük: `backoff` hiç artmıyor (2 sn); kamera kapalıyken sürekli açma denemesi, log yok (sessiz).
12. **Sistem istisnaları yutuluyor** — SS:49-52, 59-62, 65-69, 115-136, NT:480-481 — Orta: `except Exception: pass`. En kritik: `_run_loop` içinde hiçbir try/except yok (SS:465-654) → YOLO/InsightFace/cv2/DB'den tek bir istisna thread'i sessizce öldürür (daemon), panel "bağlı" görünüp analiz biter, `.bat` bekçisi ana süreç yaşadığı için yeniden başlatmaz. **Yüksek.** Öneri: döngü gövdesini try/except + hata sayacı + sağlık durumu `/api/status`.
13. **Alarm yolunda DB/disk hatası** — SS:622-636 — Orta: `send_alert_with_crop` ya da `log_alert` istisnası tüm döngüyü öldürür (madde 12).
14. **Bloklayan çağrılar async uç noktalarda** — WA:186-257, 384 (`async def` içinde InsightFace/DB) — Orta: yüz çıkarımı sırasında event loop donar, MJPEG akışı takılır; ayrıca `_engine_lock` analiz döngüsüyle çekişir (WA yüz çıkarımı SS:259'da kilidi bekler → kayıt anında alarm hattı da bekler). Öneri: `def` (thread pool) ya da `run_in_threadpool`.
15. **Misafir listesi güncelleme yarışı** — SS:181-186, 508-511, TR:359-364 — Orta: `reload_guests` WA thread'inde `tracker.clear_memory()` yapar, tracker'a kilitsiz erişen analiz thread'iyle yarışır ("dictionary changed size" riski). Ayrıca 10 sn'de bir `active_guests` DB'den yeniden yüklenip `cleanup_expired_guests` yazması her 10 sn'de DB yazma kilidi alır.
16. **Okuma yolunda yazma** — DB:194, 216 — Düşük: `get_active_guests`/`list_active_guests_info` UPDATE+DELETE benzeri yazma yapar (her panel yenilemesinde).
17. **Çıkış tarihi serbest biçim, metin karşılaştırması** — WA:78-85, DB:171-181 — Yüksek/Orta: `check_out_date` kullanıcı dizgisi (yalnızca 10 karakterlik tarihe " 23:59:59" eklenir); "12.05.2025" gibi giriş `<` karşılaştırmasında anında "süresi dolmuş" olur (misafir hemen pasif + foto silinir); "abc" hiç dolmaz. Öneri: `datetime.strptime` ile doğrula (422).
18. **Yanlış kişi "çıkış"** — DB:140-157, SS:306-326 — Orta: çıkış ad+oda eşitliğine göre toplu pasifleştirir; farklı gün/aynı ad+oda yinelenen kişi de kapanır; `checkout-from-camera` en iyi eşleşme >=0.36 ile (gevşek eşik) başkasını çıkartabilir. Öneri: kameradan çıkışta onay adımı, eşik ≥0.45.
19. **Kayıt atomik değil** — WA:110-127 — Orta: `add_guest` (embedding var) → foto yaz → `update_guest_photo`; ortada çökerse foto'suz kayıt. Ayrıca aynı kişi için çift tıklama ile iki satır.
20. **Etiketlerde Türkçe/Kiril karakter bozulur** — SS:360, 395-399 (`cv2.putText` Hershey) — Orta: ş,ğ,ı,İ,ç,ö,ü ve Rusça adlar `?` çıkar; Telegram kanıt fotoğrafına da yansır. Öneri: PIL ile TTF çiz (paket içi yazı tipi) ya da etiketi yalnızca panelde göster.
21. **Zaman dilimi** — DB:87,168,260, WA:85 — Düşük/Orta: hepsi `datetime.now()` (saf, yerel); `created_at` ise `CURRENT_TIMESTAMP` (UTC) → karışık. Türkiye'de DST yok ama bilgisayar saati/zaman dilimi yanlışsa çıkış süresi bozulur. Öneri: tek kural (yerel ISO), saat dilimi saklanan ayar.
22. **SQLite eşzamanlılık** — DB:14-19 — Düşük/Orta: her çağrıda yeni bağlantı+PRAGMA; `with conn` bağlantıyı KAPATMAZ (yalnızca commit/rollback), CPython GC'ye güveniyor; WAL ile okuma-yazma uyumlu, 20 sn bekleme (busy_timeout) var ama çoklu thread yazması (analiz thread + uvicorn) `database is locked` üretirse istisna yutulmaz → madde 12'ye düşer. Öneri: tek bağlantı+kilit ya da `closing()`.
23. **MJPEG yayını boşta döner** — WA:157-175 — Düşük: değişmese de 20 Hz aynı kareyi gönderir; sekme kapanana kadar `is_disconnected` kontrol ediliyor (iyi).
24. **Her işlenen karede tam çözünürlük çizim+JPEG** — SS:643-652 — Orta (performans): tam çözünürlük kopya + çizim + JPEG q82; yayın tüketici yokken de çalışır.
25. **`HEADLESS` ölü ayar; `/api/guests/{id}` oda/ad güncelleme yok** — CF:42 — Düşük.
26. **Piksel poligonu çözünürlüğe bağlı** — TR:170-176 — Düşük: kamera çözünürlüğü değişirse bölge kayar; ayrıştırma hatası sessizce bölgeyi kapatır (print).
27. **Alarm dosya adı çakışması** — NT:439 — Düşük: `%f` ilk 18 karakter kırpması mikrosaniyeyi atar; aynı saniyede aynı tid için üzerine yazar (nadir).
28. **Test dosyası gerçek DB'ye dokunuyor** — test_system.py:10 — Düşük: `import web_app` modül düzeyinde `hotel_guests.db` açar; test sırasında rasgele embedding.

## 4. Güvenlik
- **Panel kimlik doğrulaması YOK** (WA'da auth/oturum/parola yok). Tek koruma `WEB_HOST=127.0.0.1` varsayılanı (CF:60). `.env`'de `WEB_HOST=0.0.0.0` yazılırsa tüm otel Wi-Fi'ı canlı yayını, misafir isim/oda listesini, alarm fotoğraflarını görür ve silebilir. Orta→**Yüksek** (yanlış yapılandırma tek satır). Öneri: oturum/PIN + sunucu 0.0.0.0'da kimlik zorunlu.
- 127.0.0.1'e bağlı olsa da **CSRF/DNS-rebinding**: gövdesiz POST'lar (`/api/alerts/clear`, `/api/guests/{id}/checkout`, `/api/guests/checkout-from-camera`, `/api/system/*`) başka bir sitedeki sayfadan resepsiyon tarayıcısı üzerinden tetiklenebilir; CORS middleware yok (varsayılan: çapraz-kaynak okuma engelli, ama basit POST gider); Origin/Host kontrolü yok. Orta. Öneri: Origin/Host doğrula + oturum belirteci.
- CORS: ayarlı değil (iyi: tarayıcı çapraz okumaya izin vermez). Başlıklar: nosniff, X-Frame-Options DENY, Referrer-Policy; CSP yok (WA:50-58).
- Dosya yolu enjeksiyonu: kullanıcıdan gelen yol YOK; URL'ler `os.path.basename` ile üretiliyor (WA:88-91); yüklenen dosya `cv2.imdecode` ile bellekte çözülüyor, diske ham yazılmıyor → iyi. StaticFiles klasör listelemez ama `alerts/`, `guest_photos/` kimlik doğrulamasız; adlar tahmin edilebilir (`guest_<id>_<epoch>`). `img_p.replace("alert_","face_")` (DB:416, WA:273, 348) yolun klasör kısmında "alert_" geçerse yanlış dönüşür (düşük).
- XSS: `esc()` 10 yerde; `innerHTML` 5 yerde (index.html:1244,1252,1404,1412) — esc kapsamı satır satır doğrulanmadı. Sunucu ayrıca `<>"'` siler.
- Telegram token: `.env` düz metin. `.gitignore` `.env`'i KAPSAMIYOR (satırlar: venv/, __pycache__/, *.pyc, .DS_Store, *.db-shm, *.db-wal, test_verification.db*, alerts/*.jpg). **`hotel_guests.db` (embedding+ad), `guest_photos/`, `.env` (RTSP şifresi+bot token) depoya girebilir.** Yüksek. Bismuth kancası kimlik/tablo verisini engeller ama bu klasör için ek `.gitignore` gerekir.
- Yüz görüntüleri/embedding düz dosya/BLOB (şifresiz), Google Drive zip'iyle taşınıyor (notlar §7) → buluta çıkış riski (KVKK özel nitelikli biyometrik veri). Öneri: şifreli saklama (anahtar OS keychain), embedding'i de silme politikasına bağla.
- `scheme`: HTTP yalnızca yerel; RTSP şifresi URL'de log/ps çıktısında görünebilir.
- Üçüncü taraf telemetri: `ultralytics` `settings.sync` varsayılanı `True` = "Send anonymized analytics and crash reports to Ultralytics" (**doğrulandı**, docs.ultralytics.com/usage/settings); kapatmak için `settings.update({"sync": False})`. Bismuth G-07 ile ilgili.
- Lisans: Ultralytics AGPL-3.0 (ticari dağıtımda kaynak açma yükümlülüğü ya da kurumsal lisans); InsightFace önceden eğitilmiş modelleri "yalnızca ticari olmayan araştırma" lisansıyla yayımlanıyor (bilinen bilgi, yerelde doğrulanmadı) → ürünleştirme öncesi hukuki kontrol şart. **Yüksek (ürünleştirme engeli olabilir).**

## 5. Performans
- Kare hızı: okuyucu thread ~200 Hz'e kadar döner (sleep 0,005; SS:94) ama kare akışı kameranın fps'i kadardır. Analiz her 3. karede; kamera 25 fps ise ~8 analiz/sn hedefi. Her döngü turunda (yalnızca analiz karelerinde değil) tam çözünürlüklü çizim + JPEG q82 (SS:643-652).
- Çözünürlük düşürme YOK: YOLO tam kareyi 640'a ölçekler (ultralytics varsayılan imgsz=640), InsightFace `det_size=640x640`. 1080p/4K'da uzak yüzler küçülür (55 px yüz 1080p'de ~18 px'e iner → kaçırma) — hem hız hem doğruluk dengesi sahada denenmeli.
- Tahmini maliyet (ölçülmedi, yalnızca tahmin): YOLO11n CPU ~60-150 ms/kare, SCRFD-500M ~30-60 ms, ArcFace-MBF ~10-30 ms/yüz → i5-gen8 sınıfı bilgisayarda analiz döngüsü ~5-8/sn, 4 çekirdek %60-100. Yüz tespiti her analiz karesinde çalışıyor (kişi varsa).
- RAM tahmini: torch + onnxruntime + 2 model ≈ 1,5-2,5 GB RSS; modeller küçük (yolo11n ~5 MB; buffalo_s ~120 MB toplam).
- Zayıf PC riskleri: 4 GB RAM/Celeron → sürekli gecikme; `_engine_lock` yüzünden kayıt/çıkış işlemleri analizi bekletir; MJPEG + 2,5 sn yoklama CPU'yu artırır; JPEG yeniden kodlama her turda; alarmda Telegram'a tam çözünürlük (NT:512); CLAHE tam çözünürlükte (SS:162-167) ek yük. Öneri: analiz için yeniden boyutlandırılmış kare, yayın için ayrı düşük fps, kalan süre ölçümü (`/api/status`'a işlem süresi).

## 6. Paketleme
- Python: 3.11 veya 3.12 (README, bat mesajı). Sanal ortam (venv) + `pip install -r requirements.txt` (Otel_Ilk_Kurulum_Windows.bat:27-28) → **kurulum sırasında internet gerekir**.
- requirements.txt (12 satır; hepsi `>=`, sabitlenmemiş; Bismuth kuralı `save-exact` ile çelişir): fastapi, uvicorn, python-multipart, pydantic, python-dotenv, requests, numpy, opencv-python, supervision, ultralytics, insightface, onnxruntime. `torch` dolaylı gelir (ultralytics) → Windows'ta ~0,2 GB (indirme)/~0,6-1 GB (kurulu), Linux CUDA tekerleğiyle 2 GB+; ultralytics+supervision matplotlib/scipy/pandas çeker. Toplam kurulu boyut tahmini 1,5-3 GB (ölçülmedi).
- PyInstaller engelleri: (1) `insightface` 0.7.3 PyPI'de yalnızca sdist (`insightface-0.7.3.tar.gz`, 02.04.2023; **doğrulandı**), Cython uzantısı derlenir → Windows'ta MSVC Build Tools gerekir; 2.1 sürümü (Ekim 2026) `py3-none-any.whl` ile geliyor ama model lisansı değişmedi; Python 3.12 derleme sorunları iddiası doğrulanamadı (ikincil forum kaynakları). (2) `onnxruntime` yerel DLL/`.pyd`'lerin (providers) açıkça `--collect-binaries` ile eklenmesi gerekir. (3) `ultralytics` dinamik import'lar (`--collect-all ultralytics`), torch dev boyut (≥1 GB), AGPL. (4) `ctypes.windll` ve `os.environ` ön ayarları (SS:10) paketlemede önce ayarlanmalı. (5) Göreli yollar (`static`, `alerts`, `hotel_guests.db`, `yolo11n.pt` CWD'ye göre: WA:23-25, 143) donmuş uygulamada `userData`'ya taşınmalı. (6) `.bat` bekçisi/VBS Startup mantığı Electron ana sürecine taşınmalı. Öneri (Bismuth için): Python'u ayrı yan süreç (sidecar) olarak ve gömülü Python + `pip install --target` ile ya da ONNX-only mimariyle: YOLO'yu ONNX'e aktar, InsightFace modellerini doğrudan onnxruntime ile çalıştır (SCRFD+ArcFace), torch/ultralytics/insightface paketi kalksın → ~150-250 MB. İzleme için basit IoU/ByteTrack kendi koduyla.
- Model ağırlıkları: `buffalo_s` → ilk çalıştırmada insightface otomatik olarak GitHub sürümlerinden `~/.insightface/models/buffalo_s/` içine indirir (~120 MB; internet ŞART; FE:12). `yolo11n.pt` → depoda YOK (`ls`: dosya yok; README ağaçta listeliyor), `YOLO("yolo11n.pt")` çalışma klasöründe yoksa ultralytics GitHub'dan indirir (~5,4 MB). Yani **ilk açılışta internet olmazsa `SecurityService.__init__` istisnayla çöker** ve panel hiç açılmaz; `.bat` 5 sn'de bir sonsuz yeniden başlatır (log patlaması). Çevrimdışı kurulumda modeller pakete gömülmeli; Bismuth "tüm kaynaklar paket içinde" kuralıyla uyumlu hale getirilmeli. Ayrıca `static/index.html:7-9` Google Fonts CDN'ine bağlı (çevrimdışı = yazı tipi yüklenmez; Bismuth yasak 1 ihlali).

## 7. `.env.example`
YOK (AI_GELISTIRICI_NOTLARI.md:~42 "`.env.example` var" diyor ama dosya klasörde yok; `.env` de depoda yok). config.py'den sır içermeyen öneri:
```
# Kamera: 0 = webcam, ya da RTSP adresi (kullanıcı/şifreyi kendiniz yazın)
CAMERA_SOURCE=rtsp://<kullanici>_<sifre>_AT_192.168.1.64:554/stream1
CAMERA_LOCATION=Merdiven / Kat Girisi
# Yüz tanıma eşikleri
FACE_SIMILARITY_THRESHOLD=0.36
MIN_FACE_DET_SCORE=0.62
MIN_FACE_SIZE_PX=55
CONFIRMATION_FRAMES=3
PROCESS_EVERY_N_FRAMES=3
ALARM_COOLDOWN_SECONDS=60
# Telegram (boş bırakılırsa yalnızca yerel kayıt)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Depolama
DB_PATH=hotel_guests.db
ALERTS_DIR=alerts
GUEST_PHOTOS_DIR=guest_photos
ALERT_RETENTION_DAYS=30
MAX_ALERT_COUNT=500
DEDUP_SIMILARITY_THRESHOLD=0.46
DEDUP_WINDOW_HOURS=12
# Web (127.0.0.1 = yalnızca bu bilgisayar; 0.0.0.0 YAPMAYIN)
WEB_HOST=127.0.0.1
WEB_PORT=8000
INSIGHTFACE_MODEL_NAME=buffalo_s
# İsteğe bağlı geçiş bölgesi (piksel): x1,y1;x2,y2;x3,y3;x4,y4
ZONE_POLYGON=
```
Ek: `.gitignore`'a `.env`, `*.db`, `guest_photos/`, `alerts/` eklenmeli.

## 8. Bismuth ile veri entegrasyonu: asgari arayüz
Kamera tarafının ihtiyacı (Bismuth → kamera), "misafir" başına:
- `guest_id` (Bismuth kimliği; şu an yerel AUTOINCREMENT), `name` (görünen ad), `room_number` (oda no; Bismuth'ta oda kodu), `check_in_date`, `check_out_date` (YYYY-MM-DD yerel gün, çıkış günü gece değil; kamera tarafı bugün 23:59:59'a kadar tutuyor: tek bir kural seçilmeli), `status`/`is_active`, `face_photo` (dosya + sha256, K-25 `userData/attachments/`) ya da hazır embedding (512 float32) + model adı/sürümü (buffalo_s uyumluluğu; model değişirse yeniden üretim gerekir).
- Rezervasyon başına birden çok kişi (aynı oda): kamera tarafı kişiyi (guest) ayrı tutar; Bismuth'ta konuk → rezervasyon ilişkisi var olmalı.
- Kamera tarafında olan ama Bismuth'ta ihtiyaç olmayan: yüz vektörü yalnızca kamera hizmetinde (veritabanı ayrı) kalabilir; Bismuth'a sadece "yüz kaydı var/yok" bayrağı + foto yolu dönsün.
Kameranın ürettiği olaylar (kamera → Bismuth), önerilen asgari sözleşme:
- `guest_recognized`: {guest_id, zaman, kamera/konum, skor} (isteğe bağlı; sık olduğu için örnekleme/sürekli kayıt yerine "ilk görülme/saat" ).
- `unregistered_entry` (KBS dışı giriş / alarm): {event_id, zaman, konum, takip no, face_crop (dosya+sha256), scene (dosya), embedding (opsiyonel)} — bugünkü `alert_logs` ile 1:1.
- `alarm_state`: {paused, camera_connected, camera_covered, fps} (şu an `/api/status`).
- `alert_registered_as_guest`: kayıtsız kişiyi misafire çevirme (şu an WA:260) → Bismuth'ta misafir oluşturma/oda atama; ya da Bismuth'un konuk formundan "kameradan yüz al" çağrısı.
- `guest_checked_out`: Bismuth çıkış yaptığında kameraya `deactivate(guest_id)` komutu; kamera tarafında çıkış tarihi otomatik süre bitimi yedekte.
Mimari notu: Bismuth "tek giriş" (G-60) gereği ad/oda/tarih Bismuth'tan akmalı, kamera panelindeki elle giriş kaldırılmalı; Telegram/ağ çağrısı yasağı (CLAUDE.md Yasak 1) yüzünden bildirim Bismuth'un `src/main/network/` kapsamında opsiyonel olmalı ve `network.enabled=false` ile kapanmalı; yetki servis katmanında (ctx) olmalı (kamera panelinde auth yok). Kamera hizmeti Python yan süreç olarak yalnızca `127.0.0.1` üzerinde, rastgele oturum belirteciyle konuşmalı.
