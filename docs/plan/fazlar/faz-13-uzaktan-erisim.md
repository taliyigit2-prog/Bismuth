# Faz 13 · Sunucu Modu, İstemci + Yedek Kopya, Şifreli Kutu, Devral, Telefon Arayüzü (Uzaktan Erişim)

**Amaç:** Resepsiyon otel bilgisayarında, sahip evdeki Mac'inden ve telefonundan **aynı veriyi** görsün ve yetkisi olan
işlemleri yapsın — bizim sunucumuz olmadan, otel bilgisayarı tek yazıcı kalarak. Otel bilgisayarı çökse bile sahibin Mac'inde
**her şey** görünsün; bilgisayar tamamen bozulursa Mac ya da yeni bilgisayar **devralsın**. Hepsi **ücretsiz** (K-19, K-31).

**Gereksinimler:** G-140 … G-146, G-135, G-144, G-02.
**Ön koşul:** Faz 1 (taşıma katmanı soyutlaması baştan kurulur), Faz 4 (oturum/roller), Faz 5–12 (ekranlar; mobil düzen Faz 3'te taslaklandı), Faz 14'ün şifreleme/anahtar altyapısı bu fazla birlikte yazılır.
**Sorular:** yok — S-65, S-66, S-71, S-62, S-79, S-82…S-89 cevaplandı/varsayılan; S-97 hayır (kat görevlisi WhatsApp'la devam).
**Referans:** `03-mimari.md` §2, §7, §8, §11; **`04-arastirma/uzaktan-bulut-secenekleri.md` §6.1 (C2 bileşenleri), §8 (spike'lar), §11 (ücretsiz yol, kılavuz iskeleti)**; `04-arastirma/i18n-rtl-mobil.md` Bölüm B; `06-kararlar.md` K-19, K-31, K-32.

## Spike'lar (fazın başında; sonuçlar `04-arastirma/`'ya)

| ID | Ne | Başarı ölçütü |
|---|---|---|
| S-A | **NetBird Free**: otel hesabıyla ağ; Windows 10 PC servis + setup key + oturum süresi kapalı; sahip davetli (ayrı Google hesabı); Mac + iPhone + Android; Türk Telekom/Superonline/mobil hatlarda bağlantı; Mac'te Tailscale ile birlikte çalışma (aynı `100.64.0.0/10`) | Yeniden başlatma sonrası < 2 dk erişim; ≤ 30 dk kurulum (teknik olmayan biri); her hatta bağlantı |
| S-B | `change_log` + yedek kopya: Drizzle şemasından tetikleyici üreteci; idempotent uygulayıcı; fast-check ile rastgele işlem dizisi → kopya = kaynak | 1.000 değişiklik < 1 sn; karma eşit |
| S-C | Şifreli kutu: `.bmr` biçimi, geçici ad + rename, Google Drive masaüstü (Win akış modu, macOS File Provider) gecikmesi, yarım dosya, zayıf PC CPU/RAM etkisi | p95 < 2 dk; bozuk/yarım dosya asla uygulanmaz |
| S-D | Devral tatbikatı: ana bilgisayarı "öldür" → Mac devralır → eski PC geri gelir → epoch görür, yazmayı kapatır | Veri kaybı yok; eski PC yazma kabul etmez |
| S-E | Telefon: NetBird üzerinden HTTP mobil arayüz, "ana ekrana ekle", çerez oturumu, QR eşleme; otel Wi‑Fi'ında yerel adres | İki platformda açılır; Bugün < 2 sn |

## Teslimatlar

1. **Sunucu modu** (`src/main/server/`): Hono uygulaması ana süreçte; `/api/*` kontrat çağrıları (zod doğrulama → servis → yanıt), `/` ve statik dosyalar = aynı React paketi; port (varsayılan 7373); yalnızca yerel ağ + özel ağ arayüzleri; hız sınırı; `bonjour-service` ile duyuru (`_bismuth._tcp`).
   - Oturum: `/api/auth/login` → belirteç (çerez `HttpOnly` + `SameSite=Strict` + Origin denetimi); `sessions`/`devices`; cihaz adı; süre; iptal.
   - Yetki: aynı `ctx`; rol bazlı `remote.allowed` (her yerden / yalnız yerel ağ / kapalı).
   - Ayarlar → **Uzaktan erişim**: mod (tek / sunucu / istemci), port, bağlı cihazlar (ad, son görülme, IP, çıkar), **adresler**: yerel ağ ve özel ağ (otomatik algılama: NetBird `wt0`/`100.x`, Tailscale `100.x`/`*.ts.net`; Bismuth ağ programından bağımsız) + **QR**; "Hep açık" rehberi (G-146); açılışta otomatik başlat.
2. **Değişiklik günlüğü** (`src/main/replica/`, yeni numaralı migrasyon): çoğaltılan her tablo için üretilmiş `AFTER INSERT/UPDATE/DELETE` tetikleyicileri → `change_log(seq, epoch, tbl, pk, op, row_json, schema_version, ts)`; `host.epoch` ayarı; `synchronous=FULL`.
3. **İstemci + yedek kopya** (Mac): `transport/http.ts` ile canlı yazma/okuma; yerel **salt‑okunur SQLite kopyası** canlı akıştan (`/api/replica/changes?after=seq`, SSE) ve kutudan güncellenir; `schemaVersion` kapısı ("Bismuth'u güncelleyin"); bağlantı yoksa tüm ekranlar kopyadan salt‑okunur, başlıkta **"Yedek kopya · 14:32"** rozeti, yazma düğmeleri kapalı + açıklama; yeniden bağlanma; sürüm uyumsuzluğunda sunucunun tarayıcı arayüzüne yönlendirme.
4. **Şifreli kutu** (`src/main/relay/`): her dakika (değişiklik varsa) segment, her gece anlık görüntü → `.bmr` (gzip + AES‑256‑GCM, HKDF dosya anahtarı, başlık AAD) → **otelin Google Drive klasörü** (`Drive'ım/Bismuth/kutu/`; geçici ad + rename); `relay.excludeIdentity` (kimlik no yok); 14 anlık görüntü; düşük öncelik ve parça parça yazma (K-32). **Bismuth anahtarı**: kurulumda QR + 11×5 kâğıt metni (K-41; yazdırılır), cihazda `safeStorage`; Mac'te bir kez girilir.
5. **Devral sihirbazı**: "Otel bilgisayarı bozuldu mu? Bu bilgisayarı ana bilgisayar yap" → son veriyle `epoch+1`, kutuya epoch dosyası, sunucu modu açılır; eski PC daha yüksek epoch görünce yazmayı kapatır ve "yeni ana bilgisayardan kopyala" önerir; iki yerde çevrimdışı yazılmışsa "çakışan kayıtlar" raporu (otomatik birleştirme yok).
6. **Telefon/tablet arayüzü**: aynı React paketi, `layouts/mobile`: alt gezinme (Bugün · Takvim(liste) · Misafir · Kasa · Daha fazla), G-143 kapsamı (görevler, vardiya notları, otelde kalanlar dahil); Sheet formlar, 44 px; 10 yıllık ızgara yerine gün/oda listesi ve 7 günlük görünüm; PWA manifest + "ana ekrana ekle" (HTTP'de yer imi gibi).
8. **PDF özet** (G-145, S-62): sunucu her saat (ayar) `Drive'ım/Bismuth/ozet.pdf` yazar — Bugün + aylık özet, **kişisel veri yok** (misafir adı, tanıtıcı not, kimlik yok); telefondan Drive uygulamasıyla açılır; kapatılabilir.
9. **Uzaktan erişim kılavuzu** (`docs/otel/uzaktan-erisim.md`, program içinden açılır; G-18 kılavuzunun parçası): `uzaktan-bulut-secenekleri.md` §11 iskeletiyle resimli, basit Türkçe: Drive masaüstü (otel Gmail'i) → NetBird (otel Gmail'i ağ sahibi, setup key, oturum süresi kapalı) → sahibi davet → Mac ve telefona NetBird (sahibin kendi hesabı) → Bismuth'ta "Aç", QR, anahtarı yazdır → Mac'te "Ana bilgisayara bağlan" → telefonda QR; FileVault/BitLocker önerisi; sorun giderme (PC kapalı, uyku, güvenlik duvarı, Mac'te iki VPN). Windows güvenlik duvarı kuralı kurulumda (NSIS `installer.nsh`); macOS'ta ilk açılışta izin.
10. **Güvenlik testi**: yetkisiz belirteçle `/api` → 401; rol dışı çağrı → 403; `remote.allowed=yalnız yerel ağ` rolü özel ağ adresinden → 403; hız sınırı; belirteç iptali anında; sunucu dış arayüze bağlanmıyor; CSP/CORS yalnız kendi kaynağı; kutu paketinde kimlik no yok; anahtarsız cihaz paketi çözemez.

## Faz 4'ten notlar (güvenlik incelemesi, 2026-10-04)

Faz 4 masaüstü oturumunu kurdu; HTTP yüzeyi açılırken şunlar **zorunlu**:

- **Giriş listesi**: `auth.signInUsers` HTTP'de kapalı ya da en az bilgiyle (ad listesi uzaktan kullanıcı adı tahminini kolaylaştırır); uzaktan giriş kullanıcı adı + şifre ile.
- **Hız sınırı scrypt'ten önce**: IP + cihaz başına giriş/PIN/kurtarma denemeleri, şifre özeti hesaplanmadan reddedilir (CPU tüketme saldırısı); scrypt HTTP yolunda **asenkron** (`crypto.scrypt`) çalışır, ana süreç donmaz.
- **Cihaz belirteci çereze bağlı**: `deviceId` istemcinin gönderdiği metin değil, sunucunun verdiği `HttpOnly` çerezden okunur; PIN duraklatma sayacı bu kimliğe ve IP'ye bağlanır.
- **Taşıma türü** giriş noktasında belirlenir (`HandlerEnv.transport`): HTTP sunucusu `transport: 'http'` bağlar; kurulum (`setup`) erişimi HTTP'de zaten kapalı, `remoteAllowed=false` rolü HTTP'de oturum açamaz, açık oturumu da çalışmaz (`ctxForUser`).
- Kilit ekranı sayacı (5 yanlış → oturum kapanır) HTTP oturumunda da pencere yerine oturum başına tutulur.
- `/api/*` için `Content-Type: application/json` ve `Origin` denetimi (CSRF; `.claude/rules/ipc.md`).
- **Bağlantı ekranı** (`/connect`, `features/auth/connect-page.tsx`): Faz 4'te yalnız açıklama + "tek başına kur" var; adres
  alanı ve "Bağlan" burada çalışır hâle gelir (ana bilgisayarı bul, QR, oturum aç) ve "henüz kullanılamıyor" metni kalkar.
- **Yasak 13 (tek yazıcı)**: istemci modunda bu bilgisayar otel verisini **yerelde tutmaz**. Faz 4 ara durumu: "istemci"
  seçimi (`app.mode`) yerel veritabanına yazılıyor ve sihirbaz yazamaz hâle geliyor; bu fazda istemci modu açılışta yerel
  `hotel.db`'yi hiç açmamalı (mod küçük bir yapılandırma dosyasında tutulur, yedek kopya ayrı salt‑okunur dosyadır).
- **Rol başına uzaktan erişim**: Faz 4 `roles.remote_allowed` (açık/kapalı, 0005) getirdi; "her yerden / yalnız yerel ağ /
  kapalı" üç durumu yeni numaralı migrasyonla eklenir (eski değer: 1 → her yerden, 0 → kapalı).

## Kabul ölçütleri

- [x] Aynı ağdaki ikinci bilgisayar Bismuth'u istemci modunda açıp sunucuyu listede görür, giriş yapar, rezervasyon oluşturur; sunucu ekranında anında görünür. — `tests/e2e/electron/remote.spec.ts` "ikinci Bismuth istemci modunda bağlanır, oturum açar, rezervasyon yazar; ana bilgisayarda hemen görünür" (aynı makinede iki örnek, ayrı veri klasörü; adres elle yazılır — bu test ortamında çoklu yayın yok); listede görünme `src/main/server/link-config.test.ts` "duyuru _bismuth._tcp türüyle…" ve `connect-page.test.tsx` "yerel ağda bulunan ana bilgisayara dokununca…"; gerçek yerel ağda bonjour listesi sahip onay paketine (P13a)
- [ ] **NetBird** üzerinden farklı ağdaki Mac bağlanır; telefon tarayıcısı Bugün ekranını açar, ödeme girer.
- [x] Otel PC kapatılınca Mac'te tüm ekranlar yedek kopyadan salt‑okunur açılır, rozet son eşitleme saatini gösterir; açılınca canlıya döner. — `tests/e2e/electron/replica.spec.ts` "ana bilgisayar kapanınca ekranlar yedek kopyadan salt okunur açılır; açılınca canlıya döner" (iki Electron örneği; pencere yeniden yüklenince de kopyadan açılır); `tests/unit/replica-live.test.ts` "sahip oturum açınca kopya kendiliğinden başlar…"; `src/main/replica/store.test.ts` (her yordam kopyada çökmeden 203 / "yalnız okunur") (P13b)
- [ ] NetBird kapalıyken (özel ağ yok) Mac'in kopyası Drive kutusundan ≤ 2 dk gecikmeyle güncellenir.
- [x] Devral tatbikatı (S-D) veri kaybı olmadan geçer; eski PC yazma kabul etmez. — `tests/unit/takeover-drill.test.ts` "veri kaybı olmadan devralır; eski bilgisayar geri gelince yazamaz ve çakışan kayıtları listeler" (iki servis örneği + kutu klasörü + üçüncü okuyucu); gerçek iki bilgisayarla tatbikat sahip onay paketine (P13b)
- [x] Mobil görünüm Playwright telefon emülasyonunda (iPhone/Android boyutları) G-143 ekranlarını yatay kaydırmasız gösterir. — `tests/e2e/electron/remote.spec.ts` "telefon boyutunda tarayıcı ana bilgisayarı açar; G-143 ekranları yatay kaydırmasız" (gerçek sunucu modu, çerezli oturum, 13 ekran + 7 günlük görünüm; P13a)
- [x] Güvenlik testleri geçer; `security-reviewer` ajanı HTTP yüzeyini ve kutu şifrelemesini onaylar. — kutu
  şifrelemesi incelemede onaylandı; HTTP yüzeyinin engelleri (Y-1, Y-2, Y-3, O-1, O-2) P13sec ile kapandı:
  `tests/unit/server-security.test.ts` (26), `src/main/server/host-identity.test.ts`; bulgu → test eşlemesi
  "Sonuç — Güvenlik düzeltmeleri (P13sec)" bölümünde. Düzeltmelerin yeniden gözden geçirilmesi ana oturumda.
- [ ] Kılavuzu izleyen teknik olmayan biri (sahip) kurulumu kendi başına tamamlar (gerçek deneme, süre kaydedilir).
- [ ] İnternet yokken sunucu makinede her şey çalışmaya devam eder (regresyon testi); zayıf PC profilinde kutu ve PDF yazımı arayüzü yavaşlatmaz.

## Sonuç — P13a: sunucu modu, HTTP sertleştirme, istemci bağlantısı, telefon arayüzü (2026-10-05)

Bu fazın ilk yarısı (madde 1, 3'ün canlı kısmı, 6, 9, 10 ve "Faz 4'ten notlar"in tamamı). Değişiklik günlüğü, yedek
kopya, şifreli kutu, devral ve PDF özeti (madde 2, 3'ün kopya kısmı, 4, 5, 8) P13b'nindir.

**Yapılanlar**

- **Sunucu modu** (`src/main/server/`): `host-app.ts` aynı yönlendiriciyi ve aynı React paketini sunar; sıra: ana
  bilgisayar adı denetimi (IP, bilgisayarın adı, `*.local`, `*.netbird.cloud`, `*.ts.net`; başka ad → 421, DNS
  rebinding), arayan adresi yalnız bu bilgisayar / yerel ağ / özel ağ (100.64.0.0/10; internet adresi → 403), adres
  başına istek sınırı (429), `/api` için yalnız POST + `Content-Type: application/json` + `Origin` = sunucunun kendisi
  (+ `Sec-Fetch-Site`), CORS başlığı hiç yok (OPTIONS 405), her yanıtta CSP/`frame-ancestors 'none'`/nosniff/
  `X-Bismuth-Version`. `listen.ts` + `host-controller.ts`: 0.0.0.0 yerine her izinli adrese ayrı dinleyici, 30 sn'de
  bir yeniden tarama (NetBird sonradan bağlanınca adresi kendiliğinden eklenir), port doluysa "port kullanımda".
  `net.ts` adres sınıfları ve gösterilen adresler (NetBird `wt0`, Tailscale, diğer 100.x). Ayar: `host.port` (7373),
  `host.sessionHours` (12); `app.mode` ve `host.*` artık `remote.settings` yetkisi ister.
- **Oturum ve cihaz** (`http-sessions.ts`, `cookies.ts`): belirteç ve cihaz kimliği yalnız `HttpOnly` +
  `SameSite=Strict` çerezde; cihaz çerezi sunucunun gizli anahtarıyla imzalı (`userData/host-secret.key`), uydurma
  kimlik yeni cihaz sayılır; kilit durumu ve yanlış kilit açma sayacı oturum başına; taşıma türü giriş noktasında
  `http`. `auth-handlers.ts`: HTTP'de giriş listesi boş, şifre/PIN/kurtarma özetleri asenkron (`crypto.scrypt`),
  giriş denemeleri adres + cihaz başına sınırlı ve özetten **önce** reddedilir, PIN duraklatması adrese de bağlı.
- **Rol başına uzaktan erişim** üç durumlu: her yerden / yalnız otelin ağından / kapalı — migrasyon
  `0010_roles_remote_access` (eski 1 → her yerden, 0 → kapalı; `remote_allowed` uyumluluk için eşit tutulur). Yalnız
  yerel ağ rolü özel ağdan doğru şifreyle 403 `errors.remoteLanOnly` alır; açık oturumu da özel ağda 403. Rol
  düzenleyicide anahtar yerine üç seçenekli liste.
- **Yerel ağ duyurusu** (`src/main/discovery/`): `bonjour-service` ile `_bismuth._tcp` (sürüm, veri sürümü, otel
  adı); bağlantı ekranı birkaç saniye dinler.
- **İstemci modu** (yasak 13): mod `userData/connection.json` dosyasında; istemci olarak açılan Bismuth veritabanı
  açmaz. Pencerenin çağrıları ana süreçteki bağlantıdan (`host-link.ts`, `client-app.ts`) ana bilgisayara gider;
  oturum ve cihaz çerezi ana süreçte kalır (masaüstü penceresindeki belirteç gibi), ekran görmez. Sihirbazda "Başka
  bir Bismuth'a bağlan" seçilince pencereler hemen istemci moduna geçer; Faz 4 ara durumundaki bilgisayar açılışta
  taşınır. `schemaVersion` + sürüm kapısı: farklıysa bağlantı durur, ekran hangi tarafın güncelleneceğini söyler ve
  "Tarayıcıda aç" ile ana bilgisayarın kendi ekranlarını sistem tarayıcısında açar. Bağlantı kopunca anlaşılır 503
  ("Ana bilgisayara ulaşılamıyor"), 5 sn'de bir yeniden deneme.
- **Bağlantı ekranı** (`/connect`) gerçek: yerel ağda bulunanlar, elle adres, ulaşılamıyor / sürüm farklı durumları,
  "Bu bilgisayarı tek başına kur". Telefonlar QR'ı ana bilgisayarın Ayarlar ekranından okutur.
- **Ayarlar → Uzaktan erişim** gerçek servise bağlı ("Örnek veri" kalktı): mod (tek / ana bilgisayar / istemci, onaylı),
  çalışma durumu, adresler + QR (`uqr`), duyuru, port, "Hep açık" (açılışta başlat + öğütler), uzaktan oturum süresi,
  bağlı cihazlar; istemci modundaki bilgisayarda kendi kartı (ana bilgisayar adresi, durum, değiştir, ayrıl);
  telefondan yalnız görüntüleme.
- **Bağlantı durumu ve "yazma kapalı" kapısı** (`lib/transport/connection.ts`): her çağrı durumu bildirir; üst çubukta
  rozet, kopunca şerit ("Değişiklikler şu an kaydedilemez", son bağlantı saati, "Şimdi dene"), geri gelince bütün
  ekranlar yenilenir; tarayıcıda ana bilgisayarın sürümü değişirse "Ekranı yenile". `useWritesBlocked()` P13b'nin
  salt-okunur yedek kopyasının düğmeleri için hazır.
- **Telefon/tablet**: alt gezinme (Bugün · Takvim · Misafir · Kasa · Daha fazla) zaten vardı; takvime **7 günlük
  görünüm** (Gün / 7 gün, seçim hatırlanır), PWA `manifest.webmanifest` + simgeler + `apple-touch-icon`, ağdan açılan
  tarayıcıda bir kez "Ana ekrana ekle" ipucu.
- **Kılavuz** `docs/otel/uzaktan-erisim.md` (§11 iskeleti, basit Türkçe, sorun giderme tablosu); Windows güvenlik duvarı
  kuralı `build/installer.nsh` (yalnız özel ağ profili; kaldırmada silinir); macOS yerel ağ izni metni
  (`NSLocalNetworkUsageDescription`, `NSBonjourServices`).

**Karşılanan G-xx:** G-140 (canlı kısım), G-141 (bağlantı durumu; salt-okunur kopya P13b), G-143, G-144, G-146, G-135,
G-02 (ana bilgisayar internetsiz çalışır; sunucu yalnız yerel/özel ağ).

**Testler:** `tests/unit/server-security.test.ts` (18: 401, 403, yalnız yerel ağ rolü özel ağdan 403, giriş ve istek
hız sınırı, iptal anında, CSRF, CORS yok, CSP, internet adresi 403, DNS rebinding 421, 0.0.0.0/genel adreste dinlememe,
port dolu), `tests/unit/client-mode.test.ts` (gerçek dinleyici üzerinde istemci: bağlan, oturum aç, yaz, sürüm farkı,
kopma/geri gelme), `tests/unit/permissions-remote.test.ts`, `src/main/services/auth-remote.test.ts` (asenkron özet, üç
durum, PIN–adres, migrasyon 0010), `src/main/server/{net,cookies,link-config}.test.ts`, renderer:
`connection.test.ts`, `connect-page.test.tsx`, `remote-section.test.tsx`, `connection-status.test.tsx`,
`layouts/mobile/mobile.test.tsx`. E2E `tests/e2e/electron/remote.spec.ts` (3).

**Varsayılanlar (K-39):** port 7373 (varsayılan); uzaktan oturum 12 saat, seçenekler 1/12/24 saat, 7/30 gün (varsayılan);
istek sınırı adres başına 600/dk, giriş 10 başarısız deneme/10 dk adres ve cihaz başına, aynı adresten aynı anda 2
giriş (varsayılan); güvenlik duvarı kuralı yalnız "özel" profil (varsayılan); Linux'ta "açılışta başlat" gösterilmez.

**Sahip onay paketine:** S-A (NetBird gerçek hesap/cihazlar, hatlar, Mac'te Tailscale ile birlikte), S-E (gerçek
telefonda QR, "ana ekrana ekle", Bugün < 2 sn), gerçek yerel ağda bonjour listesi, Windows'ta kurulum programının
güvenlik duvarı kuralı ve ilk açılış izni, macOS yerel ağ izni penceresi, kılavuzun sahip tarafından denenmesi (süre)
ve kılavuz resimleri.

**Kalanlar:** madde 2, 3 (yedek kopya), 4, 5, 8 ve onlara bağlı kabul kutuları → P13b; `security-reviewer` onayı ana
oturumda.

## Sonuç — P13b: değişiklik günlüğü, Mac yedek kopyası, şifreli kutu, devral, saatlik PDF özet (2026-10-05)

Bu fazın ikinci yarısı: madde 2, 3'ün kopya kısmı, 4, 5, 8, 9'un kopya/kutu/devral kısmı ve 10'un kutu/kopya kısmı.

**Yapılanlar**

- **Değişiklik günlüğü** (`src/main/replica/`, migrasyon `0013_change_log`: `change_log`, `replica_grants`; Drizzle'dan
  üretildi, elle SQL yok). `tables.ts` şemadaki her tabloyu ya çoğaltır ya da gerekçesiyle yerelde tutar (`sessions`,
  `devices`, `recovery_codes`, `replica_grants`, `change_log`); şifre/PIN özetleri hiçbir okuyucuya gitmez, kimlik
  numaraları yalnız izinli okuyucuya. `triggers.ts` her çoğaltılan tablo için `AFTER INSERT/UPDATE/DELETE`
  tetikleyicilerini **Drizzle şemasından üretir** (bütün sütunlar `json_object`, anahtar değişirse silme + yazma, dönem
  `host.epoch` ayarından, veri sürümü); tetikleyiciler veritabanı her açıldığında migrasyonlardan sonra şemayla
  eşitlenir (migrasyon öncesi kaldırılır: migrasyonun kendi satır değişiklikleri yarım kaydedilmez). Yeni tablo ya da
  sütun tetikleyicisiz kalamaz; listede olmayan tablo testi kırar. Günlük 30 gün tutulur.
- **Canlı akış** (`src/main/server/replica-routes.ts`): `GET /api/replica/changes?after=&epoch=` (sayfalı JSON ya da
  SSE) ve `/api/replica/snapshot` (NDJSON, sonu doğrulanır). Yetki: kopya izni (`Authorization: Bearer`, her istekte
  kullanıcı etkin mi, rol `remote.settings` görebiliyor mu, cihaz çıkarılmamış mı, ağ kuralı) ya da `remote.settings`
  oturumu; yoksa 401, yetkisizse 403. **Kimlik alanları:** rol yetkisine göre süzülür (`guests.identity` yoksa hiç
  gönderilmez) — devralmada veri kaybı olmasın diye; Drive kutusu varsayılan olarak hiç içermez (varsayılan, K-39).
- **Yedek kopya** (istemci): ayrı dosya `userData/replica/replica.db` (yasak 13: otel veritabanı açılmaz), aynı
  migrasyonlar, tetikleyicisiz; `apply.ts` idempotent uygulayıcı (tam satır `INSERT OR REPLACE`, silme, denetim kaydı
  yalnız eklenir, eski dönem yok sayılır, yeni dönem önce anlık görüntü ister, kimlik gelmeyen pakette eldeki kimlik
  korunur). Uzaktan erişim ayarını görebilen biri Mac'te oturum açınca kopya izni kendiliğinden alınır, kopya
  başlar. Ana bilgisayara ulaşılamazken (ya da sürüm farklıyken) bütün yordamlar kopyadan **aynı servislerle**,
  kopyayı başlatan kişi olarak ve her düzenleme yetkisi kapalı (`readOnlyCtx`) yanıtlanır; yanıt durumu **203**.
  Ekranda: `connection` durumu `readonly`, `useCan` düzenleme yetkilerini kapatır (yazma düğmeleri kalkar), üst
  çubukta "Yedek kopya · 14:32", şeritte neden + "Şimdi dene"; sürüm farkında "Bismuth'u güncelleyin" + "Tarayıcıda
  aç". Pencere ana bilgisayar kapalıyken yeniden açılırsa bağlantı ekranı yerine kopya açılır (ilk 4 sn bekler).
  Değişiklik denemesi `errors.readOnlyCopy`. İstemcinin kendi yanıtları 202 (bağlantı durumunu değiştirmez).
- **Şifreli kutu** (`src/main/relay/`): `.bmr` = başlık (JSON) + gzip + AES‑256‑GCM, dosya başına HKDF anahtarı,
  başlık AAD; geçici ad + rename; her dakika değişiklik varsa `seg-…`, her gece (yedek saatinde) ve kutuda bu dönemin
  görüntüsü yoksa `snap-…`, sessiz saatlerde 5 dakikada bir `durum.bmr` notu; 14 anlık görüntü; büyük dosya 4 MB
  bloklar arasında dinlenerek ve iş varken bekleyerek yazılır (K-32). Klasör `Drive'ım/Bismuth/kutu` (Faz 14'ün Drive
  bulma kodu; yedek klasörü elle seçildiyse onun yanındaki `kutu`). Mac kopyası canlı bağlantı yokken 30 sn'de bir
  kutudan güncellenir; yarım/bozuk/başka anahtarlı dosya asla uygulanmaz. Ayarlar → Uzaktan erişim'de kutu kartı
  (durum, "Kutuya yaz", "Kimlik numaraları kutuya konmasın", "Saatlik PDF özet", "Şimdi yaz").
- **Bismuth anahtarı:** Ayarlar → Yedek'te anahtar metniyle birlikte **QR** ve **Yazdır** (A4 sayfa, K-41). Mac'te
  Yedek kopya kartından bir kez girilir (yazarak ya da QR'dan okunan metni yapıştırarak). **P16d bulgusu çözüldü:** bu
  bilgisayar kendi anahtarını önceden oluşturduysa kâğıttaki anahtar "Bu bilgisayarın anahtarı değiştirilsin mi?"
  onayıyla kaydedilir (`backup.setRecoveryText` ve `remote.replicaSetKey` için `replace`); istemci bilgisayar kendi
  anahtarını hiç üretmez.
- **Devral** ("Otel bilgisayarı bozuldu mu? Bu bilgisayarı ana bilgisayar yap"): kutudan son hâle getirir, kopyayı
  otel veritabanı yapar (varsa eski dosya yanına ayrılır, silinmez), `host.epoch` = bilinen en yüksek + 1, devralan
  kişinin yeni şifresi (şifre özetleri hiç kopyalanmaz; diğer kullanıcılar şifre değiştirmeye zorlanır), kutuya
  şifreli `epoch-<n>.bmr`, sunucu modu, yeniden başlatma. Eski bilgisayar kutuda yeni dönemi görünce (dakikada bir)
  `replaced.json` yazar: her bağlamda düzenleme kapanır (`errors.notMainComputer`), yanıtlar 203 ("Salt okunur"
  rozeti), kutuya/PDF'e yazmaz, zamanlayıcılar durur; Ayarlar'da "Bu bilgisayar artık ana bilgisayar değil" kartı,
  **çakışan kayıtlar** listesi (yeni ana bilgisayarın bilmediği değişiklikler; otomatik birleştirme yok), "Listeyi
  kaydet", "Yeni ana bilgisayara bağlan".
- **Saatlik PDF özet** (`summary.ts` + `summary-pdf.ts`, Electron `printToPDF`): `Drive'ım/Bismuth/ozet.pdf`; bugün
  (dolu/satılabilir oda, giriş, çıkış, otelde kalan oda/kişi, kirli oda, açık arıza, kasada olması gereken) + bu ay
  (P10a'nın `reports.summary` servisi: doluluk, gelir, gider, kâr, ortalama gecelik fiyat). Veri tipi ad taşıyamaz;
  sayfa betiksiz ve dış kaynaksız.
- **Kılavuz** `docs/otel/uzaktan-erisim.md` genişletildi: yedek kopya, kutu, PDF özet, anahtarı yazdırma/girme, Drive
  klasörünü Mac'te ekleme, devral bölümü, güvenlik, sorun giderme satırları.

**Karşılanan G-xx:** G-140 (yedek kopya, kutu, devral), G-141 (salt okunur kopya, rozet), G-145 (PDF özet), G-02
(kutu ve özet sessiz, ağ gerektirmez), G-144 (kopya izni cihazla iptal).

**Testler:** `src/main/replica/replica.test.ts` (S-B: tablo sınıflandırması — yeni tablo unutulursa kırılır;
tetikleyiciler üreteçle birebir; 12 tohumlu rastgele işlem dizisi + yazma sürerken alınan anlık görüntü + iki kez
uygulama → tablo karmaları eşit; 1.000 değişiklik < 1 sn; eski dönem uygulanmaz), `store.test.ts`,
`src/main/relay/relay.test.ts` (S-C: bayt/başlık bozulması, yarım dosya, anahtarsız cihaz okuyamaz, kutuda kimlik no
yok, 14 görüntü), `summary.test.ts` (demo otel: hiçbir ad/not/kimlik/telefon PDF verisinde ve sayfasında yok),
`tests/unit/takeover-drill.test.ts` (S-D), `tests/unit/replica-live.test.ts` (akış 401/403, kimlik yalnız izinliye,
cihaz çıkarılınca 401, rol izni kalkınca 403; istemcide canlı → kopya → canlı), `tests/unit/permissions-replica.test.ts`,
`backup-service.test.ts` (anahtar değiştirme onayı), renderer: `replica-card.test.tsx`, `relay-card.test.tsx`,
`connection-status.test.tsx`, `connection.test.ts`, `view-as.test.tsx`, `backup-section.test.tsx`.
E2E `tests/e2e/electron/replica.spec.ts`; `remote.spec.ts` kopma beklentisi güncellendi (kopya varken şerit
"salt okunur" olur).

**Varsayılanlar (K-39):** kimlik numaraları canlı kopyaya rol yetkisiyle, kutuya hiç (varsayılan); kopya izni
`remote.settings` görme yetkisi ister (yeni izin anahtarı eklenmedi) (varsayılan); kopya açıkken Bismuth şifre
sormaz, kopyayı başlatan kişi olarak salt okunur açılır (Mac'in kendi oturum şifresi/FileVault korur) (varsayılan);
gece görüntüsü yedek saatinde (04:00) (varsayılan); günlük 30 gün (varsayılan); "buradayım" notu 5 dk (varsayılan);
ana bilgisayar ulaşılabilirken devral yalnız "Yine de devral" işaretiyle (varsayılan); PDF özet otelin dilinde
(varsayılan); eski bilgisayarın yeni dönemi yalnız kutudan öğrenmesi (yerel ağ duyurusundan değil) (varsayılan).

**Sahip onay paketine:** S-C gerçek Google Drive gecikmesi (Windows akış modu, macOS File Provider; p95 < 2 dk) ve
"NetBird kapalıyken kopya Drive'dan ≤ 2 dk" kabulü; S-D'nin iki gerçek bilgisayarla tatbiki; anahtar sayfasının
yazıcıdan çıktısı ve QR'ın telefon kamerasıyla okunması; ozet.pdf'in telefonda Drive uygulamasıyla açılması; zayıf
PC'de kutu/PDF yazımının arayüzü yavaşlatmadığının gözlenmesi; kılavuzun sahip tarafından denenmesi.

**Kalanlar:** `security-reviewer` onayı (HTTP akışı + kutu şifrelemesi) ana oturumda; fast-check yerine tohumlu
üreteç kullanıldı (bağımlılık eklenmedi); program içi kılavuza (P15b) girecek noktalar raporda.

## Sonuç — Güvenlik düzeltmeleri (P13sec) (2026-10-05)

Faz 13 güvenlik incelemesinin (taban 33b453e) bütün bulguları ve Faz 11/14 hata avının #1, #3, #7'si; karar **K-45**.
Her bulgu için önce kırmızı test yazıldı, sonra düzeltildi.

**Yapılanlar (bulgu → düzeltme → test)**

| Bulgu | Düzeltme | Test |
|---|---|---|
| Y-1 | `backup.recoveryText`, `setRecoveryText`, `restore` ve yeni `backup.pickDriveFolder` yalnız masaüstü penceresi (`desktopOnly`); telefonda/Mac'te anahtar ve geri yükleme düğmeleri yok, açıklama var | `server-security` "Bismuth anahtarı ağdan gösterilmez, girilmez, değiştirilmez…"; `backup-service.test` "anahtarı gösterme, girme ve geri yükleme yalnız…"; `permissions-backup` "uzaktan bağlanan sahip anahtarı göremez…"; `backup-section.test` "telefondan anahtar gösterilmez…" |
| Y-2 | `/api/*` için `hono/body-limit` (8 MB = `MAX_BODY_BYTES`, uzunluksuz gövde de sayılır) → 413 `errors.requestTooLarge`; `/api/replica/*` gövdeli istek 413 | `server-security` "oturumsuz 8 MB üstü giriş isteği 413 alır…" |
| Y-3 / K-45 (1) | `host.listenLan` (varsayılan kapalı): kapalıyken yerel ağ adresleri dinlenmez, listelenmez, yerel ağdan gelen istek 403 `errors.remoteLanOff`; Ayarlar'da anahtar + "misafir Wi‑Fi ayrı olmalı" onayı (`remote.setListenLan`, yalnız IPC). TOFU: sunucu sırrından Ed25519 kimlik (`host-identity.ts`), `remote.hello` nonce imzası; istemci ilk anahtarı `connection.json`'da saklar, kimliği bu çalışmada doğrulanmamış adrese hiçbir şey (şifre, çerez, kopya izni) göndermez, başka anahtar → `identityChanged`, kişi kabul edince (`remote.acceptHostIdentity` / `connect {acceptIdentity}`) geçer; ana bilgisayarda "Bu bilgisayarın kimliği" gösterilir. `docs/otel/uzaktan-erisim.md` §Güvenlik: misafir Wi‑Fi ayrımı, yerel ağ seçeneği, kimlik | `net.test` "varsayılan: yalnız bu bilgisayar ve özel ağ…", "yerel ağ ayarı açılınca…"; `server-security` "varsayılan: otel Wi‑Fi'ından gelen istek 403…"; `host-identity.test` (4); `permissions-remote` "otelin ağını açmak…"; `remote-section.test` "otelin ağı varsayılan kapalı…", "istemcide ana bilgisayarın kimliği değişince…"; `connect-page.test` "başka kimlikle cevap veren adrese bağlanmaz…" |
| O-1 | Ana bilgisayar adı tam eşleşme: ad, `ad.local`, `ad.lan`, `ad.home.arpa` | `net.test` "bilgisayarın adıyla başlayan başka site adı geçmez"; `server-security` "…tanınmayan ad (DNS rebinding) 421" |
| O-2 / K-45 (2) | HTTP'de `auth.signInWithPin` → 403 `errors.pinDesktopOnly`; HTTP kilidi yalnız şifreyle açılır; telefon/istemci kilit ekranında PIN seçeneği yok | `server-security` "PIN ile giriş ağdan 403…"; `lock-page.test` "telefonda ya da tarayıcıda PIN sorulmaz…" |
| O-3 | Ayrı uzaktan sayaç `users.remote_failed_attempts` / `remote_locked_until`: ağdan yanlış şifreler yalnız uzaktan girişi kilitler | `server-security` "ağdan yanlış şifreler yalnız uzaktan girişi kilitler…" |
| O-4 + 11/14 #3 | `inTransaction` başında merkezi kapı (`writeRefusal`: `ctx.readOnly` ve süreç çapında `writeGate` = devralınmış bilgisayar); `settings.set` de; index.ts'te yedek zamanlayıcısı ve kapanış yedeği devralınmış bilgisayarda çalışmaz; Drive yedek adı dolu ise `-2`… | `takeover-drill` "devralınmış bilgisayarda görüntüleme yetkisiyle yazan yordamlar ve programın kendi işleri hiçbir şey yazmaz"; `backup-service.test` "Drive'da aynı adlı yedek varsa…" |
| O-5 / K-45 (4) | Devral kâğıttaki anahtarı yeniden ister (`takeOver.keyText`, kayıtlı anahtarla aynı olmalı → `errors.takeoverKeyMismatch`) | `takeover-drill` "veri kaybı olmadan devralır…" (yanlış anahtar reddi); `replica-card.test` "devral: … kâğıttaki anahtar yeniden yazılır…" |
| O-6 | `host.epoch` yama şemasından çıktı (yalnız devral ve geri yükleme yazar); `app.mode`, `host.*`, `relay.*`, `backup.driveFolder` `settings.set`'te yalnız IPC (`isDesktopOnlySettingKey`) | `server-security` "ağdan ayar: …dönem hiçbir ekrandan yazılmaz" |
| O-7 / K-45 (3) | Drive klasörü yalnız klasör seçicisiyle (`backup.pickDriveFolder`, Electron diyaloğu); ayar şeması `\\…`, `//…`, `\\?\…` reddeder; metin kutusu kalktı ("Klasör seç", "Otomatik bul") | `backup-service.test` "Drive klasörü yalnız klasör seçiciyle…"; `server-security` (aynı test, UNC); `backup-section.test` "Drive klasörü yazılarak değil…" |
| D1 | 100.64/10 yalnız NetBird/Tailscale (wt0, NetBird, tailscale, macOS utun) arayüzünde dinlenir; diğeri listelenmez, Ayarlar'da uyarı (`unservedPrivate`) | `net.test` "yerel ağ ayarı açılınca … sıradan karttaki 100.x … hiç dinlenmez (D1)"; `remote-section.test` "…100.x adresi için uyarı (D1)" |
| D2 | Kutu: başlık = dosya adı (`headerMatchesName`), kutudan aynı dönemin eski anlık görüntüsü reddi (canlı akış hariç), `gunzipSync` çıktı sınırı (512 MB), okumadan önce boyut sınırı (256 MB) | `relay.test` "kutu dosyalarına güven (D2)" (3) |
| D3 | `sessions.locked_at`: HTTP oturum kilidi kayıtta | `server-security` "oturum kilidi kayıtta tutulur…" |
| D4 | Kopya akışı: izin/kişi/adres başına en çok 2 açık SSE; tam kopya dakikada 2 → 429 | `replica-live` "aynı kişi/adres için en çok 2 açık akış…" |
| D5 | Kopya izni belirteci `connection.json`'da `safeStorage` ile mühürlü (eski açık değer ilk açılışta mühürlenir) | `link-config.test` "kopya izni dosyada mühürlü (D5)" (2) |
| D6 | Akış sayfası `identity` söyler; izin kalkınca kopyadaki kimlik numaraları silinir, geri gelince tam kopya | `replica-live` "rolünden kimlik görme izni kalkınca…" |
| D7 | Çakışan kayıtlar dosyasında kimlik no yalnız `guests.identity` ile | `replica-live` "çakışan kayıtlar dosyasına kimlik numarası…" |
| D8 | mDNS adı makine adı yerine kimlikten kısa kod (`Bismuth 15CA`); otel adı TXT'de kaldı (bağlantı ekranında seçmek için gerekli) | — (yalnız ad; elle bakıldı) |
| D9 | Korumasız `createServerApp`/`startServer` `tests/e2e/mobile/plain-server.ts`'e taşındı (`src/main/server/index.ts` silindi) | `api.test`, mobil e2e |
| D10 | Pencere: `nodeIntegrationInWorker:false`, `webviewTag:false` açık yazıldı; CSP `font-src 'self'` (`data:` yok; paketteki fontlar dosya) | `server-security` "CSP yazı tipini yalnız programın kendi dosyalarından alır (D10)" |
| 11/14 #1 | Geri yükleme yeni dönem açar: `applyPendingRestore` değiştirilen verinin dönemini okur (`termOfFile`), `noteRestored` `host.epoch = max(geri yüklenen, önceki) + 1` yazar (denetimde `term`); canlı kopya ve kutu tam kopyaya döner, kutuya ilk dakikada yeni dönemin tam kopyası yazılır; devral dönemi kutudaki dosya adlarının en yüksek döneminin de üstünde başlar (`highestBoxTerm`) | `src/main/replica/restore-term.test.ts` "geri yüklemeden sonra kopya ve kutu yeni dönemin tam kopyasıyla başlar; tablo karmaları kaynağa eşit" (düzeltme olmadan kırmızı doğrulandı); `backup-service.test` "geri yüklenen veri yeni bir dönem açar…" |
| 11/14 #7 | `restore` kâğıttaki anahtar bu bilgisayarınkinden farklıysa `replace` ister (anahtar yedeği açtıktan sonra sorulur); arayüzde "Bu bilgisayarın anahtarı değiştirilsin mi?" | `backup-service.test` "Drive kopyası şifreli (K-05)…"; `backup-section.test` "Drive yedeği kâğıttaki farklı anahtarla…" |

**Migrasyon:** `0016_remote_security` (Drizzle'dan üretildi, elle SQL yok): `sessions.locked_at`,
`users.remote_failed_attempts` (varsayılan 0), `users.remote_locked_until`. Eski veri taşınmaz.

**Bilinçli istisnalar:** `tableDigests` eşitliğinde `audit_log` hariç: kopyada da salt eklenir (G-24, 0003/0004
tetikleyicileri), geri yüklemenin götürdüğü değişikliklerin denetim satırları kopyada kalır; kopya kaynağın bütün
denetim satırlarını taşır (testte ayrıca denetlenir). D2'nin "aynı dönem eski anlık görüntü" reddi yalnız kutudan
gelende: canlı akış ana bilgisayarın kendisi (bu düzeltmeden önce geri yüklenmiş eski kurulumların kopyası takılmasın).

**Varsayılanlar (K-39):** `host.listenLan` kapalı (K-45); uzaktan kilit 5 yanlış şifre / 15 dk (masaüstüyle aynı)
(varsayılan); SSE 2 akış, tam kopya 2/dk (varsayılan); kutu paketi en çok 256 MB, açılmış en çok 512 MB (varsayılan);
mDNS'te otel adı kalır (varsayılan); ağdan kimlik değişince bağlantı ekranı/Ayarlar'da kabul (varsayılan).

**Sahip onay paketine:** gerçek iki bilgisayarda kimlik (TOFU) uyarısı ve devral sonrası kabul; modemde misafir ağı
ayrımı; Windows'ta `safeStorage` (DPAPI) ve macOS Keychain ile kopya izninin mühürlenmesi; klasör seçicinin Drive
klasörünü göstermesi.

**Kalanlar:** bağlantı şeridi kimlik değişince "ulaşılamıyor" der (ayrıntı Ayarlar ve bağlantı ekranında); Ayarlar →
Kullanıcılar'daki "kilitli" rozeti uzaktan kilidi göstermez; HTTP yüzeyinin düzeltmelerle yeniden `security-reviewer`
incelemesi ana oturumda.

## Sonuç — Güvenlik yeniden incelemesi (P13sec2) (2026-10-05)

İkinci güvenlik incelemesinin (taban 1e24845) N-1, N-3…N-10, N-12 bulguları ve veritabanı incelemesinin yedek
kopya/kutu maddeleri (#1–#4). N-2 ve N-11 (`auth-service.ts`) P4fix paketinde. Her madde için test yazıldı.

**Yapılanlar (bulgu → düzeltme → test)**

| Bulgu | Düzeltme | Test |
|---|---|---|
| N-1 | `host-app.ts`: adres başına dakikalık istek sınırı ve aynı anda açık istek üst sınırı (adres başına 16, toplam 48) gövde okunmadan önce (429); gövde `readBody` ile sınırlı okunur: oturumsuz, kilitli ya da herkese açık yordamda 64 KB, 8 MB yalnız geçerli oturumla (413); `listen.ts` `server.maxConnections = 64` | `server-hardening` "aynı adresten 20 paralel, parçalı 8 MB istek…", "aynı anda açık istek bütün adreslerin toplamında da sınırlı", "oturumsuz remote.hello + 1 MB gövde 413…", "oturumlu büyük ama geçerli istek (içe aktarma önizlemesi…) hâlâ çalışır", "dinleyici aynı anda en fazla belirli sayıda bağlantı kabul eder"; `server-security` "oturumsuz 8 MB üstü giriş isteği 413…" (yeşil kaldı) |
| N-3 (kalan risk, belge) | Bismuth↔Bismuth TLS yapılmadı (varsayılan: özel ağ NetBird/WireGuard şifreli, otelin ağı isteğe bağlı). Ayarlar → Uzaktan erişim yerel ağ yardımı ve onay metni (üç dil): "Otelin ağında bağlantı şifresiz; kimlik denetimi araya girmeyi durdurmaz. Mümkünse özel ağ (NetBird) adresini kullanın." `docs/otel/uzaktan-erisim.md` §Güvenlik: ortadaki adam riski, TOFU ilk bağlantı davranışı (ilk anahtar sorgusuz saklanır; kimlikten önce kurulmuş Mac'ler de bir sonraki bağlantıda saklar) | — (metin; `i18n-check`) |
| N-4 | `isAllowedHostName(host, makine, sınıf)`: `.local/.lan/.home.arpa` yalnız bilgisayarın adıyla; genel sonek yalnız `.ts.net`, `.netbird.cloud`, `.netbird.selfhosted`; loopback'ten gelen istekte yalnız localhost, 127.0.0.1, [::1], makine adı | `server-hardening` "127.0.0.1'den Host: evil.local → 421…"; `net.test` "yerel ağ adları ve bu bilgisayardan gelen istek (N-4)" (2) |
| N-5 | `isPrivatePeer`: 100.x istemci yalnız soketin yerel adresi NetBird/Tailscale kartının adresiyse ve kartın aralığındaysa özel ağ (tek adresli /32 kartta 100.64.0.0/10); değilse 'public' → 403. `createHostApp({ interfaces })`, kartlar 10 sn önbellekte | `server-hardening` "özel ağ yalnız kendi kartından ve aralığından: yerel 100.90.1.2/16, istemci 100.65.0.5 → 403"; `net.test` "özel ağdan gelen istek (N-5)" (3) |
| N-6 | mDNS ilanı yalnız `host.listenLan` açıkken; her yeniden taramada (ayar değişince `applyListen` → `rescan`) yayın açılır/kapanır; TXT'de program sürümü yok (`s` veri sürümü ve otel adı kalır) | `server-hardening` "host.listenLan kapalıyken ilan yapılmaz…"; `link-config.test` "duyuru … (program sürümü yok)…" |
| N-7 | `remote.acceptHostIdentity` girdisi `{ fingerprint }`, `remote.connect` `acceptIdentity: <parmak izi>`; `acceptOffered(fingerprint)` yalnız sunulan anahtarın parmak izi eşitse kaydeder (değilse 409 ve yeni parmak izi); bağlantı ekranı ve Ayarlar gösterdiği parmak izini gönderir | `host-identity.test` "kabul, ekranda görülen parmak iziyle: arada anahtar değişince kabul reddedilir (N-7)"; `client-mode` "başka kimlik yalnız ekranda gösterilen parmak iziyle kabul edilir…"; `connect-page.test`, `remote-section.test` (gönderilen parmak izi) |
| N-8 | `settings.set` başında `writeRefusal` (süreç çapındaki `writeGate` dahil); `createSettingsService(db, clock, writeGate)` | `write-gate` "writeGate='replaced' iken settings.set(systemCtx()) → errors.notMainComputer (N-8)" |
| N-9 | `backup.cancelRestore` `desktopOnly`; ağdan `backup.overview` `dataDir`, `backupsDir`, `driveDir` = null (sözleşmede null olabilir); telefonda klasör yolları yerine "Klasörlerin yeri yalnız ana bilgisayarda gösterilir.", geri yükleme düğmeleri yerine "Geri yükleme ana bilgisayarda yönetilir."; Hakkında (`app.getInfo`) da ağdan veri klasörü yolunu vermez | `permissions-backup` "uzaktan bağlanan sahip planlı geri yüklemeyi iptal edemez; genel bakışta yerel klasör yolları yok (N-9)"; `backup-section.test` "telefonda klasör yolları ve geri yükleme iptali yok…"; `server-hardening` "telefondaki sahip Hakkında bilgisinde veri klasörünün yolunu almaz" |
| N-10 | Kur sağlayıcı API anahtarları `systemSealer(safeStorage)` ile (`os:` önekli); Bismuth anahtarı artık API anahtarı kaydedilince oluşmaz (`keySealer` yalnız eski kaydı okur, anahtar yaratmaz); eski (Bismuth anahtarlı) kayıt bir kez okunup hemen yeniden mühürlenir; dosya her zaman 0600. `host-secret.key` `safeStorage` ile mühürlü (`loadHostSecret` → `host-identity.ts`; eski düz dosya aynı sırla mühürlenir; yoksa 0600) | `network.test` "Bismuth anahtarı değişince … API anahtarı korunur; kaydetmek Bismuth anahtarı yaratmaz", "eski sürümün Bismuth anahtarıyla mühürlediği kayıt…", "mühürleyici yokken … 0600"; `host-identity.test` "sunucu sırrı dosyası (N-10)" (2) |
| N-12 | `electron-builder.yml` Linux `dir` hedefi yalnız CI duman testi: `docs/plan/bagimliliklar.md` notu (yapılandırma değişmedi) | — |
| DB #1 (§4.9-12) | `tables.ts` `PRIVATE_ROWS` + `rowVisible`: kişisel not yalnız sahibinin kopyasına (`RowFilter.reader` = izin/oturum kullanıcısı); başkasına değişikliği yalnız anahtarlı bir silme olarak gider (metin ve sahip yok, sıra boşluksuz); kutuya hiç kişisel not gitmez; kopya `ApplyOptions.reader` ile her uygulamada başkasının notlarını siler (`forgetPrivateRows`), tam kopya zaten tabloyu yeniler | `private-rows.test` "Resepsiyon'un kişisel notu sahibin kopyasında yok…", "kopyada daha önceki sürümden kalan başkasının kişisel notu sonraki uygulamada silinir", "Drive kutusuna hiçbir kişisel not gitmez…" |
| DB #2 (yazma kapısı) | `settings.set` (N-8), `createGrant` (`writeRefusal` + `writeGate`), şifre kurtarma (`recoverFinish`, tek satır kapı) kapıdan geçer; oturum "son görülme", oturum kilidi, kopya izni "son çekme", açılış tohumu/`task-upgrades` ve kurulum sihirbazı kapıyı neden atladığını koddaki yorumla söyler | `write-gate` (3) |
| DB #3 (bellek) | `snapshotRows` tabloları rowid ile 2 000'lik sayfalarla okur; kutu anlık görüntüsü `encodePackageLines` ile geldikçe sıkıştırılır (bütün satırlar metin olarak bellekte tutulmaz; `encodePackageAsync` kalktı) | `large-snapshot` "10 yıl × 20 oda: satırlar sayfa sayfa okunur…" (245 bin satır, 96,6 MB metin → 3,6 MB paket, ~2,5 sn), "anlık görüntü sorgusu bir seferde en çok 2000 satır okur…" |
| DB #4 | `promoteReplica`: `PRAGMA foreign_key_check` (yetim satır → `PromoteError` → `errors.takeoverOrphans`); başarısızlıkta yarım dosya silinir, önceki veri yerine döner. `openDatabase`: bekleyen migrasyon varken `integrity_check ≠ ok` ise migrasyondan ve yedekten önce durur (`SQLITE_CORRUPT` → açılıştaki Faz 16 kurtarma önerisi); migrasyon yoksa eskisi gibi açılır ve uyarır | `promote.test` (2); `db.test` "bozuk veritabanı (integrity_check ≠ ok) migrasyondan önce durur…" |

**Migrasyon:** yok.

**Varsayılanlar (K-39):** Bismuth↔Bismuth TLS yok, risk belgelendi (varsayılan); aynı anda açık istek adres başına
16, toplamda 48; dinleyici başına 64 bağlantı; oturumsuz/herkese açık gövde 64 KB (varsayılan); mDNS'te otel adı
kalır, program sürümü çıkar (varsayılan); kişisel notlar Drive kutusuna hiç girmez, sahibininki de (varsayılan;
sonucu: kutudan geri yüklenen ya da devralan bilgisayarda başkalarının kişisel notları yoktur); `safeStorage` açılamazsa
yeni sunucu sırrı = yeni kimlik, istemciler kimlik değişti uyarısı görür (varsayılan).

**Sahip onay paketine:** Windows (DPAPI) ve macOS (Keychain) üzerinde `host-secret.key` ve API anahtarlarının
mühürlenmesi, program güncellenince kimliğin değişmediğinin görülmesi; otelin ağı kapalıyken Mac'in bağlantı ekranında
ana bilgisayarın listede görünmemesi (NetBird adresi yazılır).

**Kalanlar:** devralma çakışma listesinde (`conflictingChanges`) kişisel notlar yok; `apply.ts` kimlik numaralarını korurken `guests`/`blacklist` anahtar +
kimlik sütunlarını belleğe alır (küçük).

### Son kontrol düzeltmesi (QA3d)

- D1 (K-45): istemci ana bilgisayarın kimliğini şifre/oturum göndermeden önce yeniden doğrular (`auth.*` çağrılarında her
  seferinde, diğerlerinde son doğrulama 3 sn'den eskiyse). Test: `host-identity.test.ts` "A kapanıp aynı adreste B açılınca…".
- D2: kimlik değişince rozet "Kimlik değişti", şerit "Ayarlar → Uzaktan erişimde onaylayın" + bağlantı. Test:
  `connection-status.test.tsx` (D2).
- D3 (varsayılan): `summary.*` ayarları ve "Şimdi yaz" yalnız ana bilgisayarda (HTTP 403 `errors.remoteLocalOnly`); telefonda
  kutu kartı salt okunur. Testler: `server-security.test.ts`, `permissions-replica.test.ts`, `relay-card.test.tsx`.
- D5: anahtarlar telefonda ≥44 px; Bismuth/API anahtarı 200 karakter sınırı metni; uzaktan kilitliyken doğru şifreye kilit
  metni (`server-security.test.ts`, `auth-reauth-remote.test.ts`); ondalık port "Tam sayı yazın" (`remote-section.test.tsx`);
  aşırı uzun adres biçim hatası (`link-config.test.ts`); açık istemcilerde ayarlar 30 sn'de ve odaklanınca yenilenir.
