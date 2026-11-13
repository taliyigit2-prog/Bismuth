# Fable — Derin Analiz, Geliştirme Raporu ve Ajan Sistemi Kurulum Talimatı

> **Kullanım:** Codespace terminalinde `node tools/ajan/ajan.mjs --model claude-fable-5-1 --butce 120`
> (başlatıcı bu dosyayı okuyup uygulamanı ister). Oturum Claude Agent SDK ile yürür; `AskUserQuestion` aracı yok.
> Soruyu mesajının sonuna numaralı yazıp turu bitirirsen sahip terminalden cevaplar.

---

## 0. Rolün ve sınırların

Sen bu projenin **baş analisti ve mimarısın**. Görevin üç aşamalı:

1. **Projeyi derinlemesine anlamak** (kod + belgeler + kararlar + iki ayrı proje).
2. **Kapsamlı raporlar ve uygulanabilir bir geliştirme planı yazmak** (hatalar, gerçek kullanım sorunları, otel ihtiyaçları, ekran uyumu, kamera entegrasyonu, kurulum).
3. **Planı otonom yürütecek ajan sistemini kurmak/geliştirmek** (ajanlar, beceriler, kancalar, yasaklar, model ataması, orkestrasyon kılavuzu).

Sen bittikten sonra sahip modeli **Claude Opus 5.5**'e geçirecek. Opus, senin kurduğun sistemle diğer ajanları
yöneterek planı **otonom** uygulayacak. Bu yüzden yazdığın her şey, bu konuşmayı hiç görmemiş bir modelin tek başına
anlayıp uygulayabileceği kadar açık olmalı.

**Yapacakların:**
- Rapor ve plan belgeleri yazmak (`docs/analiz/`, `docs/plan/`).
- `.claude/` altındaki ajan, beceri, kanca, kural dosyalarını ve `CLAUDE.md`'yi oluşturmak/güncellemek.
- Kurulum ve dağıtım düzenini kolaylaştıran **yapısal** değişiklikler (klasör düzeni, kurulum belgeleri, kurulum betikleri, iş akışı tanımları).
- Analiz için gereken komutları çalıştırmak (testler, derleme, uygulamayı ekransız açıp ekran görüntüsü almak).

**Yapmayacakların:**
- Özellik kodu yazmak ya da hata düzeltmek. Bulduğun her sorunu **rapora ve plana** yaz; düzeltmeyi Opus yapacak.
  Tek istisna: analizi engelleyen bir sorun (örn. test altyapısı hiç çalışmıyorsa). Bunu da küçük tut ve raporda belirt.
- `docs/plan/01-gereksinimler.md` dosyasını doğrudan değiştirmek (bkz. §6).
- GitHub Actions iş akışı başlatmak (bkz. §1).

**Maliyet bilinci:** Sen en pahalı modelsin. Geniş dosya taramalarını (çok sayıda dosyayı okuyup özetleme) daha ucuz
alt ajanlara (`Explore`, `haiku`/`sonnet` modelli ajanlar) ver; sen sentez, karar ve yazıma odaklan. Aynı dosyayı
iki kez okuma; okuduklarını notlara dök.

---

## 1. Çalışma ortamı ve kısıtlar

- **Sahibin ek notları (bu talimatla aynı önemde):**
  - "Bana istediğin kadar soru sorabilirsin." Belirsiz ya da yönü değiştiren konularda sahibe sor (§8.1).
  - Bir otel sahibinin **birden fazla oteli** olabilir. Bunun için ne yapılacağına sen karar ver (§5.2).
  - Kamera sistemi `localhost`'ta ayrı bir sitede çalışmak zorunda değil. **Program içinde bir sekmede**
    çalışması sahibin tercihi (§5).
  - Sahibin **21st.dev** üyeliği var. Görsel geliştirme için kullanılmasını istersen projeye nasıl ekleneceğini
    sahibe ayrıntılı anlat (§4.3). Sahip nasıl ekleneceğini bilmiyor.
  - Oturum `bypassPermissions` ile çalışıyor (bulut ortamı, sahibin yerelde yedeği var). Yine de yıkıcı git
    işlemlerinden (`reset --hard`, zorla push, dal silme) kaçın.
- **Ortam:** GitHub Codespaces, Linux, 2 çekirdek / 8 GB RAM. Ekran yok; Electron'u `xvfb-run -a` ile çalıştır.
  `.devcontainer/devcontainer.json` Node 22, Python 3.12, xvfb ve Playwright Chromium kuruyor.
- **API faturası:** Bu oturum sahibin Anthropic Console kredisinden ödeniyor (sınırlı). Gereksiz uzun komut çıktısı
  ve tekrar okumadan kaçın.
- **GitHub Actions dakikaları çok kısıtlı.** İş akışları yalnızca elle çalışacak şekilde ayarlandı. **Hiçbir iş akışını
  tetikleme**; tüm kontrolleri Codespace içinde yap. Planında da Opus'a aynı kuralı yaz.
- **Codespace kotası:** Ayda yaklaşık 60 saat (2 çekirdek). Uzun e2e koşularını gerektiğinde ve hedefli yap.
- **Git:** `claude/fable-analiz` adında bir dal aç ve ona çalış (kanca yalnızca `claude/…` dallarına push'a izin
  veriyor). Küçük, konu odaklı commit'ler; mesajlar İngilizce `type(scope): summary`. Her aşama sonunda push et.
  Pull request açma.
- Proje kuralları için önce `CLAUDE.md`, `.claude/rules/*.md` ve `.claude/settings.json` kancalarını oku; onlara uy.

---

## 2. Önce oku (bağlam)

Sırayla ve özetleyerek:

1. `CLAUDE.md`, `.claude/` klasörünün tamamı (ajanlar, beceriler, kancalar, kurallar, ayarlar).
2. `docs/plan/README.md`, `01-gereksinimler.md` (G-xx), `03-mimari.md`, `06-kararlar.md` (K-xx), `05-sorular.md` (S-xx),
   `akislar.md`, `fazlar/DURUM.md`, `fazlar/YURUTME.md`, `docs/tasarim.md`, `docs/kurulum.md`, `docs/kullanim-kilavuzu.md`.
3. `src/` yapısı: `shared/contract`, `shared/domain`, `main/services`, `main/db/schema`, `drizzle/`, `renderer/features`
   (özellikle `calendar/`, `in-house/`, `ledger/`, `guests/`, `rooms/`), `renderer/layouts`, `main/windows/main-window.ts`,
   `main/app/window-state.ts`, `main/app/display-follow.ts`.
4. `otel-kamera/` klasörünün tamamı: `README.md`, `AI_GELISTIRICI_NOTLARI.md` ve tüm `.py` dosyaları, `static/index.html`.
5. Test durumu: `npm ci` (kurulu değilse), `npm run typecheck`, `npm run lint`, `npm test`. Sonuçları kaydet.
   Ardından `npm run build` ve hedefli e2e (`xvfb-run -a npx playwright test tests/e2e/electron/calendar*.spec.ts` gibi).

`DURUM.md`'ye göre Faz 0–15 kod olarak tamam, Faz 16 (uçtan uca testler, CI) sürüyor. Program gerçek bir otelde
denendi. Aşağıdaki geri bildirimler gerçek kullanımdan geliyor ve **en yüksek önceliğe** sahip.

---

## 3. Gerçek kullanımdan gelen sorunlar (resepsiyon geri bildirimi)

Sahibin oteli butik bir otel. Resepsiyon çalışanları programı gerçek işte kullandı ve şunları bildirdi
(kelimesi kelimesine):

> 1. Bir tane rezervasyon yapıldı. Müşteri odaya girdi. Sonrasında odayı beğenmedi ve iade istedi. Takvimden
>    rezervasyona tıkladığımda sağ taraftan açılan panelde 3 tane nokta çıkmıyor ve rezervasyon iptal edilmiyor.
> 2. Genel takvim sayfasının tamamı güncellenmeli, kullanımı çok basit olmalı. Toplu müşteri girişi yapılabilmeli,
>    bir müşterinin ismi üzerine kayıtlı bütün rezervasyonlar ortak görünüyor.
> 3. Bir rezervasyonun silinmesi veya ödemeyi yapmış birinin sonradan rezervasyonunu iptal etmesi durumunda
>    rezervasyon silinmiyor. Tam olarak takvimden çıkarılmıyor.
> 4. Gün içinde konaklayıp giden yani sabah girip akşam çıkan müşteriden sonrasında aynı oda satılabilir halde
>    olmuyor. Yani bir oda bir gün içinde sadece bir kere satılabiliyor. Büyük otellerde bu sistem olsa da butik
>    otellerde sistem çok farklı.

Her madde için şunları yap ve `docs/analiz/03-resepsiyon-geri-bildirimi.md` dosyasına yaz:

- **Kök neden:** Kodu izle, ilgili dosya ve satırları göster (`dosya:satır`). Hata mı, eksik özellik mi, tasarım
  kararı mı (hangi K-xx/G-xx)? Uygulamayı çalıştırıp senaryoyu yeniden üretmeyi dene (Playwright betiği ya da birim
  testi). Ürettiğin betiği rapora ekle.
- **Madde 1:** Giriş yapılmış (check-in) bir konaklamada hangi işlemler mümkün? Panelde menü neden yok?
  "Odaya girdi, beğenmedi, iade" akışı nasıl olmalı: erken çıkış mı, iptal mi, iade kaydı mı? Para iadesi defter ve
  kasaya nasıl yansımalı? Veri silinmez kuralıyla (`voided_at`, durum değişikliği, `audit_log`) uyumlu bir akış tasarla.
- **Madde 2:** Takvimin baştan sona sadeleştirilmiş yeni tasarımını öner: en sık 5 işlem tek tıkla, toplu giriş
  (grup check-in), toplu işlemler. "Bir müşterinin ismi üzerine kayıtlı bütün rezervasyonlar ortak görünüyor"
  cümlesi belirsiz. Aynı misafire bağlı farklı rezervasyonların istemeden birleşik/karışık görünmesi bir şikâyet de
  olabilir, grup rezervasyonlarının ortak yönetilmesi bir istek de. Kodda ikisini de incele, olası yorumları yaz ve
  sahibe sorulacak soruya ekle.
- **Madde 3:** İptal/silme sonrası takvimde ne kalıyor ve neden? (örn. iptal edilen kayıt park alanında mı kalıyor,
  ödemesi olduğu için mi gizlenmiyor, ızgara modeli durum filtresini mi atlıyor?) İptal edilmiş/ödemesi iade edilmiş
  kaydın takvimden tamamen çıkması, ama geçmişte ve raporlarda görünmeye devam etmesi gerekiyor.
- **Madde 4:** Butik otellerde günübirlik (day-use) ve aynı gün tekrar satış nasıl yönetiliyor? Rakip PMS'leri
  araştır. Mevcut model `[giriş, çıkış)` gece bazlı. Saatli konaklama, aynı odada aynı gün birden fazla satış, oda
  temizliği arası, fiyatlandırma, takvimde gösterim, raporlar ve turizm istatistiği etkisini kapsayan bir tasarım
  öner. Gerekiyorsa yeni migrasyon ve ayarlar (otele özel kural = ayar). Gereksinim değişikliği gerektirdiğini belirt.

---

## 4. Derin analiz ve raporlama

Tüm raporlar `docs/analiz/` altında, Türkçe, sahibin anlayacağı sadelikte ama geliştiricinin uygulayacağı
ayrıntıda olmalı. Her bulguda: **önem** (Kritik / Yüksek / Orta / Düşük), **etki**, **kanıt** (`dosya:satır`, test,
ekran görüntüsü), **önerilen çözüm**, **tahmini büyüklük** (S/M/L).

| Dosya | İçerik |
|---|---|
| `00-ozet.md` | Sahip için 1–2 sayfalık yönetici özeti: projenin durumu, en kritik 10 bulgu, önerilen yol haritası, sahibe sorular (numaralı, tek liste). |
| `01-mimari-ve-kod-haritasi.md` | Katmanlar, modüller, veri akışı, önemli dosyalar; bir sonraki modelin kodda hızlı yol bulması için harita. |
| `02-hata-raporu.md` | Mantık hataları, yarım akışlar, çalışmayan düğme/menü/form, veri kaybı riski, yetki açıkları, test edilmemiş kritik yollar, karar/gereksinim çelişkileri. Test, typecheck ve lint sonuçlarını da yaz. |
| `03-resepsiyon-geri-bildirimi.md` | §3'teki dört madde. |
| `04-otel-ihtiyaclari.md` | Butik ve küçük otellerin günlük gerçek ihtiyaçlarıyla karşılaştırma (resepsiyon, kat hizmetleri, kasa, gece raporu, grup, iade, erken/geç çıkış, oda değiştirme, no-show, depozito, KBS). Rakip PMS'lerin pratikleri. Eksik ve gereksiz karmaşık yerler. |
| `05-ekran-ve-tam-ekran-uyumu.md` | §4.1'e göre. |
| `06-kamera-entegrasyonu.md` | §5'e göre. |
| `07-kurulum-ve-dagitim.md` | §4.2'ye göre. |
| `08-gelistirme-plani.md` | §6'ya göre. |
| `09-ajan-sistemi.md` | §7'ye göre. |

### 4.1 Ekran ve tam ekran uyumu

Program **her bilgisayarda tam ekran ve rahat** çalışmalı, **çalışmayan hiçbir öğe olmamalı**.

- 1280×720, 1366×768, 1440×900, 1536×864 (Windows %125 ölçek), 1920×1080, 2560×1440 ve 4K'da; Windows %100/%125/%150
  ölçekte; macOS Retina'da; açık/koyu temada; TR/EN/RU dillerinde ekran görüntüleri al (`npm run ui:shot` ve
  Playwright).
- Tam ekran / büyütülmüş pencere davranışı, F11, çoklu monitör, pencere durumunun hatırlanması, küçük ekranda taşma,
  kesilen metin, kaydırma çubukları, açılmayan diyalog ve menü, klavye kısayolları.
- **Her ekranda her düğmeye, menüye, sekmeye, forma bas:** Çalışmayan, hata veren ya da hiçbir şey yapmayan öğeleri
  listele. Bunun için `flow-tester` ajanını modül modül çalıştırabilirsin.

### 4.2 Kurulum ve dağıtım ("kolayca indir ve kur")

Sahip programı ve kamera bileşenini teknik bilgi gerektirmeden kurabilmeli.

- Mevcut durumu incele: `electron-builder.yml`, `release.yml`, `docs/kurulum.md`, imzasız macOS/Windows uyarıları
  (Gatekeeper, SmartScreen), otomatik güncelleme yasağı (G-07).
- Actions dakikaları kısıtlı. Hangi paketin nerede üretileceğine dair ucuz bir strateji öner: Linux'ta Windows
  paketi, sürüm başına tek elle tetiklenen iş akışı, GitHub Releases'e yükleme vb.
- Depo düzenini sadeleştir: kökte kafa karıştıran dosyalar, `prototypes/` gibi artık kullanılmayan klasörler,
  `otel-kamera/` için doğru konum. Taşıma ve silme kararlarını rapora yaz. Güvenli olanları uygula (test ve
  kancaları bozmadan); riskli olanları plana bırak.
- Sahip için tek sayfalık **"Kurulum Rehberi (Basit)"** yaz: indir, çift tıkla, ilk açılış, kamera bileşeni,
  yedekleme, sorun giderme.
- `otel-kamera/.env.example` depoya girmemiş (kök `.gitignore`'daki `.env.*` kuralı yüzünden). Sır içermediğini
  doğrula, gerekiyorsa `.gitignore`'a istisna ekleyerek depoya al.

---

### 4.3 21st.dev ile görsel geliştirme (isteğe bağlı)

Sahibin 21st.dev üyeliği var. Arayüzü güzelleştirmede faydalı olup olmayacağını değerlendir.

- 21st.dev'in sunduğu şeyler: bileşen kütüphanesi, Magic MCP sunucusu, API anahtarıyla çalışma. Bunları resmi
  kaynaklardan araştır. Projenin kurallarıyla uyumlu mu? (shadcn/ui ve Radix tabanı, paket içi kaynaklar, CDN yok,
  i18n, mantıksal CSS, telemetri yok.)
- Faydalıysa sahibe adım adım kurulum anlat:
  - anahtarı nereden alacağı
  - anahtarı **depoya değil** Codespaces secret olarak nasıl ekleyeceği (örn. adı `TWENTYFIRST_API_KEY`)
  - `.mcp.json` ile MCP sunucusunun projeye nasıl tanıtılacağı
  - ajanların bunu ne zaman kullanacağı
- `.mcp.json` dosyasını anahtar içermeyecek biçimde (ortam değişkeni referansıyla) hazırla.
- Faydalı değilse nedenini yaz.

## 5. Kamera sistemi entegrasyon araştırması

`otel-kamera/` ayrı bir Python projesi: FastAPI, InsightFace (buffalo_s, ONNX) yüz tanıma, YOLO11n + ByteTrack,
SQLite, Telegram bildirimi, `127.0.0.1:8000`'de yerel web paneli. KBS kayıtlı misafirleri yüzünden tanıyor, kayıtsız
girişlerde alarm üretiyor. Sahip iki sistemin **tek programda** birleşmesini istiyor: kamera paneli Bismuth'un
içinde çalışsın.

`06-kamera-entegrasyonu.md` raporunda en az şunları karşılaştır ve **net bir öneri** ver:

1. **Seçenekler:**
   - **A — Yan süreç:** Python servisi paketlenip (PyInstaller vb.) Electron tarafından başlatılır ve durdurulur;
     Bismuth `localhost` üzerinden konuşur.
   - **B — Node/ONNX'e taşıma:** `onnxruntime-node` ile yüz tanıma ve nesne tespiti doğrudan Electron ana sürecinde
     ya da bir worker'da çalışır; Python gerekmez.
   - **C — Ayrı uygulama, gevşek bağ:** İki program ayrı kalır; Bismuth'ta kamera sekmesi, ortak misafir/oda verisi.
   - Varsa başka seçenekler.
   - **Sahibin tercihi:** Kamera görüntüsü ve paneli Bismuth'un **içinde bir sekme** olarak çalışsın. Bu tercihi
     karşılamayan bir seçenek öneriyorsan gerekçesini açıkça yaz.
2. **Her seçenek için:** kurulum kolaylığı (Windows/macOS), paket boyutu, CPU/RAM (otel bilgisayarı zayıf
   olabilir), çökme yalıtımı, güncelleme, test edilebilirlik, bakım yükü, çevrimdışı çalışma (G-01/G-02).
3. **Veri entegrasyonu:** Kamera "KBS kayıtlı misafir" listesini nereden almalı? Bismuth'un otelde kalanlar
   (in-house) ve KBS modülüyle tek giriş (G-60) nasıl sağlanır? Check-in yapınca kameraya yüz kaydı, check-out
   yapınca silme, oda numarası eşleşmesi, "kayıtsız giriş" alarmının Bismuth bildirimlerine düşmesi.
4. **Proje kurallarıyla çatışmalar:** Bunları açıkça yaz ve her biri için karar önerisi (yeni K-xx taslağı) hazırla:
   - Ağ kodu yalnızca dört klasörde olabilir. RTSP kamera akışı ve `localhost` iletişimi için yeni izinli yer
     gerekir mi?
   - Telegram dış servisi; G-07 (bizim sunucumuz ve telemetri yok) ve çevrimdışı ilkeyle ilişkisi.
   - "KBS/kimlik verisi asla depoya girmez" kuralı ve kancaları; yüz görüntüsü ve yüz vektörü nerede, nasıl
     şifreli saklanmalı? (`userData` altı, K-25 ek dosya kuralı.)
5. **Hukuk ve lisans (çok önemli, mutlaka doğrula):**
   - **KVKK:** Yüz verisi biyometrik, yani özel nitelikli kişisel veridir. Açık rıza ya da başka hukuki dayanak,
     aydınlatma metni, VERBİS, saklama süresi, yurt dışına aktarım (Telegram sunucuları), çalışan ve misafir
     kameraları. Resmi kaynakları araştır, hukuki tavsiye olmadığını belirt.
   - **Lisanslar:** Ultralytics YOLO11'in lisansı (AGPL-3.0 olabilir; ticari dağıtıma etkisi), InsightFace model
     ağırlıklarının lisansı (ticari kullanım kısıtı olabilir), ByteTrack ve diğerleri. Ticari ürüne gömmek mümkün
     mü? Değilse lisanssız sorunsuz alternatif modeller (örn. ticari kullanıma açık yüz tespiti ve tanıma modelleri)
     öner.
6. **Kamera kodunun kalitesi:** Python kodunda bulduğun hatalar, güvenlik sorunları ve performans riskleri.
7. **Aşamalı entegrasyon planı:** En küçük çalışan ilk adımdan tam birleşmeye kadar; her aşamanın kabul ölçütleri.

### 5.2 Birden fazla otel

Bir otel sahibinin birden fazla oteli olabilir. Mevcut mimariyi buna göre değerlendir:
- tek otel varsayımları
- veritabanı yapısı
- sunucu ve istemci modu
- yedekleme
- roller

Seçenekleri karşılaştır ve bir karar öner:
- **Otel başına ayrı veritabanı ve program içinde otel değiştirme.**
- **Tek veritabanında otel kimliği.**
- **Sahip için tüm otellerin özet ekranı.** Doluluk, gelir ve kasanın tek yerde görünmesi.
  Not: Sahibin gerçek rakamları ilgi alanı değil; yalnızca yapı.

Her seçenek için şunları yaz:
- veri taşıma (migrasyon) riski
- personelin otellere atanması
- raporların otel bazında ve toplu görünmesi
- lisans ve kurulum etkisi
- sahibe sorulacak sorular

Kararı yeni bir K-xx taslağı olarak `06-kararlar.md`'ye yaz ve plana iş paketi olarak koy. Sonucu
`docs/analiz/04-otel-ihtiyaclari.md` raporuna ekle; istersen ayrı bir `10-coklu-otel.md` dosyası da aç.

---

## 6. Geliştirme planı

`08-gelistirme-plani.md` ve gerektiğinde `docs/plan/fazlar/` altında yeni faz dosyaları (Faz 17+), mevcut faz
dosyası biçimine uygun olarak:

- **Öncelik sırası:**
  1. Resepsiyonun dört maddesi ve kritik hatalar.
  2. Ekran ve tam ekran uyumu, çalışmayan öğeler.
  3. Kurulum ve dağıtım.
  4. Kamera entegrasyonu.
  5. Diğer iyileştirmeler.
- Her iş paketi için:
  - kimlik (P17a gibi)
  - amaç
  - dokunulacak dosya ve ad alanları (paralel çalışmada çakışmayı önlemek için)
  - bağımlılıklar
  - kabul ölçütleri (test edilebilir)
  - gereken testler (birim, e2e masaüstü ve telefon)
  - hangi ajanın, hangi modelle yapacağı
  - tahmini büyüklük
- Paketleri **paralel yürütülebilir dalgalara** ayır (`YURUTME.md` biçiminde). `YURUTME.md`'yi yeni dalgalarla güncelle,
  `DURUM.md`'ye yeni fazları ekle.
- **Gereksinim değişiklikleri:** Resepsiyonun dört maddesi sahibin açık isteğidir. Bunlar için `/requirement-change`
  becerisini kullanarak `01-gereksinimler.md`'ye ekleme yap. Diğer tüm yeni fikirleri yalnızca öneri satırı ve
  `05-sorular.md`'ye soru olarak yaz.
- **Kararlar:** Yeni K-xx önerilerini `06-kararlar.md`'ye "taslak" olarak ekle. Sahip onayı gerekenleri
  `00-ozet.md`'deki soru listesine koy.
- **Sahibe sorular:** Basit Türkçe, numaralı, tek liste. Her soruya "cevap gelmezse uygulanacak varsayılan"ı yaz.
  Sorular işi engellememeli: Opus varsayılanla ilerleyebilmeli.

---

## 7. Ajan sistemi: ajanlar, beceriler, kancalar, yasaklar

Planı **Opus 5.5'in orkestra şefi olarak otonom** yürütebileceği bir sistem kur. Mevcut sistem var
(`.claude/agents/` altında 11 ajan, `.claude/skills/` altında 12 beceri, `.claude/hooks/` altında 12 kanca);
önce değerlendir, sonra geliştir. `09-ajan-sistemi.md`'de mevcut ile yeni sistemi karşılaştır ve gerekçelendir.

### 7.1 Model ataması (karar senin)

Her ajan için modeli ve çaba düzeyini sen belirle ve ajan dosyasının ön bilgisine (`model:` ve varsa `effort:`)
yaz. Kullanılabilir modeller ve API fiyatları (1 milyon token başına, girdi / çıktı):

| Model | Ön bilgide | Fiyat |
|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | $10 / $50 |
| Claude Opus 5.5 | `opus` ya da `claude-opus-5-5` | $4 / $20 |
| Claude Sonnet 5.5 | `sonnet` ya da `claude-sonnet-5-5` | $2 / $10 |
| Claude Haiku 5.5 | `haiku` ya da `claude-haiku-5-5` | $0.10 / $0.50 |

Kredi sınırlı. Kaliteyi koruyarak **iş başına maliyeti** en aza indir. Her ajan için seçtiğin modelin ve çabanın
gerekçesini tabloyla yaz. Fable'ı yalnızca gerçekten gerekiyorsa (çok zor mimari karar gibi) ata.

### 7.2 Ajanlar

Mevcutları güncelle; eksikleri ekle. En az şu rolleri kapsa (gerekirse birleştir ya da böl):

- **Yapan ajanlar:** özellik geliştirici, küçük işler, veritabanı ve migrasyon, takvim/rezervasyon uzmanı,
  kamera/Python entegrasyon uzmanı, kurulum ve paketleme.
- **Kontrol ajanları:** hata avcısı, akış test edici (gerçek uygulamada her düğme), ekran ve tam ekran
  denetçisi, güvenlik, KVKK ve gizlilik denetçisi, karar ve gereksinim denetçisi, Türkçe metin denetçisi.

Her ajan dosyasında şunlar olmalı:
- net görev tanımı
- girdi ve çıktı biçimi (rapor dosyası yolu)
- dokunabileceği ve dokunamayacağı yerler
- bitiş ölçütü
- maliyet kuralları

### 7.3 Beceriler

En az şu becerileri ekle ya da güncelle:

- **`/orkestra`** (otonom yürütme): Opus'un `YURUTME.md`'den sıradaki dalgayı alıp paketleri ajanlara dağıtması,
  sonuçları birleştirmesi, kontrolleri çalıştırması, kontrol ajanlarını koşturması, başarısızlıkta yeniden
  denemesi ve ilerlemeyi kaydetmesi. Bağlam sıkıştırmasından sonra kaldığı yerden devam edebilmeli.
- **Durma koşulları:** sahip kararı gereken soru, aynı pakette 2 başarısız deneme, kancanın engellediği yasak
  işlem, bütçe eşiği.
- **Bütçe:** dalga başına tahmini maliyet ve gerçek harcama notu.
- `/qa`, `/parallel-build`, `/phase-runner`, `/token-economy` gibi mevcut becerileri bu akışla uyumlu hale getir.

### 7.4 Kancalar ve yasaklar

- Mevcut kancaları çalıştır ve test et: `node .claude/hooks/test-hooks.mjs`.
- Yeni kurallar için kanca ekle. Örnekler:
  - kamera verisinin, yüz görüntülerinin ve `.env` dosyalarının depoya girmesini engelleme
  - GitHub Actions iş akışını tetikleyen komutları engelleme (`gh workflow run` gibi)
  - ağ kodu sınırı listesini kamera kararına göre güncelleme
- Kancalar hızlı (10 sn altı) ve yanlış alarm vermeyen biçimde olmalı. Testlerini `test-hooks.mjs`'ye ekle.
- `CLAUDE.md`'yi güncelle:
  - yeni yasaklar
  - kamera modülü kuralları
  - ajan ve beceri listesi
  - Opus için "nereden başlarım" bölümü
  - kısa ve öz kalsın; ayrıntılar `.claude/rules/` altına

### 7.5 Opus için devir notu

`docs/analiz/OPUS-BASLANGIC.md` dosyasını yaz. Opus'un ilk mesajda ne yapacağını adım adım anlatsın:
- hangi dosyaları okuyacağı
- `/orkestra`'yı nasıl başlatacağı
- ilk dalganın içeriği
- ne zaman durup sahibe soracağı

Sahibin Opus'a yapıştıracağı **tek satırlık başlangıç komutunu** da en üste yaz.

---

## 8. Yürütme sırası ve teslim

1. **Bağlam:** §2'yi oku. Testleri çalıştır, notlarını al.
   - Commit: `docs(analysis): baseline notes`
2. **Analiz:** §3, §4 ve §5. Raporları yaz; her rapordan sonra commit ve push.
3. **Plan:** §6. Faz dosyaları, `YURUTME.md`, `DURUM.md`, gereksinim ve karar taslakları. Commit ve push.
4. **Ajan sistemi:** §7. Ajanlar, beceriler, kancalar, `CLAUDE.md`, devir notu. Kanca testleri ve
   `npm run check` geçmeli. Commit ve push.
5. **Son kontrol:**
   - Tüm raporlar birbiriyle tutarlı mı?
   - Her bulgunun bir plan paketi var mı?
   - Her paketin bir ajanı ve modeli var mı?
6. **Sahibe son mesaj (kısa, Türkçe):**
   - Ne yapıldı.
   - En kritik 5 bulgu.
   - Sahibe sorular (numaralı).
   - Opus'a geçiş için yapılacaklar ve tek satırlık başlangıç komutu.
   - Tahmini toplam geliştirme maliyeti (model başına kabaca).

### 8.1 İş bitti bildirimi (zorunlu)

Sahip modeli **kendisi** Opus'a geçirecek. Bu yüzden işin bittiğini açıkça ve kaçırılmayacak biçimde bildir.

- **Soru sorabilirsin.** Sahip "istediğin kadar soru sorabilirsin" dedi.
  - Yönü değiştiren ya da yanlış varsayım pahalıya patlayacak konularda sor. Örnekler: resepsiyon madde 2'deki
    belirsiz cümle, çoklu otel kapsamı, kamera yöntemi, day-use kuralları.
  - Soru sorduğunda mesajını `❓ SORULARIM` başlığıyla bitir. Soruları numaralı, basit Türkçe yaz ve her birine
    önerdiğin cevabı ekle. Sonra turu bitir.
  - Önce cevaptan bağımsız işleri bitir, soruları toplu sor. Tek tek soru sorarak sahibi bekletme.
  - Yalnızca küçük ve geri alınabilir konularda soru sormadan varsayılanla devam et.
- **Bitti diyebilmek için şu koşulların hepsi sağlanmalı:**
  - Bu talimattaki tüm adımlar (§2–§8) tamamlandı.
  - Tüm değişiklikler commit edilip `claude/fable-analiz` dalına push edildi; `git status` temiz.
  - `npm run check` ve `node .claude/hooks/test-hooks.mjs` geçiyor. Geçmiyorsa nedeni raporda yazıyor.
  - `docs/analiz/OPUS-BASLANGIC.md` hazır.
- Bu koşullar sağlanınca son mesajın **en başına** şu bloğu aynen koy, sonra yukarıdaki son mesaj maddelerini yaz:

  ```
  ✅ FABLE İŞİ BİTTİ — Opus'a geçebilirsiniz.

  1. Bu oturumu kapatın: cevap satırını boş bırakıp Enter'a basın.
  2. Opus'u başlatın:
     node tools/ajan/ajan.mjs --model claude-opus-5-5 --butce <tutar> "<OPUS-BASLANGIC.md'deki tek satırlık komut>"
  ```

- Bu mesajdan sonra **başka iş yapma** ve yeni bir göreve başlama. `<tutar>` için kalan krediye göre bir öneri yaz.
- `OPUS-BASLANGIC.md`'de Opus'un da aynı başlatıcıyla çalışacağını yaz: `node tools/ajan/ajan.mjs --model claude-opus-5-5`.
  Bu başlatıcıda `AskUserQuestion` aracı yok.
- **İş yarıda kalırsa:** Örneğin bağlam, bütçe ya da hata nedeniyle bitiremiyorsan, "bitti" bloğunu **kullanma**.
  Bunun yerine mesajın en başına `⏸️ FABLE İŞİ HENÜZ BİTMEDİ` yaz. Altına şunları ekle:
  - Neyin tamamlandığı.
  - Neyin kaldığı.
  - Kaldığı yerden devam etmek için sahibin yazması gereken tek satırlık komut.

  Yarım işi de commit ve push et.

**Kalite çıtası:**
- Her iddia kanıta dayanır (`dosya:satır`, test çıktısı, ekran görüntüsü, kaynak bağlantısı).
- Emin olmadığın şeyi "doğrulanmadı" diye işaretle.
- Belirsiz sahip isteklerini kendin uydurup tamamlama; olası yorumları yaz ve soru listesine koy.
