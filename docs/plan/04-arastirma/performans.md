# Performans ölçümleri (Faz 15 madde 9)

> Faz 15 P15a2, 2026-10-05. Faz 16'nın "10 yıl × 20 oda kabul edilebilir sürede" maddesine de veri. Ölçüm betiği ve
> veri hazırlığı depoda; sonuçlar bu dosyada. Sayılar **yüklü bir Linux kapsayıcısında** (xvfb, yazılımla çizim, ölçüm
> sırasında yük ortalaması 18–28) alındı: otelin bilgisayarında (Windows/macOS, donanım çizimi, başka iş yok) daha iyi
> olur. Önemli olan aynı makinede **önce/sonra** karşılaştırmasıdır.

## Nasıl ölçülür

```sh
# 1) Veri: 20 oda × 2026–2036 (≈ 20.000 rezervasyon), bu ay 1.376 satırlık defter (776 ödeme + 600 gider)
npx tsx --tsconfig tsconfig.node.json tests/e2e/seed-calendar.ts <klasör> --dense
npx tsx --tsconfig tsconfig.node.json tests/e2e/seed-perf.ts <klasör>
# 2) Ölçüm (gerçek uygulama, 1366×768)
npm run build
BISMUTH_PERF=1 BISMUTH_PERF_DATA=<klasör> xvfb-run -a npx playwright test tests/e2e/electron/perf.spec.ts
```

- `tests/e2e/electron/perf.spec.ts` (yalnız `BISMUTH_PERF=1` ile koşar): hizmet süreleri (pencerenin kendi API'si
  üzerinden), takvimin ilk çizimi, 300 kare kaydırma, on yıl içinde 20 rastgele atlama, 40 ok tuşu, defter ayının açılışı,
  gün açma, süzgeç, raporlar. Sonuç JSON olarak yazdırılır ve rapora eklenir.
- **Yeniden çizim sayaçları** (`src/renderer/lib/render-count.ts`): ağır bileşenler (`tape-row` takvim satırı,
  `ledger-band` defter ayının günü) `globalThis.__bismuthRenders` tanımlıyken kendini sayar; kapalıyken tek bir özellik
  kontrolüdür. Birim testleri de bu sayaçla "gereksiz yeniden çizim yok" der (`calendar-page.test.tsx`,
  `ledger-page.test.tsx`).
- Eski ölçüm `tests/e2e/electron/calendar-perf.spec.ts` (Faz 5; 19 oda) olduğu gibi duruyor.

## Sonuçlar (aynı makine, aynı veri)

| Ölçüm | Önce | Sonra | Not |
|---|---:|---:|---|
| `reservations.grid` (2 ay × 20 oda), ortanca / en kötü | 85 / 175 ms | 139 / 354 ms | hizmet değişmedi; fark makinenin yükü |
| Takvim ilk çizim (Bugün → Takvim, ilk çubuk) | 1.449 ms | 1.005 ms | |
| Takvim kaydırma (300 kare × 30 px), kare/sn · p95 | 11 · 217 ms | 9 · 300 ms | yazılımla çizim + yük; aşağıya bkz. |
| On yılda rastgele atlama (sonraki kare), ortanca / en kötü | 194 / 571 ms | 199 / 1.053 ms | |
| Ok tuşu başına (imleç + ekran okuyucu duyurusu) | **136 ms** | **56 ms** | satırlar artık yeniden çizilmiyor |
| Ok tuşu başına yeniden çizilen satır | 20 (hepsi) | ≈ 1 (40 basışta 40; yalnız pencere kayınca) | `tape-row` sayacı |
| `ledger.month` (1.376 satır, 921 KB) | 129 ms | 185 ms | hizmet değişmedi |
| Defter ayı açılışı (sekme → ilk gün bandı) | 1.706 ms | **970 ms** | gün gruplaması tek geçiş |
| Bir günü açma | 347 ms | **201 ms** | yalnız o günün bandı çizilir (`ledger-band` = 1) |
| Para birimi süzgeci | 748 ms | 582 ms | |
| Raporlar ilk çizim | 1.203 ms | 2.425 ms | rapor ekranına dokunulmadı; fark yük (bkz. hizmet) |
| `reports.summary` (bütün yıl) / `reports.yearly` (2 yıl) | 289 / 54 ms | 253 / 21 ms | |

**Zorlama denemesi** (ilk veri: yoğun tohumun bütün ödemeleri tek güne yazılmıştı, ayda 13.398 ödeme, 10 MB):
`ledger.month` 527–1.165 ms; düzeltmeden önce defter ayının açılışı **27,8 sn**, bir gün açma 2,5 sn sürdü. Aynı veride
**gün görünümü** (tek günde 12.700 satır) çizilirken pencere yanıt vermez oldu. Gerçek bir otelde bir günde yüzlerce
satır bile beklenmez (19 oda); yine de not edildi (aşağıda "Kalanlar").

## Yapılan iyileştirmeler

1. **Takvim satırları** (`features/calendar/calendar-grid.tsx` → `GridRow`, `memo`): imleç, ekran okuyucu duyurusu,
   sürükleme hedefi ya da arama vurgusu değişince yalnız ilgili satır çizilir; satırların işleyicileri tek ve sabit
   bir nesnede (`RowActions`, son kapanışlar bir ref'te). Pencere (çizilen haftalar) kayınca satırlar elbette çizilir.
2. **Defter ayı** (`features/ledger/month-view.tsx`): günlere bölme her çizimde gün başına bütün satırları süzmek yerine
   tek geçişte ve `useMemo` ile; her gün bandı `DayBand` (`memo`), açma/kapama işlevi sabit (`useCallback`).
3. Ölçüm ve sayaçlar kalıcı: Faz 16 ve sonraki değişiklikler aynı betikle karşılaştırılabilir.

## Faz 16 için değerlendirme ("10 yıl × 20 oda kabul edilebilir sürede")

- Takvim on yıllık ızgarada yalnız görünen haftaları çizer (Faz 5 sanallaştırması); 20 odada ilk çizim ~1 sn, ay okuma
  ~0,1–0,35 sn, yıl atlama bir karede. Yüklü kapsayıcıda bile kabul edilebilir; donanım çizimli bir bilgisayarda kaydırma
  akıcı olmalı (Faz 5 ölçümü: 19 odada akıcı).
- 1.000+ satırlık defter ayı 1 sn'nin altında açılıyor; bir gün açmak 0,2 sn.
- Raporlar bütün yıl için 0,25 sn hizmet süresi.

## Kalanlar

- **Gün görünümü sanallaştırılmadı**: bir günde binlerce satır (gerçekçi değil; yalnız zorlama verisinde) pencereyi
  kilitler. Gerekirse ödeme/gider tablolarına satır sanallaştırması eklenir — öneri, bu pakette yapılmadı.
- Kaydırma kare hızı bu kapsayıcıda yazılımla çizim yüzünden düşük (9–11); gerçek cihazda ölçüm **sahip onay
  paketine** (Windows dizüstü ve Mac'te `BISMUTH_PERF=1` koşusu).
