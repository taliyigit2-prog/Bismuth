# Faz 0 · Derin Araştırma ve Doğrulama (Ar‑Ge)

**Amaç:** Plan aşamasındaki araştırmayı (`04-arastirma/`, 8 rapor) **doğrulamak, derinleştirmek ve kararlara
dönüştürmek**; kod yazmadan önce en riskli varsayımları gerçek derleme, gerçek API çağrısı ve gerçek makinelerle
sınamak. Bu faz "deep research" modunda çalışır: her başlık için kaynak listesi, bulgular, karar önerisi.
Plan aşamasındaki ajanlar çoğu dış siteye erişemedi (vekil engeli); **canlı doğrulama bu fazın işi** ve GitHub Actions çalıştırıcılarında yapılır.
Kanıt kodu `prototypes/` altında durur; Faz 1 ürünü `src/` altında sıfırdan, seçilen şablonla kurulur (prototipler ürün kodu değildir).

**Ön koşul:** Sahip, `05-sorular.md` Faz 0–1 bölümündeki soruları cevapladı (✅ 2026-10-01, üçüncü tur).
**Çıktı:** güncellenmiş raporlar + **depo seçim raporu** + `06-kararlar.md` içinde kesinleşmiş kararlar + `prototypes/` (kanıt kodu) + bu dosyada "Sonuç" + `docs/plan/akislar.md`.

## Araştırma başlıkları (her biri ayrı rapor/bölüm)

### A0.1 Masaüstü kabuğu ve işletim sistemi tabanı (K-01, K-12) — **en kritik**
- Electron **37.x** ile boş uygulamayı GitHub Actions'ta paketle (`windows-latest` → `Bismuth-Setup.exe`, `macos-latest` → iki `.dmg`); aynısını 44.x ile; boyut, açılış süresi, bellek ölç.
- better-sqlite3 13 hazır ikilileri 37 ile çalışıyor mu; Playwright sürüm uyumu; Tailwind v4 (Chromium 138) görünümü.
- Sahibin Mac'inde (M2, macOS 26) ve bir Windows 10 makinede aç; imzasız paket uyarılarını ekran görüntüsüyle belgele (kılavuz için).
- Karar: K-01 kesin; K-12 (37 mi 44 mü) kesin.

### A0.2 SQLite erişimi ve migrasyon akışı (K-02)
- better-sqlite3 + Drizzle: gömülü migrasyon, WAL, `backup()`/`VACUUM INTO`, 20 oda × 10 yıl gece sorgusu performansı; `node:sqlite` yedek seçenek notu.

### A0.3 Takvim ızgarası prototipi (K-03)
- 20 satır × sınırsız sütun; TanStack Virtual ile yatay sanallaştırma; sabit sol sütun + üst satır; birleşik bloklar; gece gece renk; bölünmüş hücre (aynı gün iki misafir); 60 fps ve < 300 ms ilk çizim ölçümü.

### A0.4 Bayram üretimi ve çevrimiçi doğrulama (K-04)
- `date-holidays` TR çıktısını 2026–2030 için Diyanet/resmi listeyle karşılaştır; 28 Ekim 13:00 ve arife yarım gün normalizasyonu; TR‑only küçük paket üretimi.
- Çevrimiçi doğrulama adayı: Google Takvim TR resmi tatil ICS akışını canlı çek, bayram+arife içeriyor mu; Calendarific (kullanıcı anahtarı seçeneği). Karar: hangisi "yıllık doğrulama" kaynağı.
- Diğer ülkeler için `date-holidays` kapsamını listele (ürün genel).

### A0.5 Piyasa orta kur ve hava durumu kaynakları (K-06, K-13) — canlı doğrulama
- Bu konteynerden dış API'lere erişim engelli → doğrulama **GitHub Actions** çalıştırıcısında yapılır (`prototypes/live-checks`).
- Kur: anahtarsız orta kur kaynakları (fawazahmed0 currency-api, open.er-api.com, Frankfurter (RUB yok), ExchangeRate-API v4, Türk akışları yalnızca kıyas için) + TCMB + Google Finance sayfası (yalnızca kıyas referansı). Her kaynak: HTTP durumu, gecikme, alanlar, USD/EUR/GBP/RUB değerleri, Google'a fark %.
- Hava: MET Norway, Open‑Meteo, 7Timer, wttr.in — İstanbul için anlık + 7 gün; alanlar ve lisans notları.
- Bayram: Google Takvim TR resmi tatil ICS akışı, Nager.Date — 2026–2027 içeriği; `date-holidays` çıktısıyla kıyas.
- Karar: kur kaynak sırası, hava birincil/yedek, bayram doğrulama kaynağı.

### A0.6 Çok cihaz / uzaktan erişim mimarisi (K-19) — **yeniden açıldı**
- Sahip: otel PC çökebilir; aynı Google hesabı istemiyor; ücretsiz sunucu (Supabase gibi) araştırılsın.
- Seçenekler: (1) otel PC sunucu + özel ağ (ayrı hesap + davet/paylaşım), (2) otel PC birincil + uçtan uca şifreli bulut aynası (ücretsiz katman), (3) bulut birincil + yerel önbellek, (4) yerel‑öncelikli eşitleme motoru (Evolu/Jazz/PowerSync…). KVKK yurt dışı aktarım değerlendirmesi.
- Çıktı: `04-arastirma/uzaktan-bulut-secenekleri.md` + sahibe sade anlatım + öneri → sahip seçer (S-79) → K-19 kesin. Seçilen yolun Faz 1'de prototipi.

### A0.7 Dil (K-17)
- Arapça ertelendi (S-69). i18next TR/EN/RU kurulumu, i18next-cli, Rusça çoğul; mantıksal CSS kuralı ileride RTL için korunur.

### A0.8 Turizm istatistiği kuralları (K-24, K-29)
- Kurallar sahipten geldi (giriş ayı, aynı gün = 1, çocuk ayrı değil, doluluk = geceleme ÷ (yatak × gün)). Prototip: `prototypes/kbs-stats` gerçek Eylül dosyasıyla 607/838 sonucunu üretir (dosya depoya girmez; sentetik fixture girer).
- KBS Excel'inin farklı aylardan 2–3 örneği ile sütun/biçim değişkenliği kontrolü; `country_map` tohumunu KBS'nin ülke yazımlarıyla (İngilizce + parantez) tamamla; bakanlık panelindeki ülke listesini (Türkçe) elde et.

### A0.9 Otel alanı doğrulaması ve günlük akış (K-09)
- Sahiple 30 dk "günlük akış" görüşmesi → `docs/plan/akislar.md` (sabah/misafir geliş/çıkış/akşam/ay sonu; çamaşırhane kağıdı akışı; su teslimi; arıza bildirimi; bakanlık bildirimi).
- Oda tipi, ödeme yöntemi, kanal, hizmet, çamaşır türü, ürün kategorisi, gider kategorisi tohum listelerini sahiple gözden geçir; Pandora'nın 19 odasını örnek kurulum verisi yap.

### A0.10 Claude Code çalışma düzeni (K-10)
- `.claude/` kancalarını (zaten test edilmiş) Faz 1 komutlarıyla genişlet (pre-commit-gate, format-file, i18n-literal-warn); kalan ajan/becerileri yaz; her kancayı `test-hooks.mjs` ile doğrula.

### A0.12 **Derin depo (repo) araştırması ve seçimi** — sahip: "çok önemli"
Dört kol, her biri puanlama tablosu (uygunluk, bakım, lisans, kalite, uyarlama emeği) + seçilen/reddedilen listesi:
1. **Masaüstü başlangıç şablonları ve örnek uygulamalar** (electron-vite şablonları, electron-shadcn, Frappe Books, Actual Budget…) → Faz 1'in başlangıç noktası.
2. **UI ve kütüphaneler** (shadcn ekosistemi, tape chart/zaman çizelgesi, veri ızgarası, form, grafik, Excel, tarih/para, durum yönetimi, Electron yardımcıları) → kesin paket listesi + kodundan yararlanılacak depolar.
3. **Uzaktan erişim / bulut / eşitleme motorları** (A0.6 ile birlikte).
4. **Alan ve Türkiye'ye özgü depolar + hava API'leri** (açık kaynak PMS'ler, otel otomasyonu depoları, KBS/ülke eşleme, TC kimlik, bayram, hava simgeleri).
Çıktı: `04-arastirma/repo-*.md` raporları + `04-arastirma/depo-secimi.md` (tek tablo: seçilen depo/paket, sürüm, lisans, neden, risk, alternatif) + `docs/plan/bagimliliklar.md` taslağı.

### A0.11 Test ve CI (K-11)
- Vitest + Playwright Electron (xvfb) + mobil emülasyon projesi; Windows/macOS runner'da paket smoke testi.

## Kabul ölçütleri

- [~] Boş Bismuth her iki işletim sistemi için CI'dan indirilebilir paket olarak üretildi (Electron 37 ve 44 kıyas) ✅; **sahibin Mac'inde açıldı ✅ (2026-10-02)**; otel Windows makinesi bekleniyor (S-80; Faz 1'i engellemez).
- [x] Faz 0 kararları kesinleşti: K-02 (better-sqlite3), K-03, K-04, K-06, K-12, K-13, K-24 ✅; **K-19 kesin (C2 + NetBird Free + otelin Google Drive'ı)** ✅ (2026-10-02).
- [x] Takvim prototipi hedef performansı karşıladı (142 ms, 60 fps); ölçüm `prototypes/tape-chart/perf-result.json`.
- [x] Beş orta kur kaynağı ve dört hava kaynağı canlı doğrulandı (GitHub Actions); kıyas tablosu `canli-dogrulama.md` (Google sayfası okunamadı → Yahoo canlı piyasa referans alındı).
- [x] Uzaktan erişim raporu ve sade anlatım hazır (`uzaktan-bulut-secenekleri.md` §9); ücretsiz yol kararı ve kılavuz iskeleti §11 ✅.
- [x] Depo seçim raporu (`depo-secimi.md`) tamam; Faz 1 başlangıç şablonu (electron-vite `react-ts`) ve paket listesi kesin.
- [x] TR bayramları doğrulandı (2026 üç kaynakta aynı; 2027 Ramazan'da 1 gün fark yakalandı → "tahmini" etiketi); çevrimiçi doğrulama kaynağı Google TR ICS.
- [x] `docs/plan/akislar.md` — sahip günlük akışı yazılı anlattı (2026-10-02); tohum listeleri sahibin "büyültebilirsin" cevabıyla genişletildi.
- [x] Faz 1 başlangıç komutu, şablon düzeltmeleri, dosya düzeyinde alımlar ve klasör yapısı kesinleşti (`faz-01` "Başlangıç").

## Sonuç (2026-10-01)

**Yapılanlar**
- Sahibin üçüncü tur cevapları plana işlendi (gereksinimler v3; Arapça ertelendi; orta kur; hava zorunlu; yatak kapasitesi + geçmiş; KBS kuralları; çamaşırhane; içe aktarma zorunlu; uzaktan erişim yeniden açıldı).
- **Derin depo araştırması** dört kolda tamamlandı ve tek tabloda birleştirildi: `04-arastirma/depo-secimi.md` (+ `repo-masaustu-sablonlar.md` 29 depo, `repo-ui-kutuphaneler.md`, `uzaktan-bulut-secenekleri.md`, `repo-alan-tr-hava.md`).
- **Canlı doğrulama** GitHub Actions'ta: kur (5 kaynak + TCMB + piyasa referansı), hava (4 kaynak), bayram (Google ICS, Nager.Date) → `canli-dogrulama.md`.
- **Prototipler** (`prototypes/`, ürün kodu değil) → `faz0-prototipler.md`:
  - Kabuk: Electron 37 ve 44, Windows NSIS + macOS DMG paketleme ve duman testi 4/4 geçti; kurulum ~92 MB / ~118 MB.
  - Takvim ızgarası: 10 yıl × 19 oda, 17.900 konaklama → 142 ms, 60 fps.
  - KBS istatistiği: sahibin gerçek Eylül dosyası → 607 giriş / 23 ülke; KBS'nin `1900-01-01` "çıkmadı" değeri bulundu; 8 test.
  - Bayram: sınırsız yıl (2026–2200), 7 test.
- Kancalar: `deps-guard` yanlış pozitifi düzeltildi; `prototypes/` ağ kuralından muaf; 20 kanca testi geçiyor.

**Kesinleşen kararlar:** K-02 (better-sqlite3), K-03, K-04, K-06, K-12, K-13, K-24 (+ K-27…K-30 sahip cevaplarından).

**Açık kalanlar (sahipten)** — Faz 1'e başlamadan önce:
1. S-80: prototip paketlerini Mac'te ve otel bilgisayarında açıp ekran görüntüsü göndermek.
2. S-79 + S-82…S-89: uzaktan erişim seçimi (öneri C2) ve ayrıntıları.
3. S-78: toplam yatak sayısı (Eylül %100 çıkıyor; 28'den fazla olabilir).
4. S-81: KBS'de ay sonunda otelde kalanların sayımı (840 / 838).
5. S-90, S-91: hava yağış olasılığı; bakanlık ülke listesi.
6. 30 dk günlük akış görüşmesi → `akislar.md`.

**Faz 1'i etkileyen bulgular:** `@electron-toolkit/preload` güvensiz (kaldırılacak); Vite 7.3.6 sabit; React Compiler kapalı; exceljs tarihleri UTC; zod `import * as z`; sanallaştırmada satır içi konum stili istisnası (CLAUDE.md güncellendi); GitHub Actions eylemleri Node 20 uyarısı → güncel ana sürümler.

## Sonuç eki (2026-10-02, dördüncü tur)

**Yapılanlar**
- Sahibin dördüncü tur cevapları işlendi: `05-sorular.md`'deki **tüm** açık sorular (S-10…S-96) + Faz 0 raporundaki 7 soru; eşleme ve
  etkiler `06-kararlar.md` → "Sahip cevapları (dördüncü tur)".
- **Gereksinimler v4** (`/requirement-change` yöntemiyle, sahibin açık istekleri): yeni **G-18** kılavuz, **G-19** kısayollar, **G-47** açılış Takvim,
  **G-48** varsayılan fiyat, **G-54** odadaki kişiler + KBS (yasal), **G-55** kayıp eşya, **G-72** gün kapatma, **G-94** görevler, **G-95** vardiya devri ve notlar;
  G-24, G-32, G-34, G-37, G-40, G-50, G-53, G-62, G-64, G-66, G-69, G-70, G-71, G-82, G-84…G-87, G-90…G-92, G-100, G-102, G-110, G-112, G-113, G-120, G-122,
  G-140…G-145, G-150, G-170, G-171, G-180, G-191, G-192 güncellendi; G-65 kaldırıldı; §O'ya istenmeyenler eklendi; Ö-19 (kat görevlisi telefonu) öneri.
- **K-19 kesin**: C2 (tek yazıcı + Mac'te yedek kopya + şifreli kutu ve yedekler otelin Google Drive'ında + devral) + **ücretsiz özel ağ NetBird Free**
  (K-31; Tailscale ücretsiz planı ticari değil, ZeroTier de değil, Cloudflare WARP Türkiye'de engelli). Yeni kararlar K-31…K-38.
- `03-mimari.md` v4: yeni tablolar (`stay_occupants`, `task_templates`, `tasks`, `shift_definitions`, `shift_handovers`, `notes`, `lost_items`,
  `expense_sections`, `expense_items`, `product_categories`, `change_log`), misafirde doğum/anne‑baba alanları kaldırıldı, yeni kurallar §6.15–§6.17.
- **KBS önlemi** (sahip: "Türkiye ve Kuzey Kıbrıs yazımında hatalar olabiliyor"): prototipe normalizasyon + takma adlar + yazım hatası önerisi +
  kullanıcı onayı + otelde kalanlar için planlı çıkış kuralı (`prototypes/kbs-stats`, **15 test geçiyor**). Gerçek Eylül dosyasında
  "KUZEY KIBRIS TURK CUMHURİYETİ" (Ü eksik) zaten bu türden bir yazım; 38 yatakla Eylül doluluğu **%73,7**.
- **Hava simgeleri**: Yr hava simgeleri (MET kodlarıyla birebir; CC BY 4.0) — `canli-dogrulama.md` §2.
- **Günlük akış**: `akislar.md` (kişisel veri içermez).
- Faz dosyaları 1–16 güncellendi: görevler/vardiya/otelde kalanlar Faz 9, kayıp eşya Faz 12, C2 + NetBird + devral Faz 13, Drive yedeği Faz 14,
  kılavuz Faz 15; fazların "Sorular" satırları cevaplarla kapandı.

**Faz 0 durumu:** ✅ tamam. Açık kalan küçük sorular Faz 1'i engellemez: **S-80** (otel PC'de Windows denemesi + "Sistem türü"),
S-97 (hayır — WhatsApp yeterli) ve S-99 (gerçek 38 yatak) beşinci turda cevaplandı.
