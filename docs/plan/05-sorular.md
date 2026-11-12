# 05 · Sahibe Sorulacak Sorular — Bismuth

> Basit dille. Her sorunun yanında hangi fazdan önce cevaplanması gerektiği ve cevap gelmezse uygulanacak varsayılan
> yazar. Cevaplar `06-kararlar.md` → "Sahip cevapları" bölümüne işlenir. Durum: ⬜ bekliyor · ✅ cevaplandı · ⏭️ varsayılan.
>
> **2026-10-02:** sahip açık soruların tamamını cevapladı (dördüncü ve beşinci tur). Açık kalan tek madde: **S-80** (otel PC
> denemesi — sahip otele gidince). Cevap gelmezse varsayılan uygulanır.

## Faz 0–1'den önce (temel kararlar)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-01 | Tek bilgisayar mı, birden fazla mı? | — | ✅ Birden fazla, farklı mekân, telefon da |
| S-02 | Aynı ağda mı? | — | ✅ Hayır; ev + otel |
| S-03 | Bilgisayarlar? | — | ✅ Mac M2 / macOS 26; otel PC muhtemelen Win10; "hepsi için hazır" |
| S-04 | İmza ücreti? | — | ✅ Ücretsiz yol |
| S-05 | Program adı? | — | ✅ Bismuth |
| S-06 | Diller? | — | ✅ TR, EN, RU, AR |
| S-07 | Kuruş görünümü / tema? | — | ✅ Tam sayı varsayılan; açık/koyu/sistem |
| S-08 | 2026 Excel verisi taşınsın mı? | Sıfırdan; içe aktarma aracı isteğe bağlı faz | ✅ Taşınsın |
| S-09 | Yetki tablosu? | — | ✅ Sahip kendisi select ile tanımlar |
| S-65 | **Uzaktan erişim yöntemi:** Otel bilgisayarına, Mac'inize ve telefonunuza **Tailscale** adlı ücretsiz programı kurup hepsinde aynı Google hesabıyla giriş yapmanız gerekecek (bir kez, 10 dakika, resimli anlatacağız). Bu sizin için uygun mu? Alternatif istiyorsanız söyleyin. | Tailscale | ✅ Aynı Google hesabı istemiyor → K-19 yeniden açık |
| S-71 | Otel bilgisayarının **hep açık** kalması gerekiyor (uyku modu kapalı; siz evden bakarken o makine çalışıyor olmalı). Bu mümkün mü? Kapalıyken evden erişilemeyeceğini kabul ediyor musunuz? | Evet | ✅ Hep açık ama çökebiliyor → ücretsiz bulut araştırılıyor |
| S-66 | **Telefonda** hangi ekranlar olsun? Önerimiz: Bugün, bugünkü doluluk listesi, misafir arama ve geçmişi, kasa paneli, raporların özet kartları, döviz çevirici, arıza listesi, bakım hatırlatıcı; ayrıca ödeme girme, arıza açma ve oda durumu değiştirme. Eksik/fazla var mı? | Bu liste | ✅ Uygun |
| S-69 | **Arapça**: tüm arayüz sağdan sola mı çevrilsin (menüler, formlar dahil), yoksa yalnızca metinler Arapça olup düzen soldan sağa mı kalsın? (Tam RTL daha doğru ama daha çok iş.) | Tam RTL; takvim ızgarası ve sayı tabloları LTR | ✅ Arapça şimdilik yok |
| S-68 | **Kur görünümü** varsayılanı: "piyasa orta kur" (Google'ın gösterdiği gibi tek kur) mu, yoksa "serbest piyasa alış / satış" (döviz bürosu gibi iki kur) mu? İkisi de olacak; hangisi açılışta görünsün? | Piyasa orta kur; alış/satış sekmede | ✅ Orta kur yeterli |
| S-70 | Roller için **hazır başlangıç önerileri** (Sahip, Müdür, Resepsiyon, Muhasebeci, Temizlik, Çalışan) yüklü gelsin mi, yoksa boş başlayıp siz mi tanımlayacaksınız? | Hazır gelsin, düzenlenebilir | ✅ Hazır gelsin, düzenlenebilir |

## Faz 3–6'dan önce (takvim, rezervasyon, misafir)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-10 | Kapora/kısmen ödendi için ayrı otomatik durum olsun mu? | Var, kapatılabilir | ✅ Ayrı renk |
| S-11 | İlk ekran: takvim mi, Bugün mü? | Bugün | ✅ Takvim |
| S-12 | Gün kapatma? | Var, isteğe bağlı | ✅ Olsun (ayar; diğer oteller çok kullanıyor) |
| S-13 | Denetim kaydı? | Var | ✅ Açıklandı ("kara kutu": kim, ne zaman, neyi değiştirdi); var, yalnız Sahip görür (varsayılan) |
| S-14 | Çıkışta otomatik kirli + temizlik rolü? | Evet | ✅ Çıkışta otomatik kirli |
| S-15 | Misafir kartında kimlik/uyruk/doğum alanları? | Var, isteğe bağlı alanlar | ✅ Kimlik yeterli |
| S-16 | Vardiya teslim notu? | Var, basit | ✅ Olsun + görevler ve kişisel notlar (G-94, G-95) |
| S-17 | Kayıp eşya? | Yok | ✅ Olsun (az kullanılır) |
| S-18 | Tekrar gelen/VIP otomatik işareti? | Var | ✅ VIP işareti |
| S-19 | Hava durumu? | Var, kapatılabilir | ✅ Olsun, haftalık |
| S-20 | Oda tipine göre varsayılan fiyat / hafta sonu farkı? | Var; elle değişir | ✅ Olsun |
| S-21 | Basit alındı/makbuz yazdırma? | Yok | ✅ Olmasın |
| S-22 | Kişi sayısı girilsin mi? | Var, isteğe bağlı | ✅ İsteğe bağlı + yanındaki kişinin adı ve tanıtıcı not + KBS (yasal; G-54) |
| S-23 | Hücrede ne görünsün? | İsim + fiyat | ✅ İsim + fiyat |
| S-24 | Özel haftanın günleri / bayram seçimi? | Cumartesi; TR bayramları | ✅ Cumartesi‑pazar; TR bayramları; kullanıcı istediği günü seçer |
| S-25 | Day‑use için ayrı kural? | Sadece tür + renk | ✅ Sadece tür + renk |
| S-72 | **Firma/fatura bilgileri** için alanlar: unvan, adres, vergi dairesi, vergi no, telefon, e‑posta, yetkili kişi, not. Eksik var mı (örn. e‑posta için e‑fatura adresi, IBAN)? | Bu liste | ✅ + IBAN |
| S-75 | Sürekli istek notu **iki seviyeli** olsun mu: "bilgi" (sarı kutu) ve "önemli" (kaydetmeden önce onay ister)? | Evet | ✅ Evet |

## Faz 7–9'dan önce (defter, personel, arıza)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-30 | Teslim alma (x) kim yapabilsin? | Sahip + Müdür | ✅ Sahip + Müdür |
| S-31 | Banka kontrol işareti ayrı mı? | Aynı (x) | ✅ Aynı (x) |
| S-32 | Döviz çevrimi: işlem günü kuru mu, ay kuru mu? | İşlem günü | ✅ Kaydın yazıldığı dakika; değişirse değiştirildiği an |
| S-33 | Gider kategorileri listesi | Öneri listesi | ✅ Gerek yok (serbest açıklama + otomatik tamamlama) |
| S-34 | Mesai ücreti türü? | İkisi de; %50 | ✅ İşletme belirler; Sahip + Müdür ayarlar; Pandora'da ek mesai ücreti yok |
| S-35 | Bayram mesaisi çarpanı? | 2× | ✅ Sahip + Müdür ayarlar (S-34 ile birlikte) |
| S-36 | Prim tabanı? | Yüzde, tüm oda geliri | ✅ Sahip + Müdür belirler |
| S-37 | İzin devreder mi? | Devretmez, ödenir | ✅ Devretmez, ödenir |
| S-38 | Maaş parça parça ödeme? | Evet | ✅ Evet; kasadan avans (ayar) |
| S-39 | Çalışan kendi mesaisini girsin mi? | Evet | ✅ Ek mesaiyi yalnız Müdür; normal mesai geliş/çıkış saatini çalışan girer |
| S-64 | **Arıza kaydına fotoğraf** eklensin mi? (Dosya olarak saklanır; yedek büyür ama sorun değil.) | Evet, isteğe bağlı | ✅ Evet; çözülünce silinebilir, eskiler tutulmaz |
| S-76 | Arıza çözülünce **maliyeti** gider olarak yazılsın mı (tesisatçı parası gibi)? | Evet, isteğe bağlı alan | ✅ Gerekmez (deftere zaten yazılıyor) |

## Faz 10–12'den önce (raporlar, istatistik, döviz, rehber, tedarik)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-40 | Raporlarda öncelik sırası? | Kâr, doluluk, kanal, yöntem | ✅ Ciro, kâr, gider, doluluk, ödeme yöntemi, kanal |
| S-41 | Döviz sekmesinde hangi para birimleri? | USD, EUR, GBP, RUB (+ gram altın isteğe bağlı) | ✅ Altın yok |
| S-60 | **Bakanlık kuralları (lütfen bakanlığa sorun):** (a) 30 Eylül girip 2 Ekim çıkan misafirin geceleri hangi aya yazılır — hepsi giriş ayına mı, yoksa her gece kendi ayına mı? (b) Ay sonunda hâlâ otelde olan ("Aktif") misafir nasıl sayılır? (c) Çocuklar/refakatçiler ayrı giriş sayılıyor mu (KBS listesinde ayrı satır)? (d) Doluluk oranı panelde nasıl hesaplanıyor (oda sayısı × gün mü, yatak sayısı mı)? | (a) her gece kendi ayına, (b) ay sonuna kadar, (c) evet, (d) oda×gün | ✅ Giriş ayı; çocuk ayrı değil; doluluk yatak×gün |
| S-61 | KBS **giriş/çıkış bildirimi takibi** ister misiniz? (Her misafir için "KBS'ye bildirildi" işareti; bugün bildirilecekler listesi; unutulan çıkışlar uyarısı.) | Var | ✅ Elle işaret (KBS bağlantısı gerekmez) |
| S-67 | **Çamaşırhane**: hangi çamaşır türlerini sayıyorlar (çarşaf, nevresim, yastık kılıfı, havlu, bornoz, paspas…)? Kağıtta birim fiyat yazıyor mu, yoksa sadece adet mi? Ay sonu faturayı türe göre mi, toplam mı veriyorlar? | Tür listesi varsayılan; adet; toplam | ✅ Tür listesi + lekeli; fiyat ayarda |
| S-73 | **Ürün kategorileri** başlangıç listesi: su, market, kahvaltı, temizlik malzemesi, çamaşır, diğer. Eklenecek var mı? | Bu liste | ✅ Büyütülsün, temizlik ürünleri dahil |
| S-74 | Her tedarik alımı **otomatik olarak defterde gider** olsun mu, yoksa siz "gider olarak yaz" kutusunu mu işaretleyeceksiniz? | Kutu işaretli gelir, kapatılabilir | ✅ Önce gidere yazılır; defter eski düzen gibi, daha temiz |
| S-63 | Su gibi ürünlerde **stok sayacı** (kaç tane kaldı) ister misiniz? | Yok (isteğe bağlı açılır) | ✅ Yok, isteğe bağlı açılır |
| S-62 | Otel bilgisayarı kapalıyken en azından **son raporları** görmek için Drive/OneDrive klasörüne otomatik rapor kopyası ister misiniz? | Var, kapatılabilir | ✅ Var, kapatılabilir |
| S-42 | Yedekler nereye, kaç tane? | Program klasörü; 30 gün | ✅ Program klasörü + otel Gmail Drive; 30 gün; yavaş/parçalı |
| S-43 | Excel dışa aktarma hangi tablolar? | Hepsi | ✅ Hepsi |

## Faz 0 sonrasında (yeni)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-78 | Otelde toplam **yatak sayısı** kaç? (Bakanlık panelindeki %0,24 değerinden 28 yatak çıkıyor; doğru mu?) Odaların yatak dağılımı (örn. Double 2, Twin 2, Junior ?) | 28 | ✅ 19 oda, 38 yatak |
| S-79 | **Uzaktan erişim seçimi**: önerimiz "tek yazıcı + Mac'te sıcak kopya + şifreli kutu" (`04-arastirma/uzaktan-bulut-secenekleri.md` §9 sade anlatım). Kabul mü, yoksa Supabase gibi bulutu ana defter mi yapalım (önermiyoruz: çevrimdışı çakışma, ücretsiz plan durdurma, KVKK)? | Öneri (C2) | ✅ "Profesyonelliğine güveniyorum" → C2 |
| S-80 | Prototip paketlerini (Windows `.exe` ve Mac `.dmg`) kendi Mac'inizde ve otel bilgisayarında açıp ekran görüntüsü gönderebilir misiniz? | — | 🟡 Mac ✅ (ekran görüntüsü geldi); otel bilgisayarı: sahip otelde değil, **sonra** (Faz 1 paketiyle denenebilir) — ayrıca "Sistem türü" (64 bit mi?) |
| S-81 | KBS dosyasında ay sonunda **hâlâ otelde olan** misafirler ("Aktif", çıkış tarihi 1900 yazıyor) bakanlığa nasıl bildiriliyor? (a) ay sonuna kadarki geceleri sayılır, (b) her biri 1 gece sayılır, (c) çıkış yapınca bir sonraki ayın bildirimine eklenir. Eylül dosyanızda 5 kişi var: (a) 840, (b) 838 geceleme veriyor. | (a), kullanıcı değiştirebilir | ✅ Sonraki aya sarkabilir, kurumlar kabul ediyor → planlı çıkışa kadar (K-36) |
| S-82 | **Uzaktan erişim programı**: Tailscale'in ücretsiz planı kâğıt üzerinde "ticari olmayan kullanım" için. Otel ağı için ayda ~8 $ öder misiniz, yoksa önce ücretsiz bir alternatif (NetBird) mi deneyelim? | Önce ücretsizle dene; karar Faz 13'te | ✅ Ücretli istemiyor → NetBird Free (K-31) |
| S-83 | Otel için **ayrı bir hesap** (yeni Gmail ya da Apple/Microsoft) açmayı kabul ediyor musunuz? Otel bilgisayarı yalnızca bu hesapla bağlanır, sizin cihazlarınıza paylaşılır. | Evet, yeni Gmail | ✅ Otelin ayrı Gmail'i zaten var |
| S-84 | Mac'inizde otel verisinin **tam kopyası** tutulsun mu (otel PC çökerse her şeyi görürsünüz)? Mac'te FileVault (disk şifreleme) açık mı? | Evet / açılacak | ⏭️ Evet; FileVault açılması önerilir (kılavuzda) |
| S-85 | **Kilitli kutu** (şifreli değişiklik dosyaları) hangi klasöre: Google Drive, OneDrive, iCloud, hiçbiri? | Google Drive (otel hesabı, sizinle paylaşılmış klasör) | ✅ Otel Gmail'inin Drive'ı (S-42 cevabıyla) |
| S-86 | Otel **kışın kapanıyor** mu, bilgisayar aylarca kapalı kalıyor mu? | Hayır | ⏭️ Hayır |
| S-87 | Otel bilgisayarı bozulursa **Mac'i geçici ana bilgisayar yapma** özelliği istiyor musunuz? | Evet | ⏭️ Evet |
| S-88 | Telefona **Tailscale uygulaması** kurmak sorun mu? (Sorunsa "VPN'siz telefon" eklentisi öne alınır.) | Sorun değil | ⏭️ Sorun değil (uygulama NetBird) |
| S-89 | Kimlik/pasaport numaraları kilitli kutuya da konsun mu, yoksa yalnız otel bilgisayarında ve Mac'te mi kalsın? | Kutuya konmasın | ⏭️ Kutu paketlerine konmaz; şifreli tam yedeklerde var (geri yükleme için şart) |
| S-90 | **Hava durumu**: ticari kullanıma izin veren ücretsiz kaynak (MET Norway) yağış **olasılığı (%)** vermiyor; yağış **miktarı (mm)** ve "yağmur bekleniyor / beklenmiyor" yazısı veriyor. Bu yeterli mi? Yoksa % için Open‑Meteo'yu (ücretsiz planı ticari olmayan kullanım için) kendi sorumluluğunuzda açalım mı? | mm + "yağmur bekleniyor" yazısı | ✅ Görsel simgelerle (yağmurlu bulut vb.) |
| S-91 | Turizm Bakanlığı panelindeki **ülke açılır listesini** bir kez ekran görüntüsü ya da sayfayı kaydederek gönderebilir misiniz? (Ülke adlarını birebir eşlemek için.) | — | ✅ Liste yok, yazdıkça geliyor → Bismuth Türkçe adları verir; Türkiye/KKTC yazım hatası önlemi |
| S-97 | **Kat görevlisi telefonu** (Ö-19): Kat görevlisi otelin Wi‑Fi'ına bağlı telefonundan Bismuth'u açıp temizlediği odayı "temiz" yapsın (WhatsApp'taki "302+" yerine) ve arıza fotoğrafını göndersin mi? Yalnız otel içinde çalışır, ek program gerekmez; WhatsApp da kullanılmaya devam edebilir. | Evet, isteğe bağlı (Temizlik rolü, yalnız otel ağı) | ✅ Hayır — WhatsApp grubundan memnun |
| S-99 | Bakanlık panelinde (**Tesis Bilgileri**) oteliniz **kaç yatakla** kayıtlı? Panelin %0,24 değeri 28 yatağa denk geliyor; 38 yazıyorsa sorun yok, 28 yazıyorsa programda "bakanlık yatak sayısı" ayrıca girilir (gerçek doluluk 38 ile hesaplanır). | 38 (gerçek sayı) | ✅ Bakanlıkta 28 yazıyor ama "bizim işimiz yok"; gerçek 38 kullanılır |

### Faz 0 araştırmalarından çıkan küçük öneriler (evet derseniz ilgili faza eklenir)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-92 | Yeni KBS sistemi yabancı misafirler için **anne adı, baba adı, doğum yeri** de istiyor (pasaportta yok). Misafir kartında bu alanlar olsun ve eksikse "KBS için eksik" uyarısı çıksın mı? | Evet | ✅ Kesinlikle hayır |
| S-93 | KBS'nin **toplu Excel yükleme** özelliği için Bismuth o günün giriş listesini KBS biçiminde dosya olarak hazırlasın mı? (Otomatik gönderim yok; dosyayı siz yüklersiniz.) | Evet | ✅ Hayır (KBS girişi anında yapılır) |
| S-94 | **"Her N konaklamada bir" bakım** hatırlatıcısı (örn. her 30 konaklamada bir odanın derin temizliği) ister misiniz? | Hayır | ✅ Evet, 10 konaklamada bir |
| S-95 | Çamaşırhanede **eksik/geri gelmeyen** parçaları bir sonraki teslimata devreden takip ister misiniz? | Evet | ✅ Giden ve gelen olarak |
| S-96 | Oda durumu ekranında odaları **kat planı** gibi (kat kat kutular) görmek ister misiniz? | Evet | ✅ Evet |

## Faz 15–16'dan önce (son rötuş)

| No | Soru | Varsayılan | Durum |
|---|---|---|---|
| S-50 | ~~Koyu tema?~~ | — | ✅ Açık/koyu/sistem |
| S-51 | Klavye kısayolları? | Var | ✅ Evet |
| S-52 | Program içi kılavuz? | Var | ✅ Evet; ayarlardan her zaman; çok ayrıntılı, basit kelimeler |
| S-77 | Rusça ve Arapça çevirileri bir **ana dili konuşan** kişiye kontrol ettirebilir misiniz? (Biz üretiriz; son kontrol insan.) | Yapay zekâ çevirisi + sahip kontrolü | ✅ Arapça yok; Rusça için bizim kontrolümüz yeterli (sahip Rusça biliyor) |
