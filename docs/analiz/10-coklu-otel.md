# 10 — Birden fazla otel

> Hazırlayan: Fable (2026-11-12). Sahip notu: "Bir otel sahibinin birden fazla oteli olabilir; ne yapılacağına sen karar
> ver." Rakamlar ilgi alanı değildir; yalnız yapı. Karar taslağı: K-54 (`docs/plan/06-kararlar.md`).

## 1. Bugünkü tek otel varsayımları (kanıt)

| Yer | Varsayım | Kanıt |
|---|---|---|
| Şema | `hotel` tablosu ve `hotel_id` sütunu yok; otel bilgisi `settings` anahtarları (`hotel.name`, `hotel.city`, `hotel.timezone`, `hotel.currencies`, `hotel.baseCurrency`, `hotel.checkinTime/checkoutTime`, `hotel.email`) | `src/shared/contract/settings.ts`; `drizzle/meta/0018_snapshot.json` taraması |
| Veritabanı dosyası | Tek `userData/bismuth.db`; yedekler `userData/backups/`; Drive `Bismuth/yedekler` | `src/main/app/paths.ts:20-35`, `src/main/backup/drive.ts:11` |
| Roller / kullanıcılar / oturumlar | Otel-bağımsız; tek yetki matrisi (6 sistem rolü) | `src/shared/permissions.ts`, `roles`, `users`, `sessions` tabloları |
| Sunucu modu | Tek DB'yi sunar; istemci tek ana bilgisayara bağlanır (adres + parmak izi) | `src/main/server/electron-wiring.ts:149`, `host-link.ts` |
| Saat dilimi / para | Süreç düzeyinde tek (`setHotelTimeZone`), temel para birimi tek | `src/main/services/index.ts:93` |
| Raporlar, turizm istatistiği, kasa | Tek otel toplamı | `services/reports/*`, `tourism-stats-service.ts`, `ledger-service.ts` |
| Çoğaltma (Mac kopyası) | Tek `change_log` akışı, tek epoch | `replica.ts` |
| Belgeler | "Çoklu otel", "tenant" hiçbir plan belgesinde geçmiyor; G-09 "genel otel ürünü, her kurulum tek otel" | `01-gereksinimler.md:40` |

## 2. Seçenekler

| Ölçüt | A. Otel başına ayrı veritabanı + program içinde otel değiştirme | B. Tek veritabanında otel kimliği (`hotel_id` her tabloda) | C. A + sahip için "tüm oteller" özet ekranı |
|---|---|---|---|
| Veri taşıma (migrasyon) riski | **Düşük**: şema değişmez; `bismuth.db` → `hotels/<kod>/bismuth.db` taşınır, mevcut kurulum "ilk otel" olur | **Yüksek**: 60+ tabloya `hotel_id`, tüm benzersiz indeksler (`room_nights`, `reservation_code_sequences`, `business_days` PK!) değişir, her sorguya süzgeç, her servis/handler dokunulur; hata = veri karışması | A ile aynı (düşük) + özet için salt-okunur toplama |
| Personelin otellere atanması | Kullanıcılar otel başına ayrı (her DB kendi `users`); aynı kişi iki otelde iki hesap. Sahip hesabı her otelde ayrı oluşturulur ya da "sahip anahtarı" ile her DB'ye eklenir | Tek kullanıcı tablosu + `user_hotels` (rol otel başına) — en esnek | A + sahip için tek şifreyle tüm otellere giriş (her DB'de aynı sahip kaydı, ayarlanabilir) |
| Raporlar | Otel bazında doğal; **toplu rapor yok** | Otel bazında süzgeç + toplu doğal | Otel bazında (mevcut) + toplu özet ekranı (doluluk, gelir, kasa, bugün gelen/giden) salt-okunur, DB'leri sırayla açar ya da her otelin **günlük özet dosyasını** (JSON) okur |
| Lisans ve kurulum | Her otel kendi bilgisayarında kendi kurulumu (bugünkü model); sahip Mac'inde iki profil. Ek kurulum yok | Tek kurulum, tek DB, tek ana bilgisayar: iki otel aynı fiziksel makineye bağımlı olur; ayrı şehirlerde anlamsız | A ile aynı; özet ekranı sahibin Mac'inde çalışır (her otelden gelen şifreli yedek/özet dosyasıyla, K-32 düzeniyle) |
| Yedek | Otel başına ayrı yedek seti ve anahtar (bugünkü kod); Drive klasörü `Bismuth/<otel>/yedekler` | Tek yedek; bir otelin geri yüklemesi diğerini de geri alır (kötü) | A gibi |
| Sunucu/istemci modu | Her otelin kendi ana bilgisayarı; istemci "otel seç → adres" listesi (yeni) | Tek ana bilgisayar; uzak otel internete bağımlı (G-01 ihlali) | A gibi + özet ekranı her otelin kopyasını çeker |
| Çevrimdışı ilke (G-01/02) | ✅ her otel bağımsız | ❌ ikinci otel ağ olmadan çalışamaz | ✅ |
| Kod etkisi | `paths.ts` (profil kökü), kurulum sihirbazı (otel seç/ekle), giriş ekranı (otel seçici), istemci modunda adres listesi, Drive yolu; **servislere dokunulmaz** | Her katman | A + yeni `features/portfolio/` ekranı + özet üretici |
| Tahmini büyüklük | M | XL (ve riskli) | M + M |

## 3. Karar önerisi: **C (A + özet ekranı), B reddedilir**

Gerekçe: Bismuth'un temel ilkesi "otel bilgisayarında internetsiz çalışan tek defter" (K-19). Her otel kendi
bilgisayarında kendi veritabanıyla çalışmaya devam eder; bu hem çevrimdışı ilkeyi hem de "tek yazıcı" kuralını korur
ve **sıfır migrasyon** gerektirir. Sahibin ihtiyacı olan "hepsini tek yerde görmek" salt-okunur bir özet ekranıyla
karşılanır; bu ekran Mac'teki salt-okunur kopya altyapısının (Faz 13) doğal uzantısıdır.

### K-54 (taslak) — Çoklu otel: profil başına ayrı veritabanı + portföy özeti

1. **Profil = otel.** `userData/hotels/<kod>/` altında `bismuth.db`, `attachments/`, `backups/`, `logs/`. Mevcut kurulum
   ilk açılışta `hotels/<kod>/`'a taşınır (kod = otel adından türetilir, sahip onaylar); `window-state.json` ve kişisel
   tercihler kök seviyede kalır.
2. **Otel değiştirme.** Giriş ekranında (birden fazla profil varsa) otel seçici; "Ayarlar → Oteller" ile yeni otel ekle
   (kurulum sihirbazı o profil için çalışır). Aynı anda tek otel açık; değiştirmek = DB'yi kapat, diğerini aç, oturum yenile.
3. **Kullanıcılar otel başına.** Sahip, yeni otel kurarken "sahip hesabını kopyala" seçeneğiyle aynı kullanıcı adı ve
   şifreyi ikinci profile yazar. Personel hesapları ayrı (gerçekte de farklı personel).
4. **Uzaktan erişim.** İstemci modunda "Bağlan" ekranı birden fazla ana bilgisayar kaydı tutar (otel adı + adres + parmak
   izi); seçilen otele bağlanır. Mac kopyası otel başına ayrı (`replica/<kod>`).
5. **Portföy özeti (sahip ekranı).** Yeni ekran `features/portfolio/`: her otel için bugün doluluk, gelen/giden, kasa
   durumu, ayın geliri/gideri, açık arızalar; kaynak = her otelin kopyası (Mac) ya da ana bilgisayarına canlı bağlantı
   (sırayla). Rakamlar her otelin kendi para biriminde; toplam için otel kuru ayarı. Yalnız `owner` rolü.
6. **Yedek.** Otel başına ayrı yedek ve anahtar; Drive yolu `Bismuth/<kod>/yedekler`. Geri yükleme profil içinde.
7. **Raporlar.** Otel içinde değişmez; portföy ekranı yalnız özet (ayrıntı için otele geçilir).
8. **Turizm istatistiği / KBS** otel başına kalır (her tesisin kendi bildirimi).

Varsayılan (sahip cevaplamazsa): K-54 uygulanır, portföy özeti Faz 20'ye ertelenir (önce profil altyapısı).

## 4. Sahibe sorular (S-114…S-117)

- S-114 Kaç oteliniz var ya da olacak; aynı şehirde mi? (Varsayılan: 2, farklı adreslerde.)
- S-115 İkinci otelin resepsiyonu kendi bilgisayarını mı kullanacak? (Varsayılan: evet, her otelin kendi ana bilgisayarı.)
- S-116 Tek yerde görmek istediğiniz ilk üç bilgi hangileri? (Varsayılan: bugünkü doluluk, kasa, ayın geliri.)
- S-117 Aynı personel iki otelde de çalışıyor mu (maaş tek bordroda mı)? (Varsayılan: hayır; çalışıyorsa her otelde ayrı kayıt.)

## 5. Plan paketleri

| Paket | İçerik | Büyüklük | Bağımlılık |
|---|---|---|---|
| P20a Profil altyapısı | `paths.ts` profil kökü, taşıma, otel seçici, "Oteller" ayarı, sahip hesabı kopyalama, yedek yolu | M | — |
| P20b İstemci çoklu ana bilgisayar | Bağlan ekranında kayıt listesi, kopya klasörleri otel başına | M | P20a |
| P20c Portföy özeti | `features/portfolio/`, özet üretici, owner yetkisi, telefon düzeni | M | P20a, P20b |
