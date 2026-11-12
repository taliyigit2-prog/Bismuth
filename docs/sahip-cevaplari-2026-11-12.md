# Sahip cevapları ve yeni yönergeler — 2026-11-12

> **Fable için:** Bu dosyayı `docs/fable-tamamlama.md` §5'e göre işle:
> - Cevapları `06-kararlar.md` → "Sahip cevapları" bölümüne yaz.
> - `05-sorular.md`'de S-100…S-118'i ✅ yap.
> - Etkilenen K-48…K-56 taslaklarını kesinleştir ya da değiştir.
> - Faz 17–21 dosyalarını, paket kartlarını, `YURUTME.md`'yi, maliyet tahminini ve `OPUS-BASLANGIC.md`'yi güncelle.
> - §B'deki yeni yönergeleri ayrıca araştırıp raporla.
>
> Sahibin sözleri tırnak içinde, yorum ve uygulama notları ok (→) ile.

## A. S-100 … S-118 cevapları

| Soru | Sahibin cevabı | Uygulama notu |
|---|---|---|
| S-100 İade yetkisi | "Resepsiyon iade girebilir." | → Resepsiyon rolüne iade yetkisi varsayılan açık. Rol ayarından kapatılabilir. Her iade `audit_log`'a düşer. İade tutarı tahsilatı aşamaz (mevcut kural). |
| S-101 "Ortak görünüyor" | (a) | → Bir isimle alınmış birden çok oda tek panelde ve tek iptalle görünüyor. Grup rezervasyonu yapılır: oda başına misafir adı, oda başına ya da toplu işlem, toplu giriş. |
| S-102 Gündüz fiyatı | "Saatlik. Fiyatı resepsiyon belirlesin. Kurulumda da sorulabilir." | → Saatlik konaklama. Fiyatı resepsiyon satış anında girer. Kurulum sihirbazında ve ayarlarda isteğe bağlı bir varsayılan saatlik fiyat sorulur (oda tipi başına). |
| S-103 Günlük satış sınırı | "Sınırsız." | → Aynı odada aynı gün sınırsız saatlik satış. Yalnızca saat çakışması engellenir. Temizlik arası ayarlanabilir; varsayılanı uyarıdır, engel değildir. |
| S-104 KBS | "Evet, bildirilir." | → Saatlik misafir de KBS listesine girer. |
| S-105 Raporlar | "Dahil edilsin, sadece filtreleme yapılabilsin; aylık kaç tane saatlik satılmış görebilmiş oluruz." | → Saatlik gelir ve doluluk raporlara dahil. Raporlarda "konaklama türü: gecelik / saatlik" filtresi ve aylık saatlik satış sayısı olur. |
| S-106 Grup ödemesi | Varsayılan | → Tek hesap. Gerekirse oda başına ayrı hesap seçeneği. |
| S-107 Personel kamerada | Varsayılan | → Personel dışlama listesi. Personel yüz tanımaya girmez. |
| S-108 Kamera görüntüsü | "Canlı görüntü yalnızca otel bilgisayarında; telefonda sadece alarm listesi. Alarm zaten Telegram'dan da var." | → Canlı yayın yalnızca ana bilgisayarda. Telefon ve Mac'te alarm listesi. |
| S-109 Telegram | "Telegram'da da olsun, programda da." | → Alarm hem Bismuth bildirimine hem Telegram'a gider. Telegram bir ayardır, açılıp kapatılabilir. Bu, ağ kodu sınırı ve G-07 için bir istisna kararı (K-xx) gerektirir. Telegram kodu izinli bir ağ klasöründe olur, 5 sn zaman aşımı ve sessiz başarısızlık uygulanır, internet yokken alarm programda yine görünür. |
| S-110 Yüz tanıma modelleri | "Mevcut sistemin ticariye uygun olduğunu biliyorum, bu konu araştırılmalı. Test ettim, çok iyi çalışıyor; değiştirmek istemiyorum. Kendi otelimde kişisel olarak kullanacağım, şimdilik satmayı düşünmüyorum." | → Mevcut modeller (InsightFace buffalo_s + YOLO11n) **korunur**. Fable lisansı resmi kaynaklardan yeniden araştırır ve sonucu raporda açıkça yazar: kendi otelinde kullanım ticari kullanım sayılır mı, model ağırlıkları ile kod lisansı farkı, AGPL'in yalnızca dağıtımda tetiklenmesi. Risk varsa sahibe tek paragrafta bildirir. Satış ileride gündeme gelirse alternatif modele geçiş planı hazır tutulur, ama şimdi geçilmez. |
| S-111 Rıza | "Yazılı onay gerekmiyor. Otelde 'bu otelde kamera ile kayıt alınmaktadır' gibi bir yazı yeterli. Avukatla görüştüm." | → Sahibin avukat görüşü kayda geçer: aydınlatma tabelası yeterli kabul edilir, yazılı rıza akışı yapılmaz. Program kurulumda ve kamera sekmesinde aydınlatma metni şablonu sunar. Yüz verisi şifreli, yerel, saklama süreli (ayar) tutulur. Bu nokta rapora "sahibin hukuki değerlendirmesi" olarak yazılır. |
| S-112 Kamera ve bilgisayar | "Bilgisayar bilgileri gibi otomatik alınabilenler kurulumda otomatik alınsın. Kamera gibi elle girilmesi gerekenleri kurulum sorsun. Kameranın markasını bilmiyorum ama Hik-Connect uygulamasıyla bağlanıyorum." | → Hik-Connect, kameranın ya da kayıt cihazının (NVR) **Hikvision** olduğunu gösterir. Kamera kurulum sihirbazı şunları yapar: yerel ağda kamera arar (ONVIF / Hikvision SADP benzeri keşif), IP, kullanıcı adı ve şifre ister, Hikvision RTSP adres kalıbını (`rtsp://<kullanıcı>:<şifre>@<ip>:554/Streaming/Channels/<kanal>01`) hazır sunar, görüntüyü test eder ve kanal ya da kamera sayısını bulur. İşlemci, RAM ve işletim sistemi otomatik okunup performans profili seçilir. Şifre şifreli saklanır. |
| S-113 Windows kurulumu | Varsayılan | → Yalnızca kuran kullanıcı için (bugünkü gibi). |
| S-114 Otel sayısı | "Aynı şehirde, 2 otel, farklı adres." | — |
| S-115 Bilgisayarlar | "Her otelin kendi bilgisayarı ana bilgisayar olur. Fakat birbirlerine bağlanabilirler." | → Her otel kendi ana bilgisayarında kendi veritabanıyla çalışır. Oteller arası bağlantı mevcut uzaktan erişim altyapısı (NetBird, sunucu modu) üzerinden olur: sahip bir otelden diğerine bağlanıp görebilir veya çalışabilir. Fable bunu çoklu otel kararına (K-xx) işler. |
| S-116 Tek ekranda ilk görülecekler | "Takvim, gelir-gider sekmesi, bugünkü doluluk, kasa." | → Sahip özet ekranı: iki otelin takvimi (otel seçerek ya da yan yana), gelir-gider, bugünkü doluluk, kasa. |
| S-117 Ortak personel | "Aynı personel iki otelde çalışmıyor." | → Personel otel bazında. Ortak bordro gerekmez. |
| S-118 21st.dev | "Ücretli üyeliğim var, kullanalım; bolca hakkım var. 21st.dev'de yeni bir 'Apps' sekmesi geldi, birçok güzel tasarım var. Hangilerinin uygun olduğunu bilmiyorum; Opus ya da Fable kendisi seçebilir. Detaylıca tarasın, en uygun olana karar versin, direkt alsın." | → 21st.dev kullanılacak. Ayrıntısı §B.3'te. |

## B. Yeni yönergeler (sahip)

### B.1 Rust'a geçiş

"Birçok program Rust diline geçiriliyor; sebebi güvenlik ve hız. Bu programı da Rust'a geçirmek istiyorum. Oteldeki
bilgisayar güçlü değil; hızlı çalışması ve yük olmaması gerekiyor."

→ Fable bunu **araştırır, ölçer ve karar önerir**. Bu turda kodu dönüştürmez.

- **Önce ölç:** Bugünkü Electron uygulamasının boşta ve yoğun kullanımdaki RAM ve CPU kullanımı, açılış süresi ve
  paket boyutu. Ölçümü codespace'te `xvfb` ile yap ve rakamları ver.
- **Seçenekleri karşılaştır:**
  - (a) Electron'u optimize etmek.
  - (b) **Tauri 2**: Rust kabuk, sistemin kendi WebView'i, React arayüz aynen kalır. Arka uç TypeScript servisleri için
    alt seçenekler: Node yan süreç ya da servislerin kademeli Rust'a taşınması.
  - (c) Tamamen Rust: arka uç Rust + Tauri.
  - Varsa başka seçenekler.
- **Her seçenek için yaz:**
  - beklenen RAM ve CPU kazancı (kaynaklı)
  - iş büyüklüğü
  - risk: SQLite, migrasyonlar, sunucu modu, yedek, testlerin taşınması, Windows WebView2 ve macOS WKWebView farkları
  - kamera modülüyle ilişkisi (Rust tarafında ONNX ile yüz tanıma mümkün mü)
  - API maliyeti tahmini
- **Net bir öneri ver ve plana aşamalı paketler olarak koy.** Mevcut raporların öncelik sırasını bozmasın: önce
  resepsiyon düzeltmeleri gelir. Sahip "geçmek istiyorum" dedi; öneri bunu en düşük riskle gerçekleştirmeli.
- Raporu `docs/analiz/11-rust-gecisi.md` dosyasına yaz.

### B.2 Ponytail becerisi

"Kodları kısaltmak için https://github.com/dietrichgebert/ponytail reposunu kursun. Diğer Claude ve projedeki otonom
işler yapıldıktan sonra bolca kullansın."

→ Ponytail, MIT lisanslı bir Claude Code becerisi. Hedefi kodu sadeleştirmek ve kısaltmak.

- Depoyu oku: README, kurulum, ne yaptığı, hangi dosyaları yazdığı.
- Güvenlik açısından incele: kurulum betiği ne çalıştırıyor, ağ erişimi var mı.
- Projeye uygun biçimde kur: proje becerisi olarak `.claude/skills/` altına ya da README'nin önerdiği yolla. Sürümü
  sabitle.
- Kuralları `CLAUDE.md`'deki yasaklarla çatışıyor mu, kontrol et. Çatışma varsa proje kuralları önce gelir; bunu
  beceriye not olarak ekle.
- `/orkestra` akışına "her dalganın sonunda, testler geçtikten sonra ponytail ile sadeleştirme turu" adımını ekle.
  Hangi ajanın ve modelin yapacağına sen karar ver. Sadeleştirme davranışı değiştirmemeli; testler aynı kalıp geçmeli.
- `09-ajan-sistemi.md` raporunu güncelle.

### B.3 21st.dev

→ Sahibin **ücretli** üyeliği var.

- Sahibin, anahtarı Codespaces secret olarak nasıl ekleyeceğini adım adım yaz (secret adını sen belirle;
  `.mcp.json` ile tutarlı olsun).
- 21st.dev'in yeni **Apps** sekmesini (21st.dev/community/apps) ve bileşen kütüphanesini tara. Otel yönetimine uygun
  tasarımları seç: takvim, rezervasyon, CRM, panel, analitik, ayarlar ve benzeri.
- Seçim ölçütleri ve sınırlar:
  - Proje kurallarıyla uyum: shadcn/ui ve Radix tabanı, Tailwind v4, paket içi kaynak, CDN yok, i18n, mantıksal CSS,
    telemetri yok, erişilebilirlik, düşük güçlü bilgisayarda performans.
  - Her seçilen öğenin lisansını kontrol et.
  - Görsel yenilemeyi Faz 18 (ekran) ve takvim yeniden tasarımı (Faz 17) paketlerine bağla.
  - Somut seçimleri (bağlantı, hangi ekrana) `docs/analiz/12-21st-tasarim-secimi.md` dosyasına yaz.
- Sahip "en uygun olana karar versin, direkt alsın" dedi. Uygulamayı Opus yapar; sen seçimi ve uyarlama talimatını
  hazırla.

## C. Bütçe notu

Bu ek araştırmalar bütçeyi aşarsa önceliği koru:

1. A'daki cevapları plana işle.
2. B.2 Ponytail.
3. B.3 21st.dev.
4. B.1 Rust raporu.

Bitiremezsen `⏸️ FABLE İŞİ HENÜZ BİTMEDİ` kuralını uygula.
