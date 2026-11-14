# Faz 3 · UI Tasarım Sistemi ve Ekran Taslakları (UI Fazı 1)

**Amaç:** Ekranları kodlamadan önce görünümü kararlaştırmak: tasarım dili, tema (açık/koyu/sistem + sahibin serbest renk
ve anlam etiketleri), yoğunluk, **üç dil** (TR/EN/RU), **masaüstü + telefon** düzenleri; her ana ekranın tıklanabilir
taslağı. Sahip taslakları onaylar; sonraki fazlar taslağı uygular.

**Gereksinimler:** G-130, G-32, G-33, G-08, G-17, G-143.
**Ön koşul:** Faz 1, Faz 2.
**Sorular:** yok — S-10 (kapora ayrı renk), S-11 (açılış Takvim), S-23 (isim + fiyat), S-66, S-69 cevaplandı.
**Beceriler:** `frontend-design` (anti‑jenerik), `dataviz` (grafikler), `design:design-critique` (varsa).

## Teslimatlar

1. **Tasarım dili belgesi** (`docs/gelistirici/tasarim.md`): yazı tipleri (Latin/Türkçe/Kiril), ölçek, boşluk, köşe, yoğunluk modları, simge seti, durum rengi mantığı (otomatik + özel etiket, lejant), tablo/form/boş durum/toast kalıpları, klavye odak, **mobil kalıplar** (alt gezinme, Sheet formlar, liste kartları, 44 px hedefler).
2. **Tema ve etiket sistemi** (kod): shadcn değişkenleri + `--status-*`; **Durum Etiketleri ekranı**: otomatik durumlar (ad, renk, açık/kapalı), özel etiketler (ekle/sil, ad, renk, anlam metni), öncelik ayarı, canlı takvim önizlemesi, lejant bileşeni; açık/koyu/sistem; "Tema önizleme" (tüm bileşenler, üç dilde örnek metin).
3. **Uygulama kabuğu (masaüstü)**: sol daraltılabilir menü (rol‑duyarlı), üst çubuk, içerik; 1366×768'de rahat.
4. **Mobil kabuk**: alt gezinme (Bugün · Takvim · Misafir · Kasa · Daha fazla), üst çubuk (otel adı, bağlantı rozeti), Sheet formlar.
5. **Ekran taslakları** (sahte servisle çalışan React ekranları; masaüstü **ve** S-66 kapsamındakiler için mobil):
   - **Rezervasyon takvimi (açılış ekranı)** (sabit sütunlar, etiket renkleri, blok, not/istek/VIP/**KBS eksik** simgeleri, park alanı, özel gün rozetleri, **lejant**); Bugün; **Görevler**; **Vardiya devri ve notlar**; **Otelde kalanlar** (kişiler, tanıtıcı not, KBS); **Kayıp eşya**; **Ay sonu kontrol**; oda durumu **kat planı**; hava kartı (haftalık, simgeli); Rezervasyon paneli (+ misafir geçmişi kartı, sürekli istek uyarısı, ödeme); Günlük defter + kasa paneli; Misafir listesi/kartı (geçmiş, firma bilgileri, kopyala), Kara liste; Personel; Oda durumu, **Arıza listesi**; Bakım; Raporlar; **Turizm istatistiği**; Döviz; **Rehber**, **Tedarik**, **Çamaşırhane**; Ayarlar (dil, tema, etiketler, listeler, **Roller düzenleyici (ekran × select)**, **Uzaktan erişim**), Kurulum sihirbazı; Giriş/kilit; mobil: Bugün, gün listesi, misafir arama, kasa, rapor kartları, döviz, arıza, bakım.
6. **Sahip incelemesi**: her taslağın ekran görüntüsü (açık/koyu, TR + RU örnek, masaüstü + telefon) sahibe sunulur; geri bildirimler bu dosyaya; onay olmadan Faz 4'e geçilmez.
7. **Bileşen kütüphanesi**: seçilmiş shadcn bileşenleri + özel: `MoneyInput`, `DateInput`, `RoomPicker`, `GuestCombobox`, `OccupantList`, `StatusTagBadge`, `Legend`, `TapeChart` (iskelet), `KpiCard`, `PhoneField`, `CopyButton`, `AttachmentPicker`, `WeatherIcon` (Yr simgeleri), `FloorPlan`.

## Kabul ölçütleri

- [x] `docs/gelistirici/tasarim.md` yazıldı; `ui-reviewer` ajanı bunu referans alır.
- [x] Durum Etiketleri ekranında ad/renk değişikliği ve yeni özel etiket takvim önizlemesine anında yansır; koyu tema kontrastı geçer.
- [x] Tüm masaüstü taslakları 1366×768'de, mobil taslaklar 390×844'te taşmaz; Rusça uzun metinlerde kırpılma yok.
- [x] Sahip taslakları onayladı (`docs/plan/taslak-onay/2026-10-04.md`, 2026-10-04).
- [x] Hiçbir taslakta gömülü metin yok; üç dil dosyası aynı anahtar kümesine sahip (`i18n:extract` farksız).

## Sonuç (2026-10-04)

**Durum:** ✅ tamam — sahip bütün taslakları 2026-10-04'te onayladı (`docs/plan/taslak-onay/2026-10-04.md`). Tasarım
dili, tema ve etiket sistemi, iki kabuk, 31 ekran taslağı ve bileşen kütüphanesi hazır. Sahibin tek isteği İngilizce
görüntülerdi; inceleme sayfasına eklendi (arayüz zaten üç dilliydi).

**Yapılanlar**

- **Tasarım dili** — `docs/gelistirici/tasarim.md`: ilkeler, yazı ve ölçek, renk ve durum rengi mantığı (otomatik durum + özel
  etiket, lejant), boşluk ve yoğunluk, simgeler, bileşen kalıpları, klavye ve odak, telefon kalıpları (ana eylem başlık
  altında tam genişlik, liste kartları, 44 px), metin ve dil (Rusça uzunluk, mantıksal CSS), rol duyarlılığı, ekran
  listesi, gözden geçirme listesi. `ui-reviewer` ajanı bu belgeyi referans alır.
- **Tema ve etiketler** — açık/koyu/sistem; shadcn değişkenleri + `--status-*`, `--hk-*`, `--chart-*`. Metin olarak da
  kullanılan durum renkleri beyaz zeminde ve kendi %15 tonlu zemininde ≥ 4,5:1; alan kenarlıkları iki temada ≥ 3:1.
  **Durum etiketleri ekranı gerçek servisle çalışır**: otomatik durumların adı (boş bırakılırsa ya da varsayılanla aynıysa
  programın çevirisine döner, `name: null`), rengi (her tema ayrı), anlamı, takvimde göster; kendi etiketleri (ekle,
  ad, renk, anlam, dolgu/kenar önceliği, kullanılmıyorsa kaldır); canlı takvim önizlemesi ve lejant anında değişir
  (telefonda önizleme üstte). **Tema önizleme**: tema anahtarı, her durum için çubuk örneği, bütün bileşenler, üç dilde
  örnek metin.
- **Masaüstü kabuğu** — daraltılabilir, role göre süzülen menü; üst çubuk (otel adı, bugün, arama/komut menüsü, Ctrl K);
  "Bu rolün gözüyle bak" şeridi; rolün göremediği ekran adresle açılınca "Bu ekrana yetkiniz yok"
  (`layouts/route-guard.tsx`; servis 403'ünde de aynısı, yeniden deneme yok).
- **Telefon kabuğu** — alt gezinme (Bugün · Takvim · Misafir · Kasa · Daha fazla), üst çubuk (otel adı, bağlantı rozeti,
  arama), alttan açılan formlar (`ResponsiveDialog`), güvenli alan payları.
- **31 ekran taslağı** sahte veriyle (bir yıllık örnek otel, uydurma isim ve rakamlar; "Örnek veri" rozeti): 22 menü
  ekranı, Ayarlar'ın 6 sekmesi, kurulum sihirbazı (sekiz adım; `?step=N` ile istenen adım açılır), giriş, kilit. S-66 kapsamındakilerin telefon düzeni ayrı (gün listesi,
  liste kartları, tek dokunuş eylemler). Her ekranda yükleniyor / hata / boş / "eşleşen yok" durumları.
- **Bileşen kütüphanesi** — 32 shadcn bileşeni (`components/ui`, new-york-v4, elle alındı) + özel: `MoneyInput`,
  `DateInput`, `RoomPicker`, `GuestCombobox`, `OccupantList`, `StatusTagBadge`, `Legend`, `TapeChart` (iskelet; çubuk
  adı durumunu da söyler), `KpiCard`, `PhoneField`, `CopyButton`, `AttachmentPicker`, `WeatherIcon` (Yr), `FloorPlan`,
  `SectionCard`, `Page`/`PageHeader`, `QueryView`, `EmptyState`/`ErrorState`/`NoAccessState`, `ResponsiveDialog`.
- **İncelemeler** — üç `ui-reviewer` turu (31 ekran; Türkçe masaüstü/telefon × açık/koyu, Rusça masaüstü/telefon
  açık), bir doğrulama turu ve üç `turkish-ui-copy` turu; 1 kritik ve 16 yüksek bulgunun hepsi düzeltildi ve doğrulama
  turunda görüntüden teyit edildi (raporlar depoda değil; ayrıntı commit geçmişinde `fix(ui): …`).
- **Testler** — 687 birim/bileşen testi (82 dosya), aralarında tema kontrastını kilitleyen test
  (`tests/unit/theme-contrast.test.ts`: iki temada durum ve soluk metin renkleri kartta ve kendi %15 tonunda ≥ 4,5:1,
  alan kenarlığı ≥ 3:1). 12 e2e: 1366×768 ve 390×844'te Türkçe ve Rusça **bütün ekranlarda** belge düzeyinde yatay
  taşma yok; telefonda Ayarlar ve alt gezinmede dokunma hedefleri ≥ 44 px; durum etiketi değişikliği önizlemeye anında
  yansır; ilk açılışta hiçbir ağ isteği yapılmaz. Rusça kırpılma otomatik ölçülmez; ekran görüntüleriyle incelendi.
  i18n: 1973 anahtar, tr/en/ru eşit, değişken adları üç dilde aynı (`npm run i18n:check`; ölçütteki `i18n:extract`
  bu betiktir).

**Kabul ölçütleri** → yukarıda işaretli (beşi de).

**Sapmalar ve kararlar (varsayılan)**

- Taslaklarda kaydetme yok: Kaydet "Örnek ekran: kayıt yapılmadı." bildirimi verir. Yalnız Durum etiketleri ve Görünüm/Genel
  ayarları gerçek servise yazar.
- Rol önizlemesi Faz 4'e kadar K-38 varsayılan yetkileriyle; Faz 4'te oturumun yetkileri okunur.
- Durum etiketi kontratı: otomatik durumun adı `null` olabilir (programın çevirisine dönüş); özel etiket adsız kalamaz
  (servis reddeder). Migrasyon gerekmedi (`status_tags.name` zaten boş olabilir).
- Takvimde boş hücreye klavyeyle ulaşım ve tek kaydırma alanı Faz 5'te (sanallaştırılmış ızgarayla).
- Rapor ekseni için kısa para biçimi şimdilik rapor ekranında; Faz 10'da `src/shared/format.ts`'e taşınır.
- Lisans listesi yalnız doğrudan bağımlılıkları gösterir; tam liste Faz 16'da (`npm run notices`).
- Sağdan sola dil (Arapça) ertelendi; `components/ui` yukarı akış fiziksel sınıflarını korur.
- Hiç kullanılmamış özel etiket "Kaldır" ile gerçekten silinir (geçmişi yok; denetim kaydına önceki hâli yazılır);
  kullanılan etiket kaldırılamaz (`errors.tagInUse`), kapatılabilir (Yasak 11 ile uyumlu).
- Taslaklarda bilerek yer almayanlar (ilgili fazlarda gelir): çok odalı rezervasyon (G-35) ve oda değiştir / uzat /
  kısalt (G-44) Faz 5; takvimde tarih seçme ve boş oda bulma (G-41) Faz 5; istemci ekranındaki "Yedek kopya · saat"
  rozeti (G-141) Faz 13; kurulumun oda tipleri, ek hizmetler, personel politikası ve görev önerileri adımları Faz 4.

**Açık noktalar**

- **G-24 denetim kaydı ekranı** (ZORUNLU) hiçbir fazın teslimatında yoktu; Faz 4'e 6. teslimat ve kabul ölçütü olarak
  eklendi (taslağı uygulamadan önce sahibe gösterilir).
