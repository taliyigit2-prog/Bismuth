# Faz 9 · Günlük Operasyon: Oda Durumu, Arıza, Görevler, Vardiya Devri, Otelde Kalanlar, Takvim Notları, Bugün

**Amaç:** Otelin günlük akışını (`akislar.md`) tek yerde yönetmek: hangi oda kirli (kat planında), **hangi odada açık arıza var**
(501'in tuvalet kapağı bir hafta unutulmasın), **bugün kim ne yapacak** (görevler), **gündüz ve gece resepsiyonu birbirine ne
devrediyor** (vardiya devri ve notlar), **odada kim kalıyor ve KBS'ye bildirildi mi** (yasal), bugün kim geliyor/gidiyor, kasada
ne bekliyor; sınırsız yıl takvimine bayram ve özel gün notları; yasal bildirim hatırlatıcıları.

**Gereksinimler:** G-90, G-91, G-92, G-93, **G-94, G-95**, G-54 (Otelde kalanlar ekranı), G-53 (KBS uyarıları), G-16, G-40, G-180.
**Ön koşul:** Faz 5, Faz 7.
**Sorular:** yok — S-11, S-14, S-16, S-17, S-19, S-24, S-64, S-76, S-94, S-96 cevaplandı. S-97: kat görevlisi telefonu yok (WhatsApp grubu yeterli); Temizlik rolü için masaüstünde sade görünüm.
**Referans:** `akislar.md` (günlük akış), `03-mimari.md` §4.8 (görev/vardiya/not tabloları), §6.8, §6.15–§6.17, K-25, K-33, K-34.

## Teslimatlar

1. **Oda durumu panosu** (`features/housekeeping/`): **kat planı görünümü** (kat kat kutular, S-96) + liste görünümü; durum (temiz / kirli / kontrol edildi / bakımda / kullanım dışı); tek tık; not; son değiştiren ve saat; otomatik kurallar (**çıkışta kirli**, day‑use çıkışında kirli; S-14); bakımda/kullanım dışı → takvimde blok; Temizlik rolü için sade görünüm (kirli odalar listesi → "temiz"); **açık arıza rozeti** kartta.
2. **Arıza bildirimi** (`features/room-issues/`, G-180): liste (açık / planlandı / çözüldü; önem; oda; yaş — "7 gündür açık" kırmızı), form (oda — ya da "genel alan", başlık, açıklama, önem, bildiren otomatik, **fotoğraf** (S-64), "odayı satışa kapat" anahtarı → `room_blocks`), durum geçişleri (planla: tarih + sorumlu; çöz: not — **maliyet alanı yok**, masraf defterde gider olarak yazılır, S-76), geçmiş. Çözülen arızanın fotoğrafı elle silinebilir; `attachments.resolvedIssueRetentionDays` (30) gün sonra kendiliğinden silinir (yazı kalır; K-25). **Görünürlük**: Bugün ekranında "açık arızalar" kartı (önem sırasıyla), takvimde oda satırında simge, rezervasyon panelinde "bu odada açık arıza" uyarısı, oda panosunda rozet; mobilde arıza açma en üstte.
3. **Görevler** (`features/tasks/`, G-94, K-34): liste (bugün / geciken / yaklaşan / tamamlanan; kişi, rol, vardiya ve oda filtresi), form (başlık, açıklama, kime: kişi / rol / vardiya, oda, son tarih‑saat, **tekrar**: her gün saat, haftanın günleri, ayın günü, **her N konaklama** (S-94, varsayılan 10, oda bazında)), "yapıldı" (yapan + saat), iptal (neden); geciken görev vurgulu ve bir kez bildirim; **bakım hatırlatıcıları** görev şablonudur (başlık, ilk tarih, tekrar, kaç gün önce, sorumlu; tohum örnekler: asansör aylık bakım, yıllık periyodik kontrol, baca, yangın tüpü, klima filtresi, su deposu, sigorta, İSG); **yasal hatırlatıcılar** (G-93, TR tohumu): "Turizm Bakanlığı konaklama istatistiği (1–10)" her ayın 1'inde → Turizm İstatistiği ekranına bağlantı; "KBS çıkış kontrolü" günlük; kapatılabilir. **Örnek görev önerileri** (`akislar.md`): "12:00 çıkış yapmayan odaları ara", "15:00 çamaşırhaneye kirli teslim", "11:00 temiz çamaşır fişini gir" — seçmeli, silinebilir.
4. **Vardiya devri ve notlar** (`features/shift-notes/`, G-95): vardiya tanımları ayardan (Lale: Gündüz 09:00–21:00, Gece 21:00–09:00); **devir ekranı**: otomatik özet (`handoverSummary`, §6.16 — henüz gelmemiş girişler, bu gece kalanlar ve KBS eksikleri, çıkışı geçmiş ama çıkmamışlar, ödenmemiş bakiyeler, açık/geciken görevler, açık arızalar, kasa — yetkiye göre) + elle not → kaydet (özet anlık görüntüsüyle); gelen vardiya **"okudum"** (kim, saat); devir geçmişi; **kendime not** (yalnız yazan görür; isteğe bağlı hatırlatma saati); **herkese not** (pano, sabitlenebilir). Bugün ekranında okunmamış devir rozeti.
5. **Otelde kalanlar** (`features/in-house/`, G-54): oda · kişiler · tanıtıcı not · KBS durumu (bildirildi kim/ne zaman) · giriş/çıkış tarihi; arama (ad, oda, not — "kızıl"); işaretsiz kişi kırmızı; buradan kişi ekleme ve KBS işaretleme; **yazdır** (A4, gece listesi). Bugün ekranında "KBS eksik" kartı aynı veriden.
6. **Takvim ve özel günler** (`features/calendar-notes/`): **sınırsız yıl** bayram üretimi (takvimde görünen yıl için otomatik, `calendar_generation`); kullanıcı notu tek/aralık/**toplu** (haftanın günü, yapıştırılan liste, yıllık tekrar); tür/renk; rozetler; vurgulu günler (varsayılan cumartesi + pazar; kullanıcı istediği günü özel gün yapar; S-24); üretilmiş satır düzenlenince `source=user` olur ve korunur; çevrimiçi doğrulama düğmesi Faz 11'de dolar.
7. **Bugün ekranı** (`features/today/`, G-92; açılış ekranı değil): bugün gelecekler, **bugün çıkacaklar** (öğlen hâlâ çıkmamışlar vurgulu), otelde kalanlar ve KBS eksikleri, kirli odalar, açık arızalar, bugünkü/geciken görevler, okunmamış vardiya notu, kasada bekleyen (yetkiye göre), bugünün özel günleri, favori telefonlar (Faz 12), hava durumu (Faz 11); mobil düzen.

## Kabul ölçütleri

- [x] Arıza açılınca Bugün, takvim satırı, oda kartı ve rezervasyon panelinde görünür; çözülünce hepsinden kalkar; 7 günden eski açık arıza kırmızı. (`today-page.test.tsx` "açık arızalar önem sırasıyla; 7 gündür açık olan kırmızı", `calendar-page.test.tsx` "açık arızası olan odanın satırında anahtar simgesi…", `rooms-page.test.tsx` "…kim/ne zaman ve arızaları gösterir", `new-reservation-dialog.test.tsx` "…açık arızalı oda seçilince uyarı verir", `domain/housekeeping.test.ts` "7 gündür açık…"; hepsi `open`/`planned` süzgeciyle okur, çözülen düşer)
- [x] "Odayı satışa kapat" ile açılan arıza takvimde siyah blok oluşturur; çözülünce blok kapanır.
- [x] Fotoğraf eklenen arıza: dosya `attachments/` altında, küçültülmüş, DB'de yol+sha256; yedek kapsar; çözüldükten 30 gün sonra dosya silinir, arıza yazısı kalır (saat ilerletilmiş test).
- [x] Çıkış işlenince oda kirli; temizlenince simge kalkar; kat planında kirli odalar renkli.
- [x] Görevler: "her gün 12:00" şablonu her gün bir görev üretir (tekrar çalıştırmada kopya yok); bir odada 10. çıkıştan sonra "derin temizlik" görevi açılır; aylık tekrar "yapıldı" sonrası doğru sonraki tarih (31 → 30/28 kenar durumları); 3 gün önce bildirim; OS bildirimi Windows ve macOS'ta test (kısmen: bildirim metni ve tur birim testi var; gerçek Windows/macOS bildirimi sahip onay paketinde; son kontrol). — `tasks-screens.test.ts`: "her gün 12:00 şablonu bugünden bir hafta sonrasına…kopya yok", "ayın 31'i: kısa ayda son güne düşer…31 → 28 → 31 → 30", "3 gün önce hatırlatma: zamanı gelince tek bildirim…", "oda bazında sayar; 10. çıkışta görev açılır…"; `tasks-service.test.ts` "her 10 konaklamada bir derin temizlik…"; `scheduler.test.ts` (OS bildirimi metni, turda en çok üç); e2e `electron/tasks-shift.spec.ts` "görev oluşturulur, tek tıkla yapıldı olur…". Windows/macOS'ta gerçek bildirim denemesi sahip onay paketinde.
- [x] Vardiya devri: özet elle yazılmadan doğru dolar (sentetik gün: 2 gelmemiş giriş, 1 KBS eksik, 1 bakiyeli konaklama, 1 açık görev); gelen vardiya "okudum" deyince rozet kalkar; kişisel not başka kullanıcıda (Sahip dahil) görünmez. — `permissions-operations.test.ts`: "2 gelmemiş giriş, 1 KBS eksik, 1 bakiyeli konaklama, 1 açık görev elle yazılmadan dolar…", "kişisel not başka kullanıcıda — Sahip dahil — görünmez…"; e2e `electron/tasks-shift.spec.ts` "devir yazılır; gelen vardiya (başka kullanıcı) okudum der…". Bugün ekranındaki rozet P9c'de (`shift.unreadHandovers`).
- [x] Otelde kalanlar: "kızıl" araması tanıtıcı notu bulur; KBS işaretsiz kişi kırmızı; yazdırma A4'e sığar. (`occupants-today.test.ts` "kızıl araması…", `in-house-page.test.tsx`, e2e `electron/today.spec.ts` "otelde kalanlar…" — Electron `printToPDF` A4 tek sayfa, `mobile/today.spec.ts` `page.pdf` A4 tek sayfa)
- [x] 2036'ya kaydırınca bayramlar otomatik üretilir; 2026–2028 bilinen tarihlerle doğrulanır; kullanıcı düzenlemesi yeniden üretimde korunur. (`calendar/holidays.test.ts` 2026/2027/2028, `calendar-service.test.ts` 2036, `permissions-today.test.ts` "bayram düzenlenince…", `calendar-notes-page.test.tsx` "2036'ya geçince…", e2e `electron/today.spec.ts` "takvim notları…")
- [x] "Her cumartesi" toplu notu saniyeler içinde eklenir. (`calendar-service.test.ts` 52 satır < 1 sn, `calendar-notes-page.test.tsx`, e2e `electron/today.spec.ts` < 5 sn)
- [x] Ayın 1'inde "Turizm Bakanlığı bildirimi" hatırlatıcısı çıkar ve ilgili ekrana götürür. (`domain/today.test.ts`, `permissions-today.test.ts` "turizm bildirimi hatırlatıcısı", `today-page.test.tsx` "…Turizm ekranına götürür")
- [x] Bugün ekranı rolüne göre kart gizler; mobilde yatay kaydırma yok. (`permissions-today.test.ts` "Bugün özeti… rol bazlı parçalar", `today-page.test.tsx` temizlik/resepsiyon, e2e `electron/today.spec.ts` sahip + resepsiyon, `mobile/today.spec.ts` taşma yok)

## Sonuç

### P9a — Oda durumu panosu ve arıza bildirimi (madde 1, 2)

- **Oda durumu** (`features/rooms/`; faz metnindeki `features/housekeeping/` yerine mevcut rota): kat planı + liste,
  durum süzgeci sayılarıyla; tek tıkla durum, not (durum değişince silinir), son değiştiren + saat; açık arıza rozeti ve
  blok işareti kartta. Bakımda / kullanım dışı → `room_blocks` (bugünden bir sonraki satılmış geceye, en çok 365 gün;
  `source='hk_status'`), başka duruma geçince blok o gün biter. Bu iki duruma girmek/çıkmak `rooms.block` yetkisi
  ister (satış kararı; Temizlik temiz/kirli/kontrol edildi yapar). Rezervasyonu görmeyen rol (Temizlik) sade görünüm
  alır: kirli odalar + "Temizlendi", sonra bütün odalar; misafir adı servisten hiç gelmez.
- **Çıkışta kirli** (S-14): kural `shared/domain/housekeeping.ts` `stateAfterCheckout` (bakımda/kullanım dışı kalır),
  olay `rooms-service.ts` `markRoomDirtyAfterCheckout(tx, audit, ctx, roomId, now)` — çıkış, aynı gün giriş‑çıkış ve
  oda değişikliğinin eski odası bunu çağırır (P5b'ye).
- **Arıza** (`features/issues/`; G-180): liste (açık / planlandı / çözüldü, önem sırası, oda ya da adlı genel alan,
  7 gündür açık kırmızı), form (fotoğraf ekranda 1600 px JPEG'e küçültülür, ana süreçte yeniden küçültülür ve üst veri
  silinir), planla (gün + kim), çöz (not; maliyet yok), geçmiş, fotoğrafı elle sil (onaylı). Çözülen arızanın
  fotoğrafı `attachments.resolvedIssueRetentionDays` gün sonra açılışta ve 6 saatte bir silinir (`src/main/attachments`).
- **Okuma işlemleri (başka paketler için)**: `housekeeping.openIssuesByRoom` (takvim satırı simgesi P5a, rezervasyon
  paneli uyarısı P5b), `housekeeping.issues { status: ['open','planned'] }` (Bugün kartı P9c), `housekeeping.board`.
- Migrasyon `0009_housekeeping` (birleştirmede 0008 → 0009 yeniden üretildi): `rooms.hk_note`, `room_blocks.source`, `room_issues.area`.
- Kapandı (son kontrol): arızanın Bugün kartı (`today-cards.tsx:345`, P9c), takvim simgesi (P5a) ve rezervasyon paneli uyarısı (P5b) yapıldı; kabul 1 işaretli.
  "Derin temizlik" sayacı oda ekranından kaldırıldı (görevler P9b).

### P9c — Otelde kalanlar, takvim notları ve özel günler, Bugün (madde 5, 6, 7) (2026-10-05)

- **Otelde kalanlar** (`features/in-house/`, G-53, G-54): gerçek servise bağlandı (`inHouse.list`); oda · kişiler ·
  tanıtıcı not · KBS işareti **kim ve ne zaman** · giriş/çıkış · rezervasyon notu · bakiye (ödeme görene). Arama
  ad/oda/not ("kızıl", Türkçe harf ve büyük/küçük harf farkı yok), "yalnızca KBS eksikleri" anahtarı; işaretsiz kişi
  kırmızı ve "KBS'ye bildirdim" düğmesi; yanlış işaret geri alınır (audit); otelden ayrılıp KBS çıkışı yapılmayanlar
  ayrı kartta ("KBS çıkışını yaptım"). Kişi ekleme (tanıtıcı not + aynı adımda KBS işareti; kimlik no sorulmaz).
  **Yazdır**: A4 gece listesi (`night-list.tsx` + `night-list.css`: yalnız liste basılır, tema ne olursa olsun
  siyah-beyaz sistem renkleri, oda sayfa arasında bölünmez). Okuma `occupants-service.inHouseView`, yazma var olan
  `occupants.add/markKbs*` (yetki `in_house`).
- **Takvim notları ve özel günler** (`features/calendar-notes/`, yeni rota `/calendar-notes`, menüde "Takvim notları",
  yetki `calendar.notes`; G-16, G-40): yıl yıl, ay kartları; görünen yılın bayramları `calendar_generation` ile
  kendiliğinden üretilir (2036 dahil); not ekleme tek gün / aralık / haftanın günleri / yapıştırılan liste, yıllık
  tekrar (tek gün), tür (not, özel gün, etkinlik, resmî tatil, yarım gün) ve renk (palet + serbest renk; renk `<style>`
  sınıfıyla, satır içi stil yok); rozetler (tür, tahmini, internetten doğrulandı, düzenlendi, her yıl); vurgulu
  günler ayardan (`calendar.highlightWeekdays`, Ayarlar'a bağlantı); düzenleme (üretilmiş satır `source=user` olur ve
  korunur), iptal (tek gün ya da toplu notun bütün günleri; silme yok). Çevrimiçi doğrulama için Döviz → Bayramlar
  sekmesine bağlantı. İşlemler `calendarNotes.list/add/edit/cancel/cancelGroup` (`procedures/today.ts`);
  `calendarNotes.add` ile takvimin `calendar.addNote`'u aynı `calendar-service.addNote`'a gider (test).
- **Bugün** (`features/today/`, G-92, G-93; açılış ekranı değil): `today.summary` tek okumada rolün görebildiği
  parçaları verir (görmediği parça `null` → kart gizlenir): bugün gelecekler, bugün çıkacaklar (çıkış saati geçip
  çıkmamışlar üstte ve vurgulu), otelde kalanlar + KBS eksikleri, kirli odalar, bugünkü/geciken görevler ("yapıldı"
  `today.completeTask` → `tasks-service.done`), okunmamış vardiya devri (`shift-service.unreadHandovers`), kasadaki
  nakit (`ledger-service.cashPanel`, kasa yetkisi), bugünün özel günleri, **turizm istatistiği hatırlatıcısı**
  (`domain/today.ts`: `legal_tourism_stats` şablonu açıksa şablonun gününden ayın 10'una kadar, geçen ay "bildirildi"
  işaretlenene dek; Turizm ekranına götürür; listedeki yasal görev de aynı bağlantıyı taşır). Kendi okumasını yapan
  kartlar: açık arızalar (`housekeeping.issues`, önem sırası, 7 gündür açık kırmızı), sık aranan numaralar
  (`contacts.favorites`, telefonda dokununca arar), personel durumu (`staff.panel`) ya da personeli göremeyen rolde
  **kendi saatini girme** (`MyHoursCard`), yedek uyarısı (`backup.status`, yedek ayarını görebilen rolde), hava
  (`WeatherCard`). Telefonda hava en üstte, kartlar tek sütun.
- **Okuma servisleri** (yeni, `occupants-service.ts`): `inHouseView(ctx, q)`, `dayLists(ctx)` (Bugün yetkisi; misafir
  satırları yalnız takvim ya da otelde kalanlar görene).
- **Sahte veri**: Bugün ve Otelde kalanlar artık `src/renderer/mocks` kullanmıyor (mocks dosyalarına dokunulmadı).
- Testler: `src/shared/domain/today.test.ts`, `src/main/services/occupants-today.test.ts`,
  `tests/unit/permissions-today.test.ts` (rol matrisi, iki not yolunun aynı servise gitmesi, 2036 düzenleme
  korunması, turizm hatırlatıcısı), `today-page.test.tsx`, `in-house-page.test.tsx`, `calendar-notes-page.test.tsx`;
  e2e `tests/e2e/electron/today.spec.ts`, `tests/e2e/mobile/today.spec.ts` (`P9C_SHOTS=<klasör>` ile ekran
  görüntüleri).
- Kapandı (son kontrol): "Arıza açılınca … görünür" ölçütünün Bugün kartı bu pakette, takvim satırı ve rezervasyon paneli
  P5a/P5b'de karşılandı. Görev şablonlarının her gün kendiliğinden üretilmesi (zamanlayıcı) P9b'de; Bugün'deki görev kartı
  üretilmiş görevleri gösterir. `calendar-notes` taşma listesine eklendi (`tests/e2e/routes.ts:5`).
- Varsayılan yok (fazın sorusu yok). Sahip onay paketine: gece listesinin gerçek yazıcıda A4 çıktısı.

### P9b — Görevler, bakım hatırlatıcıları, vardiya devri ve notlar (madde 3, 4) (2026-10-05)

- **Görevler** (`features/tasks/`, G-94, K-34): Faz 3 taslağı gerçek servise bağlandı. Liste dört görünüm (bugün —
  geciken önce, tarihsiz "derin temizlik" ve bugün yapılanlar dahil / geciken / yaklaşan / yapıldı — son 30 gün),
  süzgeç kişi, rol, vardiya, "bana verilenler" ve oda. Tek tıkla yapıldı (yapan + saat serviste), geri alma, menüden
  neden yazılarak iptal. Geciken satır kırmızı + rozet. Form: başlık, açıklama, kime (kişi/rol/vardiya), oda, son
  tarih-saat; tekrar (her gün saat, haftanın günleri, ayın günü — 31 kısa ayda son gün, her N konaklama) yalnız görev
  yöneticisine (Temizlik gibi "yalnız kendi görevleri" rolü tek seferlik görev ekler). Yasal hatırlatıcılar kartı
  (aç/kapat, sıradaki tarih), "Turizm Bakanlığı konaklama istatistiği" görevinde Turizm istatistiği ekranına bağlantı.
  Örnek öneriler (`akislar.md`: 12:00 çıkış yapmayanları ara, 15:00 çamaşırhane, 11:00 temiz fiş…) eklenir ya da
  "gerek yok" ile karttan düşer (Ayarlar → Görev önerilerinde durur).
- **Bakım** (`features/maintenance/`, G-91): hatırlatıcılar görev şablonudur (`kind=maintenance`): başlık, sıklık
  (her N gün/ay/yıl), ilk tarih, kaç gün önce uyarı, sorumlu (kişi/rol), not. Liste: sıklık, son yapılan, sonraki
  tarih (gecikti/yaklaşıyor), "Görevlerde"; "Yapıldı" yapıldığı günle (sonraki tarih önizlemesi ortak kuraldan),
  düzenle, kapat. Tohumdaki örnek bakımlar ilk tarih sorularak açılır (çevirili başlık korunur). Derin temizlik sayacı
  oda bazında (`tasks.stayCounters`): dolan oda vurgulu, "Temizlendi" sayacı sıfırlar (erken temizlik de).
- **Zamanlayıcı ve bildirim** (`src/main/notifications/`): otel bilgisayarında (istemci modunda değil) açılıştan 20 sn
  sonra ve 5 dakikada bir tur: bugünden bir hafta sonrasına görev yazılır (`materializeWindow`, idempotent), geciken
  görev bir kez (`notifyOverdue`), "N gün önce" hatırlatma bir kez (`notifyReminders`, şablon + vade anahtarıyla) bildirim
  olur ve Electron `Notification` ile gösterilir (turda en çok üç, fazlası tek bildirimde). Kişisel not hatırlatması
  yalnız uygulama içinde (saati gelen not Notlarım'da öne çıkar; `notes.dueReminders`) — paylaşılan bilgisayarda not
  metni işletim sistemi bildirimine düşmesin diye.
- **Vardiya devri ve notlar** (`features/shift/`; faz metnindeki `features/shift-notes/` yerine mevcut rota, G-95):
  okunmamış devir (yazan, saat, not, devir anındaki özet çipleri) + "Okudum"; devir yaz: otomatik özet (`shift.summary`,
  §6.16 — gelmemiş girişler, çıkışı geçmiş ama çıkmamışlar, bu gece kalanlar ve KBS eksikleri, ödenmemiş bakiyeler,
  bugüne kadar açık/geciken görevler, açık arızalar, kasa; her parça okuyanın yetkisine göre) + elle not → kaydet
  (özet anlık görüntüsüyle; vardiya ayardan, şu anki → sıradaki); geçmiş (son 14 gün, kim okudu); kendime not
  (yalnız yazan görür, Sahip dahil; hatırlatma saati) ve pano (sabitle, panodan kaldır). Telefonda üç sekme.
- **İşlemler** (`procedures|handlers/operations.ts`): `tasks.list|lookups|create|done|undoDone|cancel|templates|addTemplate|
  editTemplate|setTemplateActive|dismissSuggestion|completeTemplate|stayCounters`, `shift.summary|saveHandover|acknowledge|
  handovers|unreadHandovers`, `notes.list|add|update|setState|dueReminders`. **Bugün rozeti (P9c) için:
  `shift.unreadHandovers`** (okunmamış ve başkasının yazdığı devirler; boş dizi = rozet yok); kişisel hatırlatma için
  `notes.dueReminders`, bugünkü görevler için `tasks.list`.
- Servis: devir özetindeki açık görevler artık yalnız bugüne kadar vadeli + tarihsiz görevler (yarının görevleri sonraki
  vardiyanın işi değil). Migrasyon yok.
- Karşılanan: G-91, G-93, G-94, G-95 (Bugün rozeti hariç — P9c).
- Varsayılanlar: S-94 her N konaklama = 10, oda bazında (varsayılan değil, cevaplı). Görev penceresi 7 gün ve bildirim
  turu 5 dk program sabiti (varsayılan); bakım hatırlatıcısında uyarı varsayılanı 3 gün (tohum, varsayılan).
- Sahip onay paketine: Windows ve macOS'ta işletim sistemi bildiriminin gerçek denemesi (geciken görev ve "3 gün
  önce" hatırlatması; bildirime tıklayınca pencere öne gelir).
- Kapandı (son kontrol): Bugün ekranındaki okunmamış devir uyarısı (`today-page.tsx:89-102, 183`) ve görev kartı (`today-page.tsx:193`) P9c'de yapıldı.


### Hata avı düzeltmeleri (P9fix) (2026-10-05)

Faz 9 hata avının 19 bulgusu düzeltildi; her biri kalıcı testle (bulgu → test adı):

1. **Bakım serisi durmuyor** — `domain/task-recurrence.ts` `nextDueAfterDone` sonraki tarihi kapanan görevin
   tarihinden sonraya koyar (çok erken yapılırsa görevin tarihinden sayar; makul erken yapılanda K-34 "yapıldığı
   günden" kalır); `completeTemplate` yalnız sistemin park ettiği (`template_changed`) görevi yeniden açar, yapılmış
   kaydı ezmez; Bakım'da tarihi gelmemiş, görevi olmayan bakımda "erken mi yapıldı" uyarısı. Testler:
   `task-recurrence.test.ts` "sonraki tarih kapanan görevin tarihinden sonradır…", `tasks-fixes.test.ts` "aynı gün iki
   kez Yapıldı…", "üçüncü Yapıldı önceki yapılmış kaydı ezmez…", "7 günlük bakım tam 7 gün erken…", "ayın 31'ine
   bağlı aylık bakım…"; `maintenance-page.test.tsx` "tarihi gelmemiş, görevi olmayan bakımda…".
2. **Derin temizlik Temizlik'e gider** — tohumda sorumlu rol `housekeeping`; var olan veritabanında sorumlusuz şablon
   (ve açık görevleri) açılışta Temizlik'e verilir; görevi olmayan odada "Temizlendi" yalnız görev yöneticisine.
   `tasks-fixes.test.ts` "10. konaklamada Temizlik görevi görür…", "görevi bekleyen yokken Temizlik erken temizlik
   açamaz…", "sorumlusuz derin temizlik şablonu açılışta…"; `maintenance-page.test.tsx` "görev yöneticisi olmayan
   rol…".
3. **KBS girişi işaretlenmeden ayrılan kişi** — "KBS çıkışını yaptım" ayrılmış kişide iki işareti tek audit'li
   yazmada koyar (otelde kalan kişide hâlâ önce giriş istenir); listede "iki işaret birlikte" notu.
   `today-fixes.test.ts` "KBS girişi işaretlenmeden ayrılan kişi…", "otelde kalan, girişi işaretlenmemiş kişide…";
   `in-house-page.test.tsx` "KBS girişi de işaretlenmemiş ayrılan kişide…".
4. **Çıkış günü geçmiş misafir Bugün'de** — `dayLists` çıkış günü geçmiş, odada kalan konaklamayı "Bugün
   çıkacaklar"a vurgulu ekler ("Çıkış günü 3 Eki idi"). `today-fixes.test.ts` "çıkış günü geçmiş ve hâlâ odada…";
   `today-page.test.tsx` "otelde kalan oda ve kişi sayısı; çıkış günü geçmiş…".
5. **Doluluk = rapor** — Bugün'ün satılabilir oda sayısı raporun hesabıyla (`capacityInputs` + `forEachSellableDay`:
   kapasite geçmişi ve bloklar düşülür). `today-fixes.test.ts` "arızalı oda bu gece satılabilir sayılmaz…".
6. **Turizm bildirimi (G-93)** — görev ayın 10'u 23:59'da dolar, hatırlatma 1'i 09:00'dan (`remindMinutesBefore`);
   Bugün'deki hatırlatıcı başlangıç gününü şablondan hesaplar (`tourismStartDay`). Turizm ekranında "bildirildi"
   işareti o ayın görevini kapatır (görev henüz yazılmadıysa yapıldı olarak yazar), dönemin son işareti kalkınca
   görevi geri açar (tek giriş, audit'li; `syncLegalPeriodTask`). Var olan veritabanında ilk sürümün şablonu
   (1'i 09:00, hatırlatmasız) açılışta idempotent tohum güncellemesiyle düzeltilir (`db/seed/task-upgrades.ts`;
   otelin değiştirdiği şablona dokunulmaz, eski takvimin açık görevi `template_changed` ile kapanır). Migrasyon yok.
   `tasks-fixes.test.ts` "ayın 1'inde gecikme bildirimi yok…", "bildirildi işareti o ayın görevini kapatır…", "ilk
   sürümün şablonu açılışta bir kez düzeltilir…"; `today.test.ts` "başlangıç günü şablondan…"; güncellenen beklenti:
   `tasks-service.test.ts` "…istatistik her ayın 10'u (1'inden hatırlatır)", `tasks-screens.test.ts` (sıradaki tarih).
7. **Gece yarısından sonra geç gelen** — işletme günü/gece sınırı ayarı yok (`businessDay.*` yalnız gün kapatma);
   **(varsayılan)** otelin çıkış saatine (`hotel.checkoutTime`, 12:00) kadar dünün gelmemiş girişleri devirde ve
   Bugün'de görünür ("Dünden bekleniyor"); dünün aynı gün giriş‑çıkışı hariç. `occupants.test.ts` "gece yarısından
   sonra dünün gelmemiş girişi…", `today-fixes.test.ts` "gece yarısından sonra dünün gelmemiş girişi devirde…".
8. **Devirde misafir adı** — `takvim` ya da `otelde kalanlar` görme yetkisi ister (Bugün kuralı).
   `permissions-operations.test.ts` "Temizlik rolüne pano için vardiya notu görme verilse de…".
9. **Otelde kalan sayısı Bugün'de** — KBS kartının üstünde "Otelde 5 oda · 9 kişi". `today-page.test.tsx` "otelde
   kalan oda ve kişi sayısı…".
10. **Bayram değiştirilmeden kaydedilince** — servis yalnız gerçek değişikliği yazar (çeviri adı ad değişikliği
    sayılmaz), diyalog yalnız değişen alanları gönderir, hiçbir şey değişmediyse istek yok; bayram üretilmiş kalır.
    `today-fixes.test.ts` "aynı değerlerle düzenleme yazmaz…"; `calendar-notes-page.test.tsx` "bayram düzenlenince…"
    (beklenti güncellendi: yama yalnız `note`).
11. **Tarihsiz görev Bugün'de** — Bugün de bugüne kadar vadeli + tarihsiz açık görevleri alır (devir ve Görevler ile
    aynı). `today-fixes.test.ts` "tarihsiz derin temizlik görevi Bugün'de de sayılır…".
12. **Şablon değişince açık görevler** — başlık, açıklama, sorumlu ve oda (her N konaklamada oda hariç) açık görevlere
    audit'li aktarılır; yapılmış/iptal görev değişmez. `tasks-fixes.test.ts` "başlık ve sorumlu değişince…".
13. **Kapatılan şablonun gecikmiş görevi** — kapatınca gecikmişler de `template_changed` ile kapanır.
    `tasks-fixes.test.ts` "kapatılan şablonun gecikmiş açık görevi de kapanır".
14. **`kbs.checksEnabled`** — takvim çubuğu uyarısı ve Otelde kalanlar/gece listesi işaretsiz kişiyi kırmızı
    göstermez (`inHouse.list` → `kbsChecks`). `today-fixes.test.ts` "KBS kontrolleri kapalıyken…";
    `in-house-page.test.tsx` "otel KBS kontrollerini kapatınca…".
15. **İşaret yeniden çağrılınca** — KBS giriş/çıkış işareti varsa hiçbir şey yazılmaz, ilk "kim, ne zaman" kalır.
    `today-fixes.test.ts` "işaret zaten varken yeniden işaretlemek…".
16. **N konaklamada bir** — Bakım kartında görev yöneticisi N'i değiştirir (`tasks.editTemplate`); tohum yeni şablonu
    `tasks.everyNStays` ayarından yazar. `tasks-fixes.test.ts` "tohum N değerini tasks.everyNStays ayarından alır…";
    `maintenance-page.test.tsx` "N konaklamada bir değeri Bakım kartında değişir".
17. **Oda başına arıza özeti** — sayı/önem/blok herkese, arıza başlıkları yalnız `room_issues` görene.
    `permissions-housekeeping.test.ts` "arıza yetkisi olmayan rol sayıyı ve önemi alır…"; güncellenen beklenti:
    `housekeeping-service.test.ts` "odaya göre açık arızalar…" (muhasebe başlık almaz).
18. **Ekleyen kendi görevini görür** — yalnız kendi görevlerini gören rol sorumlusuz eklediği görevi görür ve kapatır.
    `permissions-operations.test.ts` "yalnız kendi görevlerini gören rol sorumlusuz eklediği görevi…".
19. **Yeniden açılan arıza** — yeniden açınca çözüm notu açık arızadan kalkar; geçmiş (çözüldü / yeniden açıldı,
    kim, ne zaman, not/neden) audit'ten gelir (`history`). `today-fixes.test.ts` "eski çözüm notu açık arızada
    kalmaz…"; `issues-page.test.tsx` "yeniden açılan arızanın geçmişi…".

Varsayılanlar: #7 gece sınırı = otelin çıkış saati (varsayılan); #6 son tarih saati 23:59 (G-93 "10'una kadar").
Avcının iki betiği kırmızı kalır ve beklentisi bilerek farklıdır: "monthly interval anchored on the 31st" 20 Ocak'ta
açık görev bekliyor ama sıradaki tarih 31 Ocak, görev penceresi 7 gün (kalıcı test 26 Ocak'ta açık görevi doğrular);
"tourism statistics on the 2nd" 2 Ekim'de görevin var olmasını bekliyor, oysa görev artık 10'unda dolar ve 3'ünden
yazılır (kalıcı test gecikmiş görev olmadığını ve hatırlatıcıyı doğrular).

## Son kontrol düzeltmesi (QA-1, QA1b — 2026-10-05)

- **TR yasal görev önerileri ülke koşulu** (K-46 (7), karar denetimi #11): turizm istatistiği ve KBS çıkış hatırlatıcısı
  yalnız `hotel.country === 'TR'` iken açık tohumlanır ve kurulum sihirbazında önerilir (`shared/domain/task-country.ts`
  `TASK_COUNTRIES`). Var olan otelin görevleri değişmez. Testler: `task-country.test.ts`, `seed.test.ts` "TR yasal
  hatırlatıcıları yalnız Türkiye'deki otelde açık tohumlanır", "var olan otelin görevleri ülke değişince kendiliğinden
  değişmez", `session-access.test.ts` "Türkiye dışındaki otelde TR yasal hatırlatıcıları açılmaz…",
  `setup-page.test.tsx` "personel: Türkiye dışındaki otele TR yasal hatırlatıcıları önerilmez".

## Son kontrol düzeltmesi (QA2b — akış testi B; 2026-10-05)

| Bulgu | Düzeltme | Test |
|---|---|---|
| Uzun boşluksuz metin sayfayı yana taşırıyor (Bugün 23.183 px, Vardiya 70.425 px, Takvim notları, Görevler, Otelde kalanlar, Arızalar, Kayıp eşya; akış A alanları da) | Ortak çözüm: `globals.css` `body { overflow-wrap: anywhere }` (ekran, diyalog ve alt sayfa miras alır); ekranlardaki `break-words` aynı kurala bağlandı; arayüz kitinin düğme, sekme ve etiketleri kendi sözcüklerini bölmez (`overflow-wrap: normal`); `Card` `min-w-0`; tablo içindeki kullanıcı adı hücreleri sarılır; personel paneli `min-w-0` | e2e `mobile/wrap.spec.ts` "servis sınırındaki boşluksuz metinle hiçbir ekran yatay taşmaz (telefon ve masaüstü)", "uzun metinli kayıtların ayrıntı panelleri taşmaz…" (veri `tests/e2e/long-text.ts`, sınırlar sözleşme şemasından); `user-text-wrap.test.ts` |
| Görevler "Her N konaklamada" 0/-1 ve ayın günü 0/32/-3 için metin yok; Görevler 1.000.000'u kabul ediyor, Bakım 500 | Sözleşme tek değer: `recurrenceRuleInputSchema` (N 1–500, sıklık 1–999, gün 1–31; kayıtlı kurallar sınırsız okunur); alan altında "1 ile 500 arasında bir tam sayı yazın." | `limits.test.ts` "Her N konaklamada Görevler ve Bakım için aynı…", `tasks-page.test.tsx` "Her N konaklamada ve ayın günü sınır dışıysa…" |
| Bakım: sıklık 1000 / 1,5 yanıltıcı metin; uyarı günü -1 / 366 metinsiz | Sınırı söyleyen tek metin (`useRangeText`, sınırlar sözleşmeden) | `maintenance-page.test.tsx` "hatırlatıcı: sıklık 1000 / 1,5 ve uyarı günü -1 / 366…", "Kaç konaklamada bir sınır dışıysa…" |
| Bakım: her "N konaklamada" görevi "Derin temizlik sayacı" diye etiketleniyor | Yalnız tohumdaki derin temizlik şablonu o kartta; otelin kendi görevleri "Konaklama sayısına göre işler" kartında kendi başlığıyla | `maintenance-page.test.tsx` "otelin kendi her N konaklamada görevi…", `user-text-wrap.test.ts` "arayüzün tanıdığı kod tohumdaki kodla aynı" |
| Telefonda Bugün (16×16) ve Görevler (24×24) onay kutusu | Ölçüm kutunun kendisiydi: `Checkbox` telefonda görünmez `::after` ile 44 px (değişiklik gerekmedi); e2e ile güvenceye alındı | e2e `mobile/today.spec.ts` "Bugün görev kutusu telefonda 44 px dokunma alanı", `mobile/tasks-shift.spec.ts` (var olan ölçüm) |
| Vardiya'da iki "Ekle" düğmesi ayırt edilemiyor | Erişilebilir adlar "Kendime not ekle" / "Panoya not yaz" | `shift-page.test.tsx` "kendime not hatırlatma saatiyle eklenir…" |
| "Herkes" ataması Temizlik/Çalışan rolünde görünmüyor | Davranış belgeli (`canSeeTask`); atama seçiminde ipucu | `tasks-page.test.tsx` "Her N konaklamada ve ayın günü…" (ipucu metni) |
