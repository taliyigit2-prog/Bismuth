---
name: orkestra
description: Otonom yürütme — YURUTME.md'den sıradaki dalgayı alır, paketleri ajanlara dağıtır (worktree), sonuçları birleştirir, kontrolleri ve kontrol ajanlarını koşturur, başarısızlıkta yeniden dener, ilerlemeyi ve harcamayı YURUTME.md'ye yazar; durma koşullarında sahibe numaralı soru bırakıp durur. Bağlam sıkıştırmasından sonra kaldığı yerden devam eder. "Planı uygula", "devam et", "/orkestra", "sıradaki dalga" için.
argument-hint: "[dalga-no | devam | durum]"
---

## Durum

!`sed -n '/^## Dalgalar/,/^## Günlük/p' docs/plan/fazlar/YURUTME.md | grep -E '🔄|⬜|^\| Dalga' | head -30`
!`git status --short | head -15`
!`tail -5 docs/plan/fazlar/YURUTME.md`

## 0. Kurallar (her turda geçerli)

- **Tek kaynak:** `docs/plan/fazlar/YURUTME.md` (dalgalar, paketler, durum, günlük, harcama). Her değişiklik önce oraya
  yazılır; bağlam sıkıştırmasından sonra **ilk iş** bu dosyanın "Dalgalar" ve "Günlük" bölümlerini okumaktır.
- **Sahip yok (K-39):** soru = `05-sorular.md`'deki varsayılan + "(varsayılan)" işareti. Yalnız §5'teki durma
  koşullarında sahibe sorulur; soru mesajın sonunda `❓ SORULARIM` başlığı altında numaralı yazılır ve tur biter.
- **Yasaklar:** `gh workflow run`/`gh release`/`git tag v*` yok (kanca); push yalnız `claude/…` dalına; `01-gereksinimler.md`
  yalnız `/requirement-change` ile; migrasyon değişmez; commit mesajında model adı yok.
- **Maliyet:** `/token-economy` kuralları; aynı anda en çok **3 kodlayan ajan** (4 çekirdek, 15 GB; yük > 5 ise 2; tam test/e2e/build aynı anda tek), kontrol
  ajanları kodlayanlar bittikten sonra; tam `npm run check` dalga başına bir kez (ajanlar kendi worktree'lerinde bir kez).
  Dalga başına tahmini maliyet `08-gelistirme-plani.md` §6'dan; gerçek harcama başlatıcının yazdığı `$` satırından günlüğe.

## 1. Dalgayı seç

1. `YURUTME.md` "Dalgalar ve paketler" tablosunda durumu 🔄 ya da ⬜ olan en küçük dalga numarası sıradaki dalgadır
   (`$ARGUMENTS` bir dalga numarası verirse o). Bir dalganın tüm paketleri ✅ olmadan sonraki dalga başlamaz
   (bağımlılık sütunu izin veriyorsa tek paket öne alınabilir; günlüğe yaz).
2. Paketin faz dosyasını (`faz-NN-*.md`), `08-gelistirme-plani.md`'deki paket kartını (amaç, dosyalar, kabul, testler,
   ajan/model) ve atıf yapılan G-xx/K-xx satırlarını oku. Eksikse paketi "⏸ eksik tanım" işaretle ve §5'e göre dur.
3. Ortak altyapı (sözleşme kaydı, migrasyon numarası, paylaşılan bileşen) varsa **önce ana oturumda** yap, commit et;
   paketler o commit'ten başlar.

## 2. Dağıt

`/parallel-build` adımlarıyla: her pakete paket kartındaki ajan (`calendar-specialist`, `feature-builder`,
`db-migration-builder`, `camera-integrator`, `packager`, `feature-builder-lite`), `isolation: worktree`,
`run_in_background: true`, tek mesajda. Görev metni: paket kartı aynen + "önce `.claude/agents/<ajan>.md` oku" + portlar
(paket n → `475n1/475n2`) + rapor yolu `.tmp/REPORT.md`. Dalga başlar başlamaz `YURUTME.md`'de paket durumu 🔄,
günlüğe "dalga N başladı (paketler, taban commit)".

Beklerken: sonraki dalganın ortak altyapısını hazırla, belgeleri güncelle; ajan sonucunu **tahmin etme**.

## 3. Birleştir ve doğrula

1. Her ajan bitince raporunu oku (`.claude/worktrees/<ajan>/.tmp/REPORT.md`). "Yapamadım" varsa §4.
2. `/parallel-build` §4 ile cherry-pick (`-n`), i18n spec'leri `npm run i18n:add`, çakışma çözümü.
3. Yük < 3 iken **bir kez** `npm run check > .tmp/check.log 2>&1`; hedefli e2e (`xvfb-run -a npx playwright test <spec>`).
4. Kontrol ajanları **tek mesajda, paralel** (yalnız dokunulan alanlar): UI → `ui-reviewer` + `turkish-ui-copy` +
   `screen-auditor` (düzen/pencere değiştiyse); servis/şema → `db-reviewer`; main/preload/server/camera → `security-reviewer`;
   kişisel veri → `privacy-auditor`; her dalga sonunda `decision-auditor` (kapsam: dalganın G/K'ları). Bulguları
   önem ≥ Yüksek olanlar aynı dalgada düzeltme paketi (`<paket>fix`) olur; Orta/Düşük sonraki dalgaya not.
5. Yeşil → tek commit (paketleri satır satır say), push `claude/…` dalına; faz dosyasında kabul kutuları ve Sonuç;
   `YURUTME.md` paket ✅ + günlük satırı + harcama; `DURUM.md` faz satırı.
5a. **Sadeleştirme turu (Ponytail, K-61)** — commit'ten **sonra**, aynı dalgada, tek `feature-builder` (sonnet) ajanı,
   worktree'de: görev metni "`/ponytail lite` ile bu dalganın commit'inde değişen kaynak dosyaları (`git diff --name-only
   <önceki>..HEAD -- src`) sadeleştir; test dosyalarına, migrasyonlara, i18n json'larına, `01-gereksinimler.md`'ye
   dokunma; davranış değişmez; CLAUDE.md kuralları Ponytail'den önce gelir (`.claude/skills/ponytail/SKILL.md` Bismuth
   notu); `npm run check` aynı test sayısıyla yeşil". Diff satır sayısı azalmadıysa ya da herhangi bir test
   değiştiyse/kırıldıysa sadeleştirme **atılır** (worktree silinir), günlüğe "sadeleştirme atlandı: neden" yazılır.
   Başarılıysa ayrı commit `refactor(<kapsam>): simplify wave N changes (ponytail)`; `decision-auditor` koşmaz (davranış
   değişmedi), yalnız `npm run check`. Dalga maliyetine $2–4 eklenir. Bütçe sıradaki dalganın tahmininin altındaysa atlanır.

## 4. Başarısızlıkta yeniden deneme

- Ajan "yapamadım" dediyse ya da check kırmızıysa: aynı worktree'yi **yeni** bir ajana "devam et: <eksik>" diye ver
  (baştan başlatma). Aynı pakette **2. başarısız denemeden** sonra §5.
- Birleştirme çakışması kod dosyasındaysa ana oturum elle çözer; çözülemiyorsa paket ⏸ ve §5.
- Kanca engeli (yasak işlem): işlemi yapma, nedenini günlüğe yaz; yasak gerçekten gerekiyorsa §5.

## 5. Durma koşulları (sahibe sor ve dur)

1. Sahip kararı gereken soru (00-ozet.md listesinde "sahip onayı" işaretli; varsayılanla ilerlemek pahalı ya da geri alınamaz).
2. Aynı pakette 2 başarısız deneme.
3. Kancanın engellediği yasak işlemi gerektiren bir paket.
4. Bütçe: kalan bütçe sıradaki dalganın tahmininin altındaysa ya da toplam harcama planın %80'ini geçtiyse.
5. Gereksinim çelişkisi (G-xx ile paket kartı uyuşmuyor; sessizce yorumlama).
6. Gerçek cihaz/hesap gerektiren adım (otel bilgisayarı, Mac DMG, 21st.dev anahtarı): paketi "sahip onay paketine" yaz, dalganın kalanına devam et; dalga bitince sor.

Durunca: `YURUTME.md` günlüğüne "⏸ durdu: neden", mesaj sonunda `❓ SORULARIM` (numaralı, her soruya önerilen cevap),
tur biter. Sahip cevaplayınca `06-kararlar.md` "Sahip cevapları"na yaz ve §1'den devam et.

## 6. Durum raporu (`/orkestra durum`)

Dalga tablosu (✅/🔄/⬜/⏸), son 5 günlük satırı, harcama toplamı, açık sorular. Kod yazma.
