# Faz 6 · Misafirler, Kara Liste, Firma/Fatura Bilgileri, Sürekli İstekler, Fiyat Geçmişi

**Amaç:** Her misafir bir kez kaydedilsin; **geçmiş ödemeleri ve ödediği fiyatlar bir bakışta** görünsün (sahibin en
sevdiği özellik); firmaların fatura bilgileri tek yerde dursun ve tek tıkla kopyalansın; sürekli istekler
unutulmasın; istenmeyen misafirler rezervasyon anında yakalansın.

**Gereksinimler:** G-50 … G-52, G-45, G-46, G-190, G-191, G-192 (G-53/G-54 kişiler ve KBS: Faz 5 + Faz 9).
**Ön koşul:** Faz 5.
**Sorular:** yok — S-15 (kimlik yeterli), S-18 (VIP işareti), S-72 (+IBAN), S-75 (iki seviye) cevaplandı.

## Teslimatlar

1. **Misafir listesi**: arama (ad, telefon, kimlik no, firma), filtre (kara liste, VIP, tekrar gelen, sürekli isteği olan), sıralama, sayfalama; mobilde arama odaklı liste.
2. **Misafir kartı** sekmeleri:
   - *Bilgiler*: ad, soyad, telefon, e‑posta, **kimlik/pasaport no** (belge türü; S-15: kimlik yeterli — doğum tarihi/yeri, anne/baba adı **yok**, S-92), uyruk isteğe bağlı (varsayılan gizli), **VIP işareti** (elle; S-18), etiketler, notlar.
   - *Geçmiş* (G-190): konaklamalar tarih sırasıyla — oda(lar), gece sayısı, **gecelik fiyatlar**, ödenen toplam, yöntem, kanal, kalan bakiye; özet şerit: son konaklama, **son gecelik fiyat**, ortalama fiyat, toplam gece, toplam harcama; "bu fiyatı yeni rezervasyona uygula" kısayolu.
   - *Sürekli istek* (G-192): metin + seviye (bilgi / önemli, S-75); rezervasyon panelinde ve hücre ipucunda otomatik uyarı.
   - *Firma / fatura bilgileri* (G-191): misafire bağlı firma kartı (unvan, adres, vergi dairesi, vergi no, telefon, e‑posta, **IBAN**, yetkili, not; S-72) + **Kopyala** (tek satırlık ve çok satırlık biçim; fatura programına yapıştırmaya uygun) + favori.
3. **Firmalar listesi** (ayrı ekran, misafirden bağımsız da kayıt): favoriler üstte, arama, kopyala; firma → misafir bağlantısı; firmaya ait tüm konaklamalar ve ödemeler (kurumsal geçmiş).
4. **Birleştirme**: aynı kişinin iki kaydı → "birleştir" (rezervasyon/ödeme/istek/firma bağlantıları taşınır); Excel'den gelen yazım farkları için şart.
5. **Kara liste**: ekle (misafirden ya da bağımsız), liste, kaldır (yetkili); eşleşme kuralı §6.9; rezervasyon panelinde kırmızı uyarı; "engelle" ciddiyetinde kaydetmek için yetki.
6. Rezervasyon panelindeki otomatik tamamlama bu modülün arama servisini kullanır; "yeni misafir" hızlı formu.

## Kabul ölçütleri

- [x] "gadir garibov" ile "GADİR GADİROV" aynı misafiri bulur; birleştirme sonrası geçmiş tek kartta. — `guests-service.test.ts` "\"gadir garibov\" ile \"GADİR GADİROV\" aynı misafiri bulur; birleştirme sonrası geçmiş tek kartta", `guest-match.test.ts`, `guests-page.test.tsx` (arama, birleştirme), e2e `electron/guests.spec.ts`
- [x] Geçmiş sekmesi: 3 konaklamalı örnekte gecelik fiyatlar, ödenenler ve son fiyat doğru; rezervasyon panelindeki özet kartı aynı rakamları gösterir. — `permissions-guests.test.ts` "3 konaklamalı geçmiş: … panelin özet kartıyla aynı rakamlar" (`guests.history` = `booking.guestSummary`), `guests-page.test.tsx` "kart: 3 konaklamanın gecelik fiyatları …"
- [x] Firma kopyala → panoya beklenen biçim; favori firmalar listede üstte. — `companies-page.test.tsx` "favori firma üstte; çok satırlı ve tek satır kopya …", `guests-service.test.ts` (kopya metni, favori sırası), e2e `electron/guests.spec.ts` "firma eklenir, favori üstte …" (Electron panosu)
- [x] Sürekli istek "önemli" seviyesinde rezervasyon kaydetmeden önce onay ister. — `guests-page.test.tsx` "sürekli istek \"önemli\" seviyesinde kaydedilir …" + rezervasyon formundaki onay (P5b, `new-reservation-dialog.test.tsx`)
- [x] Kara listedeki telefon numarasıyla yeni misafir açılınca uyarı verir. — `permissions-guests.test.ts` "kara listedeki telefonla yeni misafir …", `guests-page.test.tsx` "yeni misafir: kara listedeki telefon …", e2e `electron/guests.spec.ts`
- [x] Rol: Resepsiyon kara listeye ekler, silemez; firma bilgilerini görür/düzenler (sahip ayarlar). — `permissions-guests.test.ts` "her rol × her yordam …", "\"engelle\" kaydındaki kişiye …"
- [x] Birim testleri: normalize/eşleşme, geçmiş özeti, kopya metni; E2E: misafir ara → geçmiş → yeni rezervasyon fiyat öner. — `guest-match.test.ts`, `normalize.test.ts`, `guests-service.test.ts`; e2e `electron/guests.spec.ts` "misafir ara → geçmiş → bu fiyatla yeni rezervasyon …", `mobile/guests.spec.ts`

## Sonuç (2026-10-05)

**Yapılanlar**
- Sözleşme `procedures/guests.ts` + işleyici `handlers/guests.ts`: `guests.list/card/history/create/update/setStandingNote/duplicates/merge`, `companies.list/get/create/update/markUsed`, `blacklist.list/add/remove/check`.
- `guests-service`: sunucu tarafı liste (arama: ad, telefon, firma, yetkiliyse kimlik no; filtre: tekrar gelen, VIP, sürekli istek, firmalı, kara listede, olası çift kayıt; sıralama; sayfa), misafir kartı (firma, olası çiftler, kara liste eşleşmesi; birleştirilmiş kart kalan karta yönlenir); geçmişe rezervasyon kodu, kanal/yöntem kimliği ve **kalan bakiye** eklendi; ödeme yetkisi olmayana ödenen tutar, yöntem ve bakiye gizli (G-23). Firma: vergi no ile arama, bağlı misafir sayısı, **kurumsal geçmiş** (`companies.get`). Kara liste: ekleyen/onaylayan/kaldıranın adı, "engelle" önce; misafir yazan herkese uyarı (`blacklist.check`; neden yalnız kara listeyi görene).
- Yazım farkı eşleşmesi (`shared/domain/guest-match.ts`): bir sözcük aynı, diğerleri 4–5 harfte 1, 6+ harfte 2 harf farkla eşleşir ("gadir garibov" ↔ "GADİR GADİROV"); otomatik tamamlama, liste ve "zaten kayıtlı olabilir" uyarısı bunu kullanır, tam eşleşmeler önce gelir.
- "Engelle" ciddiyetindeki kara liste kaydına rezervasyon yalnız `blacklist.remove` yetkilisi (Sahip, Müdür) ile kaydedilir (`errors.blacklistBlocked`; `reservations-service.create` içinde iki satır, formda ipucu).
- Ekranlar örnek veriden gerçek servise geçti: Misafirler (liste, kart, düzenleme, sürekli istek, VIP, notlar, firma bağlama, birleştirme, karttan kara listeye ekleme, "Bu fiyatı yeni rezervasyona uygula" → takvimin yeni rezervasyon formu misafir ve son gecelik fiyatla açılır, kaydedince takvim panelde açılır), ayrı **Firmalar** ekranı (`/companies`, menüde Misafirler grubunda), Kara liste. Boş / yükleniyor / hata / yetkisiz hâlleri ve telefon düzeni var.
- Panelin özet kartı ve misafir kartı aynı `guests.guestHistory` fonksiyonunu okur.

**Karşılanan:** G-45, G-46, G-50, G-51, G-52, G-190, G-191, G-192.

**Varsayılanlar**
- Uyruk alanı formda "Uyruk ekle" ile açılır, doluysa görünür (G-50 "varsayılan gizli") (varsayılan).
- "Engelle" kaydını geçme yetkisi = `blacklist.remove` (Sahip, Müdür); yeni yetki anahtarı açılmadı (varsayılan).
- Kara liste neden türleri: hasar, ödemeden ayrıldı, davranış, diğer; asıl açıklama metindedir (varsayılan).
- Listede "Son konaklama" bugüne kadarki son giriş, "Gelecek" ileri tarihli rezervasyon; kart özeti panelle aynı kuralı (§6.12) kullanır (varsayılan).
- Firmalar telefon menüsünde yok (S-66 kapsamı); telefonda misafir kartının Firma sekmesinden kopyalanır (varsayılan).

**Ölçümler:** liste bütün misafirlerin geçmişini tek seferde okur (konaklamalar bellekte gruplanır; kimlik listeleri 400'lük dilimlerle sorgulanır).

**Kalanlar**
- Misafir **etiketleri** (G-50) için veri modelinde alan yok; bu pakette migrasyon açılmadı, notlar alanı kullanılır.
- Takvim hücre ipucundaki sürekli istek uyarısı P5a/P5b'de (bu pakette değişmedi).
- Sahip onay paketine: Misafirler, Firmalar ve Kara liste ekranlarının görsel onayı.

### Hata avı düzeltmeleri (P5fix)

Erken hata avının Faz 6 bulguları; servis testleri `booking-fixes.test.ts`, domain `guest-history.test.ts`,
`blacklist.test.ts`.

- **#3 #19 tek "sayılan konaklama" kuralı (§6.12):** `isCountedStay` — bugüne kadar başlamış; park, gelmedi, iptal ve
  gelecek hariç. Kart, liste ("Son konaklama", "tekrar gelen"), arama sayısı (`stayCounts`), panelin özet kartı (panelin
  kendi rezervasyonu hariç: `booking.guestSummary.excludeReservationId`) ve yeni rezervasyon formundaki "Misafirin son
  ödediği" aynı kuraldan. Toplam ödenen iptal hariç bütün tahsilattır (varsayılan). Testler: `guest-history.test.ts`
  "bugüne kadar başlamış konaklama sayılır…", "son konaklama ve son gecelik fiyat ileri tarihli ya da park edilmiş
  rezervasyondan gelmez"; servis "kart, liste ve arama aynı son konaklamayı ve son ödediği geceliği gösterir", "panelin
  özet kartı açık rezervasyonun kendisini "son konaklama" saymaz". `03-mimari.md` §6.12'ye kural cümlesi eklendi.
- **#4 kara liste eşleşmesi tek fonksiyon:** `matchBlacklist` kayda bağlı misafiri (`guestId`, neden "kayıtlı misafir
  kartı") ve birleştirilmiş eski kartların ad/telefon/kimliğini de aday alır; liste rozeti, kart, `booking.checkBlacklist`,
  rezervasyon kaydı, odaya kişi ekleme ve misafir formu uyarısı aynı fonksiyon. Testler: `blacklist.test.ts` "kayda bağlı
  misafir, adı başka yazılsa da eşleşir…", servis "kara listedeki misafir başka bir kayıtla birleştirilince kart, kontrol ve
  rezervasyon uyarıyı kaybetmez".
- **#14 kişi satırındaki ad:** misafir adı düzeltilince ya da birleştirilince bağlı kişi satırları yeni adı alır, her biri
  denetim kaydıyla. Test: servis "ad düzeltmesi ve birleştirme kişi satırına denetim kaydıyla yansır".
- **#17 firma yetkisi:** misafir listesinde firma adıyla arama ve firma adı yalnız `companies` görme yetkisiyle. Test: servis
  "firma görme yetkisi olmayan rol misafir listesinde firma adıyla arayamaz, firma adını görmez".

## Son kontrol düzeltmesi (QA-1, QA1b — 2026-10-05)

- **G-50 misafir etiketleri** (K-46 (2), karar denetimi #3; "Kalanlar"daki "etiket alanı yok" maddesi kapandı):
  Ayarlar → Listeler'de yeni liste türü **Misafir etiketleri** (`guest_tags`; silinmez, kapatılır; sıralanır; tohum yok).
  Misafir ↔ etiket bağı `guest_tag_links` (migrasyon `0015_guest_tags`); `guests.setTags` takımı yazar, her değişiklik
  önceki/sonraki takımla denetime (`guest` / `update`); birleştirmede etiketler kalan karta taşınır (`moved.tags`).
  Kartta çoklu seçim (masaüstü + telefon, 44 px satır), listede rozet + **Tüm etiketler** süzgeci (`guests.list` →
  `tagId`), rezervasyon panelindeki misafir özetinde etiketler (yalnız görüntü). Kapalı etiket kartta soluk ve
  "(kapalı)" kalır, seçimde çıkmaz, yeniden verilemez (`errors.guestTagClosed`). Yetki: liste = `settings.lists`,
  misafire etiket = `guests` düzenleme. Dışa aktarmadaki etiket sütunu ana oturum birleştirince eklenecek
  (`export-catalog.ts` P14fix'te).
  Testler: `guest-tags.test.ts` (8: liste, ekle/çıkar + denetim, kapalı etiket, birleştirme, süzgeç, yetki),
  `permissions-guests.test.ts` (`guests.setTags`, `lists.create/update` guestTags), `guests-page.test.tsx`
  "misafir etiketleri (G-50)" (4), `guest-summary-card.test.tsx` (2), `lists-section.test.tsx` "misafir etiketleri
  listesi boş başlar; yeni etiket eklenir", `migrations-upgrade.test.ts` adım adım yeşil.

## Son kontrol düzeltmesi (QA-1, QA1a)

- **G-190 oda + tarih (K-46 (3)):** misafir listesinde **Oda ve tarih** süzgeci (`guests.list` → `room`, `stayFrom`,
  `stayTo`): o odada (numara bütün olarak) ve o günlere değen (`[giriş, çıkış)`; aynı gün giriş-çıkış kendi günü)
  konaklamaların sahibi ve odadaki kişiler; satırda eşleşen konaklama (oda, tarihler), iptal edilen / gelmeyen işaretli,
  park edilmiş sayılmaz (varsayılan). Masaüstü ve telefon. Kimlik no araması değişmedi (yetkiye bağlı). Testler:
  `guests-list-stay-filter.test.ts` "302'de Mart'ta kim kaldı…", "iptal edilmiş ve gelmeyen konaklama durumuyla
  listelenir…", "kimlik no araması yetkiye bağlı kalır…"; `stay-filter.test.tsx`; `permissions-calendar.test.ts`.
