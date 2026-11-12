# 01 · Gereksinim Kataloğu — Bismuth

> Otel sahibinin (Pandora Suit Otel, İstanbul, 19 oda) sohbet içinde söylediği her isteğin ve ekran
> görüntülerinden çıkarılan her davranışın tek listesi. Her madde bir kimlik taşır (`G-xx`); faz dosyaları ve
> testler bu kimliklere atıf yapar. Bu dosya yalnızca sahibin açık isteğiyle (`/requirement-change`) değişir.
>
> **Sürüm 4 (2026-10-02, 4. tur):** sahip `05-sorular.md`'deki tüm soruları cevapladı ve günlük akışını anlattı
> (`akislar.md`). Yeni: **Görevler** sekmesi, **vardiya devri ve notlar**, **odadaki kişiler + KBS işaretleri** (yasal),
> kayıp eşya, açılış ekranı Takvim, oda tipine göre varsayılan fiyat, gün kapatma, program içi kılavuz, klavye kısayolları,
> kat planı görünümü. Değişen: misafir kartında yalnız kimlik (doğum/anne‑baba adı yok), gider kategorisi listesi yok,
> kur kaydın yazıldığı dakikada donar, ek mesai oranını Sahip/Müdür belirler, arızada maliyet alanı yok ve çözülen arıza
> fotoğrafları silinir, çamaşırhanede giden/gelen takibi, hava durumu haftalık ve simgeli, altın kuru yok, yedek otelin
> Google Drive'ına (30 gün, şifreli, yavaş), uzaktan erişim kararı (K-19, ücretsiz yol). 38 yatak.
>
> **Sürüm 3 (2026-10-01, 3. tur):** Arapça ertelendi (TR/EN/RU), kur yalnızca piyasa orta kur, hava durumu zorunlu,
> oda + **yatak** kapasitesi ve geçmişi, 2026 verisinin taşınması zorunlu, KBS istatistiğinde giriş ayı kuralı,
> çamaşırhane türleri + lekeli adedi + birim fiyat geçmişi, uzaktan erişim mimarisi yeniden açıldı (ücretsiz bulut araştırması).
>
> **Sürüm 2 (2026-10-01):** sahibin ikinci tur değişiklikleri işlendi — çoklu cihaz/uzaktan erişim, dört dil,
> piyasa kuru, sınırsız bayram, serbest renk/anlam, turizm istatistiği, telefon rehberi, ürün/çamaşırhane takibi,
> oda arıza bildirimi, misafir ödeme geçmişi, firma/fatura bilgileri, sürekli istekler. Program adı **Bismuth**.

Öncelik kodları: **ZORUNLU** (v1.0'da olmadan sürüm çıkmaz) · **ÖNEMLİ** (v1.0'da olmalı, kısıtlı sürüm riskinde
ertelenebilir) · **İSTEĞE BAĞLI** (sahip onayına bağlı ek fikir).

---

## A. Ürün sınırları

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-01 | **Çevrimdışı veri girişi.** Otel bilgisayarındaki Bismuth, internet olmadan tüm kayıt ve görüntüleme işlerini yapar (rezervasyon, ödeme, gider, personel, raporlar). İnternet yalnızca ek özellikler içindir. | ZORUNLU |
| G-02 | **İnternet gerektiren özellikler** açıkça ayrıdır ve kapalıyken program bozulmaz: piyasa kuru, **hava durumu**, bayram listesi çevrimiçi doğrulama, **uzaktan erişim / bulut eşitleme** (G-140+). Hepsi ayarlardan kapatılabilir; başarısızlık sessizdir (rozet + son bilinen veri). (değişti: 2026-10-01, 3. tur) | ZORUNLU |
| G-03 | **Windows** için `Bismuth-Setup.exe`, **macOS** için `Bismuth.dmg` (içinde `.app`). Çift tıkla kurulur; terminal gerekmez. İmzasız dağıtım (sahip tercihi); ilk açılış uyarıları için resimli kılavuz. | ZORUNLU |
| G-04 | Mümkün olan en geniş işletim sistemi aralığı: Windows 10/11 (x64, arm64), macOS 11+ (Electron sürümü buna göre seçilir; K-12). Sahibin Mac'i M2 / macOS 26; otel bilgisayarı büyük olasılıkla Windows 10. | ZORUNLU |
| G-05 | **OTA / kanal yöneticisi entegrasyonu yok.** Airbnb, Booking vb. yalnızca satış kanalı etiketi. | ZORUNLU |
| G-06 | **Fatura kesme yok.** Fatura ayrı programda kesilir; Bismuth yalnızca fatura **bilgilerini** saklar ve kopyalar (G-191). | ZORUNLU |
| G-07 | **Bitmiş ürün.** Bizim işlettiğimiz sunucu, telemetri, otomatik güncelleme, lisans sunucusu yok. Bağımlılıklar sabit. Üçüncü taraf hizmet yalnızca sahibin kendi hesabıyla ve isteğe bağlı (örn. uzaktan erişim için özel ağ uygulaması, kur API anahtarı). | ZORUNLU |
| G-08 | Arayüz dilleri: **Türkçe (varsayılan), İngilizce, Rusça** — ayarlardan seçilir. **Arapça ertelendi** (sağdan sola düzen maliyeti); altyapı mantıksal CSS ile RTL'ye hazır tutulur ama Arapça dosyası ve RTL testi v1'de yok. Metinler çeviri dosyalarından gelir. Rusça çevirinin son kontrolü yapay zekâ kontrolüyle yeterli (sahip Rusça biliyor; S-77). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-09 | Bismuth **genel bir otel ürünüdür**: Pandora'ya özgü her kural (4 izin/ay, cumartesi, Bounce, çamaşırhane, **2 resepsiyon × 12 saat vardiya**, kasadan avans, ek mesai ücreti yok) **ayar**dır. (değişti: 2026-10-02, 4. tur) | ZORUNLU |

## B. Kurulum ve ilk açılış

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-10 | İlk açılışta **kurulum sihirbazı**: dil, otel adı, ülke/şehir (hava durumu konumu), ana para birimi + dövizler, oda tipleri, odalar, **yatak sayıları**, **oda tipine göre varsayılan fiyat ve hafta sonu farkı**, ödeme yöntemleri, satış kanalları, ek hizmetler, çalışanlar, personel politikası, **vardiya düzeni**, takvim, sahip hesabı, **çalışma modu**. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-11 | **Oda tipleri**: uzun, gruplanmış, çok dilli hazır liste + otele özel isim. | ZORUNLU |
| G-12 | Odalar: numara, kat, tip, **yatak sayısı**, satılabilir, sıralama; toplu oluşturma. **Kapasite geçmişi**: oda ekleme/çıkarma ve yatak değişikliği (tadilat) **geçerlilik tarihiyle** kaydedilir; geçmiş ayların doluluk ve bakanlık istatistiği o tarihteki oda/yatak sayısıyla hesaplanır. Ayarlardan oda/yatak ekleme‑çıkarma. Pandora: **19 oda, 38 yatak** (S-78). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-13 | **Ödeme yöntemleri** genişletilebilir (varsayılan Nakit, Kredi Kartı, Havale/EFT). | ZORUNLU |
| G-14 | **Satış kanalları** genişletilebilir. | ZORUNLU |
| G-15 | **Ek hizmetler** tanımlanabilir (bavul emaneti vb.). | ZORUNLU |
| G-16 | **Bayramlar sınırsız yıl için** çevrimdışı üretilir (kural tabanlı; takvimde yeni yıla gidildikçe otomatik). İnternet varsa yılda bir çevrimiçi doğrulama (isteğe bağlı) yalnızca "üretilmiş" satırları düzeltir; kullanıcı düzenlemeleri korunur. | ZORUNLU |
| G-17 | **Görünüm ayarları**: tema açık / koyu / sisteme göre; tutarlar varsayılan **tam sayı**, ayarlardan kuruşlu; yoğunluk (rahat/sıkışık). | ZORUNLU |
| G-18 | **Program içi kılavuz** (S-52): yalnız ilk kurulumda değil, **Ayarlar'dan her zaman** açılır; her ekranda "?" ile o ekranın bölümüne gider. **Çok ayrıntılı**, **basit kelimelerle**, teknik terim kullanmadan, ekran görüntülü; yeni başlayan bir çalışan tek başına öğrenebilsin (resepsiyon, kat görevlisi, muhasebe, sahip bölümleri). Üç dilde. (yeni: 2026-10-02) | ZORUNLU |
| G-19 | **Klavye kısayolları** (S-51): yeni rezervasyon, arama, bugüne git, ödeme gir, takvimde ok tuşlarıyla gezinme; kısayol listesi kılavuzda ve `?` ile görünür. (yeni: 2026-10-02) | ÖNEMLİ |

## C. Kullanıcılar ve roller

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-20 | Sistem rolleri **hazır öneri olarak** gelir (Sahip, Müdür, Resepsiyon, Muhasebeci, Temizlik, Çalışan); sahip yeni rol ekler, var olanı **düzenler veya siler** (Sahip rolü hariç); her ekran/veri alanı için "göremez / görür / düzenler" seçer. (değişti: 2026-10-01, 3. tur) | ZORUNLU |
| G-21 | Yetki tanımı **basit seçimlerle** yapılır (ekran listesi × select); teknik anahtar isimleri görünmez. "Yönetici giderleri" gibi gizli bölümler bu matrisle gizlenir. | ZORUNLU |
| G-22 | Giriş: kullanıcı adı + şifre veya PIN; boşta kilit; hızlı kullanıcı değiştirme. Uzaktan erişimde aynı hesaplar. | ZORUNLU |
| G-23 | Yetki kontrolü **servis katmanında** (IPC ve HTTP için aynı). | ZORUNLU |
| G-24 | **Denetim kaydı** (programın "kara kutusu"): kim, hangi cihazdan, ne zaman, neyi ekledi/değiştirdi/iptal etti (önceki ve sonraki değer). Kayıt silinemez. Varsayılan olarak yalnız **Sahip** görür; rol ekranından başkasına açılabilir (S-13, açıklandı). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-25 | Çalışan kartı ↔ kullanıcı hesabı bağlantısı. | ZORUNLU |

## D. Rezervasyon takvimi

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-30 | Oda satırları × gün sütunları (tape chart); sol iki sütun sabit. | ZORUNLU |
| G-31 | Takvim sınırsız ileri/geri; sanallaştırma; başlangıç yılı ayarlanabilir. | ZORUNLU |
| G-32 | **Durum etiketleri iki katmanlı:** (a) **otomatik durumlar** program türetir (ödendi, ödenmedi, **kısmen/kapora — ayrı renk**, aynı gün giriş‑çıkış, geçmişte boş, boş, satılmaz) — kullanıcı **adını ve rengini** değiştirir, istemediğini kapatır; (b) **özel etiketler** kullanıcı tanımlar (ad + renk + anlam metni), rezervasyona elle atar (örn. "Sorunlu", "Grup"). Hangi katmanın üstte çizileceği ayarlanır. Excel'deki kırmızı/sarı/mavi/gri/siyah yalnızca varsayılandır. (değişti: 2026-10-02, 4. tur — S-10 onaylandı) | ZORUNLU |
| G-33 | Renk ve anlam ayarları ekranı: renk seçici, ad, açıklama, önizleme, varsayılana dön; takvimde **lejant** (açıklama kutusu). | ZORUNLU |
| G-34 | Hücre içeriği: **misafir adı + gecelik fiyat** (+ birim) (S-23); küçük simgeler: hücre notu, **VIP**, sürekli istek, **KBS'ye bildirilmemiş kişi uyarısı** (G-54); misafirin sürekli isteği varsa rezervasyonda otomatik görünür (G-192). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-35 | Bir rezervasyon birden fazla oda. | ZORUNLU |
| G-36 | Geceye göre farklı fiyat. | ZORUNLU |
| G-37 | Aynı gün aynı odada iki misafir; day‑use ayrı tür (yalnız tür + renk; ayrı fiyat kuralı yok — S-25). (değişti: 2026-10-02, 4. tur) | ZORUNLU (değişti: 2026-11-12 — ayrı gündüz fiyatı ve saat aralığı G-196 ile eklendi) |
| G-38 | Satılmaz / bakımda / arızalı oda bloğu (G-180 ile bağlantılı). | ZORUNLU |
| G-39 | Park edilmiş rezervasyonlar (tablo altı). | ZORUNLU |
| G-40 | Özel günler: bayram otomatik (TR); **varsayılan vurgulu günler cumartesi ve pazar**; kullanıcı **istediği günü özel gün** yapar; kullanıcı notu tek/aralık/toplu (S-24). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-41 | Gün atlama, misafir arama, boş oda bulma. | ZORUNLU |
| G-42 | Rezervasyon durumları (ön kayıt, kesin, giriş yaptı, çıkış yaptı, iptal, gelmedi, park). | ZORUNLU |
| G-43 | Kapora ve bakiye. | ZORUNLU |
| G-44 | Oda değişikliği, uzatma/kısaltma. | ÖNEMLİ |
| G-45 | Kara liste uyarısı. | ZORUNLU |
| G-46 | Rezervasyon panelinde **misafirin geçmişi tek tıkla**: önceki konaklamalar ve ödediği gecelik fiyatlar (G-190). | ZORUNLU |
| G-47 | **Açılış ekranı Takvim**'dir (S-11); kullanıcı kendi açılış ekranını ayarlardan değiştirebilir. (yeni: 2026-10-02) | ZORUNLU |
| G-48 | **Oda tipine göre varsayılan fiyat** ve **hafta sonu / özel gün farkı** (S-20): rezervasyon yazılırken öneri fiyat gelir, kullanıcı değiştirir; program fiyat dayatmaz. (yeni: 2026-10-02) | ÖNEMLİ |
| G-193 | **Vazgeçme ve iade** (resepsiyon geri bildirimi 1 ve 3, 2026-11-12): giriş yapılmış bir konaklamadan misafir vazgeçtiğinde program tek menüden "aynı gün çıkış + iade", "girişi geri al + iptal" ya da "erken çıkış" sunar; iptal ve çıkış pencereleri tahsilatı gösterir ve iade satırı ya da "İade bekliyor" parkı önerir; kapalı (çıkış yapılmış) rezervasyonun paneli işlem menüsünü (iade gir, geçmiş, not) korur; hiçbir kayıt silinmez (`docs/analiz/03-resepsiyon-geri-bildirimi.md`). (yeni: 2026-11-12) | ZORUNLU |
| G-194 | **Grup rezervasyonu ve toplu giriş** (resepsiyon geri bildirimi 2): birden çok oda tek grup kimliğiyle bağlanır, oda başına misafir adı yazılır, grup panelinden toplu giriş/çıkış/not yapılır; takvimde grup aynı desenle görünür; ödeme tek folyo ya da oda başına (S-106). (yeni: 2026-11-12) | ZORUNLU |
| G-195 | **Hızlı takvim işlemleri** (resepsiyon geri bildirimi 2): sağ tık (telefonda uzun basma) menüsü, boş hücrede hızlı rezervasyon çubuğu, çoklu seçim ile toplu işlem, takvim üstünde bugün şeridi (gelen/giden/otelde); en sık beş işlem tek tıkla. (yeni: 2026-11-12) | ÖNEMLİ |
| G-196 | **Gündüz kullanımı 2.0** (resepsiyon geri bildirimi 4; G-37'yi genişletir): gündüz yuvası saat aralıklı; aynı odada aynı gün birden çok gündüz satışı ve gece satışı ayarla mümkün; temizlik arası uyarısı; ayrı gündüz fiyatı (sabit/saatlik/gecelik, ayar); raporda ayrı satır ve doluluğa katılım ayarı; aynı gün ikinci tur çıkışında oda o gece yeniden satılabilir (K-44 eki, K-48). (yeni: 2026-11-12) | ZORUNLU |

## E. Misafirler, odadaki kişiler, kara liste, firmalar

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-50 | Misafir kartı: ad, soyad, telefon, e‑posta, **kimlik/pasaport no** (belge türüyle), notlar, etiketler, **VIP işareti** (elle; S-18), sürekli istek, konaklama geçmişi, toplam harcama. **Doğum tarihi/yeri, anne/baba adı tutulmaz** (S-15: "kimlik yeterli"; S-92: "kesinlikle hayır"). Uyruk isteğe bağlı alan (varsayılan gizli). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-51 | Otomatik tamamlama; tekrar kayıt önleme; birleştirme. | ZORUNLU |
| G-52 | Kara liste (ad / kimlik / telefon eşleşmesi). | ZORUNLU |
| G-53 | **KBS bildirim takibi (elle):** KBS ile entegrasyon yok; KBS girişi misafir gelirken KBS sisteminde anında yapılır (S-93: toplu dosya yok). Bismuth odadaki **her kişi** için "KBS'ye bildirildi" ve çıkışta "KBS çıkışı yapıldı" işaretini (kim, ne zaman) tutar; eksikler takvimde, Bugün ekranında ve vardiya devrinde uyarı olur (S-61). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-54 | **Odadaki kişiler** (sahip: "yasal açıdan çok önemli"; S-22): her konaklamada odada kalan **her kişi** ayrı satırdır — ad soyad, isteğe bağlı **tanıtıcı not** (örn. "kızıl saçlı"; gece çalışanı her seferinde isim sormadan tanısın), KBS işaretleri (G-53), geliş saati (sonradan gelen kişi konaklama sırasında eklenir), ayrıldı işareti. Kişi sayısı bu listeden türetilir (ayrıca yazılmaz). KBS işareti olmayan kişi varsa takvim hücresinde ve listelerde kırmızı uyarı. **"Otelde kalanlar"** ekranı: oda · kişiler · notlar · KBS durumu tek bakışta, aranabilir, yazdırılabilir (gece vardiyası için). Kişi eklemek isteğe bağlıdır ama ana misafir dışındaki kişinin adı önerilir. (yeni: 2026-10-02) | ZORUNLU |
| G-55 | **Kayıp eşya defteri** (S-17): bulunan eşya, oda/yer, tarih, bulan, açıklama, saklandığı yer, isteğe bağlı fotoğraf; durum (saklanıyor / sahibine verildi — kime, ne zaman / elden çıkarıldı). Az kullanılan sade bir sekme. (yeni: 2026-10-02) | ÖNEMLİ |
| G-190 | **Ödeme ve fiyat geçmişi** (sahibin en sevdiği özellik): misafir kartında ve rezervasyon panelinde, tarih sırasıyla her konaklama → oda, gece sayısı, gecelik fiyat, ödenen tutar/yöntem/kanal; "son ödediği fiyat" özeti; fiyat verirken referans. Arama: ad, telefon, oda, tarih. | ZORUNLU |
| G-191 | **Firma / fatura bilgileri**: misafir kartına (veya ayrı "Firmalar" listesine) bir kez girilir: unvan, adres, vergi dairesi, vergi no, telefon, e‑posta, **IBAN**, yetkili kişi, not; **favori** işareti; **kopyala** düğmesi (tek tık, tüm bilgiler panoya) → sahibin ayrı fatura programına yapıştırması için. Fatura Bismuth'ta kesilmez. (değişti: 2026-10-02, 4. tur — S-72) | ZORUNLU |
| G-192 | **Sürekli istekler (misafir notu)**: misafir kartındaki "her gelişinde" notu (örn. "yüksek kat ister", "ekstra yastık"); **iki seviye**: "bilgi" (sarı kutu) ve "önemli" (kaydetmeden önce onay ister) (S-75); bu misafire rezervasyon yazılırken panelde ve takvim hücresinde **otomatik uyarı** olarak görünür. Tek seferlik istek rezervasyon notunda kalır. (değişti: 2026-10-02, 4. tur) | ZORUNLU |

## F. Defter, kasa, giderler

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-60 | Tek giriş ilkesi. | ZORUNLU |
| G-61 | Ödeme alanları (tutar, birim, yöntem, kanal, rezervasyon, tür). | ZORUNLU |
| G-62 | Günlük defter görünümü + gün notu. Düzen sahibin Excel defterine benzer, **daha temiz** ve **Excel sınırları olmadan** (satır sayısı, yavaşlama, elle toplam hatası) (S-74). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-63 | Yönteme göre sıralama. | ZORUNLU |
| G-64 | Teslim alındı (x) akışı ve kasa paneli. **Teslim alma yetkisi varsayılan Sahip + Müdür** (S-30). Kredi kartı ve IBAN satırları da banka/ekstre kontrolünden sonra **aynı x** ile işaretlenir (S-31; ayrı mutabakat işareti yok). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-65 | ~~Banka mutabakatı işareti.~~ (kaldırıldı: S-31 → G-64'teki aynı x işareti) (değişti: 2026-10-02, 4. tur) | — |
| G-66 | Gider kaydı: tutar, birim, açıklama, kasadan mı (x). **Hazır gider kategorisi listesi yok** (S-33): açıklama serbest yazılır ve önceki açıklamalardan **otomatik tamamlanır** (Excel'deki gibi); raporlarda "en çok ne harcadım" açıklama, ürün ve personel kalemlerine göre gruplanır. Gizli bölüm (yönetici giderleri) G-67 ile ayrılır. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-67 | Gizli gider bölümleri (rol matrisi ile). | ZORUNLU |
| G-68 | Ek hizmet satışı. | ZORUNLU |
| G-69 | Maaş/avans/izin parası otomatik gider. Çalışanın **kasadan avans** alması ayarla açılır (Pandora'da açık; S-38). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-70 | Döviz tutarlarının ana birime çevrimi: **kaydın yazıldığı dakikadaki piyasa kuru** dondurulur; tutar veya para birimi sonradan değiştirilirse **değiştirildiği andaki** kur alınır (S-32: "Türkiye'de kurlar çok hareketli"). İnternet yoksa son bilinen kur + rozet; otel kuru / elle düzeltme isteğe bağlı. Ay kuru seçeneği yok. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-71 | **Tedarik alımı önce gider olarak yazılır** (sahibin defter düzeni; S-74): gider satırına isteğe bağlı **ürün satırları** (ürün, adet, birim fiyat) eklenir; ürün fiyat geçmişi ve zam uyarısı bu satırlardan çıkar (G-170). Aynı alım ikinci kez yazılmaz. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-72 | **Gün kapatma** (S-12): ayarla açılır (Pandora'da az kullanılır, başka oteller çok kullanır); kapatılan güne değişiklik yalnız yetkiyle ve denetim kaydıyla. (yeni: 2026-10-02) | ÖNEMLİ |

## G. Personel

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-80 | Çalışan kartı; ekleme/çıkarma. | ZORUNLU |
| G-81 | Aylık maaş tablosu (Excel formülü korunur, mesai/prim eklenir). | ZORUNLU |
| G-82 | İzin politikası ayarlanabilir. Pandora: kullanılmayan izin **devretmez, ödenir** (S-37). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-83 | İzin kaydı. | ZORUNLU |
| G-84 | Fazla mesai: ücret türü ve oranı **işletmeye göre değişir; Sahip ve Müdür belirler** (ayar; Pandora'da ek mesai ücreti yok → kapalı) (S-34). **Ek mesai saatini yalnız Müdür (ve Sahip) girer**; çalışan **kendi normal mesaisinin geliş ve çıkış saatini** girebilir, çalışılan süre bundan hesaplanır (S-39). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-85 | Bayram/yılbaşı mesaisi: oranı Sahip ve Müdür belirler (ayar) (S-35). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-86 | Satış primi: taban ve oranı Sahip ve Müdür belirler (ayar) (S-36). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-87 | Avans; maaş parça parça ödenebilir; kasadan avans ayarı (G-69). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-88 | Maaş ayı kilitleme. | ÖNEMLİ |

## H. Günlük operasyon: oda durumu, arıza, görevler, vardiya, bakım, takvim notları

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-90 | Oda durumu panosu (temiz / kirli / kontrol edildi / bakımda / kullanım dışı). **Çıkış yapılınca oda otomatik kirli** (S-14). **Kat planı görünümü**: odalar kat kat kutular hâlinde (S-96). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-91 | Bakım hatırlatıcı (tekrarlı, N gün önce uyarı) + **her N konaklamada bir** hatırlatıcı (örn. derin temizlik; varsayılan 10; oda bazında sayılır) (S-94). Hatırlatıcılar **Görevler**'e görev olarak düşer (G-94). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-92 | **Bugün ekranı** (açılış ekranı değil; G-47): bugün gelecekler, **bugün çıkacaklar** (öğlen hâlâ çıkmamış olanlar vurgulu), otelde kalanlar ve KBS eksikleri, kirli odalar, açık arızalar, bugünkü görevler, **okunmamış vardiya notu**, kasada bekleyen (yetkiye göre), hava durumu. (değişti: 2026-10-02, 4. tur) | ÖNEMLİ |
| G-93 | **Yasal bildirim hatırlatıcıları** hazır gelir (TR): Turizm Bakanlığı aylık konaklama istatistiği (her ayın 1–10'u), KBS günlük bildirim, periyodik kontroller; kapatılabilir. | ÖNEMLİ |
| G-94 | **Görevler sekmesi** (sahip isteği, 4. tur): görev = başlık, açıklama, kime (kişi / rol / vardiya), oda (isteğe bağlı), son tarih‑saat, **tekrar** (her gün belirli saatte, haftanın günleri, ayın günü, her N konaklama), durum (açık / yapıldı — yapan ve saat kaydedilir). Bugün ekranında ve vardiya devrinde görünür; gecikenler vurgulu; bakım ve "her N konaklamada" hatırlatıcıları görev olarak düşer. Örnek görevler (12:00 çıkış yapmayan odaları ara, çamaşırhane teslimi) ilk kurulumda **öneri** olarak sunulur, silinebilir. (yeni: 2026-10-02) | ZORUNLU |
| G-95 | **Vardiya devri ve notlar** (S-16 + sahip isteği): (a) **devir notu**: çıkan vardiya yazar, gelen vardiya "okudum" der (kim, saat); devir ekranı otomatik bir **özet** içerir (tek giriş — elle yazılmaz): henüz gelmemiş girişler, bu gece kalanlar ve KBS eksikleri, ödenmemiş bakiyeler, açık görevler ve arızalar, kasa durumu (yetkiye göre); (b) **kendime not**: yalnız yazan görür, isteğe bağlı hatırlatma saati; (c) **herkese not** (pano). Vardiya düzeni ayardır (Pandora: 2 resepsiyon, 09:00–21:00 / 21:00–09:00; başka otel farklı). (yeni: 2026-10-02) | ZORUNLU |
| G-180 | **Oda arıza / sorun bildirimi**: resepsiyon ya da herkes "501 tuvalet kapağı kırık" gibi kayıt açar: oda, başlık, açıklama, önem (düşük/orta/acil), bildiren, tarih, durum (açık / planlandı / çözüldü), çözen, çözüm tarihi. **Maliyet alanı yok** — masraf defterde gider olarak yazılır (S-76). **Açık arıza**: Bugün ekranında liste, takvimde ve oda panosunda odada rozet, rezervasyon panelinde uyarı ("bu odada açık arıza var"). İsteğe bağlı **fotoğraf** (S-64): arıza çözüldükten sonra elle silinebilir; çözülmüş arızaların fotoğrafları ayarlanan süre sonra (varsayılan 30 gün) **kendiliğinden silinir**, yedek gereksiz büyümez; arıza kaydının yazısı kalır. (değişti: 2026-10-02, 4. tur) | ZORUNLU |

## I. Raporlar, istatistikler, resmi bildirimler

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-100 | Aylık özet + **ay sonu kontrol sayfası** (sahibin rutini): kredi kartı ve IBAN toplamları (x'lenmiş / bekleyen), maaşlar (ödenen / kalan), ciro, kâr, **en çok harcama** listesi. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-101 | Yıllık özet. | ZORUNLU |
| G-102 | Otel KPI'ları; öncelik sırası (S-40): **ciro, kâr, gider, doluluk oranı, ödeme yöntemi, kanal**. (değişti: 2026-10-02, 4. tur) | ÖNEMLİ |
| G-103 | Gider dağılımı, personel maliyeti, teslim geçmişi. | ÖNEMLİ |
| G-104 | Tarih aralığı, karşılaştırma, dışa aktarma. | ÖNEMLİ |
| G-105 | Rol bazlı rapor görünürlüğü. | ZORUNLU |
| G-150 | **Turizm Bakanlığı konaklama istatistiği sekmesi.** Kullanıcı KBS'den indirdiği ham Excel'i (EGM Konaklayan Listesi, seçilen tarih aralığı) verir; program **uyruğa göre Toplam Giriş ve Toplam Geceleme** tablosunu bakanlık paneli biçiminde üretir. Kurallar (sahip bakanlıkla teyit etti): **aynı gün giriş‑çıkış = 1 geceleme**; **Türkler dahil**; **çocuklar ayrı giriş sayılmaz** (KBS satırı neyse o); **konaklamanın tüm geceleri giriş ayına yazılır, sonraki aya sarkan geceler dahil** (30 Eylül giriş – 2 Ekim çıkış → 2 gece Eylül'e; kurumlar bunu böyle kabul ediyor, S-81). Dosya alındığında hâlâ otelde olanların (çıkış "1900") geceleri Bismuth'taki **planlı çıkışa** kadar sayılır; eşleşme yoksa dosyanın içe alındığı güne kadar; ikisi de işaretli ve düzeltilebilir. **Doluluk oranı = geceleme ÷ (yatak sayısı × ayın gün sayısı)**; Pandora 38 yatak → Eylül %73,7. Doluluk her zaman **gerçek** yatak sayısıyla hesaplanır; bakanlıkta kayıtlı sayı (Pandora'da 28) kullanılmaz (S-99: "bizim işimiz yok"). **Ülke adları**: panelde açılır liste yok, yazdıkça çıkan kutu var → Bismuth Türkçe ülke adlarını kendisi verir; KBS'deki **Türkiye ve Kuzey Kıbrıs yazım hatalarına karşı** önlem: harf/aksan farkı tanınır, harf hatalı yazım en yakın ülkeye önerilir ve kullanıcı bir kez onaylar, belirsiz değer ("KIBRIS") otomatik eşlenmez (S-91). Program kendi verisinden de aynı tabloyu üretip KBS ile karşılaştırır. Bakanlığa giriş elle yapılır. (değişti: 2026-10-02, 4. tur) | ZORUNLU |

## J. Döviz ve dış veriler

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-110 | **Döviz sekmesi**: anlık kurlar (USD, EUR, GBP, RUB; ayarla eklenir), çevirici (tutar → tüm birimler), "misafire göster" modu. **Altın yok** (S-41). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-111 | **Kur kaynağı = piyasa orta kur** (Google Finance'in gösterdiği bankalararası kur gibi; resmi TCMB kuru değil). Alış/satış (döviz bürosu) görünümü **gerekmez**. Anahtarsız kaynak zinciri; isteğe bağlı kullanıcı API anahtarı (currencylayer vb.); **otel kuru** (elle sabit kur) seçeneği; TCMB yalnızca karşılaştırma satırı (kapatılabilir). Güncelleme internet varken otomatik (30 dk); kesintide son kur + "X dakika/gün önce" rozeti. (değişti: 2026-10-01, 3. tur) | ZORUNLU |
| G-112 | Kur geçmişi saklanır; ödeme ve gider kaydında kur **kaydın yazıldığı dakikada** dondurulur (G-70). (değişti: 2026-10-02, 4. tur) | ÖNEMLİ |
| G-113 | **Hava durumu** (sahip açıkça istedi; public-apis kaynaklı): otelin şehri için anlık durum + bugün en düşük/en yüksek + **haftalık (7 gün) tahmin** (S-19); **görsel simgeler** (güneş, bulut, yağmurlu bulut, kar, fırtına…; paket içinde); yağış **miktarı (mm)** ve "yağmur bekleniyor" yazısı (yağış yüzdesi yok: ticari kullanıma izin veren ücretsiz kaynak vermiyor; S-90). Bugün ekranında kart, Döviz/Hava küçük sekmesi; anahtarsız birincil kaynak + yedek; çevrimdışıyken son veri ve saat. (değişti: 2026-10-02, 4. tur) | ZORUNLU |

## K. Telefon rehberi, tedarik ve çamaşırhane

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-160 | **Telefon rehberi sekmesi**: kişi/firma adı, kategori (sucu, çamaşırhane, tesisatçı, elektrikçi, taksi, acil…), telefonlar, adres, e‑posta, not, favori; arama; tedarikçi kaydıyla bağlantı (G-170). Tamamen elle. | ZORUNLU |
| G-170 | **Ürün / tedarik takibi**: tedarikçi (rehberden), ürün (örn. "Munzur 0,5 L su"), birim; alım = gider kaydı + ürün satırları (G-71) → **fiyat geçmişi grafiği ve "zam uyarısı"** (son fiyat öncekinden yüksekse). Aylık tüketim/tutar. Ürün kategorileri geniş hazır liste (su ve içecek, market, kahvaltı, **temizlik malzemeleri**, banyo/misafir ürünleri, kâğıt ürünleri, çamaşır/tekstil, teknik/bakım, kırtasiye, diğer; düzenlenebilir; S-73). **Stok sayacı** isteğe bağlı, varsayılan kapalı (S-63). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-171 | **Çamaşırhane takibi** (örnek: "Temiz Fişi", Fiş No, Tarih, Ürün Adı · Miktar · **Lekeli**): **giden** (kirli teslim; Pandora'da her gün 15–16) ve **gelen** (temiz fiş; 11–12) ayrı kaydedilir; tür bazında adet + **lekeli adet**; tür bazında **giden − gelen = eksik/geri gelmeyen**, sonraki teslimata devreder (S-95). Tür listesi geniş ve düzenlenebilir (tohum: çarşaf, alez, nevresim/yorgan kılıfı, yastık kılıfı, büyük havlu, küçük havlu, ayak havlusu, bornoz, yastık, yorgan, pike, battaniye, fon perde, tül perde, masa örtüsü, peçete, yatak örtüsü, paspas, önlük; sahip: "büyültebilirsin"). Fişte fiyat genelde **yazmaz** → birim fiyatlar ilk anlaşmada konuşulur ve **ayarlarda tür başına, geçerlilik tarihli** tutulur (zam geçmişi); fiyat yazan çamaşırhanelerde fiş fiyatı girilebilir. Program yalnızca toplar: aylık tür toplamları, lekeli toplamı, hesaplanan tutar, çamaşırhanenin fatura tutarıyla fark. (değişti: 2026-10-02, 4. tur) | ZORUNLU |

## L. Çoklu cihaz ve uzaktan erişim

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-140 | **Çok cihazlı çalışma** (K-19 kesin): otel bilgisayarı **asıl defter** (tek yazıcı) ve internetsiz çalışmaya devam eder; sahibin Mac'inde verinin **tam, salt‑okunur yedek kopyası** dakikalar içinde güncel tutulur (otel PC çökse de her şey görünür); değişiklikler **şifreli** paketler hâlinde otelin **Google Drive** klasörüne de düşer; otel PC tamamen bozulursa Mac ya da yeni PC "ana bilgisayarı devral" ile devam eder. Canlı erişim ve telefon için **ücretsiz** özel ağ uygulaması (NetBird; sahip ücret istemiyor, S-82). Bizim işlettiğimiz sunucu yok; bulut yalnızca şifreli dosya kutusu (KVKK). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-141 | **Uzak masaüstü istemci**: sahibin Mac'indeki Bismuth aynı ekranları ve rolleri kullanır; otel PC'ye bağlıyken yazabilir; bağlantı yoksa **yedek kopyadan** her şey salt‑okunur görünür ve rozet çıkar ("Yedek kopya · 14:32"). Kuyruklu uzaktan yazma v1'de yok. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-142 | **Uzaktan erişim kurulumu** teknik bilgi gerektirmez (resimli kılavuz, kopyala‑yapıştır). Özel ağ ve Drive için **otelin kendi Gmail hesabı** kullanılır (S-83: zaten var); sahip kendi hesabıyla **davetli** katılır — kişisel Google hesabı otel cihazlarında kullanılmaz. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-143 | **Telefon**: özel ağ uygulaması açıkken telefon tarayıcısı Bismuth'un **mobil arayüzünü** açar (ana ekrana ekle). Kapsam: Bugün, günlük doluluk listesi, misafir arama ve geçmişi, kasa paneli, raporlar KPI, döviz, arıza listesi, bakım hatırlatıcı, **görevler, vardiya notları, otelde kalanlar**; hafif düzenlemeler (ödeme girişi, arıza açma, oda durumu, görev tamamlama). 10 yıllık takvim ızgarası telefonda **liste görünümü** olarak sunulur. (değişti: 2026-10-02, 4. tur) | ÖNEMLİ |
| G-144 | **Güvenlik**: her istek oturum belirteci ile; aynı yetki matrisi; oturum süresi; başarısız giriş sınırı; cihaz listesi ve "bu cihazı çıkar". Yerel ağda HTTP, özel ağda şifreli tünel. | ZORUNLU |
| G-145 | **Otel PC kapalı/çökmüşken** sahip son verileri görür: Mac'teki yedek kopya (tam) + Drive'a yazılan **kişisel veri içermeyen PDF özet** (Bugün + aylık özet), telefondan Drive uygulamasıyla açılabilir (S-62, kapatılabilir). (değişti: 2026-10-02, 4. tur) | ÖNEMLİ |
| G-146 | Sunucu bilgisayarı için "hep açık" rehberi (uyku kapatma, otomatik başlatma) ve Bismuth'un açılışta otomatik başlaması (ayar). | ÖNEMLİ |

## M. Veri güvenliği, yedek, taşıma

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-120 | **Otomatik yedek** iki yere: program klasörü + **otelin Google Drive klasörü** (Drive masaüstü uygulamasının eşitlediği klasöre Bismuth yalnızca dosya yazar; Drive'a giden yedek **şifreli**). **30 gün** saklanır; yeni yedek gelince en eskisi silinir. Otel bilgisayarı zayıf olduğu için yedek **yavaş ve parça parça**, düşük öncelikle ve sessiz saatte alınır; program kullanılırken yavaşlatmaz (S-42). (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-121 | Elle yedek / geri yükle; bütünlük. | ZORUNLU |
| G-122 | Excel/CSV dışa aktarma: **tüm tablolar** (S-43). (değişti: 2026-10-02, 4. tur) | ÖNEMLİ |
| G-123 | **2026 E‑Tablo verisini içe aktarma** (sahip: "taşıyalım"): Rezervasyon tablosu (oda × gün, hücre metni + renk → misafir, gecelik fiyat, ödeme durumu, not) ve Defter (günlük gelir/gider satırları, x = teslim, birim, yöntem, kanal) ve Maaşlar. Sihirbaz: dosya seç → eşleme → önizleme → hata listesi → içe al; misafir adları normalize, tekrarlar birleştirme için işaretli. (değişti: 2026-10-01, 3. tur) | ZORUNLU |

## N. Teknik / kalite

| ID | Gereksinim | Öncelik |
|---|---|---|
| G-130 | shadcn/ui; açık/koyu/sistem tema; serbest renkler; RTL'ye hazır mantıksal CSS. (değişti: 2026-10-02, 4. tur) | ZORUNLU |
| G-131 | Para tam sayı kuruş + para birimi. | ZORUNLU |
| G-132 | Birim + uçtan uca testler (masaüstü ve mobil görünüm). | ZORUNLU |
| G-133 | Sürümlü migrasyonlar. | ZORUNLU |
| G-134 | GitHub Actions ile Windows ve macOS paketleri. | ZORUNLU |
| G-135 | Aynı arayüz paketi hem Electron'da hem sunucu modunda tarayıcıdan çalışır (tek kod). | ZORUNLU |

## O. İstenmeyenler (kapsam dışı)

- OTA/kanal yöneticisi API'leri, fiyat senkronu, iCal çekme.
- Fatura/e‑Fatura/e‑Arşiv, yazarkasa, muhasebe entegrasyonu (fatura **bilgisi** saklama kapsam içidir).
- Bizim işlettiğimiz bulut/sunucu, telemetri, otomatik güncelleme, lisans sunucusu, reklam.
- Web sitesi/online rezervasyon motoru. KBS'ye veya bakanlık paneline otomatik gönderim.
- **Makbuz/alındı yazdırma** (S-21). (eklendi: 2026-10-02)
- **KBS için toplu Excel dosyası hazırlama** (S-93: KBS girişi anında yapılır) ve **KBS ek alanları** (anne/baba adı, doğum yeri; S-92). (eklendi: 2026-10-02)
- **Altın kuru** (S-41), **hazır gider kategorisi listesi** (S-33), **arıza maliyet alanı** (S-76). (eklendi: 2026-10-02)
- Ücretli uzaktan erişim planı (S-82: ücretsiz yol). (eklendi: 2026-10-02)

## P. Sahibin açık fikirleri dışında eklenen öneriler

| ID | Öneri | Soru | Durum (2026-10-02) |
|---|---|---|---|
| Ö-01 | Kısmen ödendi için ayrı otomatik durum | S-10 | ✅ kabul → G-32 |
| Ö-02 | Bugün ekranı ana sayfa | S-11 | ❌ açılış ekranı Takvim → G-47 |
| Ö-03 | Gün kapatma | S-12 | ✅ kabul (ayar) → G-72 |
| Ö-04 | Denetim kaydı | S-13 | ✅ açıklandı, varsayılan → G-24 |
| Ö-05 | Çıkışta otomatik kirli + temizlik rolü | S-14 | ✅ kabul → G-90 |
| Ö-06 | Misafir kartında KBS alanları | S-15 | ❌ yalnız kimlik → G-50 |
| Ö-08 | Basit makbuz/alındı yazdırma | S-21 | ❌ istenmiyor → §O |
| Ö-09 | Vardiya teslim notları | S-16 | ✅ genişletildi → G-95 |
| Ö-10 | Kayıp eşya defteri | S-17 | ✅ kabul → G-55 |
| Ö-11 | Tekrar gelen/VIP otomatik etiketi | S-18 | ✅ kısmen: VIP işareti (elle) → G-50 |
| Ö-12 | Hava durumu | S-19 | ✅ haftalık → G-113 |
| Ö-13 | Oda tipine göre varsayılan fiyat / hafta sonu farkı | S-20 | ✅ kabul → G-48 |
| Ö-14 | Günlük müşteri listesi (VUK 240) yazdırma | — | ↪ "Otelde kalanlar" yazdırma ile karşılanır (G-54) |
| Ö-15 | KBS giriş/çıkış bildirim takibi ("bildirildi" işareti, bugün bildirilecekler listesi) | S-61 | ✅ elle → G-53 |
| Ö-16 | Drive klasörüne salt‑okunur rapor görüntüsü (G-145) | S-62 | ✅ PDF özet → G-145 |
| Ö-17 | Tedarik için "stok/kalan" sayacı (su stoku) | S-63 | ✅ isteğe bağlı, kapalı → G-170 |
| Ö-18 | Arıza kaydına fotoğraf ekleme | S-64 | ✅ kabul, çözülünce silinir → G-180 |
| Ö-19 | **Kat görevlisi telefonu**: otelin Wi‑Fi'ına bağlı telefondan (özel ağ gerekmez) temizlenen odayı "temiz" yapma ve arıza fotoğrafı gönderme — WhatsApp'taki "302+" alışkanlığının karşılığı (`akislar.md`) | S-97 | ❌ WhatsApp grubu yeterli (2026-10-02) |
| Ö-20 | **Kamera entegrasyonu** (otel-kamera Python projesi Bismuth içinde sekme; yan süreç; açık lisanslı modeller; KVKK paketi) — `docs/analiz/06-kamera-entegrasyonu.md` | S-107…S-112 | ⬜ sahip kararı bekliyor (2026-11-12) |
| Ö-21 | **Çoklu otel**: otel başına veritabanı profili + otel değiştirme + sahip portföy özeti (K-54) — `docs/analiz/10-coklu-otel.md` | S-114…S-117 | ⬜ sahip kararı bekliyor (2026-11-12) |
| Ö-22 | **Geç çıkış ücreti ve no-show bedeli kalemi**; yazdırılabilir tek sayfa gece raporu — `docs/analiz/04-otel-ihtiyaclari.md` §5 | — | ⬜ öneri (2026-11-12) |
| Ö-23 | **Pencere:** F11 tam ekran kısayolu, tam ekran durumunun hatırlanması, yakınlaştırma ayarının kalıcı olması, çoklu monitörde pencerenin kaldığı ekrana dönmesi — `docs/analiz/05-ekran-ve-tam-ekran-uyumu.md` | — | ⬜ öneri (2026-11-12) |
| Ö-24 | **Windows makine geneli kurulum** seçeneği (S-113) | S-113 | ⬜ öneri (2026-11-12) |
