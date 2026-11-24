# Bismuth tasarım dili

> Faz 3 teslimatı 1 (`docs/plan/fazlar/faz-03-ui-tasarim-sistemi.md`). Ekranları yazan herkes ve `ui-reviewer` ajanı bu
> belgeyi referans alır. Kurallar `.agent/rules/ui.md` ile birlikte okunur; metin kuralları `.agent/skills/tr-copy-guide`.
> Canlı örnek: programda **Sistem → Tema önizleme** (bütün bileşenler, üç dilde örnek metin) ve **Ayarlar → Durum
> etiketleri** (renk mantığı, canlı takvim önizlemesi).

## 1. İlkeler

1. **Sakin ve yoğun.** Resepsiyon gün boyu bu ekrana bakar: göz yormayan zemin, az renk; renk yalnızca **anlam** taşır
   (ödeme durumu, uyarı, gecikme). Bir ekranda en fazla bir birincil düğme.
2. **Önce yapılacak iş.** Her ekranın üstünde o an gereken bilgi: Bugün'de çıkış saati geçmiş oda, KBS eksiği, okunmamış devir.
   Gecikenler ve eksikler yüksek sesle (uyarı rengi + metin), geri kalanı sessiz.
3. **Tek giriş.** Hesaplanabilen hiçbir şey ikinci kez yazdırılmaz; özetler (devir özeti, kasa paneli) veriden gelir.
4. **Renk tek başına anlatmaz.** Her durumun bir adı ve/veya simgesi vardır (lejant, rozet metni, `aria-label`).
5. **Her ekranın dört hâli vardır:** yükleniyor (sayfa biçiminde iskelet), hata (ne oldu + "Tekrar dene"), boş (ne yok + nasıl
   başlanır) ve veri. Ortak bileşen: `components/query-view.tsx`.
6. **Otelin kuralı ayardır.** Saatler, vardiyalar, renkler, etiketler, listeler ekranda sabit yazılmaz; ayardan/tohumdan okunur.

## 2. Yazı

- Yazı tipi **Inter Variable** (paket içinde, `@fontsource-variable/inter`; CDN yok). Latin, Türkçe (ğ, ı, İ, ş) ve Kiril aynı
  ağırlıkta; Arapça ileride ayrı bir yazı tipiyle eklenir.
- Ölçek (Tailwind): `text-xs` 12 px yardımcı metin ve rozet · `text-sm` 14 px gövde, tablo, form etiketi · `text-base` 16 px
  telefonda giriş alanı ve öne çıkan metin · `text-lg/xl` kart başlığı, telefonda KPI ve telefonda sayfa başlığı · `text-2xl`
  masaüstünde sayfa başlığı (h1) ve KPI değeri.
- **Büyük yazı** (`ui.fontSize`, kişiye özel: normal / büyük %112,5 / daha büyük %125): kökün yazı boyutu büyür, rem ile
  verilen her ölçü (takvim hücresi dahil) onunla büyür. Ayarlar → Genel → Görünüm ve Tema önizleme.
- Saat alanı her dilde **24 saat**: `components/time-input.tsx` (`SS:DD`, klavyeyle "1430" → 14:30, ↑/↓); tarayıcının
  `<input type="time">` alanı kullanılmaz (bilgisayarın diline göre "02:00 PM" gösteriyordu).
- Ağırlık: gövde 400, etiket ve satır başlığı 500, başlık 600. Büyük harfe çevirme (`uppercase`) yalnızca küçük bölüm
  başlıklarında (`text-xs tracking-wide`) ve Türkçe `lang` doğruyken.
- Rakamlar **Latin** ve tablolarda `tabular-nums` (sütunlar hizalı). Para `<bdi>` içinde; sayı ve telefon girişleri `dir="ltr"`.
- Biçimler yalnızca `hooks/use-format.ts` → `src/shared/format.ts` üzerinden: para `₺2.500` (kuruş `ui.showMinor` ayarına uyar),
  tarih `4 Eki` / `4 Ekim 2026 Pazar`, saat `14:30`, yüzde `%74`.

## 3. Renk

Bütün renkler CSS değişkenidir (`src/renderer/styles/globals.css`); bileşende hex, `rgb()` ya da `bg-red-500` gibi palet sınıfı
yoktur. Açık ve koyu tema aynı değişken adlarını farklı değerlerle verir; "sistem" seçeneği işletim sistemini izler.

| Rol | Değişken / sınıf | Kullanım |
|---|---|---|
| Zemin, kart, kenarlık | `bg-background`, `bg-card`, `border` | sayfa ve kartlar |
| Birincil (Bismuth moru) | `bg-primary`, `text-primary-foreground` | tek birincil eylem, seçili öğe, bugün çizgisi |
| Sessiz metin | `text-muted-foreground` | açıklama, ikincil bilgi (gövdede 4,5:1 kontrastı korur) |
| Vurgu zemini | `bg-accent` | seçili sekme/kart, bugünün sütunu, sabitlenmiş not |
| Tehlike | `text-destructive`, `variant="destructive"` | borç, KBS eksiği, gecikme, geri alınamaz eylem |
| Uyarı | `border-warning`, `bg-warning/15` | çıkış saati geçti, okunması zor renk |
| Başarılı / bilgi | `text-success`, `text-info` | olumlu değişim, yağmur, bilgi notu |
| Ödeme durumları | `bg-status-*` + `text-status-*-fg` | takvim hücresi, rozet, lejant |
| Özel etiketler | `.tag-<id>` sınıfı → `bg-tag` / `border-tag` | otelin kendi etiketleri |
| Oda durumu | `bg-hk-*`, `border-hk-*` | kat planı, oda listesi, takvim oda sütunu |
| Grafik | `var(--chart-1…5)` | grafik serileri |

### 3.1 Durum rengi mantığı (G-32, G-33, §6.14)

- **Otomatik durumlar** programın bulduğu durumlardır: ödendi, ödenmedi, kısmen ödendi/kapora, aynı gün giriş‑çıkış, geçmiş
  tarih boş, boş, satılmaz. Varsayılan renkler sahibin Excel alışkanlığından gelir (ödendi = kırmızı, ödenmedi = sarı). Sahip her
  temanın rengini ayrı seçer (`ui.statusColors`, `ui.statusColorsDark`), adını ve anlamını değiştirir, istemediğini kapatır.
  Kapatılan durum boş kalmaz: kısmen → ödenmedi + **kapora simgesi**, aynı gün → ödeme durumu, geçmiş boş → boş.
- **Özel etiketler** rezervasyona takılır (Grup, Sorunlu misafir, Uzun konaklama…): tek renk, ad, anlam. Varsayılan olarak
  çubuğun **kenarlığını** boyar; "takvimde hücreyi bu renk doldursun" seçilirse **dolguyu** alır ve ödeme durumu kenarlığa geçer.
  İkisi de her zaman görünür.
- Yazı rengi zemine göre otomatik seçilir (`shared/color.ts readableOn`); kontrast 4,5:1'in altına düşen renkte ayar ekranı
  "Bu renkte yazı zor okunur" uyarısı verir.
- Takvimin altında ve ayar ekranında **lejant** (`components/legend.tsx`): açık otomatik durumlar, sonra açık özel etiketler;
  kenarlık olarak çizilenler içi boş kare.

### 3.2 Vurgu rengi (Faz 15)

- Otelin vurgu rengi her tema için ayrıdır (`ui.accentColor`, `ui.accentColorDark`; `settings.colors` yetkisi, herkes için
  aynı): birincil düğme, seçili öğe, bugünün çizgisi, odak halkası (`--primary`, `--ring`) ve vurgu zemini (`--accent`,
  rengin %12/%24'ü). Üstündeki yazı rengi türetilir. Zeminde 3:1'in altında kalan renkte **Tema önizleme** "zor seçilir"
  uyarısı verir; hazır renkler (`shared/color.ts ACCENT_PRESETS`) her temada 3:1 ve yazı 4,5:1 sağlar.
- Grafik renkleri koyu temada OKLCH L 0,48–0,67 bandında ve kartta en az 3:1 (`tests/unit/theme-contrast.test.ts`).
- Oda durumu takvimin oda sütununda renk + biçimle anlatılır: temiz nokta, kirli eşkenar dörtgen, kontrol edildi halka,
  kapalı kare; ekran okuyucu adını okur.

## 4. Boşluk, düzen, köşe

- 4 px ızgara. Sayfa bölümleri arası `gap-6`, kart içi `p-4`/`p-6`, liste satırları `gap-1`–`gap-2`.
- Okuma sayfaları `max-w-6xl` ortada; takvim ve geniş tablolar tam genişlik (`Page wide`).
- Hedef ekran **1366×768**: kenar menü (~256 px, daraltılabilir) + içerik ~1050 px. Bu genişlikte yatay kaydırma yoktur
  (takvim ızgarası kendi içinde kayar). Masaüstü ızgaraları çoğunlukla `lg:grid-cols-2`; dar sütun kartı `min-w-0`.
- Köşe `--radius` 10 px: kart `rounded-xl`, düğme/giriş `rounded-md`, rozet `rounded-md`/tam yuvarlak.
- **Yoğunluk** (`ui.density`): rahat / sıkı. Sıkı modda takvim satırı, gün sütunu ve oda sütunu daralır
  (`--density-row`, `--tape-day`, `--tape-room`); yoğun tablolar `compact` destekler.

## 5. Simgeler

- **lucide-react**; satır içinde 16 px (`size-4`), rozet ve takvim çubuğunda 12–14 px. Simge metnin yerine geçmez; tek başına
  duran simge düğmesinde `aria-label` zorunlu.
- Yön bildiren simgeler (ok, ileri/geri) `rtl:rotate-180` taşır.
- Takvim çubuğu simgeleri: not, istek, VIP, **KBS eksik**, misafir uyarısı, kapora, çocuk (`components/tape-chart`).
- Hava durumu: Yr simge seti (MIT, paket içinde, `components/weather-icon.tsx`).

## 6. Bileşen kalıpları

| Kalıp | Bileşen | Kural |
|---|---|---|
| Sayfa çerçevesi | `components/page.tsx` | başlık (h1), tek cümle açıklama, sağda eylemler; Faz 3 taslaklarında **"Örnek veri"** rozeti |
| Dört hâl | `components/query-view.tsx`, `states.tsx` | iskelet sayfa biçiminde; hata mesajı + "Tekrar dene"; boş durum ne yapılacağını söyler |
| Bölüm kartı | `components/section-card.tsx` | simge + başlık + sayı rozeti (`tone="warn"` → kırmızı) + tek eylem ("Tümü") |
| Göstergeler | `components/kpi-card.tsx` | değer, önceki döneme göre değişim (iyi/kötü rengi), küçük çizgi grafik; dar kartta grafik alta iner |
| Tablo | `components/ui/table` | sayılar sona hizalı ve `tabular-nums`; ikincil sütunlar telefonda gizlenir (`max-md:hidden`) ya da liste kartına dönüşür |
| Form | shadcn `Label` + alan | etiket üstte, açıklama/hata altta; **Enter kaydeder, Esc kapatır**; para `MoneyInput`, tarih `DateInput`, telefon `PhoneField`, oda `RoomPicker`, misafir `GuestCombobox` |
| Oluştur / düzenle | `components/responsive-dialog.tsx` | masaüstünde ortada pencere, telefonda alttan açılan sayfa |
| Ayrıntı paneli | `Sheet` | masaüstünde sağdan, telefonda alttan; sekmeli (ör. rezervasyon: Özet · Geceler · Para · Kişiler) |
| Onay | `AlertDialog` | yalnızca geri alınamaz/önemli işlem; başlık soru, gövde sonucu söyler, düğmeler eylem + "Vazgeç". Kayıt **silinmez**: iptal edilir, kapatılır |
| Bildirim | `sonner` | kısa, geçmiş zaman ("Ödeme kaydedildi"); telefonda üstte, alt gezinmeyi örtmez |
| Durum rozeti | `components/status-tag-badge.tsx` | renk + ad birlikte |
| Kopyala | `components/copy-button.tsx` | fatura bilgisi, turizm tablosu, adresler; simge bir an onay işaretine döner |
| Grafik | `components/ui/chart.tsx` (Recharts) | renkler `var(--chart-n)`; her grafiğin **tablo görünümü** düğmesi var |

## 7. Klavye ve odak

- Her şey klavyeyle kullanılır; odak halkası her zaman görünür (`focus-visible:ring-[3px] ring-ring`, tam opaklık).
- `Ctrl/⌘ K` hızlı arama (sayfalar, tema, dil); Faz 5'te yeni rezervasyon, bugüne git, ödeme gir kısayolları (G-19).
- Diyalogda ilk alan odaklanır, `Esc` kapatır, `Enter` kaydeder. Radix menü/seçim bileşenleri ok tuşlarıyla gezilir.

## 8. Telefon kalıpları (< 768 px, G-143)

- **Alt gezinme**: Bugün · Takvim · Misafir · Kasa · Daha fazla; "Daha fazla" alttan bir sayfa açar (rolün görebildiği
  diğer telefon ekranları). Kenar menü yok.
- **Üst çubuk**: otel adı + bugünün tarihi, istemci modunda **bağlantı rozeti**, arama.
- Dokunma hedefi en az **44×44 px** (`max-md:min-h-11`; satır içi anahtar/onay kutusunda görünmez `::after` alanı).
- Giriş yazısı **16 px** (iOS yakınlaştırmasın); `dvh` ve güvenli alan payları; içerik alt gezinmenin altında kalmaz.
- **Ana eylem** (Yeni rezervasyon, Arıza bildir, Kişi ekle…) başlığın altında, tam genişlikte ve **yazılı** düğmedir (yalnız
  simge değil); `PageHeader` bunu kendisi dizer.
- Tablolar **liste kartına** döner; formlar alttan açılan sayfadır; takvim telefonda **gün listesidir** (gelenler, gidenler,
  kalanlar, boş odalar; oklarla gün değişir).
- Kapsam (S-66): Bugün, gün listesi, misafir arama ve geçmişi, kasa paneli, rapor kartları, döviz, arıza, bakım, görevler,
  vardiya notları, otelde kalanlar; hafif düzenlemeler (ödeme, arıza açma, oda durumu, görev tamamlama).

## 9. Metin ve dil

- Kullanıcıya görünen her metin `t('…')` anahtarıdır; `tr.json` kaynak, `en.json` ve `ru.json` aynı anahtarlar (çeviri, kopya
  değil). Çoğul: tr/en `_one/_other`, ru `_one/_few/_many/_other`.
- Ton "siz", sade, kısa, etken; düğmede fiil ("Ödeme al", "Devri oku"); sözlük ve kalıplar `tr-copy-guide` becerisinde.
- Rusça metinler ~%30 uzundur: düğme ve sekme metni kırpılmaz, gerekirse satır kırılır; `truncate` yalnızca tam metnin başka
  yerde (ipucu, ayrıntı) göründüğü yerde.
- Düzen **mantıksal CSS** ile (`ms-`, `me-`, `ps-`, `pe-`, `text-start`); fiziksel yön yalnızca takvim ızgarasının `dir="ltr"`
  adasında. İleride sağdan sola bir dil eklenebilsin.

## 10. Rol duyarlılığı

- Menü, kartlar ve eylemler rolün yetkisine göre gizlenir (`lib/view-as.ts` → `useCan()`; Faz 4'ten itibaren oturum). Gizlemek
  koruma değildir: her servis çağrısı yetkiyi ayrıca denetler (G-23). Rolün göremediği bir ekran adresle açılırsa
  (`layouts/route-guard.tsx`) ya da servis yetkisiz yanıtı verirse (`ErrorState`) sayfa yerine **"Bu ekrana yetkiniz yok"**
  gelir; yeniden deneme düğmesi yoktur.
- **Ayarlar → Roller ve kullanıcılar → "Bu rolün gözüyle bak"** menüyü ve ekranları o rolün gördüğü gibi gösterir; üstteki
  şeritten çıkılır.

## 11. Ekran listesi ve taslak durumu (Faz 3)

| Grup | Ekranlar | Telefon |
|---|---|---|
| Günlük işler | Takvim (açılış), Bugün, Otelde kalanlar, Görevler, Vardiya devri ve notlar, Oda durumu (kat planı) | gün listesi, Bugün, kalanlar, görevler, notlar, oda durumu |
| Misafirler | Misafirler (+ firmalar), Kara liste, Kayıp eşya | misafir arama ve geçmişi |
| Para | Defter ve kasa, Ay sonu kontrolü, Döviz | kasa paneli, döviz |
| İşletme | Arızalar, Bakım, Tedarik, Çamaşırhane, Rehber | arıza, bakım |
| Personel | Personel | — |
| Raporlar | Raporlar, Turizm istatistiği | rapor kartları |
| Sistem | Ayarlar (genel, görünüm, durum etiketleri, listeler, roller ve kullanıcılar, uzaktan erişim), Tema önizleme, Hakkında | ayarlar |
| Menü dışı | Kurulum sihirbazı, Giriş, Kilit ekranı | aynı ekranlar |

Taslaklar **örnek veri** ile çalışır (`src/renderer/mocks`, uydurma adlar ve tutarlar); sonraki fazlar aynı düzeni gerçek
servislere bağlar. Durum etiketleri ekranı şimdiden gerçek servisle çalışır.

## 12. Gözden geçirme listesi (kısa)

1. 1366×768'de ve 390×844'te yatay taşma yok (takvim ızgarası hariç); Rusçada kırpılan metin yok.
2. Dört hâl var; boş durum ne yapılacağını söylüyor.
3. Renkler değişkenden; durum renkle birlikte adla/simgeyle anlatılıyor; koyu temada 4,5:1.
4. Telefonda 44 px hedef, 16 px giriş, alttan açılan formlar.
5. Metin anahtarlarda, üç dil eşit; para/tarih `useFormat` ile.
6. Odak görünür, Esc/Enter çalışıyor; simge düğmelerinde `aria-label`.
7. Yetkiye göre gizleme var ama servis kontrolüne güveniliyor.
