# 06 · Karar Kaydı (ADR) — Bismuth

> Her karar: bağlam, seçenekler, seçim, gerekçe, durum. Durum: **öneri** (Fable) → **kesin** (Faz 0'da doğrulandı
> ve/veya sahip onayladı). Kararı değiştirmek = yeni satır eklemek, silmek değil. Sahibin soru cevapları en altta.

| No | Karar | Durum |
|---|---|---|
| K-01 | Masaüstü kabuğu: **Electron** (Tauri değil) | öneri → Faz 0 doğrular |
| K-02 | Veritabanı: **better-sqlite3 13.x + Drizzle**, WAL, SQL migrasyonlar | better-sqlite3 **kesin** (Faz 0: Win/Mac/Linux'ta paketli uygulamada çalıştı, hazır ikili, yeniden derleme yok); Drizzle depo araştırmasıyla kesinleşir |
| K-03 | Takvim ızgarası: **özel bileşen** (TanStack Virtual, yatay sanallaştırma) | **kesin** (Faz 0: 10 yıl × 19 oda, 17.900 konaklama → 142 ms ilk çizim, 60 fps) |
| K-04 | Bayramlar: **kural tabanlı, sınırsız yıl, çevrimdışı** — `date-holidays` (2076'ya kadar) + yerleşik `Intl` islamic-umalqura yedeği; dini bayramlar "tahmini"; **yıllık çevrimiçi doğrulama: Google TR tatil ICS** (anahtarsız, arife + "kesin değil" bilgisi), yedek Nager.Date; kullanıcı düzeltmesi kalıcı | **kesin** (Faz 0: 2026 üç kaynakta aynı; 2027 Ramazan'da 1 gün fark yakalandı → doğrulama gerekli) |
| K-05 | Veritabanı dosyası şifrelenmez (v1); **otelin Drive'ına giden yedekler ve kutu paketleri her zaman şifreli** (AES‑256‑GCM, "Bismuth anahtarı" yalnız sahipte; QR + kâğıt metni — biçim K-41); program klasöründeki yerel yedek düz (hızlı geri yükleme), isteğe bağlı şifreli | **kesin** (S-42: yedek Drive'a; KVKK) |
| K-06 | Kur: **yalnızca piyasa orta kur**; zincir **Truncgil v4 (canlı, Yahoo canlı piyasasına %0,1 yakın) → fawazahmed0 → open.er-api → exchangerate-api v4 → Frankfurter → önbellek → otel kuru/elle**; isteğe bağlı kullanıcı anahtarı (OXR/currencyapi); TCMB yalnız kıyas; kaynak adı + saat görünür; 30 dk yenileme | **kesin** (Faz 0 canlı doğrulama: `canli-dogrulama.md`; GenelPara, Google kazıma, Yahoo, currency-api-tr elendi) |
| K-07 | Paketleme: electron-builder; Windows NSIS sihirbazlı; macOS iki DMG; **imzasız** (Windows) + **ad‑hoc** (macOS) + resimli kılavuz | **kesin** (S-04: ücretsiz) |
| K-08 | UI: shadcn/ui (Radix) + Tailwind v4; `shadcn eject`; paket içi fontlar; durum renkleri CSS değişkeni | öneri |
| K-09 | Alan modeli: rezervasyon = folyo; charges + payments; `room_nights` UNIQUE(oda, tarih, slot) | öneri |
| K-10 | Claude düzeni: proje içi `CLAUDE.md` + `.claude/` (Node kancaları) | **kesin** (uygulandı) |
| K-11 | Test: Vitest + Playwright (`_electron` + mobil emülasyon); CI ubuntu test, windows/macos paket | öneri |
| K-12 | İşletim sistemi tabanı: **Electron 37.x** (macOS 11+, Windows 10+; Chromium 138) varsayılan; 44.x yedek hat. Windows 7/8.1 mümkün değil. | **kesin** (Faz 0: 37 ve 44, Windows + macOS paketleme ve duman testi geçti; **sahibin Mac'inde açıldı** — macOS 26.5 / Darwin 25.5.0, arm64, açılış 427 ms, 10.000 satır 17 ms, tüm CSS/Intl ✓; otel PC denemesi S-80 bekleniyor) |
| K-13 | Hava durumu **zorunlu**: **MET Norway** birincil (ticari serbest, User‑Agent'ta otel e‑postası, `Expires`'a uyum); Open‑Meteo yalnız sahip açarsa (ücretsiz katman ticari değil); kullanıcı anahtarlı seçenek; 60 dk önbellek. **Gösterim (S-19, S-90): haftalık 7 gün + bugün; görsel simgeler = Yr hava simgeleri** (MET `symbol_code` ile birebir; CC BY 4.0, Hakkında'da atıf; paket içi SVG); yağış mm + "yağmur bekleniyor" yazısı; yüzde yok | **kesin** (Faz 0 canlı: MET ✅ 89 saat; sahip: "görselleştir, yağmurlu bulut simgesi") |
| K-14 | Dışa aktarma: exceljs; CSV UTF‑8 BOM + `;` | öneri |
| K-15 | Para: `amount_minor` + `currency`; kur **kaydın yazıldığı dakikada** dondurulur (`fx_rate_at`), tutar/birim değişirse değiştiği andaki kur; **görünüm varsayılan tam sayı**, ayarla kuruşlu | **kesin** (S-07, S-32) |
| K-16 | Kimlik: scrypt; PIN kolaylık kilidi; HTTP oturum belirteçleri | öneri |
| K-17 | Çeviri: i18next; `tr.json` kaynak; **en/ru** ilk sürümde (Arapça ertelendi); ESLint `no-literal-string` | **kesin** (S-06, v3) |
| K-18 | ~~LAN modu v1'de yok~~ → K-19 ile değişti | iptal |
| K-19 | **Çoklu cihaz mimarisi — C2 kesin (2026-10-02):** otel PC tek yazıcı + Mac'te tam salt‑okunur yedek kopya + şifreli kutu ve yedekler **otelin Google Drive'ında** + devralma; canlı erişim/telefon için **ücretsiz özel ağ NetBird** (K-31); ayrıntı aşağıda. Eski öneri metni:  otel PC **tek yazıcı** (çakışma yok) + değişiklik günlüğü (SQLite tetikleyicileri) + **Mac'te salt‑okunur sıcak kopya** (özel ağ/yerel ağ üzerinden canlı, ayrıca kutudan) + **şifreli kutu** (AES‑256‑GCM, anahtar yalnız sahipte, kimlik no konmaz; sahibin Drive/OneDrive/iCloud klasörü) + **devralma sihirbazı** (PC ölürse Mac/yeni PC ana olur; epoch ile eski PC yazamaz). Uzaktan yazma yalnız otel PC erişilebilirken. Özel ağ: otel için ayrı kimlik + Tailscale cihaz paylaşımı (ya da NetBird). Supabase ana kaynak **önerilmez** (çevrimdışı çakışma, 7 gün durdurma, iki şema, KVKK). İsteğe bağlı v1.1: sahibin Cloudflare hesabında şifreli ayna + VPN'siz telefon. | **kesin** (S-79: "profesyonelliğine güveniyorum"; S-82: ücretsiz; S-83: otelin Gmail'i var; S-84…S-89 varsayılan) |
| K-20 | ~~RTL: Arapça tam RTL~~ → **Arapça ertelendi** (S-69). Mantıksal CSS kuralı korunur (ileride ucuz ekleme); Arapça font ve RTL testi v1'de yok. | iptal/ertelendi |
| K-21 | Durum etiketleri iki katman: otomatik (ad/renk değişir, kapatılabilir) + özel (kullanıcı tanımlı ad/renk/anlam) | **kesin** (sahip: "renk ve anlamı kendisi atar") |
| K-22 | Program adı **Bismuth**; `appId com.bismuth.hotel` (sahip onayına bağlı) | **kesin** (S-05) |
| K-23 | Rol düzenleyici: ekran listesi × (göremez / görür / düzenler) select; sistem rolleri başlangıç önerisi; "Sahip" sabit | **kesin** (S-09: sahip kendisi seçer) |
| K-24 | Turizm istatistiği: KBS Excel içe aktarma (**sütunlar başlık adıyla** bulunur, kimlik/ad okunmaz/saklanmaz; exceljs + i18n-iso-countries) + program verisiyle karşılaştırma; KBS'nin `1900-01-01` "çıkış yok" değeri tanınır; otelde kalanlar ve uyruk eşleme K-36 | **kesin** (Faz 0: gerçek Eylül dosyasıyla 607 giriş / 23 ülke / 840 geceleme doğrulandı) |
| K-25 | Dosya ekleri (arıza/fiş/kayıp eşya fotoğrafı): `userData/attachments/`, DB'de yol+sha256; küçültme (maks. 1600 px); yedek kapsar; **çözülmüş arıza fotoğrafları `attachments.resolvedIssueRetentionDays` (30) gün sonra silinir**, elle silme her zaman | **kesin** (S-64) |
| K-26 | Tema: açık / koyu / sistem; sahibin renkleri `<style id="user-theme">` | **kesin** (S-07 ek) |
| K-27 | **Kapasite geçmişi**: `room_capacity_changes` (oda, geçerlilik tarihi, satılabilir, yatak sayısı) — doluluk ve bakanlık oranı tarihteki kapasiteyle hesaplanır | **kesin** (sahip: tadilatla oda/yatak değişir) |
| K-28 | **Çamaşırhane fiyatları**: tür × çamaşırhane × geçerlilik tarihli birim fiyat tablosu; fişte fiyat varsa satırda saklanır, yoksa tablodan; lekeli adet ayrı alan; **giden (kirli) / gelen (temiz) ayrı kayıt, tür bazında eksik devri** | **kesin** (sahip cevabı 9, S-95) |
| K-29 | **Bakanlık istatistiği kuralları**: tüm geceler giriş ayına (**sonraki aya sarkan geceler dahil**); aynı gün = 1; çocuk ayrı değil (KBS satırı); doluluk = geceleme ÷ (yatak × gün); **gerçek** yatak sayısı (Pandora 38; Eylül %73,7) — bakanlıkta kayıtlı sayı (28) kullanılmaz, ayrı ayar yok | **kesin** (sahip bakanlıkla teyit etti; S-78, S-81, S-99) |
| K-30 | **2026 verisi taşınacak** (Faz 14 içe aktarma sihirbazı zorunlu; renkler ödeme durumuna eşlenir) | **kesin** (S-08) |
| K-31 | **Ücretsiz özel ağ = NetBird Cloud Free** (5 kullanıcı / 100 makine; ücretsiz planda ticari kullanım yasağı yok — "bireyler ve küçük ekipler"); ağın sahibi **otelin Gmail hesabı**, sahip kendi hesabıyla **davetli kullanıcı**; otel PC'de Windows servisi + kurulum anahtarı (setup key), oturum süresi dolması kapalı; telefonda NetBird uygulaması. Tailscale Personal "yalnız ticari olmayan kullanım" → varsayılan değil (sahip isterse çalışır); ZeroTier ücretsiz planı ticari değil → hayır; Cloudflare Zero Trust ücretsiz ama WARP 2025'te Türkiye'de engellendi → yedek seçenek. **Bismuth ağ programından bağımsızdır** (yalnız adres bilir). | **kesin** (S-82: "ücretsiz bir yol bul") — Faz 13 spike S-A NetBird ile |
| K-32 | **Yedek**: program klasörü + otelin Google Drive klasörü (Drive masaüstü uygulaması eşitler; Bismuth buluta bağlanmaz, dosya yazar); günlük; **30 gün** saklama, yeni gelince en eskisi silinir; zayıf PC için düşük öncelik, **parça parça** (ör. 4 MB bloklar arası bekleme), sessiz saat (varsayılan 04:00) + kapanışta; Drive kopyası şifreli (K-05) | **kesin** (S-42, S-62) |
| K-33 | **Odadaki kişiler** (`stay_occupants`, eski `reservation_guests` yerine): kişi başına ad, tanıtıcı not, geliş/ayrılış saati, KBS giriş/çıkış işareti (kim/ne zaman); kişi sayısı türetilir; işaretsiz kişi → takvim/Bugün/vardiya uyarısı; "Otelde kalanlar" ekranı | **kesin** (S-22, S-61; sahip: "yasal olarak çok önemli") |
| K-34 | **Görevler + vardiya devri + notlar**: `task_templates` (tekrar kuralı: saat, hafta günü, ay günü, her N konaklama) → `tasks`; bakım hatırlatıcıları bu yapıya taşınır (ayrı `maintenance_*` tabloları yok); `shift_definitions`, `shift_handovers` (otomatik özet anlık görüntüsü + elle not + okundu), `notes` (kişisel/pano) | **kesin** (sahip isteği, S-16, S-94) |
| K-35 | **Giderler**: hazır kategori yok; `description` serbest + normalize edilmiş anahtar (otomatik tamamlama ve "en çok harcama" gruplaması); görünürlük `expense_sections` (Genel / Yönetici; yeniden adlandırılabilir); tedarik = gider + `expense_items` (ürün satırları; ayrı `purchases` tablosu yok) | **kesin** (S-33, S-74) |
| K-36 | **KBS uyruk eşleme ve otelde kalanlar**: anahtar normalizasyonu (Türkçe büyük harf, aksan/noktalama), takma adlar (TR, KKTC, GKRY…), İngilizce + Türkçe ülke adları dizini, **harf hatalı yazımda tek en yakın aday → öneri + kullanıcı onayı**, belirsiz ("KIBRIS") ve hassas ("CYPRUS") değerler otomatik eşlenmez; onaylanan eşleme `country_map`'te kalıcı. Otelde kalanlar: Bismuth'ta aynı oda + giriş günü rezervasyonunun **planlı çıkışına** kadar, yoksa içe alma gününe kadar (işaretli, düzeltilebilir) | **kesin** (S-81, S-91; prototip: `prototypes/kbs-stats`, 15 test) |
| K-37 | **Açılış ekranı Takvim** (kullanıcı başına değiştirilebilir); Bugün ekranı menüde | **kesin** (S-11) |
| K-38 | **Personel yetkileri**: teslim alma (x) Sahip + Müdür; ek mesai saati yalnız Müdür/Sahip; çalışan kendi geliş/çıkış saatini girer (`work_records.start_time/end_time`); mesai, bayram ve prim oranlarını Sahip + Müdür belirler (Pandora: ek mesai ücreti kapalı); kasadan avans ayarı | **kesin** (S-30, S-34…S-39) |
| K-39 | **Kesintisiz faz yürütme**: Faz 5–16 ara onaysız; cevapsız soru = varsayılan; tek onay paketi en sonda | **kesin** (sahip, 2026-10-04) |
| K-40 | Kılavuz metni dil başına Markdown dosyalarında | varsayılan (2026-10-05) |
| K-41 | Bismuth anahtarının kâğıt biçimi 11×5 harf-rakam + QR | varsayılan (2026-10-05) |
| K-42 | Kısmi görünümde kasa ve personel ödemeleri (sahip bölümü kasadan ödenmez; maaş yetkisiz rolde gizli) | varsayılan (2026-10-05) |
| K-43 | Elle kur yalnız kur bulunamazsa; çapraz kur ana para üzerinden | varsayılan (2026-10-05) |
| K-44 | Aynı gün ayrılış = gündüz kullanımı; hafta sonu fiyat geceleri ayarı (Cuma + Cumartesi) | varsayılan (2026-10-05) |
| K-45 | Uzaktan erişim güvenlik varsayılanları (yerel ağ kapalı, uzaktan PIN yok, anahtar yalnız masaüstü, devralda anahtar) | varsayılan (2026-10-05) |
| K-46 | Son kontrol varsayılanları (takvim aralığı, misafir etiketleri, oda/tarih araması, tanıtıcı not, otel kuru, ay sonu işaretleri) | varsayılan (2026-10-05) |
| K-47 | Akış testi düzeltme varsayılanları (para yazımı, sınırlar, tek "bugün", yinelenen ad, kutu ayarları, gelmedi, vergi no) | varsayılan (2026-10-11) |
| K-48 | **Saatlik konaklama (gündüz kullanımı 2.0):** gündüz yuvası saat aralıklı (`start_time`/`end_time`); aynı odada aynı gün **sınırsız** saatlik satış, yalnız saat çakışması engel; temizlik arası `dayUse.turnoverMinutes` (varsayılan 60, uyarı); tutarı resepsiyon satış anında girer, oda tipi başına isteğe bağlı varsayılan saat ücreti (`room_types.hourly_price_minor`, kurulum sihirbazında ve ayarlarda); KBS'ye bildirilir; raporlara **dahil** + "konaklama türü" filtresi + aylık saatlik sayısı; aynı gün ikinci tur çıkışında gece yuvası boşalır (K-44 eki) | kesin (2026-11-13; sahip S-102…S-105) |
| K-49 | **Kamera ağ sınırı:** `src/main/camera/` beşinci izinli ağ klasörü; yalnız `127.0.0.1` (yan süreç), `rtsp://` (yerel kamera) ve yerel ağ keşfi (ONVIF/SADP, yalnız özel IP aralıkları) hedefleri | kesin (2026-11-13; varsayılan) |
| K-50 | **Telegram ayarlı istisna (G-07 ve yasak 14'e tek istisna):** kamera alarmı her zaman Bismuth bildirim merkezine düşer; `camera.telegram.enabled` açıksa (bot token ve sohbet kimliği `safeStorage` ile şifreli ayar) aynı alarm Bismuth tarafından `src/main/network/telegram/` üzerinden Telegram'a da gider; fotoğraf eki `camera.telegram.photo` ayarı (varsayılan açık, mevcut davranış; KVKK yurt dışı aktarım notu `06` §6.1 — sahibin kararı); 5 sn zaman aşımı, sessiz başarısızlık, kuyruk yok, `network.enabled=false` ile tamamen kapanır; Python yan süreç dış servise bağlanmaz | kesin (2026-11-13; sahip S-109) |
| K-51 | **Biyometrik veri saklama:** yüz vektörü/kırpma yalnız Bismuth DB'de AES-GCM şifreli (`safeStorage` anahtarı), yedek/dışa aktarma/kopya/kutu dışı; Python tarafı diske yazmaz; kanca `camera-data-guard` | kesin (2026-11-13; varsayılan) |
| K-52 | **Biyometrik veri silinir:** "veri silinmez" kuralının istisnası; çıkışta / `camera.faceRetentionDays` sonunda fiziksel silme + `audit_log`; alarm kırpması `camera.alertRetentionDays` (3 gün) | kesin (2026-11-13; varsayılan) |
| K-53 | **Kamera tek giriş:** kamera panelinde elle misafir girişi yok; ad/oda/tarih Bismuth'tan; yüz kaydı Kişiler sekmesinden (`enrolled_at`, `enrolled_by`; yazılı rıza alanı yok, bkz. K-58) | kesin (2026-11-13; sahip S-111) |
| K-54 | **Çoklu otel:** her otelin **kendi ana bilgisayarı ve kendi veritabanı** (2 otel, aynı şehir); oteller arası bağlantı mevcut uzaktan erişimle (NetBird + sunucu modu): sahip/istemci kayıtlı bağlantı listesinden otel seçer (P21b); sahip için portföy ekranı: iki otelin takvimi (otel seçerek ya da yan yana), gelir-gider, bugünkü doluluk, kasa (P21c); personel otel bazında; tek makinede birden çok profil (`userData/hotels/<kod>/`, P21a) isteğe bağlı; tek DB'de `hotel_id` reddedildi | kesin (2026-11-13; sahip S-114…S-117) |
| K-55 | **Vazgeçme ve iade akışı:** check-in sonrası iptal yerine "Vazgeçme ve iade" menüsü (aynı gün çıkış + iade / girişi geri al + iptal / erken çıkış); iptal ve çıkış pencereleri tahsilatı gösterir ve iade satırı ya da "İade bekliyor" parkı sunar; kapalı rezervasyonda üç nokta menüsü kalır; **resepsiyon iade girebilir** (`payments.refund` resepsiyonda varsayılan E, rol ayarından kapatılabilir; audit) | kesin (2026-11-13; sahip S-100) |
| K-56 | **Model ve çaba ataması (ajanlar):** tek kaynak ajan dosyası ön bilgisi; orkestra şefi Opus 5.5, kod yazan sonnet, tarama haiku, karar denetimi opus; Fable yalnız sahip isteğiyle (`docs/analiz/09-ajan-sistemi.md` §2) | kesin (2026-11-12, Fable) |
| K-57 | **Kamera modelleri korunur:** InsightFace `buffalo_s` (tanıma) + Ultralytics YOLO11n (kişi tespiti) + mevcut Python kodu kalır; sahip kendi otelinde kullanacak, satış planı yok. Lisans durumu `06-kamera-entegrasyonu.md` §6.3 (AGPL yalnız dağıtımda; model ağırlıkları "ticari olmayan araştırma" — risk sahibe bildirildi); Ultralytics `settings.sync=False` + çevrimdışı zorunlu; alternatif açık lisanslı model planı (YuNet + SFace) belge olarak hazır, satış gündeme gelirse uygulanır | kesin (2026-11-13; sahip S-110) |
| K-58 | **Aydınlatma yeterli, yazılı rıza yok:** sahibin avukat görüşü (S-111) kayda geçti; "Bu otelde kamera ile kayıt alınmaktadır" tabelası + program içinde üç dilde aydınlatma metni şablonu (kurulum sihirbazı ve Kamera sekmesi, yazdırılabilir); misafir yüz kaydı için rıza kutusu yok; saklama süreleri ve şifreleme (K-51, K-52) aynen; Fable'ın KVKK notu (biyometrik veri için açık rıza beklentisi) raporda "sahibin hukuki değerlendirmesi farklı" diye kalır | kesin (2026-11-13; sahip S-111) |
| K-59 | **Kamera kurulum sihirbazı:** otomatik alınabilenler (CPU, RAM, OS, çekirdek) kurulumda okunur ve performans profili (`camera.profile`: düşük/orta/yüksek → kare hızı, çözünürlük, algılama aralığı) seçilir; kamera elle: yerel ağ keşfi (ONVIF WS-Discovery + Hikvision SADP), IP/kullanıcı/şifre, Hikvision RTSP kalıbı (kullanıcı adı, şifre, IP, port 554, yol `/Streaming/Channels/<kanal>01`) önerilir, bağlantı ve görüntü testi, kanal/kamera sayısı; şifre `safeStorage` ile şifreli ayar | kesin (2026-11-13; sahip S-112) |
| K-60 | **21st.dev kullanımı:** sahibin ücretli üyeliği; MCP sunucusu `.mcp.json` (`x-api-key`, Codespaces secret `API_KEY_21ST`), `.claude/settings.json` `enabledMcpjsonServers`; seçilen tasarımlar `docs/analiz/12-21st-tasarim-secimi.md`; her alınan bileşen lisans + bağımlılık (CDN/font yok) + i18n + CSS değişkeni + mantıksal CSS dönüşümünden geçer, `ui-reviewer` onayı; uygulama Faz 17/18 paketlerinde | kesin (2026-11-13; sahip S-118) |

## K-01 · Electron vs Tauri
(v1 metni geçerli.) Ek: sunucu modu için Node tarafında Hono çalıştırmak Electron'da doğal; Tauri'de sidecar gerekirdi → Electron lehine bir neden daha.

## K-04 · Bayramlar (v2)
Sahibin itirazı: "10 yıl sonra kullanmaya başlayan 2 yıl görür." Çözüm: sabit tablo yerine **kural motoru** — `date-holidays` TR kuralları (sabit tarihler + Hicri hesap, tablo 2080'e kadar) ile takvimde görünen her yıl için otomatik üretim; Hicri ±1 gün kayması olabilir → kullanıcı düzeltmesi kalıcı. İnternet varsa yılda bir "çevrimiçi doğrula": aday kaynaklar Calendarific (anahtarlı, ücretsiz katman sınırlı), Google Takvim resmi tatil ICS akışı (anahtarsız), Nager.Date (dini bayram yok) — `04-arastirma/fx-uzaktan-erisim.md` Bölüm B'ye göre Faz 0'da seçilir. Program "nereye yazacağını bilir": `calendar_days.source=generated` satırlarını günceller, `user` satırlarına dokunmaz.

## K-06 · Kur (v2)
Sahip: resmi kur Türkiye'de piyasanın altında; Google/Bloomberg benzeri kur istiyor; internet kabul. Tasarım: `fx.mode` ile iki ana görünüm — **piyasa orta kur** (Google Finance'in gösterdiği bankalararası orta kur; anahtarsız kaynaklar: open.er-api.com, fawazahmed0 currency-api, ExchangeRate-API open; zincir) ve **TR serbest piyasa alış/satış** (döviz bürosu kurları; Truncgil/GenelPara gibi Türk JSON akışları — kullanım şartları Faz 0'da doğrulanır). Kullanıcı isterse **kendi API anahtarı** (currencylayer, Open Exchange Rates, currencyapi — ücretsiz katman günde birkaç yenilemeye yeter) girer. TCMB yalnızca karşılaştırma satırı. "Otel kuru" elle. Ayrıntı ve örnek JSON: `04-arastirma/fx-uzaktan-erisim.md`.

## K-12 · İşletim sistemi tabanı (v2)
Sahip: Mac M2 / macOS 26 (sorun yok); otel PC muhtemelen Windows 10; "bütün sürümler için hazır olalım". Electron 37.10.x macOS 11+ ve Windows 10+ destekler, Chromium 138 Tailwind v4 için yeterli; ürün dondurulduğu için "eski Chromium" kabul edilebilir. Faz 0: 37 ile derleme, better-sqlite3 ve Playwright uyumu, performans. Alternatif 44.x.

## K-19 · Çoklu cihaz ve uzaktan erişim
**Bağlam.** Resepsiyon otelde, sahip evde dizüstünden ve telefondan; aynı ağda değiller; bizim sunucumuz olmayacak; otel PC internetsiz çalışmalı; OTA/bulut yok.

**Seçenekler.**
1. **Sunucu modu + özel ağ (önerilen):** otel PC'de Bismuth gömülü HTTP sunucusu; sahibin cihazları Tailscale gibi bir özel ağ uygulamasıyla (GUI, ücretsiz kişisel plan, Google ile giriş) o PC'ye şifreli bağlanır; telefon tarayıcıdan. Veri otelde kalır; bizim sunucumuz yok; çakışma yok (tek yazıcı). Zayıf yan: otel PC kapalıysa erişim yok; üçüncü taraf uygulama kurulumu.
2. **Bulut veritabanı / senkron (Turso, PowerSync, Supabase vb.):** iki yönlü çevrimdışı yazma ve çakışma yönetimi gerekir; ücretsiz katmanlar yıllar içinde değişir/kapanır; "bitmiş ürün" ile çelişir. Reddedildi.
3. **Port yönlendirme + dinamik DNS:** oteli internete açmak güvensiz ve kurulumu teknik. Reddedildi.
4. **Drive klasörüyle dosya senkronu:** WAL'lı SQLite'ı iki cihazda açmak veri bozar. Yalnızca **salt‑okunur rapor görüntüsü** olarak yedek yol (G-145).

**Seçim.** 1 + 4. Ayrıntı `03-mimari.md` §11. Faz 0: Tailscale'in güncel ücretsiz plan sınırları, kurulum deneyimi ve Electron içinden adres algılama doğrulanır; alternatif (ZeroTier) not edilir.

**Kesin karar (2026-10-02, Faz 0 sonu).** Sahip: "uzaktan erişimi tam anlamadım ama profesyonelliğine güveniyorum; otelin ayrı Gmail'i var; Tailscale'e para ödemek istemiyorum, ücretsiz yol bul"; yedekler "program klasörü ve otel Gmail Drive'ı". Buna göre **C2** (`04-arastirma/uzaktan-bulut-secenekleri.md` §6.1 ve §11):
1. **Asıl defter otel PC'de** (tek yazıcı) — çakışma imkânsız, internet kesikken resepsiyon çalışır.
2. **Mac'te tam yedek kopya** (salt‑okunur, dakikalar içinde güncel) — iki kanaldan beslenir: canlı (özel ağ) ve **otelin Google Drive'ındaki şifreli kutu** (özel ağ engellense bile).
3. **Drive**: otel Gmail'inin Drive'ı; otel PC'de Drive masaüstü uygulaması; Mac'te sahip bu klasöre kendi Google hesabıyla (paylaşılan klasör) ya da Drive uygulamasına ikinci hesap ekleyerek erişir. Aynı klasörde **şifreli yedekler** (30 gün) ve kişisel veri içermeyen **PDF özet** (telefondan Drive uygulamasıyla görülebilir).
4. **Canlı erişim + telefon**: NetBird Free (K-31) — ücretsiz, ticari kullanım yasağı yok; otel Gmail'i sahibi, sahip davetli.
5. **Devral**: otel PC tamamen bozulursa Mac/yeni PC ana bilgisayar olur (epoch).
6. ~~Kat görevlisi telefonu~~ — S-97: sahip WhatsApp grubundan memnun; yapılmaz (Ö-19 reddedildi).
Supabase ve diğer "bulut ana kaynak" seçenekleri reddedildi (çevrimdışı çakışma, ücretsiz plan durdurma, KVKK).

## K-24 · Turizm istatistiği
KBS Excel'i (`EGM_Konaklayan_Listesi`) yapısı `02-excel-analizi.md` §2.4.2'de. Kimlik/ad sütunları içe alınmaz. Uyruk ham adı → `country_map` (ISO2 + bakanlık Türkçe adı) tohum tablosu (~250 ülke, KBS'nin İngilizce/parantezli yazımları dahil); eşleşmeyen → kullanıcıya sor. Çıktı tablosu bakanlık paneli sırasıyla (Ülke · Toplam Giriş · Toplam Geceleme) + kopyala. Aynı gün = 1 gece (sahip bakanlıkla teyit etti). Türkler dahil.

## K-48…K-56 · Analiz turu taslakları (2026-11-12)

Gerekçeler ve ayrıntılar `docs/analiz/` altında: K-48 ve K-55 → `03-resepsiyon-geri-bildirimi.md`; K-49…K-53 →
`06-kamera-entegrasyonu.md` §5–6; K-54 → `10-coklu-otel.md`; K-56 → `09-ajan-sistemi.md`. Taslaklar sahibin
`00-ozet.md`'deki soruları cevaplamasıyla kesinleşir; cevap gelmezse Opus varsayılanla uygular ve satırı
"varsayılan (tarih)" yapar (K-39).

## Sahip cevapları (2026-11-12, 7. tur — analiz turu soruları S-100…S-119)

> Kaynak: sahibin ayrı sohbette verdiği cevaplar (`docs/sahip-cevaplari-2026-11-12.md`, `claude/wizardly-feynman-0t0ywb`
> dalı; Fable 2026-11-13'te işledi). "Varsayılan" = sahip varsayılanı seçti. S-119 cevapsız → varsayılan.

| Soru | Cevap | Etki |
|---|---|---|
| S-100 | "Resepsiyon iade girebilir." | K-55 kesin: `payments.refund` resepsiyonda **E** (rol ayarından kapatılabilir); her iade `audit_log`; tutar tahsilatı aşamaz. "İade bekliyor" parkı yetkisiz kullanıcı için kalır. P17a |
| S-101 | (a) | Grup rezervasyonu: oda başına misafir adı, oda başına ya da toplu işlem, toplu giriş. Zincir simgesi (b) yapılmaz. P17b |
| S-102 | "Saatlik. Fiyatı resepsiyon belirlesin. Kurulumda da sorulabilir." | K-48 kesin: gündüz = **saatlik konaklama**; tutarı resepsiyon satış anında girer; kurulum sihirbazı ve ayarlarda oda tipi başına isteğe bağlı varsayılan saat ücreti (`room_types.hourly_price_minor`). P17d |
| S-103 | "Sınırsız." | `dayUse.maxPerRoomPerDay` kalkar: aynı odada aynı gün sınırsız saatlik satış; yalnız saat çakışması engel; temizlik arası `dayUse.turnoverMinutes` ayarlı, varsayılan uyarı. P17d |
| S-104 | "Evet, bildirilir." | Saatlik misafir KBS listesine girer (`dayUse.kbsReport` ayarı yok, her zaman). P17d |
| S-105 | "Dahil edilsin, sadece filtreleme yapılabilsin; aylık kaç tane saatlik satılmış görebilmiş oluruz." | Saatlik gelir ve doluluk raporlara **dahil**; raporlarda "konaklama türü: gecelik / saatlik" filtresi + aylık saatlik satış sayısı; `dayUse.countsInOccupancy` ayarı kalkar (hep dahil). P17d |
| S-106 | varsayılan | Tek hesap (grup lideri); oda başına hesap seçeneği ayar. P17b |
| S-107 | varsayılan | Personel dışlama listesi; personel yüz tanımaya girmez. P20e |
| S-108 | "Canlı görüntü yalnızca otel bilgisayarında; telefonda sadece alarm listesi." | Canlı yayın yalnız ana bilgisayar; telefon/Mac alarm listesi. P20b |
| S-109 | "Telegram'da da olsun, programda da." | **K-50 değişti:** Telegram kalır, ayarlı (`camera.telegram.*`); kod Bismuth tarafında izinli ağ klasöründe `src/main/network/telegram/`; 5 sn zaman aşımı, sessiz başarısızlık, `network.enabled=false` ile kapanır; internet yokken alarm programda görünür. G-07 istisnası K-50'de. P20a |
| S-110 | "Mevcut sistemin ticariye uygun olduğunu biliyorum… Test ettim, çok iyi çalışıyor; değiştirmek istemiyorum. Kendi otelimde kişisel olarak kullanacağım, şimdilik satmayı düşünmüyorum." | **K-57 (yeni):** InsightFace `buffalo_s` + YOLO11n **korunur**; lisans yeniden araştırıldı (`06-kamera-entegrasyonu.md` §6.3): AGPL yalnız dağıtımda tetiklenir, kendi otelinde kullanım dağıtım değildir; InsightFace model ağırlıkları "yalnız ticari olmayan araştırma" — otelde güvenlik amaçlı kullanım bu tanımın dışında, risk sahibe yazıldı. Satış gündeme gelirse alternatif model planı (eski P20d) hazır, şimdi yapılmaz. Ultralytics telemetrisi kapatılır. |
| S-111 | "Yazılı onay gerekmiyor. Otelde 'bu otelde kamera ile kayıt alınmaktadır' gibi bir yazı yeterli. Avukatla görüştüm." | **K-58 (yeni):** sahibin hukuki değerlendirmesi kayda geçti: aydınlatma tabelası yeterli; yazılı rıza akışı yok; program kurulumda ve Kamera sekmesinde aydınlatma metni şablonu sunar; yüz verisi şifreli, yerel, saklama süreli. K-53'teki `consent_at` kalkar. P20c/P20e |
| S-112 | "Bilgisayar bilgileri… kurulumda otomatik alınsın. Kamera gibi elle girilmesi gerekenleri kurulum sorsun. Kameranın markasını bilmiyorum ama Hik-Connect uygulamasıyla bağlanıyorum." | **K-59 (yeni):** Kamera kurulum sihirbazı (P20g): Hikvision (Hik-Connect) varsayımı; yerel ağda keşif (ONVIF WS-Discovery + Hikvision SADP benzeri), IP/kullanıcı/şifre, Hikvision RTSP kalıbı (kullanıcı adı, şifre, IP, port 554, yol `/Streaming/Channels/<kanal>01`), görüntü testi, kanal sayısı; CPU/RAM/OS otomatik okunur → performans profili; şifre `safeStorage` ile şifreli. |
| S-113 | varsayılan | Kullanıcı başına kurulum (bugünkü). P19b belgede uyarı |
| S-114 | "Aynı şehirde, 2 otel, farklı adres." | K-54 kesin |
| S-115 | "Her otelin kendi bilgisayarı ana bilgisayar olur. Fakat birbirlerine bağlanabilirler." | K-54 kesin: her otel kendi ana bilgisayarında kendi veritabanıyla; oteller arası bağlantı mevcut uzaktan erişim (NetBird + sunucu modu, K-19/K-31) ile: sahip bir otelden diğerine istemci olarak bağlanır. P21b öne alındı; tek makinede çoklu profil (P21a) isteğe bağlı |
| S-116 | "Takvim, gelir-gider sekmesi, bugünkü doluluk, kasa." | P21c portföy: iki otelin takvimi (otel seçerek ya da yan yana), gelir-gider, bugünkü doluluk, kasa |
| S-117 | "Aynı personel iki otelde çalışmıyor." | Personel otel bazında; ortak bordro yok |
| S-118 | "Ücretli üyeliğim var, kullanalım; bolca hakkım var… 'Apps' sekmesi geldi… Opus ya da Fable kendisi seçebilir… direkt alsın." | **K-60 (yeni):** 21st.dev kullanılır; seçimler `docs/analiz/12-21st-tasarim-secimi.md`; anahtar Codespaces secret `API_KEY_21ST`; uygulama Opus (Faz 17/18 paketlerine bağlı) |
| S-119 | cevapsız | varsayılan: hafta sonu ayrımı bilinçli; K-44 detayına not (P19b) |

Yeni yönergeler (aynı dosya §B): Rust'a geçiş araştırması → `docs/analiz/11-rust-gecisi.md` (K-62 önerisi); Ponytail becerisi
→ K-61; 21st.dev → K-60.

## Sahip cevapları (2026-10-04, altıncı tur — çalışma düzeni)

| Soru | Cevap | Etki |
|---|---|---|
| Faz 4, 1. tur | 30/33 ekran onaylandı; para birimi ekleme, satış kanalları (e-posta, Otelz.com ↔ Hotels.com, bavul emaneti siteleri), görev önerileri + kendi görevi istendi | Yapıldı (`taslak-onay/2026-10-04-faz4.md`) |
| — | **Fazlar arasında onay istenmeyecek; Faz 5–16 tek seferde, durmadan yapılacak.** Bütün fazlar bitince, çok ayrıntılı kontrol (hata, mantık hatası, karar çelişkisi, çalışmayan düğme/form) yapıldıktan sonra **hepsinin son hâli tek seferde** onaya sunulacak | K-39 |
| — | Hız için ajan, beceri, kanca artırılacak; token tasarrufu için ajan azaltılmayacak; ajanların modeli ve çabası iş türüne göre ayarlanacak; profesyonellikten ödün yok | K-39 |
| — | Çalışma cloud'da devam edecek | — |

**K-39 · Kesintisiz faz yürütme (2026-10-04).** Faz 5–16 sahibin ara onayı olmadan yürütülür. Fazların "Sorular"
satırındaki ve `05-sorular.md`'deki cevapsız sorularda varsayılan uygulanır ve "(varsayılan)" diye işaretlenir; sahibe
yalnız gerçek bir engel (yasa, gerçek cihaz, hesap açma gibi yalnız sahibin yapabileceği işler) sorulur ve bunlar da
sona bırakılır. Ekran onayları (Faz 4'ün 2. turu dahil) ve gerçek cihaz denemeleri (S-80, Faz 13 spike'ları, Faz 15/16
"gerçek deneme" maddeleri) en sondaki tek onay paketinde toplanır. İş, ortak altyapı ana oturumda, modüller paralel
`feature-builder` ajanlarıyla yürütülür (`docs/plan/fazlar/YURUTME.md`); her faz kod + test + kabul ölçütleri + Sonuç ile
kapanır; sonda modül başına hata avı, akış testi, karar denetimi, güvenlik/veritabanı/arayüz/metin incelemeleri.

**K-40 · Kılavuz metni Markdown dosyalarında (2026-10-05).** Program içi kılavuz (G-18) uzun düzyazı olduğu için i18n
json'a değil, dil başına Markdown dosyalarına yazılır (`src/renderer/guide/content/{tr,en,ru}/`). Bu, yasak 8'in ("metin
koda gömülmez") ruhuna uyar: metin kodda değil, dile göre ayrılmış içerik dosyasındadır. Üç dilde aynı bölüm ve çapa
kümesi testle zorlanır; Markdown'ı yeni bağımlılık olmadan kendi küçük işleyicimiz React öğelerine çevirir (HTML
enjeksiyonu yok); kılavuz arayüzünün kısa metinleri yine i18n anahtarıdır. `docs/kullanim-kilavuzu.md` Türkçe içerikten
betikle üretilir (Faz 16 madde 7: "program içi yardımla aynı içerik").

**K-41 · Bismuth anahtarının kâğıt biçimi: 11×5 harf-rakam + QR (2026-10-05, varsayılan; K-05'in biçim kısmını
değiştirir).** K-05 "QR + 24 kelime" diyordu. 24 kelimelik standart listelerin (BIP39) Türkçesi yok; İngilizce
kelimeler Türkçe konuşan biri için yazım hatasına açık. Faz 14'te yazılan biçim korunur: 256 bit anahtar + sağlama
baytı, karışan harfleri (O/0, I/1) içermeyen Crockford base32 ile **11 grup × 5 karakter** (`7KQ2M-…`); yanlış harf
girilince program fark eder. Yanına aynı anahtarın **QR kodu** basılır (Mac ve yeni bilgisayarda kamerayla ya da
yazarak girilir). Şifreleme (AES-256-GCM, cihazda `safeStorage`) değişmez. Sahip onay paketinde sorulacak.

**K-42 · Kısmi görünümde kasa ve personel ödemeleri (2026-10-05, varsayılan; erken hata avı B2, B5, B9, N1).**
(1) Yönetici (gizli) bölümündeki gider **kasadan ödenemez**; sahip kasadaki parayı "teslim al" ile alıp kullanır. Böylece
kasa her rolde fiziksel kasayla tutar ve gizli gider hiçbir toplamdan sızmaz (Faz 7 kabulü korunur). (2) `staff.salary`
yetkisi olmayan rol, kasadan **olmayan** personel ödemelerini (maaş, izin parası, havale avans) görmez: listede,
toplamda, dışa aktarımda yok; ekranda "kısmi görünüm" rozeti. Kasadan yapılan personel ödemesi (avans ya da nakit
maaş) bir kasa hareketi olduğu için kasayı görebilen herkese görünür. (3) Vardiya devrindeki kasa tutarı, okuyanın
görebildiği satırlardan yeniden hesaplanır.

**K-43 · Ödemede elle kur (2026-10-05, varsayılan; erken hata avı B1, B4, B11, B12, B24).** Elle kur her ekranda
"1 birim ödeme para birimi = kaç ana para birimi" demektir ve **yalnız** kayıt anında piyasa/otel kuru bulunamazsa
kullanılır (giderlerdeki gibi). Folyo başka para birimindeyse tutar ana para birimi üzerinden çapraz hesaplanır
(USD → TRY → EUR); kurlar biliniyorsa elle kur istenmez. Aynı ödeme rezervasyon bakiyesinde, defterde ve raporda aynı
ana para tutarını gösterir.
İnternet yokken folyo da ana para biriminden farklıysa ikinci bir elle kur istenir: "1 folyo birimi = kaç ana para
birimi" (P7fix, `manualFolioRateMicro`); iki alan da aynı biçimde sorar.

**K-44 · Aynı gün ayrılış ve hafta sonu fiyat geceleri (2026-10-05, varsayılan; erken hata avı takvim #2, #21).**
(1) Giriş yapan misafir aynı gün ayrılırsa konaklama o günün **gündüz kullanımına** dönüşür (çıkış = giriş günü);
ilk gecenin ücreti gündüz kullanımı ücreti olarak kalır (kullanıcı çıkış penceresinde değiştirebilir), sonraki
geceler ve masrafları iptal edilir, oda bu gece yeniden satılabilir. Çıkış penceresi "N gece boşalacak" der.
(2) Önerilen fiyattaki "hafta sonu gecesi" takvimin vurgu günleri ayarından ayrılır: yeni ayar `pricing.weekendNights`,
varsayılan **Cuma ve Cumartesi geceleri**. Takvim vurgusu (S-24) değişmez.

**K-45 · Uzaktan erişimin güvenlik varsayılanları (2026-10-05, varsayılan; Faz 13 güvenlik incelemesi).**
(1) Sunucu modu varsayılan olarak yalnız **bu bilgisayarı ve özel ağı (NetBird/Tailscale)** dinler; otelin yerel ağını
(Wi‑Fi/kablo) dinlemek Ayarlar → Uzaktan erişim'de açılabilir ve açarken "misafir Wi‑Fi'ı ayrı olmalı" uyarısı çıkar
(yerel ağda trafik şifresiz HTTP'dir; NetBird otel içinde de doğrudan bağlanır). İstemci ilk bağlandığı ana
bilgisayarın kimliğini sabitler, kimlik değişirse uyarır. (2) Uzaktan (HTTP) giriş yalnız kullanıcı adı + şifreyle;
PIN yalnız otel bilgisayarının kendi penceresinde (Faz 4 notu). Uzaktan yanlış şifreler yalnız uzaktan girişi
kilitler. (3) Bismuth anahtarını gösterme, girme, değiştirme ve anahtarlı geri yükleme yalnız otel bilgisayarının
kendi penceresinde; Drive klasörü yalnız klasör seçiciyle. (4) Devralırken kâğıttaki Bismuth anahtarı yeniden
yazılır (sahiplik kanıtı). Sahip onay paketinde sorulacak.

**K-46 · Son kontrol turunun varsayılanları (2026-10-05, varsayılan; gereksinim izleme + karar denetimi).**
(1) Takvim aralığı (G-31): geçmişte `calendar.startYear` ayarı ile en eski konaklamanın yılından hangisi erkense oradan
başlar (ikisi de yoksa geçen yıl); ileride bugünden 10 yıl ile en ileri kaydın yılı + 1'den hangisi sonraysa; "Tarihe
git" ve arama bu aralıkta kıstırmasız. (2) Misafir etiketleri (G-50): Ayarlar → Listeler'de yönetilen liste; kartta
çoklu seçim, misafir listesinde süzgeç. (3) Arama (G-190): misafir listesinde oda ve "şu tarihlerde kalmış" süzgeci;
takvim aramasında oda numarası. (4) Tanıtıcı not dışa aktarılmaz (03-mimari §4.9 değişmez 13; G-122 "tüm tablolar"
tabloları kapsar, bu sütun hariç). (5) Otel kuru girilmiş ve "misafire bu kurdan söyle" açıkken yeni kayıtlar otel
kuruyla donar (Faz 11 davranışı; K-06 zincirinde otel kuru yedek olarak geçiyordu — onay paketinde sorulur).
(6) Ay sonu "baktım" işaretleri kişi tercihi olarak ana bilgisayarda (Mac'ten bakan sahip aynı işaretleri görür).
(7) Türkiye'ye özgü yasal görev önerileri yalnız otelin ülkesi Türkiye iken. (8) Gündüz kullanımı "her N konaklamada"
görev sayacında konaklama sayılır (şablon kuralında `countDayUse`, varsayılan evet; ekranda ayrı ayar yok). (9) K-25'teki "elle silme her zaman" çözülmüş arıza fotoğrafı içindir
(G-180); başka ek elle silinmez. (10) Program klasöründeki yerel yedek düz kalır (K-05'teki "isteğe bağlı şifreli" ayarı
eklenmedi: veritabanının kendisi de şifresiz, yerel yedek hızlı geri yükleme içindir; Drive kopyası her zaman şifreli).

**K-47 · Akış testi düzeltmelerinin varsayılanları (2026-10-11, varsayılan; akış testleri A–D + arayüz incelemesi).**
(1) Para yazımı: yerel ondalık işareti (tr ","); öteki işaret tek başına ve ardından 3'ten farklı hane geliyorsa ondalık
sayılır ("1250.5" = 1.250,50; "1.250" = 1.250,00); tr'de "1,250.50" hata. Miktar alanları aynı kural. (2) Tek tutar en
çok 1.000.000.000,00; bakiyeyi ya da kalan maaşı aşan ödeme/avans onay ister. (3) Çalışan kendi saatini bugün ve
`staff.ownHoursBackDays` (varsayılan 7) gün geriye yazar; Müdür/Sahip sınırsız. (4) Programın tek "bugün"ü otel saat
dilimidir (`hotel.timezone`); turizm/ay sonu "kalan gün" son güne kalan tam gün (0 = bugün son gün). (5) Yinelenen ad
(liste satırı, oda tipi, rol, kullanıcı adı) Türkçe harf katlamasıyla reddedilir; var olan yinelenmiş kayıtlar
değişmez. (6) Kutu (Drive) ayarları yalnız ana bilgisayarda değişir; telefonda salt okunur. İstemci, şifre ya da
oturum göndermeden önce ana bilgisayar kimliğini yeniden doğrular (K-45). (7) Varış gününden önce "Gelmedi"
yapılamaz; geçmiş tarihli girişte uyarı (engel yok). (8) Kara listede "Engelle" düzeyi Resepsiyona "yine de kaydet"
sunmaz (yalnız Sahip/Müdür). (9) Firma: VKN 10 hane, TCKN algoritma, IBAN mod-97; aynı ünvan uyarır. (10) KBS'de
çıkışı girişten önce olan satır geceye katılmaz, "hatalı tarih" olarak ayrı listelenir. (11) Çökmede 5 dakikada en çok
3 otomatik yeniden yükleme, sonra soru; sürükle-bırak taşımada her gece kendi fiyatıyla taşınır.

## Sahip cevapları (2026-10-02, beşinci tur)

| Soru | Cevap | Etki |
|---|---|---|
| S-80 | Otel bilgisayarında deneme şu an yapılamıyor (sahip otelde değil) | Bekliyor; Faz 1 paketiyle denenebilir, Faz 1'i engellemez |
| S-97 | Kat görevlisi için telefon gerekmez: **WhatsApp grubundan memnun** | Ö-19 reddedildi; Faz 13'ten çıkarıldı |
| S-99 | "Bakanlıkta yazan yatak sayısıyla işimiz yok": bakanlıkta 28, gerçekte **38** | K-29: gerçek yatak sayısı; `stats.ministryBeds` ayarı yok |
| — | **"Faz 1'i uygula"** | Faz 1 başladı |

## Sahip cevapları (2026-10-02, dördüncü tur — `05-sorular.md`'nin tamamı)

> Sahip `05-sorular.md`'deki açık soruları sırayla 1–46 numarayla cevapladı; ayrıca Faz 0 raporundaki 7 soruyu cevapladı ve günlük
> akışını anlattı (`akislar.md`). Eşleme: 1–18 → S-10…S-75 (Faz 3–6 tablosu), 19–29 → S-30…S-76, 30–38 → S-40…S-43, 39–43 → S-92…S-96,
> 44–46 → S-51, S-52, S-77. Sahip S-35'i S-34 ile birlikte cevapladı ("oranı sahip ve müdür belirler").

| Soru | Cevap | Etki |
|---|---|---|
| S-80 | Prototip **Mac'te açıldı** (ekran görüntüsü: Electron 37.10.3, macOS 26.5/Darwin 25.5.0, arm64, açılış 427 ms, 10.000 satır 17 ms, tüm denetimler ✓) | K-12; otel PC (Windows) denemesi bekleniyor |
| S-79 | "Uzaktan erişimi tam anlamadım ama profesyonelliğine güveniyorum" | K-19 kesin (C2) |
| S-83 | Otelin **ayrı Gmail'i zaten var** | K-19, K-31, G-142 |
| S-82 | Tailscale'e **para ödemek istemiyor**; ücretsiz yol | K-31 (NetBird Free) |
| S-84…S-89 | (cevap yok — "güveniyorum") | varsayılan: Mac'te tam kopya (FileVault açılması önerilir), kutu = otelin Google Drive'ı, kış kapanışı yok, devral var, telefona NetBird uygulaması, kimlik no kutu paketlerine konmaz (şifreli tam yedeklerde var) |
| S-78 | **19 oda, 38 yatak** | G-12, K-29 (Eylül %73,7); panelin %0,24'ü 28 yatağa denk → S-99 |
| S-81 | KBS'den seçilen tarih aralığının Excel'i alınıyor; "kurumlar arası iletişimi böyle yapmışlar, değiştiremeyiz; **sonraki aya sarkabilir**, kurumlar böyle kabul etmiş" | K-29, K-36: tüm geceler giriş ayına; otelde kalanlar planlı çıkışa kadar |
| S-90 | "Biraz **görselleştirerek** göster; yağmurlu bulut simgesi vs." | K-13: Yr simgeleri, haftalık, mm |
| S-91 | Panelde açılır liste yok, **yazdıkça geliyor**; listeyi biz ayarlayalım. KBS'de bazen **Türkiye ve Kuzey Kıbrıs yazım hataları** olur (son zamanlarda görmüyor) — önlem alınsın | K-36 (bulanık eşleme + onay; Eylül dosyasında "KUZEY KIBRIS TURK" örneği) |
| — | Günlük akış anlatıldı (09:00 gündüz resepsiyon … 21:00 gece devri; ay sonu kontrolleri); 2 resepsiyon × 12 saat Pandora'ya özel | `akislar.md`; G-09, G-95 |
| — | **Yeni istek:** Görevler sekmesi; gece/gündüz resepsiyonlarının birbirine ve kendilerine not yazabildiği sekme | G-94, G-95, K-34 |
| S-10 | Kapora/kısmen ödendi için **ayrı renk** olabilir | G-32 |
| S-11 | Açılış ekranı **Takvim** | G-47, K-37 |
| S-12 | Gün kapatma **olsun** (kendisi az kullanır, diğer oteller çok) | G-72 |
| S-13 | "Denetim kaydı ne demek anlamadım" | Açıklandı ("kara kutu"); varsayılan: var, yalnız Sahip görür → G-24 |
| S-14 | Çıkışta otomatik **kirli** | G-90 |
| S-15 | Misafir kartında **kimlik yeterli** | G-50 (doğum/anne‑baba adı yok) |
| S-16 | Vardiya teslim notu **olsun** | G-95 |
| S-17 | Kayıp eşya: "güzel fikir, az kullanılır ama olsun" | G-55 |
| S-18 | **VIP işareti** olsun | G-50, G-34 |
| S-19 | Hava durumu olsun, **haftalık** gösterim | G-113 |
| S-20 | Oda tipine göre varsayılan fiyat / hafta sonu farkı **olsun** | G-48 |
| S-21 | Makbuz yazdırma **olmasın** | §O |
| S-22 | Kişi sayısı isteğe bağlı; **yanındaki kişinin adı ve not** ("kızıl saçlı") yazılabilsin; KBS'de odaya giren herkes bildirilmeli — **yasal olarak çok önemli** | G-54, G-53, K-33 |
| S-23 | Hücrede **isim + fiyat** yeterli | G-34 |
| S-24 | **Cumartesi‑pazar**; TR bayramları; kullanıcı istediği günü özel gün yapar | G-40 |
| S-25 | Day‑use: sadece tür + renk | G-37 |
| S-72 | Firma bilgisine **IBAN** de eklensin | G-191 |
| S-75 | Sürekli istek notu **iki seviyeli** | G-192 |
| S-30 | Teslim alma (x): **Sahip + Müdür** | G-64, K-38 |
| S-31 | Banka kontrolü: **aynı x** | G-64 (G-65 kaldırıldı) |
| S-32 | Kur: işlem günü, **yazıldığı dakika**; değişirse değiştirildiği an | G-70, G-112, K-15 |
| S-33 | Gider kategorileri listesi **gerek yok** | G-66, K-35 |
| S-34, S-35 | Mesai ücretini işletmeler belirler; Pandora'da **ek mesai ücreti yok**; oranı **Sahip ve Müdür** belirler | G-84, G-85, K-38 |
| S-36 | Prim tabanını Sahip ve Müdür belirler | G-86 |
| S-37 | İzin **devretmez, ödenir** | G-82 |
| S-38 | Çalışanlar **kasadan avans** alabilir (Pandora; her otelde değil) | G-69, G-87 (ayar) |
| S-39 | Ek mesaiyi **yalnız Müdür** yazar; normal mesaide çalışan kendi **geliş/çıkış saatini** yazabilir | G-84, K-38 |
| S-64 | Arızaya **fotoğraf** eklensin; giderilince silinebilir; eski kayıtlar uzun tutulmasın, yedek büyümesin | G-180, K-25 |
| S-76 | Maliyet alanı **gerekmez** (deftere zaten yazılıyor) | G-180 |
| S-40 | Rapor önceliği: **ciro, kâr, gider, doluluk, ödeme yöntemi, kanal** | G-102 |
| S-41 | **Altın gerekmez** | G-110 |
| S-61 | "KBS bağlantın yoksa uyarıyı nasıl yaparsın? KBS API alamam; **manuel** olabilir" | G-53 (elle işaret; bağlantı gerekmez) |
| S-73 | Çamaşırhane ve ürün listesini **büyüt**, **temizlik ürünleri** dahil | G-170, G-171 |
| S-74 | **Önce gidere yazılır**; defter eski sistemi gibi olsun, daha temiz arayüz, Excel sınırları aşılsın | G-71, G-62, K-35 |
| S-63 | Su stok sayacı gerekmez; isteğe bağlı açılır | G-170 |
| S-62 | Drive'a rapor kopyası: **var, kapatılabilir** | G-145 |
| S-42 | Yedek: **program klasörü + otel Gmail Drive**; 30 gün; yeni gelince eskisi silinsin; **yavaş, parça parça** (PC zayıf) | G-120, K-32 |
| S-43 | Excel dışa aktarma: **hepsi** | G-122 |
| S-92 | KBS ek alanları (anne/baba adı, doğum yeri): **kesinlikle hayır** | G-50, §O |
| S-93 | KBS toplu dosya: **hayır**, KBS girişi anında yapılır | G-53, §O |
| S-94 | "Her N konaklamada" hatırlatıcı: **10 konaklamada bir** olabilir | G-91 |
| S-95 | Çamaşırhanede eksik takibi: zor ama **giden ve gelen** olarak yapılabilir | G-171, K-28 |
| S-96 | Kat planı görünümü: **evet** | G-90 |
| S-51 | Klavye kısayolları: **evet** | G-19 |
| S-52 | Kılavuz: evet; **ayarlardan her zaman** açılsın; **çok detaylı, basit kelimeler**, teknik kelime yok | G-18 |
| S-77 | Rusça kontrolü: sahip Rusça biliyor, **bizim kontrolümüz yeterli** | G-08 |

## Sahip cevapları (2026-10-01, üçüncü tur)

| Soru | Cevap | Etki |
|---|---|---|
| S-65 | Tailscale'i başka proje için kurmuştu, Mac'te olup olmadığını bilmiyor; otel PC'de yok; **aynı Google hesabını istemiyor** | K-19 yeniden açık; ayrı hesap/davet seçeneği araştırılır |
| S-71 | Otel PC hep açık **ama ağır programlarda çökebiliyor**; ücretsiz sunucu (Supabase gibi) araştırılsın | K-19; bulut seçenekleri Faz 0'da |
| S-66 | Telefon ekran listesi "gayet iyi" | G-143 kapsamı kesin |
| S-69 | Arapça **şimdilik yok** (RTL zor) | K-20 iptal, G-08 TR/EN/RU |
| S-68 | Piyasa **orta kur** yeterli; döviz bürosu görünümü gerekmez | K-06 |
| S-70 | Hazır roller gelsin; kullanıcı ekler/çıkarır | G-20 |
| S-08 | 2026 verisi **taşınsın** | K-30, G-123 zorunlu |
| S-60 | Çocuk ayrı giriş değil; doluluk bakanlıkta oda + yatak sayısıyla; 2 Ekim'de çıkan da Eylül'e (giriş ayı); oda/yatak ilk açılışta sorulsun, ayarlardan değişsin | K-27, K-29, G-12, G-150 |
| S-67 | Türler: çarşaf, alez, yorgan kılıfı, yastık kılıfı, büyük/küçük havlu, yastık, yorgan, pike, fon perde, tül perde…; fişte genelde fiyat yok (zam kolay olsun diye), birim fiyat anlaşmada; bazıları yazar; program sadece toplar, aylık toplam sunar. Örnek fişte "Lekeli" sütunu var | K-28, G-171 |
| — | Hava durumu planda görünmüyordu → zorunlu ve görünür yapıldı | G-113, K-13 |
| — | "Repo konusu çok önemli; çok derin repo araştırması" | Faz 0 A0.12 (dört araştırma kolu) |

## Sahip cevapları (2026-10-01, ikinci tur)

| Soru | Cevap | Etki |
|---|---|---|
| S-01 | Resepsiyon ayrı bilgisayarda, sahip ayrı bilgisayarda, farklı mekânlarda; telefondan da görmek istiyor | K-19, G-140…G-146, Faz 13 |
| S-02 | Aynı ağda değil; sahip evden dizüstüyle; bazen dizüstünü otele götürüyor | K-19 (özel ağ + yerel ağ keşfi) |
| S-03 | Otel PC bilinmiyor (muhtemelen Windows 10); sahip Mac M2 / macOS 26.5.2; "bütün sürümler için hazır olalım" | K-12 (Electron 37) |
| S-04 | Ücretsiz (imzasız) kurulum | K-07 kesin |
| S-05 | Program adı: **Bismuth** | K-22 |
| S-06 | TR, EN, RU, AR ilk sürümde, ayarlardan | K-17, K-20, G-08 |
| S-07 | Varsayılan tam sayı, ayarla kuruşlu; tema açık/koyu/sistem | K-15, K-26, G-17 |
| S-08 | (cevapsız) | varsayılan: sıfırdan; içe aktarma isteğe bağlı |
| S-09 | Sahip rolleri kendisi tanımlar, select ile seçer | K-23, G-20/21 |
| — | Kur TCMB değil piyasa; internet olabilir | K-06 |
| — | Bayram 10 yılla sınırlı olmasın; fikir istendi | K-04 |
| — | Renk ve anlam kullanıcıya ait | K-21, G-32/33 |
| — | İnternetsiz kuralı yumuşatıldı: veri girişi internetsiz; OTA çekme ve fatura kesme yok | G-01/G-02 yeniden yazıldı |
