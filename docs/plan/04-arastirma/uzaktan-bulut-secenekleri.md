# Araştırma: Uzaktan erişim, bulut ve "otel PC'si çökerse" — derin inceleme (Bismuth)

Tarih: 2026-10-01 · Hazırlayan: araştırma ajanı · Önceki rapor: `fx-remote-access.md` Bölüm C (K-19'un dayanağı).
Bu rapor K-19'u sahibin **yeni kısıtlarına** göre yeniden değerlendirir ve v1 için **tek varsayılan + bir isteğe bağlı eklenti** önerir.

**Doğrulama notu.** Oturumun çıkış vekili `tailscale.com`, `supabase.com`, `netbird.io`, `turso.tech`, `kvkk.gov.tr`,
`developers.cloudflare.com` vb. sayfaları engelledi. Kaynaklar: arama sonucu özetleri, GitHub (git clone / raw), npm kayıt
defteri (sürüm/tarih **doğrulandı**). Canlı sayfadan teyit edilemeyen her ifade **(doğrula)** ile işaretlidir; Faz 0'da
tarayıcıdan bakılıp `docs/plan/04-arastirma/` altına not düşülmelidir.

---

## 0. Kısa sonuç (TL;DR)

1. **Supabase gibi bir bulut veritabanını "ana kaynak" yapmak v1 için önerilmez.** Otel internetsiz yazmaya devam etmek
   zorunda olduğu için yine yerel kopya + çevrimdışı kuyruk + çakışma çözümü gerekir; ücretsiz plan kuralları (7 gün
   hareketsizlikte durdurma, sezon kapanışında risk) ve **açık metin misafir verisinin yurt dışında durması (KVKK md. 9:
   standart sözleşme + 5 iş günü bildirim; 2026 cezası 90.308–1.806.177 TL)** "bitmiş ürün" ile çelişir.
2. **Önerilen v1 varsayılanı = "Tek yazıcı + sıcak yedek kopya + şifreli kutu"** (Bölüm C, seçenek C2):
   otel PC'si tek doğruluk kaynağı ve tek yazıcı olarak kalır (çakışma imkânsız); sahibin Mac'i **tam, salt-okunur,
   dakikalar içinde güncel bir yedek kopya** tutar; otel PC'si ayrıca **uçtan uca şifreli** değişiklik paketlerini sahibin
   zaten kullandığı bir eşitleme klasörüne (Google Drive/OneDrive/iCloud) bırakır. Otel PC'si çökse bile Mac her şeyi görür;
   PC tamamen ölürse Mac (veya yeni PC) **"ana bilgisayarı devral"** ile birkaç dakikalık kayıpla işe devam eder.
3. **Uzaktan canlı erişim için özel ağ (overlay) kalır, ama Google hesabı paylaşılmaz:** otel için **ayrı bir kimlik**
   (yeni Gmail/Apple/Microsoft hesabı) ile ayrı bir Tailscale ağı kurulur; otel PC'si **"node sharing"** ile sahibin
   kendi kişisel Tailscale ağına paylaşılır. Paylaşılan cihaz "karantinadadır": sahibin cihazlarına bağlantı **başlatamaz**.
   Sahip telefonda/Mac'te ağ değiştirmez (iOS'ta aynı anda tek VPN çalışır — bu yüzden ikinci bir VPN ürünü kötü seçim).
4. **Lisans uyarısı (yeni bulgu):** Tailscale Personal planı fiyat sayfasına göre *"only suitable for non-commercial use"*;
   ZeroTier'in ücretsiz planı da ticari olmayan kullanım içindir. Dürüst seçenekler: Tailscale **Standard ≈ 8 $/koltuk/ay**
   (otel ağında 1 koltuk yeter), ya da ticari kullanıma daha açık görünen **NetBird Free** (5 kullanıcı/100 makine; doğrula).
   Bismuth hangi overlay'in kullanıldığını umursamaz (yalnızca adres bilir).
5. **Türkiye riski:** 2025'te BTK 27 VPN servisini engelledi; bazı ISS'lerin zaman zaman WireGuard'ı engellediği ve
   Tailscale altyapısının Türkiye'de SNI ile engellendiği **iddiaları** var (tek, doğrulanmamış kaynak; Türk kullanıcılar 2026'da
   Tailscale'i kullandığını yazıyor). Şifreli kutu HTTPS üzerinden büyük bir sağlayıcıya gittiği için **overlay engellense bile**
   Mac güncel kalır — önerinin ikinci kanalı bu riski de karşılar.
6. **İsteğe bağlı eklenti (v1.1 adayı, spike'a bağlı):** "Bulut ayna + VPN'siz telefon" — sahibin **kendi** Cloudflare
   hesabında (ücretsiz Workers + D1, AB yargı bölgesi) yalnızca şifreli paketler durur; telefon `https://…workers.dev`
   adresinden PWA açar, anahtarı QR ile bir kez alır, veriyi **tarayıcıda** çözer. Otel PC'si kapalıyken de telefonda görüntüleme
   sağlar; Cloudflare veriyi okuyamaz.
7. **CRDT/yerel-öncelikli motorlar (Evolu, Jazz, Triplit, TinyBase, Automerge)** bu ürün için olgun değil: Evolu 8, Evolu 7
   verisini taşıyamıyor; Jazz 2.0 "tamamen yeni API" ile alfa; Triplit Supabase'e katıldı ve 2025-07'den beri yayın yok;
   hiçbiri Drizzle şemamızla uyumlu değil; LWW birleştirme "aynı odaya iki satış"ı engelleyemez.

---

## 1. Yeni kısıtlar → mimari sonuçları

| Sahip kısıtı (2026-10-01) | Sonuç |
|---|---|
| Resepsiyon otel PC'sinde (Win 10); internet kesikken veri girişi sürmeli | Yazma yolu **yerel** olmalı. Bulut "ana kaynak" olursa çevrimdışı kuyruk + çakışma kaçınılmaz. |
| Otel PC'si "ağır programlarla çökebilir"; tek sunucu olarak güvenilmiyor | Verinin **otel dışında, güncel** bir kopyası gerekir (Mac ve/veya şifreli bulut kutusu) + **devralma** yolu. Ayrıca SQLite `synchronous=FULL` (WAL ile) önerilir: yazma hacmi küçük, ani kapanmada son işlem kaybolmaz. |
| Sahip evde MacBook M2 (macOS 26), bazen otelde; telefondan görmek + bazı düzenlemeler | Mac = istemci + **yedek kopya**; telefon = PWA. Otelde LAN (mDNS), dışarıda overlay. |
| Tailscale'i daha önce kullandı ama **aynı Google hesabını** otel cihazlarında istemiyor | Otel için **ayrı kimlik** + **node sharing** (Bölüm A). |
| "Supabase gibi ücretsiz sunucu" önerisi | Bölüm B'de 20+ arka uç incelendi; ücretsiz katmanların çoğu hareketsizlikte durduruyor/siliyor ve küçülme eğiliminde. Bulut ancak **şifreli, aptal bir kutu (dumb relay)** olarak güvenli. |
| Misafir kişisel verisi (ad, telefon, bazen kimlik no) — KVKK | Açık metin veri yurt dışı buluta gitmemeli; gidecekse uçtan uca şifreli (Bölüm 4). |
| Ürün yıllarca bakımsız, ücretsiz | Bağımlılık az, protokol basit; bulut değişirse yalnızca "kutu" adresi değişmeli, çekirdek değil. |

---

## 2. BÖLÜM A — Tailscale'i Google hesabı paylaşmadan kullanmak (+ NetBird, ZeroTier)

### A.0 Güncel Tailscale planları (2026)

- **Pricing v4 (2026-04-08):** Personal Plus kaldırıldı, 6 kullanıcı hakkı ücretsiz Personal'a taşındı. **Personal: 0 $,
  6 kullanıcı, sınırsız kullanıcı cihazı, 50 etiketli kaynak, 3 ACL grubu.** Standard (eski Starter) **8 $/koltuk/ay**,
  Premium 18 $/koltuk/ay; iş planları koltuk bazlı. 50'yi aşan etiketli kaynak 1 $/ay.
- **Ticari kullanım:** fiyat sayfası özeti: *"Personal plan is for individuals who want to use Tailscale at home … a free plan
  that is only suitable for non-commercial use"* (doğrula — sayfa vekil tarafından engellendi; birden çok bağımsız özet aynı
  cümleyi aktarıyor). Gmail/Apple/kişisel GitHub ile açılan ağ otomatik Personal sayılır; özel alan adlı e-posta ile açılan ağ
  "iş" sayılır ve deneme sürümüne girer.
- **Kimlik sağlayıcılar:** Google (Gmail/Workspace), Microsoft (kişisel hesap dahil), GitHub, Apple, Okta, OneLogin, özel OIDC.
  **E-posta+şifre ile kayıt yok** ("Tailscale is not an identity provider"). **Passkey:** tüm planlarda var ama **ilk kayıt
  passkey ile yapılamıyor** (GitHub issue #16598 açık); passkey kullanıcısı ancak bir ağa **davetle** girebilir.
- **Paylaşım (sharing):** tüm planlarda. Cihaz → **kullanıcıya** paylaşılır (cihaz→ağ değil). Paylaşılan cihaz
  **karantinadadır**: yalnızca gelen bağlantılara cevap verir, **bağlantı başlatamaz**. Alıcı paylaşılan cihaza **tam MagicDNS
  adıyla** erişir (`bismuth-host.<otel-ağı>.ts.net`) — bu ad aynı zamanda `tailscale serve`'ün Let's Encrypt sertifikasının
  adıdır, yani telefonda **geçerli HTTPS** çalışır (doğrula: Windows'ta serve + paylaşılan cihaz kombinasyonu Spike S-A'da).
- **Hızlı kullanıcı değiştirme:** bir cihaz **aynı anda yalnızca bir** ağda (tailnet) olabilir; hesaplar arasında geçiş
  menüden yapılır. **iOS aynı anda tek VPN** çalıştırır (Tailscale + NetBird birlikte açık olamaz).
- **Gözetimsiz çalışma:** Windows tepsi › Preferences › **Run unattended** (2026'da hâlâ destekli). Düğüm anahtarı varsayılan
  **180 günde** dolar → otel PC'si için yönetim panelinde **"Disable key expiry"** (tek tık). Etiketli (tagged) cihazlarda
  anahtar süresi zaten kapalıdır; auth key'ler 1–90 gün geçerlidir.

### A.1 Üç yol — karşılaştırma

| | **A1. Otel için ayrı kimlik + node sharing (önerilen)** | A2. Ayrı otel ağı + sahibin kişisel hesabını davet | A3. Etiketli cihaz + auth key |
|---|---|---|---|
| Nasıl | Yeni hesap (ör. `otel.bismuth@gmail.com` veya Apple/Microsoft) → otel PC'si bu hesapla "otel ağı"nda. Yönetim panelinden PC **sahibin kişisel hesabına paylaşılır**. Mac/telefon kendi (mevcut) kişisel ağında kalır. | Otel ağına sahibin kişisel hesabı "kullanıcı" olarak davet edilir; Mac/telefon otel ağına ikinci profil olarak girer. | Otel PC'si ACL'de tanımlı bir etiketle (`tag:bismuth-host`) ve auth key ile kaydedilir. |
| Sahibin günlük deneyimi | Hiçbir şey değişmez; diğer projesinin cihazları ve otel PC'si aynı anda görünür. | Mac/telefonda ağlar arasında **geçiş** gerekir (aynı anda tek ağ). | A1 ile aynı + teknik adımlar. |
| Güvenlik | Otel PC'si sahibin evdeki cihazlarına **ulaşamaz** (karantina). Resepsiyon personeli otel hesabının şifresini bilmez (2FA). | Otel ağı ayrı; ama sahibin Mac'i otel ağındayken o ağın ACL'lerine tabidir. | Cihaz kullanıcıya bağlı değil (hesap silinse de kalır). |
| Kurulum adımı (teknik olmayan) | **≈ 11 adım, 25–30 dk** (A.2) | ≈ 9 adım + her gün geçiş | +4 teknik adım (ACL JSON düzenleme, `tagOwners`, auth key üretme, **CLI** `tailscale up --auth-key` — Windows GUI'de auth key alanı yok) → **sahip için önerilmez** |
| Ücretsiz plan | Otel ağı: 1 kullanıcı + 1 cihaz; kişisel ağ: değişmez. **Ticari kullanım şartı:** otel ağı için Standard (1 koltuk ≈ 8 $/ay) dürüst seçenek. | Aynı | Personal'da 50 etiketli kaynak dahil |

### A.2 A1 adımları (sahip için resimli kılavuzun iskeleti)

1. Otel için yeni bir hesap aç (Gmail ya da Apple ID/Microsoft); 2FA aç; şifre yalnızca sahipte.
2. Otel PC'sine Tailscale'i kur, **otel hesabıyla** giriş yap (otel ağı oluşur).
3. Tepsi simgesi › Preferences › **Run unattended** ✓.
4. Tarayıcıda yönetim paneli › Machines › otel PC › **Disable key expiry**; makine adını `bismuth-host` yap (nötr ad; HTTPS
   sertifikaları herkese açık CT günlüğüne düşer — otel adını koyma).
5. DNS sayfası › **HTTPS Certificates: Enable** (MagicDNS yeni ağlarda açık gelir; doğrula).
6. Machines › otel PC › **Share…** › davet bağlantısını kopyala › kendine (WhatsApp/e-posta) gönder.
7. Mac'te bağlantıyı aç, **kişisel** hesabınla gir, **Accept**. (Telefon kişisel ağdaysa ayrıca bir şey gerekmez.)
8. Otel PC'sinde Bismuth › Ayarlar › Uzaktan erişim › **Aç** (Bismuth `tailscale.exe serve --bg …` komutunu kendisi dener,
   başaramazsa adresi HTTP olarak gösterir).
9. Mac'te Bismuth › "Ana bilgisayara bağlan" › QR/adres; **yedek kopya** başlar (Bölüm 6).
10. Telefonda QR'ı okut › Safari/Chrome › "Ana ekrana ekle".
11. Deneme: otel PC'sini yeniden başlat, Mac'ten ve telefondan tekrar bağlan.

### A.3 NetBird, ZeroTier ve diğerleri — Tailscale olmazsa

| | **NetBird Cloud** | ZeroTier | Cloudflare Tunnel + Access | Twingate Starter |
|---|---|---|---|---|
| Ücretsiz | **5 kullanıcı, 100 makine**; Team 6 $/kullanıcı | **10 cihaz, 1 ağ, 1 yönetici — ticari olmayan kullanım** | Tünel ücretsiz, Access 50 kullanıcı | 5 kullanıcı |
| Ticari kullanım | "bireyler ve küçük ekipler" için konumlanıyor (doğrula: ToS) | **Hayır** (Essential 18 $/ay) | Evet | Evet |
| Kimlik | Bulutta Google/GitHub/Microsoft vb.; e-posta ile kayıt iddiası var (doğrula) — otel için ayrı hesap aynı mantıkla | İstemci kimlik istemez: 16 haneli ağ ID + panelde onay | Alan adı + Cloudflare hesabı; istemci tarafı yalnız tarayıcı (e-posta OTP) | Kurumsal |
| Gözetimsiz | Windows'ta **servis** olarak gelir; sunucu için **setup key**; "peer login expiration" ayarı kapatılmalı (doğrula) | Servis | `cloudflared` Windows servisi (panelden kopyala-yapıştır yönetici PowerShell komutu) | Connector kurulmalı |
| Cihaz paylaşımı (ağlar arası) | **Yok** → sahip otel ağına kullanıcı olarak girer; telefonda Tailscale ile **aynı anda çalışmaz** (iOS tek VPN) | Yok | — | — |
| Telefon | iOS (v0.3.1, 2026-07) ve Android (0.6.0, 2026-09) uygulaması | iOS/Android | **Uygulama yok**, tarayıcı | Uygulama |
| HTTPS | Eş adları (`*.netbird.cloud`) için **geçerli sertifika yok**; herkese açık "reverse proxy" beta | Yok | Var (Cloudflare uçta TLS sonlandırır → **trafiği açık görür**) | — |
| Değerlendirme | **B planı** (lisans açısından daha temiz olabilir; HTTPS yok, iOS çakışması) | Ticari şart nedeniyle hayır | Alan adı + internete açık giriş sayfası + KVKK (Cloudflare açık metni görür) → hayır | Aşırı |

### A.4 Türkiye ağ riski

- BTK 2025'te Proton, Surfshark, NordVPN, ExpressVPN, **WARP** dahil 27 VPN servisini engelledi; Mart 2025 ve Eylül 2025'te
  sosyal medya kısıtlamaları yaşandı. Bir blog (Turkey Censorship Megapost) bazı ISS'lerin (özellikle Vodafone) zaman zaman
  WireGuard'ı engellediğini, bir dev.to yazısı "Tailscale altyapısının Türkiye'de joker SNI kuralıyla engellendiğini" iddia
  ediyor — **bağımsız teyit yok**; ekşi sözlükte Mart 2026 tarihli Tailscale kullanım girdileri var; sahip de daha önce kullandı.
- Sonuç: overlay **tek** uzaktan kanal olmamalı. Önerideki şifreli kutu HTTPS ile Google/Microsoft'a gider (engellenme olasılığı
  çok daha düşük) → overlay kapansa da Mac güncel kalır. Spike S-A'da Türk Telekom, Superonline, Vodafone/Turkcell mobil
  hatlarından doğrudan/DERP bağlantı ölçülmeli.

---

## 3. BÖLÜM B — Ücretsiz bulut arka uçları

Değerlendirme ölçütü: "otel internetsiz çalışır", "ürün yıllarca bakımsız", "sahip terminal kullanmaz", "KVKK".
npm sürümleri 2026-10-01'de kayıt defterinden alındı.

### B.1 Ana tablo

| Arka uç | Ücretsiz limit (2026) | Hareketsizlik kuralı | AB bölgesi | Kart | Terminal'siz kurulum / Bismuth şemayı nasıl kurar | Çevrimdışı hikâye | Risk / geçmiş | Karar |
|---|---|---|---|---|---|---|---|---|
| **Supabase** (Postgres) | 2 aktif proje; 500 MB DB; 5 GB egress; 50k MAU; dosya 0,5–1 GB (doğrula) | **7 gün DB sorgusu yoksa duraklatılır**; elle sürdürülür; uzun duraklamada (90 gün → 2026-09'dan beri 1 yıl, kaynaklar çelişkili; doğrula) geri yükleme düğmesi kalkar, yedek indirilip taşınır. Sürekli otel trafiği duraklamayı önler **ama sezon kapanışında** (otel kışın kapalı) proje durur. | Frankfurt `eu-central-1` (+ İrlanda, Londra, Paris, Zürih, Stockholm) | Hayır | Web panel: proje + DB şifresi + bölge → bağlantı dizesini Bismuth'a yapıştır. Ücretsizde doğrudan bağlantı **yalnız IPv6**; Bismuth **Supavisor havuzlayıcı** (`aws-0-<bölge>.pooler.supabase.com:5432/6543`, IPv4) ile `pg` üzerinden migrasyon koşar. Alternatif: Management API + kişisel erişim belirteci. | Yok (istemci önbelleği/kuyruk sizin işiniz: PowerSync/Electric/kendi outbox) | Pro 25 $/ay/proje; RLS + Auth + iki ayrı şema (SQLite/Postgres) | **Ana kaynak olarak hayır.** Şifreli kutu olarak olur ama Drive/B2'den kötü (duraklama). |
| **Neon** (Postgres) | 100 proje; 0,5 GB/proje; 100 CU-saat/proje/ay; 5 GB transfer | **Scale-to-zero** 5 dk'da (silme değil; ilk sorguda uyanır) | Frankfurt (doğrula) | Hayır | Bağlantı dizesi yapıştır; standart TCP/WebSocket sürücü | Yok | Databricks satın aldı (2025); ücretsiz plan şu an cömert | Supabase'ten daha az kural ama aynı çevrimdışı sorunu |
| **Turso** (libSQL/Turso DB) | 100 DB, 5 GB, 500 M okuma, 10 M yazma, 3 GB senkron/ay | Ücretsizde 10 gün hareketsiz DB arşivlenir (eski kural; "soğuk başlatma kaldırıldı" duyurusu var; doğrula) | **Dublin, Stockholm** (Frankfurt yok) | Hayır | Web panel + DB belirteci; **Turso Sync** `@tursodatabase/sync 0.8.1` (2026-09-29) `push/pull/sync` | **Var:** yerel dosya, çevrimdışı yazma; çakışmada satır düzeyinde **last-push-wins** + `transform` kancası | Motor Rust ile yeniden yazıldı, **1.0 değil** ("keep independent backups"); ücretsiz kota 2025'te ~yarıya indi; libSQL → Turso geçişi (ürün yön değişimi) | En iyi teknik aday ama: `better-sqlite3`+Drizzle'ı değiştirmek, LWW, açık metin veri yurt dışında, pre-1.0 → **hayır (v1)** |
| **Cloudflare D1 + Workers** (+R2, Durable Objects) | Workers 100k istek/gün, 10 ms CPU; D1 5 M satır okuma/gün, **100k satır yazma/gün**, 5 GB toplam; 2026-09-01'den beri limit aşımı **hata** | Yok (hareketsizlik kuralı bilinmiyor) | D1 **`jurisdiction: "eu"`** (2025-11); R2 AB yargı bölgesi | D1/Workers hayır; **R2 kart ister** | Sahip API belirteci oluşturur ("Edit Workers" şablonu + D1 yetkisi) → Bismuth **wrangler olmadan** `PUT /accounts/{id}/workers/scripts/{ad}` (multipart, `main_module`) ile Worker yükler, D1'i REST ile kurar. ~12 adım. | Yok (Worker sunucudur) | Uyumluluk tarihi (`compatibility_date`) eski betiklerin çalışmasını korur → donmuş ürüne uygun; ücretsiz plan 2017'den beri | **Ana kaynak olarak hayır; şifreli ayna + VPN'siz telefon için en iyi aday (eklenti)** |
| **PocketBase** (tek Go ikilisi) | Yazılım ücretsiz; **barındırma sizin** | — | Barındırmaya bağlı | — | Nerede çalışacak? Otel PC'si (= C1), Oracle Always Free (kart; CPU/ağ <%20 7 gün → geri alınır), Render free (15 dk'da uyur, **disk kalıcı değil**), Fly.io (yeni hesaplara ücretsiz yok; 2 VM-saat/7 gün deneme) | Yok | **v0.40.x; 1.0 öncesi geriye uyum garantisi yok** | Hayır |
| **Appwrite Cloud** | 2 proje, 2 GB depolama, 5 GB bant | **2026-02-27'den beri: 7 gün *konsol (geliştirici)* etkinliği yoksa duraklatılır; uygulama trafiği sayılmaz** | Frankfurt | Hayır | Web panel + SDK | Yok | Kullanıcı şikâyetleri (günlük trafik varken duraklatma) | **Hayır** (bakımsız ürün için en kötü kural) |
| **Firebase Firestore (Spark)** | 1 GiB, 50k okuma/20k yazma/20k silme **günlük** | Yok | `europe-west`/`eur3` | Spark hayır; **Cloud Storage 2026-02'den beri Blaze (kart) istiyor** | Google hesabı + Firebase konsolu + web config yapıştır | Web SDK IndexedDB önbelleği; Node Admin SDK'da yok | Google kilidi; sahip daha önce "bulut kilidi" istemedi; ücretsiz kapsam daralıyor | Hayır |
| **InstantDB** | 1 GB; "ücretsiz projeler asla duraklatılmaz"; ticari kullanım serbest | Yok | Bilinmiyor (doğrula) | Hayır | Web panel + app ID | İstemci önbelleği + iyimser yazma; SQL değil (triple store) | Genç şirket | Hayır (SQL/rapor yok, veri açık metin) |
| **Convex** | 0,5 GB DB, 1 M fonksiyon çağrısı/ay | 30 gün çağrı yoksa "idle" | Ücretsizde bölge seçimi (AB) | Hayır | CLI ile deploy (terminal) | **Çevrimdışı-öncelikli değil** | Açık kaynak backend self-host mümkün | Hayır |
| **PowerSync** (+ Postgres) | 2 GB senkron/ay, 500 MB, 50 eşzamanlı istemci | **7 gün deploy/istemci bağlantısı yoksa örnek kaldırılır** | Bulut bölgesi (doğrula) | Hayır | Supabase/Neon + PowerSync panosu + "sync rules" YAML → teknik | **Var:** `@powersync/node 1.1.1` yerel SQLite + yükleme kuydu; yazmayı sizin backend'iniz uygular | Pro 49 $/ay; iki satıcı (Postgres + PowerSync) iki ayrı ücretsiz kural | Hayır |
| **ElectricSQL** | Electric Cloud: okuma ücretsiz, yazma 2 $/M (2026-04) | — | — | — | Postgres + Electric hizmeti | Yalnız **okuma** yolunu senkronlar; yazma sizin API'niz | `@electric-sql/client 1.5.28` | Hayır |
| **Zero (Rocicorp)** | Ücretsiz katman yok; barındırılan Hobby 30 $/ay; self-host ≈ 100–200 $/ay AWS | — | — | — | Postgres 15+ (mantıksal replikasyon) + `zero-cache` | Web odaklı | 1.0 Haziran 2026 | Hayır |
| **Triplit** | — | — | — | — | — | Vardı | **2025-10-08 Supabase'e katıldı**; npm son yayın 2025-07-31; istemci AGPL | Hayır (terk edilmiş sayılmalı) |
| **Jazz** (jazz.tools) | Jazz Cloud Starter 0 $: 100 MAU, 10 GB, 0,2 GB senkron egress (klasik fiyat sayfası; doğrula) | — | — | — | — | Yerel-öncelikli, E2EE (CoValue) | **Jazz 2.0 alfa: "entirely new API"**; `jazz-tools` alpha.58 (2026-09-30); Klasik Jazz ayrı | Hayır |
| **Evolu** | Kütüphane ücretsiz; **barındırılan relay yok** (`free.evoluhq.com` yalnız test, "veri silinebilir") | — | Self-host relay nerede? | — | `npx @evolu/relay` (Node) — terminal + sunucu | **Var:** SQLite (Kysely), E2EE varsayılan, LWW CRDT, soft delete, mnemonic anahtar | **Evolu 8 (2026-08) Evolu 7 verisini taşıyamıyor**; TypeScript 7 + `exactOptionalPropertyTypes` şart; günde birkaç sürüm | Hayır (fikir olarak değerli: E2EE relay) |
| **TinyBase** | Ücretsiz | — | — | — | WS senkron sunucusu (self-host / Durable Object) | MergeableStore CRDT | v5 → **v10.0.1** (2026-09-24) iki yılda | Hayır (SQL değil) |
| **RxDB** | Çekirdek ücretsiz; **SQLite depolama premium: Pro ≈ 99 $/ay (yıllık)** | — | — | — | — | Çoğaltma eklentileri (CouchDB, Supabase, WebRTC…) | — | Hayır |
| **Automerge / Yjs** | Ücretsiz | — | — | — | `sync.automerge.org` (test), `y-websocket` self-host | Belge CRDT'si | `automerge 3.5.0`, `yjs 13.6.33` | Hayır (ilişkisel defter değil) |
| **Eşitleme klasörü (Drive/OneDrive/iCloud/Dropbox) = aptal şifreli kutu** | Drive 15 GB, OneDrive 5 GB, iCloud 5 GB, Dropbox Basic 2 GB + **3 cihaz sınırı** | Yok | Sağlayıcıya göre (çoğu ABD/AB) | Hayır | **Hiç API/anahtar yok**: Bismuth dosyayı klasöre yazar, masaüstü istemcisi eşitler. Sahip zaten kullanıyor. | Doğal (dosya önce yerelde) | Drive for desktop Win10 64-bit'te güncelleniyor (v132, 2026-09); OneDrive Win10 22H2'de **2028-10-10**'a kadar | **Önerilen kutu (varsayılan)** — yalnızca şifreli dosya |
| **Backblaze B2** (S3 uyumlu) | **10 GB ücretsiz, kart yok**; günlük ücretsiz işlem kotası (B/C sınıfı 2.500/gün; doğrula) | Yok | **EU Central (Amsterdam)** — bölge hesap açılışında seçilir | Hayır | Web: hesap → kova → uygulama anahtarı → 4 değeri Bismuth'a yapıştır (~8 adım) | Yok (kutu) | 2015'ten beri | **Alternatif kutu** (AB bölgesi isteyenler için) |
| **Syncthing** | Ücretsiz, açık kaynak, hesap yok | — | **Bulut yok** (P2P; röleler yalnız şifreli trafik görür) | — | Ayrı uygulama kurulumu + cihaz eşleme | Doğal | v2.1.3 (2026-08); "untrusted encrypted device" beta | İki cihaz aynı anda açık olmalı → overlay'den farkı az; KVKK açısından temiz bir **alternatif kanal** |

### B.2 Ücretsiz katman geçmişi (neden "ana kaynak" yapılmamalı)

Heroku ücretsiz dyno/Postgres (2022-11 kaldırıldı) · PlanetScale Hobby (2024-04 kaldırıldı) · ElephantSQL (2025-01 kapandı) ·
CockroachDB ücretsiz (2024 sonu) · Fly.io ücretsiz (yeni hesaplara yok) · Render Postgres (30 günde siliniyor) · Turso kotası ~yarıya
(2025) · ZeroTier 25→10 cihaz + ticari yasak (2024) · Firebase Cloud Storage Blaze zorunlu (2026-02) · Appwrite konsol-etkinliği
kuralı (2026-02) · Cloudflare D1 sert limit (2026-09). Eğilim nettir: **10 yıllık bakımsız bir ürün, ücretsiz bir bulut katmanını
kalbine koyamaz.** Kalbe değil, **değiştirilebilir bir kutuya** koyabilir.

---

## 4. KVKK — kısa analiz (hukukçu teyidi önerilir)

**Çerçeve (2024 sonrası).** 7499 sayılı Kanun md. 34 ile KVKK md. 9 değişti (RG 12.03.2024; yürürlük 01.06.2024); Yönetmelik
10.07.2024; "Kişisel Verilerin Yurt Dışına Aktarılması Rehberi" 02.01.2025.
1. **Yeterlilik kararı** → 2026 itibarıyla Kurul **hiçbir ülke için** yeterlilik kararı vermedi (AB dahil). Yani AB'deki
   Frankfurt sunucusu da "yurt dışı"dır.
2. **Uygun güvenceler** → en pratik olanı Kurul'un yayımladığı **standart sözleşme** (Türkçe, değiştirilmeden); imzadan sonra
   **5 iş günü içinde Kurum'a bildirim**. Bildirmeme cezası **2026: 90.308 – 1.806.177 TL** (yeniden değerleme %25,49).
   GDPR SCC'leri tek başına yetmez. Küçük bir otelin Supabase/Google/Cloudflare ile Kurul'un standart sözleşmesini imzalatması
   pratikte mümkün görünmüyor (doğrula: büyük sağlayıcıların TR standart sözleşmesi sunup sunmadığı).
3. **Arızi aktarım** (açık rıza dahil) yalnızca tek seferlik/düzensiz aktarımlar içindir; **sürekli bulut kullanımı arızi
   sayılmaz** → misafirden açık rıza almak çözüm değildir.
4. Rehber: yurt dışındaki bulut sağlayıcısının (alt veri işleyen) sunucusunda tutmak **aktarımdır**; Google Workspace/Microsoft 365
   gibi hizmetler örnek verilir. → **Mevcut plandaki "Drive'a yedek" (G-120/G-145) de bu kapsamdadır** ve şifrelenmelidir.

**Uçtan uca şifreleme (sağlayıcı yalnız şifreli metin tutar) analizi değiştirir mi?**
- Türk uygulamasındaki yaygın görüş: *şifreli olsa bile sunucu yurt dışındaysa aktarım sayılır* (danışmanlık yazıları).
- AB'de güçlü karşı argüman: **ABAD C-413/23 P EDPS v SRB (04.09.2025)** — yeterince güçlü takma adlandırılmış veri, anahtara
  makul erişimi olmayan **alıcı açısından kişisel veri olmayabilir**; EDPB 01/2020 Tavsiyesi "Kullanım Senaryosu 1" (anahtarı yalnız
  veri ihracatçısında olan şifreli depolama) etkili ek önlem kabul edilir. KVKK bu kararlara bağlı değildir ama Türk doktrini GDPR'ı
  yakından izler.
- **Pratik sonuç:** E2EE riski **büyük ölçüde azaltır, ama tartışmayı sıfırlamaz.** Savunulabilir duruş: (a) anahtar yalnız sahibin
  cihazlarında; (b) sağlayıcı yalnız rastgele görünen bayt + zaman damgası görür; (c) **kimlik/pasaport numaraları bulut kanalına
  hiç konmaz** (ayar; varsayılan açık); (d) aydınlatma metninde "şifreli yedek" belirtilir; (e) şüphede standart sözleşme yolu.
- **Tailscale/overlay:** misafir verisi sağlayıcıda **saklanmaz**; koordinasyon sunucusu yalnız cihaz meta verisini, DERP röleleri
  yalnız şifreli WireGuard paketlerini görür → saklama/erişim olmadığı için aktarım riski en düşük seçenek (doğrula: hukukçu).

| Seçenek | Misafir verisi nerede | KVKK md. 9 etkisi |
|---|---|---|
| C1 overlay | Otel PC (+ sahibin cihazları, TR) | Aktarım yok (yalnızca şifreli geçiş) |
| C2 (öneri) | + şifreli paketler Drive/B2'de | Düşük risk (E2EE; kimlik no hariç) — hukukçu görüşü alınmalı |
| C3 Supabase ana kaynak | Açık metin Frankfurt | **Aktarım: standart sözleşme + 5 iş günü bildirim** gerekir |
| C4 CRDT + relay | Relay'de şifreli | C2 ile aynı |

Ayrıca (teknik ve idari tedbirler): otel PC'sinde BitLocker/aygıt şifreleme, Mac'te FileVault, Bismuth oturum kilidi, audit_log, yedeklerin
şifrelenmesi.

---

## 5. BÖLÜM C — Mimari seçenekler

### C1. Otel PC'si sunucu + özel ağ (mevcut K-19)
Hono sunucusu otel PC'sinde; Mac ince istemci (yerel DB yok, yalnız yanıt önbelleği); telefon PWA; Drive'a salt-okunur özet.
- **Artı:** en basit; tek yazıcı → çakışma yok; KVKK en temiz; maliyet 0 (veya Tailscale Standard 8 $/ay).
- **Eksi:** otel PC'si kapalı/çökük → uzaktan **hiçbir şey** yok (yalnız özet HTML); disk ölürse son günlük yedeğe kadar kayıp;
  overlay engellenirse uzaktan erişim yok.

### C2. Tek yazıcı + sıcak yedek kopya + şifreli kutu (**öneri**)
C1'in her şeyi + (a) Mac'te **tam salt-okunur kopya** (overlay ya da LAN üzerinden canlı; kutudan da yetişir), (b) otel PC'si
değişiklik günlüğünü **E2EE paketler** hâlinde eşitleme klasörüne yazar, (c) **devral** sihirbazı. Ayrıntı Bölüm 6.
- **Artı:** otel PC'si çöktüğünde bile Mac her şeyi görür; disk kaybında kayıp dakikalarla sınırlı; overlay engellense de Mac
  güncellenir; bulut değişirse kutu değişir, çekirdek değişmez; KVKK savunulabilir; maliyet 0.
- **Eksi:** C1'e göre ek iş (değişiklik günlüğü, şifreleme, kopya uygulama, devral testleri) ≈ 2–3 hafta; uzaktan **yazma** yine
  ana bilgisayar ayaktayken.

### C3. Bulut ana kaynak (Supabase Postgres) + otel PC'sinde yerel önbellek + çevrimdışı kuyruk
Supabase'te Postgres şeması; otel PC'si PowerSync (veya kendi outbox'ı) ile yerel SQLite'a senkron; yazmalar kuyrukta bekler,
internet gelince Supabase'e gider; Mac ve telefon doğrudan Supabase'e bağlanır.
- **Artı:** otel PC'si ölse bile bulut tam; telefon VPN'siz.
- **Eksi:** (1) **çakışma**: otel 3 saat internetsizken resepsiyon 5 numaralı odayı bu geceye satar, sahip evden aynı odayı arkadaşına
  verir → bağlantı dönünce ikinci kayıt reddedilir (Postgres `EXCLUDE USING gist (room_id WITH =, daterange WITH &&)`) ama misafir
  belki odaya girmiştir; (2) **iki şema** (Drizzle `sqliteTable` + `pgTable`) ve her migrasyon iki kez; (3) **yetki (G-23)** RLS'e
  taşınmalı — masaüstüne `service_role` anahtarı gömmek tüm veriyi açar; (4) 7 gün duraklama + sezon kapanışı + 2 proje sınırı;
  güvenilir çalışma için Supabase Pro 25 $ + PowerSync Pro 49 $ ≈ **74 $/ay**; (5) **KVKK açık metin aktarım**; (6) iki satıcının SDK
  güncellemeleri → bakımsız üründe kırılma.

### C4. Yerel-öncelikli CRDT motoru (Evolu/Jazz/Triplit/TinyBase/Automerge)
Her cihazda tam veri; E2EE relay üzerinden birleşme.
- **Artı:** her cihaz çevrimdışı yazar; E2EE (Evolu); relay aptal.
- **Eksi:** olgunluk (B.1: Evolu 7→8 veri taşıma yok, Jazz 2.0 alfa, Triplit durdu, TinyBase 5→10); **Drizzle şemamız ile uyumsuz**
  (Evolu kendi şema tipleri + Kysely + sistem sütunları + soft delete); **defter doğruluğu**: ödemeler "yalnız ekleme" olduğu için
  birleşir ama değişmezler (oda/gece çakışması, kasa devri, rezervasyon tutarı) LWW ile **sessizce** kaybolur; relay barındırma yine
  gerekir (Evolu'nun barındırılan relay'i yok); raporlar yerelde SQL ile mümkün (Evolu) ama veri katmanı yeniden yazılır.

### C5. Karşılaştırma matrisi

| Ölçüt | C1 overlay | **C2 öneri** | C3 Supabase | C4 CRDT |
|---|---|---|---|---|
| Otel internetsiz yazar | ✅ | ✅ | ✅ (kuyruk) | ✅ |
| Otel interneti kesik — sahip ne görür | Son yanıt önbelleği | **Tam kopya (son senkron anı)** | Bulutta eski veri; **yazabilir → çakışma** | Kendi kopyası; yazar → sonra birleşir |
| Otel PC'si çöktü (saatler) | Uzaktan hiçbir şey | **Mac'te tam görüntü; telefon Mac üzerinden (ops.)** | Her şey bulutta | Diğer cihazlar |
| Otel PC'si diski öldü/çalındı | Son günlük yedek (≤1 gün kayıp) | **Dakikalar** (Mac + kutu) + "devral" | Kayıp yok | Kayıp yok |
| Bulut ücretsiz planı değişir | Etkisiz (overlay değiştirilir) | Kutu klasörü değişir; çekirdek etkisiz | **Sistemin kalbi** | Relay taşınır |
| Aynı rezervasyon iki yerde | İmkânsız (409) | İmkânsız (409) | Kuyrukta mümkün → ret/LWW | LWW sessiz kayıp |
| Overlay/VPN engeli (TR) | Uzaktan yok | Canlı yok, **kutu üzerinden güncel** | Etkisiz | Relay HTTPS ise etkisiz |
| Telefon | Overlay + PWA | Overlay + PWA (+ eklenti: VPN'siz) | Ayrı web barındırma + Supabase Auth | Ayrı web barındırma; Safari 7 gün OPFS silme |
| KVKK | En temiz | Savunulabilir (E2EE, kimlik no hariç) | Standart sözleşme + bildirim | E2EE ise C2 gibi |
| Sahip kurulum adımı | ~11 | ~11 + "kutu klasörünü seç" (2) | ~15 (iki panel, anahtarlar) | Relay sunucusu → teknik |
| Aylık maliyet | 0 (Tailscale Std ile 8 $) | 0 (aynı) | 0 → güvenilir: ~74 $ | 0–5 € (VPS) |
| Bakımsız 10 yıl riski | Düşük | Düşük–orta (kendi kodumuz, API'siz kutu) | Yüksek | Yüksek |
| Geliştirme maliyeti (C1'e ek) | — | ~2–3 hafta | ~6–10 hafta | ~8+ hafta (veri katmanı yeniden) |

---

## 6. Öneri — v1 varsayılanı ve isteğe bağlı eklenti

### 6.1 v1 varsayılanı: "Tek yazıcı + sıcak yedek + şifreli kutu" (C2)

```
 OTEL (yerel ağ)                                   İNTERNET                        EV / YOL
 ┌─────────────────────────┐      overlay (WireGuard, E2E)       ┌───────────────────────────┐
 │ Otel PC = ANA BİLGİSAYAR│◀──────────── canlı API ────────────▶│ Mac: istemci + YEDEK KOPYA │
 │ SQLite (tek yazıcı)      │──── canlı değişiklik akışı (SSE) ──▶│ (tam, salt-okunur SQLite)  │
 │ change_log (seq, epoch)  │                                     │  "Ana bilgisayarı devral"  │
 │ Hono sunucu (Faz 13)     │        ┌──────────────────┐         └─────────────▲─────────────┘
 │ Paketleyici: AES-256-GCM │──yaz──▶│ Eşitleme klasörü │──eşitle──────────────┘
 └──────────▲──────────────┘        │ (Drive/OneDrive/ │  (yalnız şifreli .bmr dosyaları)
            │ LAN / overlay          │  iCloud / B2)    │
     Telefon PWA (https://bismuth-host.<otel>.ts.net)   └──────────────────┘
```

**Bileşenler**
1. **Tek yazıcı + dönem (epoch).** Yalnız ana bilgisayar yazar (K-19 korunur). `host_epoch` ayarı; her değişiklik `(epoch, seq)`
   taşır. Uzaktan yazmalar yalnız ana bilgisayar erişilebilirken (Faz 13 ince istemci, `If-Match: version` → 409).
2. **Değişiklik günlüğü.** Çoğaltılan her tablo için Drizzle şemasından **üretilen SQLite tetikleyicileri** (`AFTER INSERT/UPDATE/DELETE`
   → `change_log(seq INTEGER PK AUTOINCREMENT, epoch, tbl, pk, op, row_json, schema_version, ts)`), yeni numaralı migrasyonda
   (kural 9). Neden tetikleyici: servis katmanı bir yazmayı unutsa bile DB garanti eder. (`audit_log.after_json` tam satır
   olsaydı aynı işi görebilirdi; ama audit iş amaçlı, change_log teknik — ayrık tutmak test etmeyi kolaylaştırır.) Not: `node:sqlite`
   oturum/changeset API'si (Electron 36.7.3+ `node:sqlite` yüklenebiliyor; session API'nin Electron 37'deki durumu doğrula) yalnız kendi
   bağlantısındaki yazmaları kaydeder → tüm uygulamayı `better-sqlite3`'ten taşımayı gerektirir → hayır.
3. **Şifreli paket biçimi (`.bmr`).** Başlık `{magic, v, epoch, fromSeq, toSeq, schemaVersion, kind: seg|snap}` + gzip + **AES-256-GCM**
   (Node `crypto`; tarayıcıda WebCrypto ile aynı → eklenti için hazır), dosya başına HKDF ile türetilmiş anahtar, 96-bit rastgele nonce,
   başlık = AAD. Ana anahtar 256-bit rastgele "**Bismuth anahtarı**": kurulumda bir kez QR + 24 kelime olarak gösterilir/yazdırılır;
   cihazda Electron `safeStorage` ile (Windows DPAPI / macOS Keychain) saklanır. Dosya adları benzersiz (`seg-<epoch>-<from>-<to>.bmr`),
   **önce geçici adla yaz → rename** (eşitleme istemcisi yarım dosya görmez; görse de GCM etiketi reddeder → sonra tekrar dener).
   Her dakika (değişiklik varsa) bir segment; her gece bir anlık görüntü (`db.backup()` → paket); 14 anlık görüntü tutulur, eskileri ve
   kapsanan segmentler silinir. Tahmini hacim: segment KB'lar, anlık görüntü 5–20 MB (sıkıştırılmış).
   Ayar `relay.excludeIdentity=true` (varsayılan): kimlik/pasaport sütunları pakete **konmaz** (Mac canlı bağlantıda yine görür).
4. **Yedek kopya (Mac; isterse otelde ikinci bir dizüstü).** Yerel SQLite; segmentleri `(epoch, seq)` sırasıyla **idempotent** uygular
   (upsert/delete); `schemaVersion` kendi sürümünden büyükse durur ve "Bismuth'u güncelleyin" der. Kaynaklar: (a) canlı SSE
   `/api/replica/changes?after=seq` (overlay/LAN), (b) kutu klasörü. Arayüz: başlıkta "Yedek kopya · 14:32" rozeti; ana bilgisayar
   erişilemezken tüm ekranlar ve raporlar salt-okunur çalışır (G-141'in "son görüntü"sünün güçlü hâli).
5. **Devral (felaket kurtarma).** Sihirbaz: "Otel bilgisayarı bozuldu mu? Bu bilgisayarı ana bilgisayar yap." → son veriyle
   `epoch+1`, kutuya `epoch-<n>.bmr` yazılır, sunucu modu açılır. Eski PC açıldığında yerel ağda ve kutuda daha yüksek epoch görürse
   **yazmayı kapatır** ve "yeni ana bilgisayardan kopyala" önerir. İkisi de çevrimdışıyken iki yerde yazılırsa (nadir) eski epoch'un
   kayıtları ayrı bir "çakışan kayıtlar" raporuna dökülür, elle aktarılır — otomatik birleştirme **yok**.
6. **Overlay.** Varsayılan Tailscale A1 (ayrı otel kimliği + node sharing); lisans için Standard 1 koltuk ya da B planı NetBird.
   Bismuth yalnız arayüz/IP algılar (`100.64.0.0/10`, `*.ts.net`, `*.netbird.cloud`).
7. **Telefon.** Overlay üzerinden ana bilgisayardaki PWA (HTTPS `tailscale serve`); ana bilgisayar kapalıysa isteğe bağlı olarak
   Mac'in "yedek sunucu (salt-okunur)" modu.

**Yazma politikası (v1):** uzaktan yazma = canlı bağlantı. Kuyruklu uzaktan yazma **yok**. (Sonraki sürüm adayı: yalnız
"ekleme" türü niyetler — ödeme, gider, arıza — kimlik anahtarı ile kutuya yazılır, ana bilgisayar sırayla uygular; rezervasyon
değişikliği asla kuyruklanmaz.)

**Plan belgelerine etkisi (öneri; 01-gereksinimler yalnız `/requirement-change` ile):** K-19 revizyonu; `03-mimari.md` §11
"İstemci: yerel veritabanı yok" → "salt-okunur yedek kopya"; G-145 (salt-okunur özet) → "şifreli yedek kopya + kişisel veri içermeyen
özet (PDF)"; G-120 "ikinci klasör (Drive)" → **şifreli** paket; Faz 13 + Faz 14 teslimatlarına change_log/paket/devral eklenir;
`db.md`'ye `synchronous=FULL` notu.

### 6.2 İsteğe bağlı eklenti (v1.1 adayı): "Bulut ayna + VPN'siz telefon" (sahibin kendi Cloudflare hesabı)
- Sahip ücretsiz Cloudflare hesabı açar, "Edit Cloudflare Workers" şablonundan API belirteci üretir (D1 yetkisiyle), Bismuth'a yapıştırır.
- Bismuth REST ile (wrangler/terminal yok) bir Worker + **AB yargı bölgeli D1** kurar; ana bilgisayar aynı `.bmr` paketlerini oraya da
  gönderir (100k satır yazma/gün sınırının çok altında).
- Telefon `https://bismuth-<rastgele>.workers.dev` adresinden PWA'yı açar; Bismuth anahtarını **Mac/PC ekranındaki QR'dan bir kez** alır
  (WebCrypto `importKey(extractable=false)` + IndexedDB; uygulama PIN'i); paketleri indirip tarayıcıda çözer, wasm SQLite (sql.js/wa-sqlite)
  ile "Bugün", doluluk, kasa özeti gösterir. HTTPS zorunlu (WebCrypto ve service worker güvenli bağlam ister) — Cloudflare sağlar.
- Kazanç: telefonda VPN yok; otel PC'si kapalıyken de telefonda görüntü; Türkiye'de overlay engeline dayanıklı; Cloudflare yalnız şifreli
  bayt görür. Bedel: ~12 kurulum adımı, ikinci bir çalışma zamanı (Worker + tarayıcıda çözme), ücretsiz katman değişirse **yalnız bu
  eklenti** durur. Karar Spike S-F sonucuna göre.

---

## 7. BÖLÜM D — Telefon erişimi (seçeneğe göre)

| Yol | Adres | HTTPS | PWA kurulumu | Ana bilgisayar kapalıyken |
|---|---|---|---|---|
| Tailscale (A1) + PWA | `https://bismuth-host.<otel-ağı>.ts.net` (paylaşılan cihaz için tam ad zorunlu) | ✅ `tailscale serve` (Let's Encrypt) | iOS "Ana ekrana ekle" + service worker ✅; Android "Yükle" ✅ | ❌ (ops.: Mac yedek sunucu) |
| NetBird + PWA | `http://bismuth-host.netbird.cloud:7373` | ❌ (eş adına geçerli sertifika yok) | iOS ana ekrana ekler ama service worker yok; Android'de yalnız yer imi | ❌ |
| Cloudflare Tunnel + Access | `https://otel.alanadiniz.com` | ✅ (Cloudflare TLS'i açar, trafiği görür) | ✅, uygulama gerekmez | ❌ |
| C3 Supabase | Ayrı web barındırma (Pages/Vercel) + Supabase Auth | ✅ | ✅ | ✅ ama çakışma/KVKK |
| C4 CRDT | Ayrı web barındırma | ✅ | ✅; **Safari, ana ekrana eklenmemiş sitenin depolamasını 7 günde siler** (Evolu SSS) | ✅ |
| **Eklenti 6.2** | `https://…workers.dev` | ✅ | ✅ | ✅ (salt-okunur, son paket) |

Not: Telefon için mağaza uygulaması önerilmez (Apple 99 $/yıl, imzalama, bakım).

---

## 8. BÖLÜM E — Faz 0/1 spike'ları (öneriyi doğrulamak için)

| ID | Süre | Ne yapılır | Başarı ölçütü |
|---|---|---|---|
| **S-A** Overlay kimlik + paylaşım | 1 gün | Win 10 PC + Mac + iPhone + Android. Yeni hesapla otel ağı; node sharing ile ikinci hesaba paylaş; Run unattended + key expiry kapalı; `tailscale serve` HTTPS; yeniden başlatma; Türk Telekom, Superonline, Vodafone/Turkcell mobil hatlardan doğrudan/DERP, gecikme. Aynısı NetBird ile (B planı). Teknik olmayan biriyle adım/süre ölçümü. | Paylaşılan cihaza tam adla HTTPS; yeniden başlatma sonrası < 2 dk erişim; ≤ 30 dk kurulum; her hatta bağlantı |
| **S-B** change_log + yedek kopya | 2–3 gün | Drizzle şemasından tetikleyici üreteci; `change_log`; uygulayıcı; fast-check ile rastgele işlem dizisi → kopya = kaynak (satır karması); idempotent yeniden uygulama; `schemaVersion` kapısı; 100k satır performansı | Tüm özellik testleri yeşil; 1.000 değişiklik < 1 sn uygulanır |
| **S-C** Şifreli kutu | 1–2 gün | `.bmr` biçimi, `safeStorage`, geçici-ad+rename; Google Drive for desktop (Win akış modu, macOS File Provider) ve OneDrive ile p50/p95 gecikme, yarım dosya, 10k dosya listeleme, macOS klasör izni penceresi, saklama/sıkıştırma; anahtar kurtarma (QR + 24 kelime) | p95 < 2 dk; bozuk/yarım dosya asla uygulanmaz; anahtarsız cihaz hiçbir şey okuyamaz |
| **S-D** Devral tatbikatı | 1 gün | Ana bilgisayarı "öldür" → Mac devralır → eski PC geri gelir → epoch algılar, yazmayı kapatır; ikisi çevrimdışıyken çift yazma → çakışma raporu | Veri kaybı yok; eski PC yazma kabul etmez |
| **S-E** Telefon PWA | 0,5 gün | ts.net HTTPS üzerinden iOS/Android ana ekrana ekleme, çerez oturumu, QR eşleme, 44 px hedefler | İki platformda kurulur, Bugün < 2 sn |
| **S-F** (eklenti) Cloudflare ayna | 2–3 gün | API belirteci akışı; REST multipart Worker yükleme; D1 `jurisdiction: eu`; telefonda WebCrypto çözme + sql.js ile "Bugün"; paket boyutu; sahip adım sayısı | ≤ 12 adım; ilk açılış < 5 sn (4G); Cloudflare panelinde yalnız şifreli veri |
| **S-G** (kanıt, ops.) Supabase | 0,5 gün | Sahibin önerisine somut cevap: Electron'dan IPv4 havuzlayıcıya bağlanma, Frankfurt, duraklama/sürdürme deneyimi | Karar notu (beklenen: "kutu olarak bile Drive/B2'den zayıf") |
| **S-H** Hukuk | paralel | Avukata 3 soru: (1) E2EE şifreli paketlerin yurt dışı bulutta tutulması md. 9 aktarımı mı? (2) Overlay röleleri üzerinden şifreli geçiş? (3) Aydınlatma metni cümlesi | Yazılı görüş → K-19'a ek |

---

## 9. Sahibe anlatım (basit Türkçe)

**Sizin sorunuz:** "Otel bilgisayarı ağır programla çökebiliyor; sadece ona güvenmek istemiyorum. Supabase gibi ücretsiz bir sunucu
kullanamaz mıyız? Ayrıca otel cihazlarında kendi Google hesabımı kullanmak istemiyorum."

**Benzetme.** Otel bilgisayarı **asıl defter**dir; resepsiyon yalnızca ona yazar, böylece "aynı odayı iki kişiye satma" gibi karışıklık
olmaz. Biz buna iki şey ekliyoruz:
1. **Mac'inizde defterin fotokopisi** — her dakika kendiliğinden güncellenir. Otel bilgisayarı çökse bile Mac'inizde her şeyi
   (rezervasyonlar, kasa, raporlar) görürsünüz. Bilgisayar tamamen bozulursa Mac'i (ya da yeni bilgisayarı) birkaç tıkla "asıl defter"
   yaparsınız; kaybınız en fazla birkaç dakikalık kayıttır.
2. **Kilitli kutu** — otel bilgisayarı defterdeki değişiklikleri **kilitli** zarflar hâlinde Google Drive (veya OneDrive/iCloud)
   klasörünüze bırakır. Anahtar yalnızca sizde; Google zarfların içini okuyamaz. İnternet bağlantınız tuhaflaşsa bile Mac bu kutudan
   güncellenir.

**Neden Supabase'i "asıl defter" yapmıyoruz?**
- İnternet kesilince otel yine yazabilmeli; o zaman otelde de bir kopya ve "sonra birleştirme" gerekir. Siz evden, resepsiyon otelden
  aynı anda aynı odayı satarsa sorun internet gelince ortaya çıkar — misafir odaya girmiş olabilir.
- Ücretsiz planlar sık değişiyor: Supabase 7 gün kullanılmayan projeyi durduruyor (otel kışın kapanırsa sorun), başka şirketler
  ücretsiz planlarını tamamen kaldırdı. 10 yıl dokunulmayacak bir programın kalbine bunu koyamayız.
- Misafir bilgilerinin açık hâlde yurt dışında durması KVKK'da ek sözleşme ve 5 iş günü içinde bildirim ister; yapılmazsa 2026'da
  90 bin TL'den başlayan cezalar var. Bizim kutumuzda bilgiler **kilitli** ve kimlik numaraları hiç konmuyor.

**Google hesabınız ne olacak?** Otel için **ayrı bir hesap** açıyoruz (yeni bir Gmail, ya da Apple/Microsoft hesabı). Otel bilgisayarı
yalnızca bu hesapla bağlanır. Sonra o bilgisayarı **sizin mevcut** Tailscale hesabınızla "paylaşıyoruz": Mac'iniz ve telefonunuz
otel bilgisayarını görür, ama otel bilgisayarı sizin evdeki cihazlarınıza **ulaşamaz**. Telefonda hesap değiştirmeniz gerekmez.

**Ne yapmanız gerekecek (bir kez, ~30 dk, resimli kılavuzla):** otel için hesap açmak; otel bilgisayarına Tailscale kurup iki ayarı
işaretlemek; paylaşım bağlantısını Mac'te kabul etmek; Bismuth'ta "kutu klasörü" olarak Drive klasörünü seçmek; ekrandaki
**Bismuth anahtarını** yazdırıp kasada saklamak; telefonda QR okutmak.

**Ne olursa ne olur?**

| Durum | Ne olur |
|---|---|
| Otelde internet kesildi | Resepsiyon her şeye devam eder. Siz evden son durumu görürsünüz, internet gelene kadar değişiklik yapamazsınız. |
| Otel bilgisayarı çöktü | Mac'inizde her şey görünür. Uzun sürerse "Bu Mac'i ana bilgisayar yap" dersiniz. |
| Otel bilgisayarının diski bozuldu / çalındı | Mac'teki kopya + kilitli kutu → en fazla birkaç dakikalık kayıt kaybı. |
| Tailscale ücretli olur ya da Türkiye'de engellenir | Kutu sayesinde Mac yine güncellenir; ağ programı değiştirilebilir (Bismuth etkilenmez). |
| Google Drive'ı bırakırsanız | Kutuyu OneDrive/iCloud/başka klasöre çevirirsiniz; veri otel bilgisayarında ve Mac'te durur. |
| Bismuth anahtarını kaybederseniz | Veri kaybolmaz (otel PC + Mac'te); yeni anahtarla kutu sıfırdan kurulur. |

**Maliyet:** 0 TL. Tek dürüst not: Tailscale'in ücretsiz planı kâğıt üzerinde "ticari olmayan kullanım" içindir; otel işi ticari
sayılır. İsterseniz otel ağı için ayda yaklaşık 8 $ ödenir, ya da benzer ücretsiz bir program (NetBird) denenir. Bismuth ikisiyle de çalışır.

**İsteğe bağlı (sonra):** telefonda hiç VPN uygulaması olmadan, otel bilgisayarı kapalıyken bile bakabilmek için sizin adınıza açılacak
ücretsiz bir Cloudflare hesabında kilitli bir "ayna". Önce denenip size gösterilecek.

**Sizden cevap beklediğimiz sorular (öneri: `05-sorular.md`'ye S-78 … S-85):**
- S-78: Tailscale için otel ağına ayda ~8 $ öder misiniz, yoksa ücretsiz alternatif (NetBird) mi deneyelim? (varsayılan: önce ücretsizle dene, karar Faz 13'te)
- S-79: Otel için ayrı bir Google/Apple/Microsoft hesabı açmayı kabul ediyor musunuz? (varsayılan: evet, yeni Gmail)
- S-80: Mac'inizde verinin tam kopyası tutulsun mu? Mac'te FileVault (disk şifreleme) açık mı? (varsayılan: evet / açılacak)
- S-81: Kilitli kutu için hangi klasör: Google Drive, OneDrive, iCloud, hiçbiri? (varsayılan: Google Drive — otel hesabıyla, sizinle paylaşılmış klasör)
- S-82: Otel kışın kapanıyor mu, bilgisayar aylarca kapalı kalıyor mu? (bulut kurallarını etkiler)
- S-83: Otel bilgisayarı bozulursa Mac'i geçici ana bilgisayar yapma özelliği istiyor musunuz? (varsayılan: evet)
- S-84: Telefona Tailscale uygulaması kurmak sizin için sorun mu? (sorun değilse 6.2 eklentisi beklemeye alınır)
- S-85: Kimlik/pasaport numaraları kilitli kutuya da konsun mu, yoksa yalnız otel bilgisayarında ve Mac'te mi kalsın? (varsayılan: kutuya konmasın)

---

## 10. Kaynaklar

**Tailscale:** tailscale.com/pricing (arama özeti: Personal "only suitable for non-commercial use", 6 kullanıcı, 50 etiketli kaynak) ·
tailscale.com/blog/pricing-v4 (2026-04-08; Personal Plus kaldırıldı, Standard 8 $/koltuk) · tailscale.com/docs/features/sharing (tüm
planlarda; paylaşılan cihaz yalnız gelen bağlantıya cevap verir; tam MagicDNS adı zorunlu) · tailscale.com/blog/sharing-over-tailscale ·
tailscale.com/docs/features/sharing/how-to/invite-any-user · tailscale.com/docs/integrations/identity (IdP listesi; e-posta ile kayıt yok) ·
tailscale.com/docs/integrations/identity/passkeys + GitHub tailscale/tailscale#16598 (passkey ile ilk kayıt yok) ·
tailscale.com/docs/features/client/fast-user-switching (tek aktif hesap) · tailscale.com/docs/how-to/run-unattended ·
tailscale.com/docs/features/access-control/key-expiry (180 gün) · tailscale.com/blog/tagged-key-expiry · auth-keys (1–90 gün) ·
tailscale.com/docs/reference/faq/other-vpns (iOS tek VPN).
**NetBird/ZeroTier/diğer:** netbird.io/pricing (5 kullanıcı/100 makine; Team 6 $, Business 12 $) · docs.netbird.io (setup keys, Windows servisi,
DNS `*.netbird.cloud`) · github.com/netbirdio/netbird#5479 (eş adlarına geçerli sertifika yok) · netbird.io/knowledge-hub/netbird-ios-v0-3-1 ·
zerotier.com/pricing.md (Personal: ticari olmayan, 10 cihaz, 1 ağ; Essential 18 $) · Cloudflare Zero Trust (önceki rapor).
**Türkiye ağ:** stockholmcf.org (27 VPN engeli) · bleepingcomputer/cybernews (VPN engelleri) · community.cloudflare.com (WARP Türkiye) ·
blog.slonk.ing "Turkey Censorship Megapost" (arama özeti) · dev.to/mariatanbobo (doğrulanmamış iddia) · eksisozluk.com/tailscale (2026 girdileri).
**Bulut:** supabase.com/docs (duraklama, bölgeler, IPv6/Supavisor) · github.com/orgs/supabase/discussions/47244, supabase/agent-skills#592 ·
neon.com/faqs/free-plan-limits-and-quotas · turso.tech/blog/turso-cloud-new-regions, introducing-databases-anywhere-with-turso-sync,
turso-offline-sync-public-beta · github.com/tursodatabase/turso (README FAQ: 1.0 değil) · developers.cloudflare.com (Workers limits,
D1 jurisdiction changelog 2025-11-05, multipart upload metadata, R2 kart şartı — community) · appwrite.io (2026-02-27 duraklatma) +
github appwrite#13289 · firebase pricing özetleri · instantdb.com/pricing · docs.convex.dev/production/state/limits · powersync.com/pricing ·
docs.powersync.com/resources/usage-and-billing · infoq.com/news/2026/06/zero-version-1 · supabase.com/blog/triplit-joins-supabase ·
github.com/garden-co/jazz (README: 2.0 alfa, yeni API) · classic.jazz.tools/pricing · github.com/evoluhq/evolu (docs: relay, privacy, FAQ,
local-first; blog "Evolu 8 is released" 2026-09-01) · tinybase.org/guides/releases · rxdb.info/premium · pocketbase README (v1.0 öncesi uyarı) ·
docs.oracle.com Always Free (boşta geri alma) · render.com/docs/faq · Fly.io fiyat özetleri · backblaze.com/cloud-storage/pricing ·
docs.syncthing.net (untrusted devices) · github.com/benbjohnson/litestream (v0.5, Windows servisi) · knowledge.workspace.google.com Drive for
desktop release notes · learn.microsoft.com Windows 10 + Microsoft 365 Apps (OneDrive 2028-10-10).
**Ücretsiz katman geçmişi:** devcenter.heroku.com/changelog-items/2461 · support.planetscale.com (Hobby kaldırıldı 2024-04) ·
swyftstack.com/blog/free-postgresql-hosting (ElephantSQL, CockroachDB) · bex.co/blog/2026/09/12 ("The Free Tier Is Almost Dead").
**KVKK:** kvkk.gov.tr "Kişisel Verilerin Yurt Dışına Aktarılması Rehberi" (02.01.2025) · guzeloglu.legal, gunespartners.com, birasyo.com
(7499 / md. 9, 5 iş günü) · cottgroup.com, mondaq (2026 cezaları: 90.308–1.806.177 TL) · arifogluaydin.com (açık rıza yalnız arızi aktarım) ·
mondaq/legal500 (2026: yeterlilik kararı yok) · curia.europa.eu C-413/23 P EDPS v SRB (04.09.2025) + goodwinlaw, twobirds, fpf.org analizleri ·
EDPB Recommendations 01/2020 (Use case 1; bellekten — doğrula).
**npm (2026-10-01 doğrulandı):** @tursodatabase/sync 0.8.1 · @libsql/client 0.18.0 · @evolu/common 8.15.1 · @evolu/relay 4.1.5 ·
jazz-tools 0.20.19 / 2.0.0-alpha.58 · @triplit/client 1.0.50 (2025-07-31) · @instantdb/core 1.0.67 · convex 1.46.0 · @rocicorp/zero 1.9.0 ·
tinybase 10.0.1 · @powersync/node 1.1.1 · @electric-sql/client 1.5.28 · rxdb 17.5.0 · @automerge/automerge 3.5.0 · yjs 13.6.33 ·
@supabase/supabase-js 2.117.2 · pocketbase (JS SDK) 0.28.1 · appwrite 28.1.0 · firebase 12.19.0 · @vlcn.io/crsqlite 0.16.3 (2024-01).

---

## 11. Ücretsiz yol kararı (2026-10-02 — sahip: "Tailscale'e para ödemek istemiyorum, ücretsiz bir yol bul"; "otelin ayrı Gmail'i var")

**Doğrulama notu.** Sağlayıcı sayfaları (netbird.io, tailscale.com, docs.netbird.io) vekil tarafından yine engellendi; aşağıdakiler
2026-10-02 tarihli arama sonucu özetleri + önceki rapordur. Faz 13 spike S-A'da kurulum sırasında panelden teyit edilir.

| Seçenek | Ücretsiz plan | Ticari kullanım | Türkiye | Telefon | Karar |
|---|---|---|---|---|---|
| **NetBird Cloud Free** | 5 kullanıcı, 100 makine; P2P WireGuard, Google/Microsoft ile giriş + MFA, erişim kuralları, özel DNS, ağ yönlendirme | Ücretsiz planda yasak ifadesi bulunamadı; "bireyler ve küçük ekipler" için konumlanıyor. Açık kaynak; kendi sunucunda barındırma da serbest (son çare) | Engel bilgisi yok | iOS + Android uygulaması | **Seçildi (K-31)** |
| Tailscale Personal | 6 kullanıcı, sınırsız kullanıcı cihazı | Fiyat sayfası: "yalnız ticari olmayan kullanım" | Doğrulanmamış engelleme iddiaları | Var | Varsayılan değil; sahip kendi kararıyla kullanırsa Bismuth çalışır |
| ZeroTier Free | 10 cihaz, 1 ağ, 1 yönetici | Hayır (kişisel/ticari olmayan) | — | Var | Hayır |
| Cloudflare Zero Trust Free | 50 kullanıcı; 2026 özetlerine göre kart gerekmiyor | Evet | **WARP 2025'te BTK engel listesinde** | WARP uygulaması | Yedek seçenek |

**Kesin yapı (K-19 + K-31 + K-32):**
1. **Otel PC = asıl defter** (tek yazıcı).
2. **Otelin Gmail hesabı**: (a) Google Drive masaüstü uygulaması otel PC'de → `Drive'ım/Bismuth/` klasörü: şifreli yedekler (30 gün), şifreli değişiklik paketleri (kutu), kişisel veri içermeyen PDF özet; (b) NetBird ağının sahibi.
3. **Sahip**: Mac'e ve telefona NetBird uygulaması, **kendi hesabıyla davetli** (kişisel Google hesabı otel cihazlarında kullanılmaz). Mac'te Drive'daki `Bismuth` klasörü otel hesabından sahibe **paylaşılır** (ya da Drive uygulamasına ikinci hesap olarak eklenir).
4. **Mac'te Bismuth**: istemci + tam salt‑okunur yedek kopya (canlı akış + Drive kutusu); otel PC bozulursa "devral".
5. **Telefon**: NetBird açıkken `http://bismuth-host.netbird.cloud:7373` (ya da `100.x.y.z`) → mobil arayüz; otel PC kapalıyken Drive uygulamasında PDF özet.

**Sahip kılavuzunun iskeleti (~25 dk, resimli; Faz 13):**
1. Otel PC'ye Google Drive masaüstü uygulamasını kur, **otel Gmail'i** ile gir; "Bismuth" klasörünü oluştur; yükleme hızı sınırını aç (zayıf PC).
2. Tarayıcıda NetBird'e **otel Gmail'i** ile gir (ağ oluşur); "Setup key" oluştur.
3. Otel PC'ye NetBird'ü kur, setup key ile bağla (Windows servisi olarak çalışır); panelde bu makine için oturum süresinin dolmasını kapat; makine adını `bismuth-host` yap (otel adı koyma).
4. Panelde **Users → Invite**: sahibin kendi e‑postası.
5. Mac'e NetBird kur → kendi hesabınla davete katıl. Telefona NetBird uygulaması → aynı.
6. Otel PC'de Bismuth → Ayarlar → Uzaktan erişim → **Aç** → adres ve QR görünür; yedek klasörü olarak Drive'daki "Bismuth" seçilir; **Bismuth anahtarı** yazdırılıp kasada saklanır.
7. Mac'te Bismuth → "Ana bilgisayara bağlan" (QR/adres) → yedek kopya başlar; Drive'da paylaşılan "Bismuth" klasörü seçilir; anahtar bir kez girilir (QR).
8. Telefonda NetBird açıkken QR okut → "Ana ekrana ekle".
9. Deneme: otel PC'yi yeniden başlat; Mac ve telefondan tekrar bağlan; NetBird'ü kapatınca Mac'in Drive'dan güncellendiğini gör.

**Riskler ve önlemler**
- NetBird ücretsiz planı değişirse → Bismuth ağdan bağımsız: Tailscale/ZeroTier/Cloudflare'e geçilir, Mac kopyası Drive'dan beslenmeye devam eder; son çare NetBird'ün kendi sunucusu.
- iOS'ta aynı anda tek VPN: sahip başka projede Tailscale kullanıyorsa telefonda geçiş gerekir. macOS'ta Tailscale ve NetBird aynı `100.64.0.0/10` aralığını kullanır → spike S-A'da çakışma denenir; gerekirse NetBird ağ aralığı değiştirilir ya da diğer proje kapatılır.
- NetBird eş adlarında geçerli HTTPS sertifikası yok → telefonda HTTP; trafik WireGuard tünelinde şifreli; çerez `HttpOnly` + `SameSite=Strict`; PWA servis çalışanı yok (gerekmiyor).
- Zayıf otel PC: NetBird istemcisi hafif (tek servis); Drive uygulaması akış modunda + yükleme sınırı; Bismuth yedeği ve paketleri düşük öncelikle, parça parça yazar (K-32).
- KVKK: Drive'a yalnız şifreli yedek/paket ve kişisel veri içermeyen PDF özet gider; anahtar yalnız sahipte.

**Kat görevlisi telefonu (Ö-19) — S-97: yapılmayacak (sahip WhatsApp grubundan memnun); not olarak kalır:** otelin Wi‑Fi'ında özel ağ olmadan `http://<otel-pc-yerel-ip>:7373` (QR); Temizlik rolü `remote.allowed = yalnız yerel ağ`; ekran: kirli odalar listesi → "temiz" (WhatsApp'taki "302+"), arıza aç + fotoğraf.

**Kaynaklar (arama özetleri, 2026-10-02):** docs.netbird.io/manage/settings/plans-and-billing · netbird.io/pricing · netbird.io/knowledge-hub/tailscale-vs-netbird ·
xda-developers.com (NetBird / Tailscale 6 kullanıcı sınırı yazısı) · netbird.io/self-hosted-EULA (yalnız kendi sunucunda ticari lisans; bulut ücretsiz planla ilgisiz) ·
tailscale.com/pricing özetleri · zerotier.com/pricing özetleri · zerotrustcost.com, zerometric.net (Cloudflare Zero Trust 2026 ücretsiz plan).
