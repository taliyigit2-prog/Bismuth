# Faz 4 · Kurulum Sihirbazı, Giriş, Roller ve Yetkiler

**Amaç:** Programı ilk kez açan otel sahibi 10 dakikada otelini tanımlasın (dil, çalışma modu dahil); her çalışan kendi
hesabıyla girsin; sahip **rolleri kendisi tanımlasın** — ekran listesi × "göremez / görür / düzenler" seçimiyle.

**Gereksinimler:** G-10 … G-17, G-20 … G-25, G-47, G-48, G-82, G-144 (oturum temelleri).
**Ön koşul:** Faz 2, Faz 3.
**Sorular:** yok — S-24 (cumartesi + pazar; bayramlar; kullanıcı istediği günü seçer), S-78 (19 oda / 38 yatak), S-70 cevaplandı.

## Teslimatlar

1. **Kurulum sihirbazı** (ilk açılış; sonradan Ayarlar'dan düzenlenir):
   1. Dil (TR/EN/RU) + tema; hoş geldiniz.
   2. **Çalışma modu**: tek bilgisayar / **sunucu** (bu bilgisayar otelin ana bilgisayarı) / **istemci** (başka bir Bismuth sunucusuna bağlan → sihirbaz burada biter ve bağlantı ekranına gider, Faz 13).
   3. Otel adı, ülke, şehir (hava durumu konumu), saat dilimi.
   4. Para birimleri: ana birim + kabul edilen dövizler.
   5. Oda tipleri (gruplu uzun liste, arama, çoklu seçim, özel tip) + **tip başına varsayılan fiyat ve hafta sonu farkı** (G-48).
   6. Odalar (hızlı üretim, tip atama, **yatak sayısı**, satılabilir) + toplam oda/yatak özeti (bakanlık doluluk oranı için; K-27). Ayarlar → Odalar'da sonradan oda/yatak ekleme‑çıkarma **geçerlilik tarihiyle**.
   7. Ödeme yöntemleri, satış kanalları, ek hizmetler.
   8. Personel politikası (izin, bölen, saat; ek mesai ücreti yok/saatlik/oran — Pandora: yok; bayram oranı; prim; **kasadan avans**) — oranları Sahip + Müdür sonradan değiştirir (K-38).
   8b. **Vardiya düzeni** (Pandora: Gündüz 09:00–21:00, Gece 21:00–09:00) + **örnek görev önerileri** (seçmeli; G-94).
   9. Çalışanlar (isteğe bağlı) + kullanıcı hesabı + rol.
   10. Takvim: vurgulu günler (varsayılan cumartesi + pazar; S-24), bayramlar (ülkeye göre otomatik, önizleme), yasal hatırlatıcılar (TR tohumu açık/kapalı); gün kapatma açık/kapalı (G-72).
   11. Sahip hesabı: kullanıcı adı, şifre/PIN, kurtarma kodu.
   12. Özet + başlat. Her adım atlanabilir (zorunlu: dil, mod, otel adı, ana birim, ≥1 oda, sahip hesabı); ilerleme kaydedilir.
2. **Giriş ekranı**: kullanıcı listesi + PIN/şifre; hatalı deneme sınırı; "şifremi unuttum" (kurtarma kodu / sahip sıfırlar); boşta kilit; hızlı kullanıcı değiştir. (HTTP oturumları Faz 13'te aynı servisi kullanır.)
3. **Roller düzenleyici** (Ayarlar → Kullanıcılar ve Roller): kullanıcı ekle/düzenle/pasif; rol ata; **rol tablosu**: satırlar = ekranlar ve veri alanları (Türkçe adlarıyla: "Takvim", "Rezervasyon oluştur", "Ödeme gir", "Kasa paneli", "Yönetici giderleri", "Maaşlar", "Raporlar — kâr", "Rehber", "Tedarik", "Çamaşırhane", "Arızalar", "Turizm istatistiği", "Firma/fatura bilgileri", "Uzaktan erişim ayarları", "Görevler", "Vardiya notları", "Otelde kalanlar ve KBS", "Kayıp eşya", "Denetim kaydı", "Teslim alma (x)", "Ek mesai girişi", "Kendi mesai saatim", "Gün kapatma"…; varsayılanlar K-38), sütunlar = roller, hücreler = **select (göremez / görür / düzenler)**; rol ekle/kopyala/sil; hazır roller başlangıç önerisi olarak gelir ve düzenlenir/silinir (S-70), "Sahip" sabit; "uzaktan giriş yapabilir" anahtarı rol başına.
   - Yetki anahtarları ve varsayılan seviyeler `03-mimari.md` §5'ten; teknik adlar görünmez.
4. **Ayarlar iskeleti**: Genel (dil, tema, tutar görünümü, yoğunluk, **açılış ekranı** — varsayılan Takvim), Otel, Odalar ve Tipler (fiyat, hafta sonu farkı), Listeler (ödeme/kanal/hizmet/**gider bölümleri**/çamaşır türü/ürün kategorisi), **Vardiyalar**, **Görev önerileri**, Personel politikası, Takvim, Durum Etiketleri (Faz 3), Döviz (Faz 11), Uzaktan erişim (Faz 13), Yedek (Faz 14), Kullanıcılar ve Roller, Hakkında.
5. Uygulama kabuğu rol‑duyarlı: `none` ekranlar menüde yok; `view` ekranlarda yazma düğmeleri yok; doğrudan çağrı servis katmanında reddedilir.
6. **Denetim kaydı ekranı** (G-24; Faz 3 sonu izlemesinde taslağı olmadığı görüldü, 2026-10-04): kim, hangi cihazdan,
   ne zaman, neyi ekledi/değiştirdi/iptal etti, önceki ve sonraki değer; tarih, kişi ve kayıt türüyle süzme; varsayılan
   yalnız Sahip görür (rol tablosundaki "Denetim kaydı" satırı); hiçbir kayıt silinmez. Ekranın taslağı uygulamadan önce
   sahibe gösterilir (Faz 3 kalıbıyla, masaüstü + telefon).

## Kabul ölçütleri

- [x] Sıfır veritabanıyla açılış → sihirbaz → 19 oda, 5 kat kurulumu 10 dakikada (E2E, TR ve RU dilinde).
      `tests/e2e/electron/setup.spec.ts` (TR ve RU; otomasyon ~8 sn; insanın süresi sahibin denemesinde ölçülür).
- [x] Sihirbaz yarıda kapanınca kaldığı yerden devam eder; mod "istemci" seçilince bağlantı ekranına gider (`setup.spec.ts`).
- [x] Özel oda tipi eklenir ve atanır (`admin.spec.ts` Ayarlar'dan; `setup-page.test.tsx` sihirbazdan).
- [x] Rol düzenleyicide "Resepsiyon → … : göremez" seçilince menüden kalkar ve IPC çağrısı reddedilir (test); "görür"
      seçilince salt‑okunur açılır. `admin.spec.ts` rol düzenleyiciyle "Personel kartları" satırını kullanır (Görür →
      menüde, okuma 200, yazma 403; Yok → menüde yok, adres "yetkiniz yok", servis 403). "Maaş ve avans" Resepsiyon'da
      varsayılan olarak zaten "Yok" (`permission-matrix.test.ts`); maaş ekranı Faz 8'de.
- [x] Yeni rol oluşturup kullanıcıya atama; sistem rolü kopyalama (`admin.spec.ts`).
- [x] Denetim kaydı ekranı: bir ödeme iptal edilince önceki/sonraki değerle listede görünür; Resepsiyon rolü ekranı ve
      servisi açamaz (test). Ödeme iptali servis testinde (`ledger-service.test.ts`); ekranda önce/sonra
      `audit-page.test.tsx` ve `admin.spec.ts` (rol değişikliği). Ödeme ekranı Faz 7'de gelince aynı akış e2e'ye eklenir.
- [x] Boşta kilit ve kurtarma kodu akışları çalışır; şifreler scrypt; düz metin yok (DB dökümü testi:
      `session-access.test.ts` "veritabanının tam dökümünde…"; `auth.spec.ts` kurtarma kodu; `app.test.tsx` boşta kilit).

## Sonuç (2026-10-04)

**Durum:** ✅ teknik olarak tamam — ekranlar sahibe gösterildi, onay bekleniyor (`docs/plan/taslak-onay/2026-10-04-faz4.md`).

**Yapılanlar**

- **Oturum temeli (ana süreç)** — her yordam kimin çağırabileceğini söyler (`public`, `setup`, `user`, `locked`);
  yönlendirici kurulmamış/oturumsuz/kilitli çağrıyı servisten önce reddeder, servis yine yetkiyi denetler (G-23).
  Pencerenin oturum belirteci yalnız ana süreçte; arayüz hiç görmez. Bilgisayar kilitlenince ya da uyuyunca pencere de
  kilitlenir; pencere kapanınca oturum biter. Taşıma türü (IPC / HTTP) giriş noktasında belirlenir.
- **Kurulum sihirbazı** (12 adım, G-10…G-17, G-48, G-82): dil ve tema, çalışma şekli, otel, para birimleri, oda tipleri
  (gruplu, aranır, fiyatlı), odalar (üretici + düzenleyici, toplam oda/yatak), ödeme ve satış (en az bir nakit ödeme
  yöntemi), personel kuralları (prim dahil) ve vardiyalar, çalışanlar ve hesapları, takvim (vurgulu günler, resmî tatil
  önizlemesi), sahip hesabı, özet. İlerleme şifresiz kaydedilir, kapatılınca kaldığı yerden açılır; "Kurulumu bitir"
  hepsini tek işlemde yazar, hata olursa hiçbir şey yazılmaz. Kurtarma kodları bir kez gösterilir.
- **Oturum açma, kilit, kurtarma** (G-22, G-144): kişi kartı + PIN ya da şifre, kullanıcı adıyla oturum açma; 5 yanlış
  şifre → hesap 15 dakika kilitli; yanlış PIN hesabı kilitlemez, PIN'i bir süre durdurur; kolay PIN'ler (1111, 1234…)
  kabul edilmez; boşta kilit (ayardan dakika), Ctrl/⌘+L; kilitte 5 yanlış deneme oturumu kapatır; kurtarma koduyla yeni
  şifre; başkasının koyduğu şifre ilk oturumda değiştirilir; hesap menüsü (şifre, PIN, kurtarma kodları, kilitle,
  oturumu kapat). Şifre/PIN/kod scrypt özeti; veritabanında düz metin yok.
- **Roller ve kullanıcılar** (G-20, G-21, G-25): her ekran için Yok / Görür / Düzenler; rol ekle, kopyala, adını
  değiştir, sil (kullanılan rol silinmez; silinen rol arşivlenir, tohum geri getirmez); "uzaktan oturum açabilir",
  "yalnız kendi görevleri"; kimse sahip olduğundan fazla yetki veremez; "Bu rolün gözüyle bak" her rol için.
  Kullanıcı ekle (geçici şifre), düzenle, şifre sıfırla, kapat. Menü, adres ve servis aynı yetkiyle süzülür.
- **Ayarlar** (14 bölüm): Genel (kişinin kendi dil, tema, yoğunluk, kuruş, açılış ekranı — K-37; boşta kilit süresi),
  Otel, Odalar ve tipler (geçerlilik tarihli yatak değişikliği, toplu ekle ≤ 500), Listeler (altı liste; hiçbir şey
  silinmez; son nakit yöntem kapatılamaz; gider bölümleri kendi yetkisiyle görünür), Vardiyalar, Görev önerileri, Personel
  kuralları, Takvim, Durum etiketleri, Döviz / Yedek (not), Uzaktan erişim (bağlı cihazlar gerçek; mod kartları Faz 13),
  Kullanıcılar ve roller, Hakkında. Salt‑okunur bölümler bunu söyler.
- **Denetim kaydı ekranı** (G-24): kim, hangi cihaz, ne zaman, ne; tarih / kişi / kayıt türü / işlemle süzme, sayfalama;
  satır açılınca önce ve sonra alan alan (yetkiler "Personel kartları: Yok → Görür" gibi okunur); telefonda kart listesi
  ve alttan açılan ayrıntı. Varsayılan yalnız Sahip.
- **Veri**: migrasyon 0005 (`roles.remote_allowed`), 0006 (`roles.archived_at`), 0007 (`user_preferences`).
- **İncelemeler**: güvenlik ve veritabanı incelemesi (PIN deneme sınırı, oturum ve kurulum açıkları, rol silme,
  gider bölümü görünürlüğü… hepsi düzeltildi), iki `ui-reviewer` turu (TR/RU/EN, masaüstü/telefon, açık/koyu; 49 bulgu,
  hepsi düzeltildi), `turkish-ui-copy` (terimler: oturum aç / oturumu kapat, ödeme yöntemi, filtre, kullanıcı ve hesap,
  personel kuralları, pozisyon), `requirements-tracer` (açıklar bu fazda kapatıldı: kişiye özel tercihler, prim,
  tatil önizlemesi, denetim adları).
- **Testler**: 883 birim/bileşen testi (102 dosya; servis yetki taraması yeni yordamları da kapsar; denetim kaydına
  yazılan her kayıt türünün ekranda adı olduğunu denetleyen test), 32 e2e (Electron + telefon: kurulum TR/RU, devam,
  istemci modu, PIN, kilit, 5 yanlış şifre, kurtarma, rol düzenleyici, yeni/kopya rol, özel oda tipi, denetim önce/sonra,
  1366×768 ve 390×844'te TR/RU yatay taşma yok). i18n 2740 anahtar, tr/en/ru eşit. CI yeşil.

**Kabul ölçütleri** → yukarıda işaretli (yedisi de).

**Sapmalar ve kararlar (varsayılan)**

- Rol düzenleyici "sütunlar = roller" tablosu yerine **soldan rol seçilir, sağda o rolün ekran listesi** (işlev aynı;
  60 satır × 6 rol tablosu 1366 genişliğe ve telefona sığmıyordu).
- Hafta sonu fiyatı **fark değil, ayrı fiyat** olarak tutulur (Faz 2 şeması, G-48; öneri fiyatı mantığı Faz 5).
- Sihirbazın oda üreticisi 1 kat × 1 oda ile başlar (otele özgü varsayılan yok, G-09); e2e 19 odayı kendisi kurar.
- Sihirbazın odaları 2000-01-01'den geçerli açılır: sonradan girilen eski kayıtlar odasını bulur.
- "İstemci" seçilen bilgisayarda sihirbaz bağlantı ekranına gider; bağlanma Faz 13'te (o fazın notlarında: istemci
  modu yerel veritabanı açmayacak, rol başına üç durumlu uzaktan erişim, HTTP'de hız sınırı ve çerezli cihaz kimliği).
- Saat alanları bilgisayarın dil ayarına göre 12/24 saat görünür; 24 saatlik kendi bileşenimiz Faz 15'te.
- Denetim ekranının taslağı uygulamadan önce değil, çalışır hâliyle gösterildi (onay kaydı yukarıda).
- Kişiye özel tercihler: oturum açmamış pencere ve yeni hesaplar otelin değerini (sihirbazdaki seçim) kullanır.

**Sahip onayı, 1. tur (2026-10-04)** — 33 ekrandan 30'u onaylandı; üçünde değişiklik istendi ve yapıldı
(`taslak-onay/2026-10-04-faz4.md`):

- Para birimleri: listede olmayan her ISO para birimi aranıp eklenir (kurulum + Ayarlar · Otel; en çok 20). Kuruş
  hanesi artık ISO 4217'nin tamamından (`shared/money.ts`: JPY/VND 0, TND/OMR/JOD 3, CLF 4).
- Satış kanalları: 12 → 38, dört türe göre başlıklı; e-posta, WhatsApp, web sitesi; Otelz.com (Türkiye) ile
  Hotels.com (Expedia Group) ayrı adlarla; Türk ve Rusça pazar siteleri, toptancılar, 6 bavul emaneti sitesi. Excel'deki
  kanallar + e-posta açık, diğerleri kapalı başlar (tohumda `defaultOn`).
- Görevler: 22 yeni öneri; otelin kendi tekrarlı görevi kurulumda ve Ayarlar · Görev önerileri'nde eklenir
  (`tasks.createTemplate`, yetki: görevler düzenleme; migrasyon gerekmedi).

### Hata avı düzeltmeleri (P4fix, 2026-10-05)

Faz 4 hata avı (`hunt-f4/REPORT.md`, 14 bulgu; #10 ve #16 P13sec'te) ve ana oturum kararları (varsayılan). Avcının
betikleri düzeltmeden önce hatayı gösteriyordu, düzeltmeden sonra hata iddiaları kırılıyor; kalıcı testler:
`src/main/services/rooms-capacity.test.ts`, `tests/unit/auth-lockout.test.ts`, `tests/unit/auth-reauth-remote.test.ts`,
`tests/unit/admin-fixes.test.ts`,
`tests/unit/laundry-closed-type.test.ts`, `tests/unit/permissions-rooms.test.ts`, ekranlarda
`rooms-section.test.tsx`, `users-section-roles.test.tsx`, `lock-page.test.tsx`, `login-page.test.tsx`; e2e
`auth.spec.ts`, `admin.spec.ts`.

- **#1 oda kullanımdan kaldırma** (varsayılan: kapasite geçmişine göre, K-27): oda yalnız geçerlilik tarihinden sonra
  kalkar; o tarihten sonra iptal edilmemiş gecesi olan oda kapatılamaz (`errors.roomHasStays`, ayrıntıda rezervasyon
  listesi); takvim aralıkta kullanımda olan ya da konaklaması olan odaları gösterir, kapalı günleri "Oda kullanımda
  değil" diye çizer; kapalı güne rezervasyon `errors.roomClosedOn` — "20 Ekimden kaldırılan odanın 25 Ekim
  rezervasyonu varsa kapatma reddedilir ve liste döner", "kaldırılan oda tarihine kadar takvimde ve listede kalır…",
  "1 Aralıktan kapanacak oda o güne kadar rezerve edilir; kapalı güne rezervasyon reddedilir".
- **#2 ileri tarihli değişiklik** bugünkü kartı değiştirmez (oda listesi, durum panosu, görevler, rezervasyon formu
  geçmişten bugünü okur); daha erken tarihli yeni değişiklik sonraki planları iptal eder (migrasyon 0015
  `room_capacity_changes.cancelled_at/cancelled_by`); Ayarlar → Odalar'da satırda plan rozeti, oda penceresinde
  kapasite geçmişi ve "Geri al" — "1 Aralıktan 3 yatak: bugünkü kart 2 yatak kalır…", "vazgeçip bugünden 2 yatak
  girilince ileri tarihli plan iptal olur…", "planlı değişiklik geri alınır; başlamış değişiklik ve odayı açan ilk satır
  geri alınmaz", "henüz açılmamış odanın açılış satırı geri alınmaz", "planlı kapasite değişikliği ve açılış tarihi
  satırda…", e2e "odanın ileri tarihli yatak değişikliği bugünkü kartı değiştirmez…".
- **#3 ileri tarihten açılan oda** öncesinde rezerve edilemez, boş oda aramasında yok, doluluk raporu ve bakanlık
  yatağı saymaz (rapor sorgusu bütün canlı değişiklikleri okur) — "1 Aralıkta açılacak 601: 28 Kasım rezerve
  edilemez, raporlar ve bakanlık yatağı saymaz; açılınca sayılır".
- **#4 ekran olanı söyler**: kilit ekranında 5 yanlış pencereyi kapatır, hesap kilitlenmez ("…oturum kapanır" ipucu,
  oturum açma ekranında "Hesap kilitli değil"); PIN'in kendi sayacı ve ipucu, 6. denemede servisin "PIN duraklatıldı"
  yanıtı; şifrede 5. yanlış servisten `errors.accountLocked` + bitiş saati — "5. yanlış şifre hesabı kilitler ve
  bitiş saatini söyler…", "PIN: 5 yanlış PIN hesabı kilitlemez…", "kilit ekranı: 5 yanlış deneme pencereyi kapatır…",
  `login-page.test.tsx` iki test, `lock-page.test.tsx`, e2e "kilit ekranında beş yanlış deneme pencereyi kapatır…".
- **#5** geçerli kurtarma kodu kilidi aşar; kilitliyken doğru şifre "hesap kilitli (bitiş: …)" der; kilit bitince
  sayaç sıfırdan başlar — "kilitli hesapta geçerli kurtarma kodu yeni şifre belirletir…", "kilit bitince sayaç
  sıfırdan başlar…", e2e "beş yanlış şifreden sonra hesap bitiş saatiyle kilitlenir; … kurtarma kodu açar".
- **#6 zorunlu şifre değişikliği**: yeni şifre eskisiyle aynı olamaz (`errors.samePassword`, formda da); değişiklik
  beklerken PIN ve kurtarma kodu yok (`errors.mustChangePasswordFirst`); şifre sıfırlama kişinin kullanılmamış
  kodlarını da düşürür — "geçici şifre yeni şifre olarak yazılamaz", "zorunlu değişiklik beklerken PIN ve kurtarma
  kodu alınamaz", "şifre sıfırlanınca kişinin kullanılmamış kurtarma kodları da düşer".
- **#7** kapatılan çamaşır türü bekleyeni oldukça "(listeden kaldırıldı)" adıyla ekranda kalır, dönüşü yazılabilir —
  "10 çarşaf gönderilip tür kapatılınca satır … bekleyen 10 adetle kalır".
- **#8** otelin ülkesi TR değilse Türk bayramı üretilmez; ülke değişince üretilmiş (ve çevrimiçi doğrulanmış) satırlar
  iptal edilir / yeniden üretilir (`calendar_generation.country`) — "ülkesi DE olan otelde Türk bayramı üretilmez…".
- **#9 / güvenlik N-2** mevcut şifre soran yordamlar (şifre, PIN, kurtarma kodu) yanlışı oturum açma gibi sayar —
  ağdan gelen çağrıda uzaktan sayaçta, masaüstünde masaüstü sayacında (K-45 (2)); 5. yanlış hesabı kilitler ve o
  oturumu kapatır, her yanlış `reauth_failed` denetim satırı yazar; ağdan şifre özeti ana iş parçacığı dışında
  (`changePasswordAsync`, `setPinAsync`, `generateRecoveryCodesAsync`, `server/auth-handlers.ts`); üçü
  `SIGN_IN_PROCEDURES` listesinde — "açık oturumda yanlış mevcut şifre sayılır, denetime yazılır; 5. yanlışta hesap
  kilitlenir ve oturum kapanır", "doğru mevcut şifre önceki yanlışları siler", "ağdan 5 yanlış mevcut şifre uzaktan
  sayaçta sayılır, oturum düşer; masaüstü sayacı değişmez", "ağdan doğru mevcut şifreyle şifre değişir".
- **Güvenlik N-11** ağdan kilit açma uzaktan kilide bakar (masaüstü kilidine değil); ağdan kilit, yanlış şifreden ayırt
  edilmez — "uzaktan kilitli hesap ağdan kilit açamaz (doğru şifreyle de); masaüstü kilidi ağı ilgilendirmez".
- **#11** ana para birimi kabul edilenlerden çıkarılamaz (`errors.baseCurrencyNotAccepted`); `hotel.timezone` geçerli
  IANA adı olmalı (ayar ve sihirbaz) — "ana para birimi kabul edilenlerden çıkarılamaz", "geçersiz saat dilimi
  (Mars/Olympus) reddedilir…".
- **#12** `staff.expenseSection` sahip bölümü yetkisi (`expenses.owner`) ister, var olan açık bölüm olmalı — "personel
  gider bölümü sahip bölümü yetkisi ister ve var olan açık bölüm olmalı".
- **#13** kullanıcı ekranı rolleri yeni `users.roleChoices` listesinden okur (`settings.users` yeter; verilemeyecek
  roller seçilemez) — "yalnız kullanıcı yetkisi olan rol rolleri adlarıyla ve verebileceği kadarıyla görür",
  "yalnız kullanıcı yetkisi olan rol hesap ekler…", yetki: "%s: rol adlarını yalnız kullanıcı yetkisiyle okur".
- **#14** sahip rolünün uzaktan erişimi de değiştirilemez (servis reddeder) — "sahip rolünün uzaktan erişimi de
  değiştirilemez".
- **#15** (a) menüyü daraltma ve tur bitirme denetim kaydına yazılmaz; (b) denetim okuyucusu görmediği modülün
  kayıtlarının (misafir, rezervasyon, kara liste, firma, kayıp eşya, rehber, personel kartı) içeriğini görmez; (c) oda
  güncellemesinin satırında geçerlilik tarihi ve not — "menüyü daraltıp açmak ve turu bitirmek denetim kaydına
  yazılmaz…", "misafir yetkisi olmayan denetim okuyucusu misafir kaydının içeriğini görmez", "kapasite değişikliğinin
  geçerlilik tarihi ve notu denetim kaydına yazılır".

- **CI: rol düzenleyicinin "kaydetmeden çık" sorusu** (`admin.spec.ts` "kaydedilmemiş rol değişikliğiyle başka bölüme
  geçerken sorulur", yalnız CI'da kırmızı; yerelde CPU 12× yavaşlatmayla 20+ denemede üretilemedi): soru,
  yönlendiricinin `withResolver` durumundan açılıyordu; o durum her cevaptan sonra eşzamansız yeniden yazıldığından
  hızlı ikinci denemede soru kapanıp açılabiliyor, kapanmakta olanla açılan iki soru üst üste kalabiliyordu. Bekleyen
  gezinme artık bölümün kendi durumunda: aynı anda tek soru; yeni deneme bekleyeni "kal" diye cevaplar; bölüm kapanırsa
  bekleyen kalmaz — "“Vazgeç”in hemen ardından yeniden denenince tek soru açılır; “Kaydetmeden devam et” bölümü
  değiştirir" (`roles-section.test.tsx`).

Değişen beklentiler: `auth-service.test.ts` (5. yanlış ve kilitte doğru şifre artık `errors.accountLocked`),
`auth-remote.test.ts` (sahip rolünün uzaktan erişimi değişmez), `booking-fixes.test.ts` (satışa kapalı oda servis
üzerinden kapatılır), `users-audit-backup.test.ts` (misafir yetkisi olmayan denetim okuyucusu misafir satırını hiç görmez), `lock-page.test.tsx`, `login-page.test.tsx`, e2e `auth.spec.ts`.

Kalan: iş günü hesaplarının otelin saat diliminden tek yardımcıyla yapılması (#11 ikinci yarı) P14fix'in
`localDateIn` yardımcısıyla sürüyor; oda kapasitesinin "bugün"ü bilgisayarın günüdür (otel bilgisayarı otelin saat
diliminde). Ağdan kilitli hesap "kilitli" demez (hesabın varlığı ağdan öğrenilmesin), masaüstünde bitiş saatiyle der.
