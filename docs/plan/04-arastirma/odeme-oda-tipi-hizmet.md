# Research: Payment Methods, Room Types, Sales Channels & Extra Services
_For the offline desktop hotel app (first user: 19-room hotel, Istanbul; designed for any small/medium hotel). UI: Turkish first, English second._
_Date: 2026-10-01. Method: web search summaries + vendor docs. Note: several primary pages (partner.booking.com, developers.booking.com, docs.oracle.com, myfrontdesk.cloudbeds.com, help/community.mews.com, bedinroom, setupmyhotel, turizmebakis) were blocked by the network egress proxy; facts from them come via search-engine snippets and secondary write-ups and are marked "verify" where precision matters._

Conventions used in the seed tables:
- `code` = stable machine key (snake_case, never translated).
- `tr_name` / `en_name` = display labels (editable by the owner).
- `group` = grouping key for the settings UI.
- `default_enabled` = `Y` shipped ON for a fresh hotel; `N` shipped OFF but one click to enable. Every list must also allow **custom entries** (`is_custom = true`).

---

## PART A — PAYMENT METHODS, PAYMENT TERMS & SALES CHANNELS

### A0. Modelling note: four different things get called "payment type"

PMS products mix these up; the app should keep them separate:

| Concept | What it answers | Lives on | Examples |
|---|---|---|---|
| **Payment method** (`payment_method`) | *How* money physically arrived | each payment line | Nakit, Kredi Kartı, Havale, VCC |
| **Payment terms / timing** (`payment_terms`) | *When* the guest/channel is expected to pay | reservation | Ön ödemeli, Otelde ödeme, Kapora + bakiye, Vadeli (cari) |
| **Payer / collector** (`collected_by`) | *Who* collects from the guest | reservation | Hotel collects, Channel collects (OTA), Agency collects |
| **Transaction kind** (`txn_kind`) | *What* the line is | each payment line | Payment, Refund, Chargeback, Pre-auth, Deposit, Comp adjustment, Transfer to city ledger |

Payment line fields worth storing: `amount`, `currency`, `fx_rate` (to TRY/home currency), `amount_home`, `method_code`, `txn_kind`, `reference` (slip no / IBAN sender / link id / VCC last4), `received_at`, `settled_at` (when it actually hit the bank), `settlement_status` (`in_hand`, `pending_bank`, `receivable`, `settled`, `disputed`), `fee_amount` (POS komisyon, platform fee), `installments` (taksit), `cashier/user`, `drawer/kasa`, `notes`.

Opera uses the same idea: transaction codes typed **P** (payment), **A** (city ledger / AR), **D** (deposit transfer) ([Oracle OPERA transaction codes](https://docs.oracle.com/cd/E53533_01/opera_5_5_1_0_core_help/transaction_codes.htm)). Mews splits `CashPayment`, `CreditCardPayment`, `AlternativePayment`, `InvoicePayment`, `ExternalPayment` ([Mews Connector API](https://docs.mews.com/connector-api/operations/payments)).

### A1. Payment methods — seed table

`group` values: `cash`, `card`, `bank`, `online`, `platform`, `account`, `other`.

| code | tr_name | en_name | group | default_enabled | Cash handling / reconciliation note |
|---|---|---|---|---|---|
| `cash_try` | Nakit (TL) | Cash (TRY) | cash | **Y** | Goes into the physical drawer (kasa). Reconcile with daily cash count (kasa sayımı) and Z-report; refunds come out of the same drawer. Keep per-shift opening/closing balance. |
| `cash_fx` | Nakit Döviz (USD / EUR / GBP …) | Cash – foreign currency (per currency) | cash | N | One sub-drawer per currency; store `currency`, `fx_rate`, `amount_home`. Convert at hotel's daily rate (or TCMB rate). Rate differences = "kur farkı" adjustment line (Mews has an "Exchange rate difference" external payment type). Istanbul hotels commonly take EUR/USD cash. |
| `credit_card_pos` | Kredi Kartı (POS) | Credit card (POS terminal) | card | **Y** | Bank batches at day-end (gün sonu); net amount lands in bank the next business day(s) minus POS commission and possibly a "bloke" period. Reconcile POS slip totals vs PMS card total per day. Chargeback risk (see A5). Store slip/auth code, last-4, card brand (Visa/MC/Amex/Troy). |
| `debit_card_pos` | Banka Kartı (POS) | Debit card (POS) | card | N | Same flow as credit card but no installments and usually lower commission; most Turkish POS screens don't distinguish — optional separate line only if the bank statement splits them. |
| `contactless_wallet` | Temassız / Mobil Cüzdan (Apple Pay, Google Pay) | Contactless / mobile wallet via POS | card | N | Settles exactly like a card transaction through the same POS batch; keep it only if the owner wants separate statistics. Little Hotelier Pay / Mews Payments list Apple Pay, Google Pay, Samsung Pay as wallet methods. |
| `card_installment` | Kredi Kartı – Taksitli | Credit card – installments (taksit) | card | N | Modifier on a card payment: store `installments` count. Bank pays the hotel either upfront (higher commission) or in instalments depending on the POS agreement. BDDK caps domestic accommodation installments (9–12 months depending on current rule; no installments for foreign hotels) — verify current BDDK table. |
| `card_moto` | Mail Order (Manuel Kart Girişi) | Manual card entry (MOTO / mail order) | card | N | Needed to charge OTA virtual cards and phone bookings; requires a POS/virtual POS with "mail order" enabled. Higher fraud/chargeback exposure; record reference. Elektraweb lists "Mail Order" as a payment setting. |
| `card_preauth` | Provizyon (Ön Otorizasyon) | Pre-authorisation hold | card | N | Not money: a hold on the card limit at check-in (e.g. 2.000 TL), captured partially at check-out and the remainder released. Model as `txn_kind=pre_auth` with later `capture`/`void`. |
| `bank_transfer` | Havale / EFT / FAST | Domestic bank transfer | bank | **Y** | Havale = same bank, instant; EFT = inter-bank, business hours 08:30–17:30; FAST = TCMB instant 7/24 (per-transaction limit 100k–300k TL, raised periodically). Match by sender name + description/reference + amount on the bank statement; mark `pending_bank` until matched. Deduct bank fees if any. |
| `swift` | Yurt Dışı Havale (SWIFT) | International wire (SWIFT) | bank | N | Arrives days later, net of correspondent fees (SHA/OUR/BEN); amount received often differs from amount invoiced → store expected vs received + "banka masrafı" difference. |
| `pay_link` | Ödeme Linki (Sanal POS – iyzico / PayTR / Stripe) | Payment link (virtual POS) | online | N | Hotel sends link by SMS/WhatsApp/e-mail; provider (iyzico, PayTR, Paynet, Stripe) collects and pays out to hotel bank in T+1…T+n days minus commission. Reconcile against provider payout report; store provider transaction id. HotelRunner ("Ödeme Al"), Elektraweb ("Paybylink") and Protel all expose this. |
| `online_booking_engine` | Web Sitesi Online Ödeme | Online payment via own website / booking engine | online | N | Same settlement as pay link (virtual POS). Separate code only for channel statistics. |
| `qr_payment` | Karekod (QR) ile Ödeme (TR Karekod / Banka QR) | QR payment (TR Karekod / bank QR) | online | N | FAST-TR Karekod: guest scans hotel's bank QR, money arrives instantly to the hotel's bank account (limit 250k–300k TL per TCMB rules). Reconcile like a FAST transfer. |
| `papara` | Papara | Papara wallet / QR | online | N | Papara Business account; funds land in the Papara account the same day; commission tiered by volume (e.g. 4% at ≤50k TL/month). Mostly domestic, young guests. |
| `ota_vcc` | OTA Sanal Kart (VCC) | OTA virtual credit card | platform | N | **Money does not exist until you charge the card.** Booking.com VCC, Expedia Virtual Card, Agoda UPC. Requires MOTO-capable POS. Card activates on a platform-defined date (check-in / check-out / booking date), must be charged before expiry (Booking: within 12 months of check-out; Expedia: 180 days; Agoda UPC: ~150 days). Keep as `receivable` until charged, then it becomes a card settlement. Sub-type per platform (`vcc_booking`, `vcc_expedia`, `vcc_agoda`). |
| `ota_payout` | Platform Ödemesi (Havale ile) | OTA payout by bank transfer | platform | N | Platform collected from guest and wires the hotel later (Airbnb ~24 h after check-in released, 3–5 business days to bank; Hostelworld PayNow every 14 days; Booking.com bank-transfer payout where available). One payout covers many reservations and is net of fees → needs a payout-matching screen. |
| `voucher` | Voucher / Hediye Çeki | Prepaid voucher / gift card | other | N | Selling = liability (deferred revenue); redeeming = non-cash settlement line that reduces the liability. Track code, value, expiry, remaining balance. Cloudbeds lists "voucher", Mews has "Gift card". |
| `agency_voucher` | Acente Voucher'ı | Tour-operator voucher | account | N | Guest arrives with voucher; nothing is collected from the guest; amount posts to the agency's cari account (see `city_ledger`). |
| `city_ledger` | Cari Hesap (Vadeli / Faturalı) | Company / agency account (city ledger, pay later) | account | N | Not cash: converts the folio balance into a receivable on a company/agency account ("Krediye Kaldır" in Elektraweb, "City Ledger" in eZee/Opera, "Invoice" external payment in Mews). Hotel issues e-fatura; actual settlement arrives later by transfer and is matched against the account (two-step). Needs ageing report & statement (ekstre). |
| `cheque` | Çek | Cheque | other | N | Rare for hotels in TR; corporate only. Store cheque no, bank, due date (vadeli çek); not cleared until deposited; bounce risk. Mews/Cloudbeds/Opera all keep it. |
| `meal_card` | Yemek Kartı (Multinet / Pluxee / Ticket / Setcard) | Meal card | other | N | Only valid for food & beverage sales (restaurant/cafe), not rooms. Provider settles later minus commission. Elektraweb POS has "Yemek Kartı" as a quick-pay button. |
| `crypto` | Kripto Varlık | Cryptocurrency | other | N (hide in TR) | **Prohibited as a payment means in Turkey** (TCMB regulation, Official Gazette 31456, 16 Apr 2021). Keep the code for other countries; if used, a processor (e.g. BitPay) settles in fiat. |
| `bnpl` | Şimdi Al Sonra Öde | Buy now pay later (Klarna etc.) | online | N | Offered by Cloudbeds Payments (Klarna) in some markets; settles like an online provider payout. Not relevant in TR today. |
| `loyalty_points` | Sadakat Puanı | Loyalty points | other | N | Non-cash settlement; Mews lists "Loyalty points". |
| `barter` | Takas (Barter) | Barter / trade-out | other | N | Non-cash settlement against a supplier/influencer deal; Mews lists "Barter". |
| `complimentary` | Ücretsiz / İkram (Comp) | Complimentary (free of charge) | other | N | Not a payment: a 100% adjustment / zero-rate. Opera uses market code CO (Complimentary) and HS (House Use); Mews has "Complimentary" external payment type. Must still appear in occupancy stats with 0 revenue. |
| `house_use` | Otel Kullanımı | House use | other | N | Staff/owner occupancy; zero revenue, like comp. |
| `bad_debt` | Şüpheli / Tahsil Edilemeyen Alacak | Bad debt write-off | other | N | Closes an uncollectable balance (Mews "Bad debts"). Accounting-only. |
| `other` | Diğer | Other | other | N | Free-text custom; always available. |

**Recommended default seed**: enabled = `cash_try`, `credit_card_pos`, `bank_transfer` (exactly the owner's three: Nakit / Kredi Kartı / İban). Pre-created but disabled = `cash_fx`, `ota_vcc`, `ota_payout`, `pay_link`, `city_ledger`, `card_moto`, `card_installment`, `debit_card_pos`, `contactless_wallet`, `qr_payment`, `papara`, `voucher`, `agency_voucher`, `cheque`, `meal_card`, `complimentary`, `house_use`, `swift`, `other`. Hidden by region flag: `crypto`, `bnpl`, `loyalty_points`, `barter`, `bad_debt`.

Suggested per-method settings: `affects_cash_drawer` (bool), `settlement_lag_days`, `default_fee_pct`, `requires_reference` (bool), `allowed_currencies[]`, `is_receivable` (true for VCC/payout/city ledger), `allow_refund` (bool), `allow_for_fnb_only` (meal card).

### A2. Transaction kinds (per payment line)

| code | tr_name | en_name | note |
|---|---|---|---|
| `payment` | Tahsilat | Payment | normal receipt |
| `deposit` | Kapora / Ön Ödeme | Deposit / prepayment | received before arrival; liability until stay; **kapora** (earnest money, legally forfeitable per policy) vs **ön ödeme** (full prepayment) vs **depozito** (security deposit, refundable) — Turkish sources distinguish all three |
| `deposit_forfeit` | Kapora İradı (No-show / İptal) | Deposit forfeiture | converts deposit to no-show/cancellation revenue |
| `balance` | Bakiye Ödemesi | Balance payment | the remainder at check-in/out |
| `pre_auth` / `capture` / `void` | Provizyon / Provizyon Çekimi / Provizyon İptali | Pre-auth / capture / void | card holds |
| `refund` | İade | Refund | negative line; same method as original where possible (card→card, cash→cash); card refunds take days to reach guest |
| `chargeback` | Ters İbraz (Chargeback) | Chargeback | bank reverses a card payment; add `chargeback_fee`; dispute window typically 120 days from transaction, hotel has 7–21 days to answer with folio, registration card, ID, policy evidence |
| `transfer_to_account` | Cariye Devir | Transfer to city ledger | folio → company/agency receivable |
| `account_settlement` | Cari Tahsilatı | Account settlement | money received against the receivable (usually bank transfer) |
| `fx_difference` | Kur Farkı | Exchange-rate difference | Mews external type |
| `commission` | Komisyon Kesintisi | Commission deducted | platform/POS fee visible on payout |
| `adjustment` | Düzeltme / İndirim | Adjustment / discount | includes complimentary |

### A3. Payment terms (reservation-level) & "pay at hotel vs prepaid"

| code | tr_name | en_name | typical source |
|---|---|---|---|
| `pay_at_hotel` | Otelde Ödeme | Pay at hotel (hotel collect) | walk-in, phone, Booking.com "Hotel Collect", Expedia "Hotel Collect", Hostelworld balance |
| `prepaid_channel` | Platform Tahsil Etti | Prepaid – channel collects | Booking.com Payments (VCC), Expedia Collect (EVC), Agoda Collect (UPC), Airbnb, Hostelworld PayNow, Trip.com prepaid |
| `prepaid_direct` | Ön Ödemeli (Otele) | Prepaid to hotel | pay link / transfer before arrival, non-refundable rates |
| `deposit_then_balance` | Kapora + Bakiye | Deposit then balance | common for direct bookings (e.g. 30% kapora) |
| `on_account` | Cari / Vadeli | Pay later on account (invoiced) | corporate, tour operators, Turkish agencies (Etstur, Jolly…) under contract |
| `complimentary` | Ücretsiz | Complimentary | comp / house use |

Acente2 (Turkish agency software) exposes exactly this spectrum: payment at check-in, X days before check-in, at check-out, X days after check-out, cari hesap, at reservation time, and "customer pays hotel directly, agency receives commission" ([Acente2](https://www.acente2.com/otel-rezervasyon-yazilimi)).

### A4. OTA-collected money: platform-by-platform behaviour

| Platform | Model names | How the hotel gets the money | Timing / constraints | Reconciliation implication |
|---|---|---|---|---|
| **Booking.com** | *Hotel Collect* (guest pays hotel) vs *Payments by Booking.com* / Channel Collect (guest pays Booking) | Virtual Mastercard (VCC) per reservation, charged by hotel through a MOTO-capable POS; bank-transfer payout exists in some countries | Activation policy codes: 3 = check-in date, 1 = check-out date, 2 = when reservation becomes non-refundable, 7 = booking date. Must charge within 12 months of check-out or funds are lost. Commission is invoiced separately (monthly) — VCC loaded with gross reservation amount (verify for your contract) | Reservation shows "paid by guest" but hotel has **no cash** until it charges the VCC → status `receivable`; later matched to a POS batch. Modifications/cancellations change the loaded amount; no-show fees only if policy allows. Sources: [Booking.com Partner Hub VCC](https://partner.booking.com/en-us/help/policies-payments/payment-products/everything-you-need-know-about-virtual-credit-cards), [Zeevou](https://zeevou.com/blog/booking-com-payment-methods-channel-collect-vs-hotel-collect-vcc/), [Cloudbeds/myallocator](https://myallocator.cloudbeds.com/hc/en-us/articles/4408601390875-Booking-com-Virtual-Credit-Card-VCC-Everything-you-need-to-know) |
| **Expedia Group** (Expedia, Hotels.com, Vrbo, Orbitz, ebookers, Travelocity) | *Expedia Collect* vs *Hotel Collect* | Expedia Virtual Card (EVC), single-use, loaded with the **net** rate (Expedia keeps its margin) | Activates on check-in day (static date even if stay moved earlier); charge at/after check-out; must be charged within 180 days of check-out; charge in card's currency for the loaded amount. Modified bookings usually keep the same card number with adjusted amount | Same `receivable` logic; net amount, so no separate commission invoice. Hotel Collect bookings carry the guest's own card → normal card payment. Sources: [Expedia developer docs – virtual cards](https://developers.expediagroup.com/supply/lodging/docs/booking_apis/reservations/learn/evc/), [RateGain](https://rategain.com/blog/streamlining-payments-with-expedia-virtual-card-for-hoteliers/), [Cloudbeds Expedia FAQ](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360047222133-Expedia-FAQ) |
| **Agoda** | *Agoda Collect* (default) vs *Property Collect* (selected countries) | UPC = Unique/Universal Payment Card (virtual Mastercard); or "UPC on ePass" = one single-use card for a **batch** of bookings, valid 24 h | UPC valid ~5 months / deactivated after 150 days; non-refundable bookings chargeable on booking date, others only after check-out | Batch cards mean one card settlement = many reservations → need many-to-one matching. Sources: [Agoda Partner Hub – payment methods](https://partnerhub.agoda.com/what-are-the-different-payment-methods-and-how-do-they-work/), [Agoda UPC](https://agodapropertypartnerhelp.zendesk.com/hc/en-us/articles/360047657393-How-do-I-Charge-a-UPC) |
| **Airbnb** | Guest always pays Airbnb | Payout to bank account / Payoneer / PayPal, net of host service fee | Released ~24 h after check-in; bank 3–5 business days, Payoneer <24 h, PayPal ~1 day; stays ≥28 nights paid monthly | Hotel never touches guest's card. One payout may bundle several reservations. Sources: [Smoobu](https://www.smoobu.com/en/blog/airbnb-payment-options/), [Host Tools](https://hosttools.com/blog/airbnb-rentals/when-does-airbnb-pay-hosts/) |
| **Hostelworld** | Deposit model vs *PayNow* | Guest pays 12–15% deposit to Hostelworld (kept as commission); balance paid at hostel. PayNow (non-refundable): Hostelworld charges 100% and bank-transfers to property every 14 days | — | Deposit bookings = `pay_at_hotel` for the balance only; PayNow = `ota_payout`. Source: [Hostelworld support – how payments work](https://support.hostelworld.com/knowledge/understanding-how-payments-work-on-hostelworld) |
| **Trip.com** | Prepaid (Trip.com collects) and Pay-at-hotel both exist | Per contract: bank-transfer settlement or virtual card | Contract-specific | Treat as `ota_payout` or `ota_vcc` depending on contract |
| **Ostrovok / Emerging Travel Group** | B2B/B2C; pay at hotel or bank transfer under contract / credit limit | Bank transfer per contract | Contract-specific | `pay_at_hotel` or `on_account` |
| **Turkish OTAs / tour operators** (Etstur, Odamax, Jolly, Tatilbudur, Tatilsepeti, Setur, Otelz, Touristica…) | Contract-based; guest arrives with voucher; some also offer pay-at-hotel | Agency pays on account (cari) per contract terms after invoice (e-fatura); or hotel collects at desk | Contract-specific (e.g. 30-day terms) | Model as `on_account` receivable per agency; Otelz is cited as the leading domestic channel for small hotels. Source: [HotelRunner – Türk OTA'ları](https://hotelrunner.com/tr/blog/satis-pazarlama/turk-online-seyahat-acenteleri-1/) |

Design consequence: a reservation needs `collected_by` + `expected_settlement_method` + `expected_settlement_date`, and the money screen needs a **"Beklenen Tahsilatlar / Receivables"** list (VCCs not yet charged, payouts not yet received, cari balances) separate from the cash drawer.

### A5. Refunds, chargebacks, split payments, deposits — modelling rules

- **Split payments / split tender**: a folio may have N payment lines of different methods and currencies (e.g. 100 EUR cash + rest by card). Also **split folios** (room to company account, extras to guest card) — Opera/Mews/Hotelogix all support routing rules. Store `payer` (guest, company, agency) per line.
- **Refunds**: negative line referencing the original payment; prefer the original method (card refund to same card; cash refund from drawer; transfer refund by transfer with IBAN). Record `refund_reason`.
- **Chargebacks**: separate `txn_kind`, with fee, dispute deadline and evidence attachments (registration card, ID copy, signed policy). Keep both the original payment and the chargeback visible.
- **Deposits**: liability until arrival; applied to folio at check-in; forfeited on no-show/late cancellation per policy → `deposit_forfeit` revenue.
- **Pre-auth (provizyon)**: never counted as money; show as "hold" on the folio with expiry.
- **Complimentary**: zero-rate or 100% discount line; occupancy counted, revenue 0; reason required.
- **Currency**: every line stores `currency` + `fx_rate` + `amount_home`; cash drawers are per currency.

### A6. How other PMSs label payment types (for familiarity)

| PMS | Payment types / labels | Source |
|---|---|---|
| **Cloudbeds** | Credit card (with brand), Bank transfer, Check, Cash, Voucher; via Cloudbeds Payments: Pay by Link, Tap to Pay, terminal, manual entry, PayPal, Klarna BNPL | [Cloudbeds – add payment](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/217997388-Add-reservation-payments-as-a-record), [Cloudbeds Payments](https://www.cloudbeds.com/payments/) |
| **Mews** | Card (online / terminal), Cash, External payment types: Bad debts, Bacs, Wire transfer, Invoice, Exchange rate difference, Complimentary, Reseller, Exchange rounding difference, Barter, Commission, Bank charges, Cross settlement, Cash, Prepayment, Cheque, Bancontact, Gift card, Loyalty points, Chèque-Vacances; wallets Apple/Google/Samsung Pay, iDeal, SEPA DD | [Mews – take a payment](https://help.mews.com/s/article/take-a-payment?language=en_US), [Mews Connector API](https://docs.mews.com/connector-api/operations/payments) |
| **Oracle OPERA** | Transaction codes typed P (payment: Cash, Check, each credit-card brand with display code e.g. AX, EFT/bank transfer, TA commission withheld), A (AR / city ledger), D (deposit transfer); market codes CO (Complimentary), HS (House use) | [OPERA transaction codes](https://docs.oracle.com/cd/E53533_01/opera_5_5_1_0_core_help/transaction_codes.htm), [OPERA Cloud market codes](https://docs.oracle.com/en/industries/hospitality/opera-cloud/22.3/ocsuh/t_admin_booking_configuring_marketing_codes.htm) |
| **Little Hotelier** | Credit/debit card, direct debit, bank transfer; Little Hotelier Pay (Stripe) adds Apple Pay, Google Pay, virtual cards; no cheque/PayPal | [Little Hotelier payments](https://www.littlehotelier.com/hotel-payment-processing/) |
| **eZee Absolute** | Master types Cash / Bank / City Ledger; sub-methods (Credit card, Net banking, UPI, wallets…); custom methods allowed; City Ledger → choose company | [eZee – define pay methods](https://yanoljacloudsolution.freshdesk.com/en/support/solutions/articles/9000234658-how-to-define-pay-payment-methods-in-eZee-absolute-) |
| **Elektraweb (TR)** | Folyo ödeme: Krediye Kaldır (→ cari), Nakit, Kredi Kartı, Havale, Paybylink; POS quick-pay: Nakit, Kredi Kartı, Havale, Yemek Kartı, Oda Hesabı, Cari; settings: Kredi Kartı, Havale, Otelde Ödeme, Mail Order; virtual POS links (PayTR etc.) | [Elektraweb kılavuz – Ödeme](https://kilavuz.elektraweb.com/untitled-1/2.1.-otel-paket-programinda-oen-kasa-islemleri/2.1.1.-folyo-islemleri/2.1.1.2.-oedeme), [Elektraweb POS](https://poskilavuz.elektraweb.com/pos-kullanim-rehberi/kullanim), [PayTR sanal POS](https://yardim.elektraweb.com/sanal-pos-baglantilari/paytr-sanal-pos-baglantisi) |
| **Sedna / Acente2 (TR)** | Cari hesap integration, invoice batches; 7 payment-plan modes (see A3) | [Sedna Hotel](https://www.kod.com.tr/Product/SednaHotel), [Acente2](https://www.acente2.com/otel-rezervasyon-yazilimi) |

### A7. Turkish regulatory / tax facts that touch payments (verify yearly)

- **Konaklama vergisi (accommodation tax)**: 2% on the VAT-exclusive accommodation price (and services sold together with the overnight stay inside the facility); not included in the VAT base; declared by the 26th of the following month. A temporary 1% rate is reported for 01.05.2026–31.12.2026 — verify. ([birfatura](https://birfatura.com/konaklama-vergisi-ertelendi-derken/), [hesaplamarehberi](https://hesaplamarehberi.net/vergi/konaklama-vergisi/))
- **KDV on accommodation**: 10%. ([kdvhesaplamalar](https://kdvhesaplamalar.com.tr/oranlari/konaklama-kdv-orani/))
- **Crypto**: cannot be used directly or indirectly for payments (TCMB regulation, 16 Apr 2021). ([TCMB PDF](https://www.tcmb.gov.tr/wps/wcm/connect/6937855a-7c29-4d08-a26e-51ef3273c022/%C3%96demelerde+Kripto+Varl%C4%B1klar%C4%B1n+Kullan%C4%B1lmamas%C4%B1na+Dair+Y%C3%B6netmelik.pdf?MOD=AJPERES))
- **Card installments**: BDDK sector limits; domestic accommodation currently 9 → 12 months per recent updates, none for foreign hotels. ([BDDK](https://www.bddk.org.tr/Mevzuat/DokumanGetir/16), [hesapkurdu](https://www.hesapkurdu.com/kredi-karti/rehber/kredi-kartinda-hangi-harcamalar-taksitlendirilir))
- **FAST / TR Karekod**: instant 7/24; per-transaction limit raised repeatedly (100k → 250k/300k TL). ([hesap.com](https://hesap.com/hesap-defteri/fast-nedir-limiti-ne-kadar), [Garanti BBVA](https://www.garantibbva.com.tr/blog/fast-ile-para-gonderme))
- **Pre-auth** is called **provizyon** in Turkish hotel practice. ([Barboon](https://www.barboon.net/blog/provizyon-ne-demek-otellerde-provizyonun-anlami/), [PayTR](https://www.paytr.com/blog/parayi-cekmeden-garantiye-alin-hizmet-sektorunde-on-provizyon-kullanimi))

### A8. Sales channels / reservation sources — seed table

`group`: `direct`, `ota_global`, `ota_tr`, `wholesale`, `b2b`, `other`. `collect` = default `collected_by` (`hotel`, `channel_vcc`, `channel_payout`, `account`, `mixed`).

| code | tr_name | en_name | group | default_enabled | collect | note |
|---|---|---|---|---|---|---|
| `walk_in` | Walk-in (Kapıdan) | Walk-in | direct | **Y** | hotel | Opera source WK / origin WI; Cloudbeds primary source |
| `phone` | Telefon | Phone | direct | **Y** | hotel | Opera TEL/PH |
| `whatsapp` | WhatsApp / Mesaj | WhatsApp / messaging | direct | **Y** | hotel | very common for Istanbul small hotels |
| `email` | E-posta | E-mail | direct | **Y** | hotel | Cloudbeds "Email bookings" |
| `website` | Web Sitesi / Online Rezervasyon Motoru | Website / booking engine | direct | **Y** | hotel or mixed | Cloudbeds "Website/Booking Engine"; Mews origin "booking engine" |
| `social_media` | Sosyal Medya (Instagram vb.) | Social media | direct | N | hotel | |
| `google` | Google (Free Booking Links / Hotel Ads) | Google Hotels | direct | N | hotel | metasearch feeding the booking engine |
| `repeat_guest` | Tekrar Gelen Misafir | Repeat guest | direct | N | hotel | |
| `referral` | Referans / Tavsiye | Referral | direct | N | hotel | |
| `booking_com` | Booking.com | Booking.com | ota_global | **Y** | mixed (hotel collect or VCC) | |
| `airbnb` | Airbnb | Airbnb | ota_global | **Y** | channel_payout | |
| `expedia` | Expedia (Hotels.com, Vrbo, Orbitz…) | Expedia Group | ota_global | N | mixed (Hotel Collect / EVC) | |
| `hotels_com` | Hotels.com | Hotels.com | ota_global | N | mixed | part of Expedia Group; separate code only for stats |
| `agoda` | Agoda | Agoda | ota_global | N | channel_vcc (UPC) | |
| `trip_com` | Trip.com | Trip.com | ota_global | N | mixed | |
| `ostrovok` | Ostrovok | Ostrovok | ota_global | N | mixed | |
| `hostelworld` | Hostelworld | Hostelworld | ota_global | N | mixed (deposit / PayNow) | |
| `hrs` | HRS | HRS | ota_global | N | mixed | corporate-heavy |
| `etstur` | Etstur | Etstur | ota_tr | N | account | |
| `odamax` | Odamax | Odamax | ota_tr | N | account | Etstur brand |
| `tatilbudur` | Tatilbudur | Tatilbudur | ota_tr | N | account | |
| `tatilsepeti` | Tatilsepeti | Tatilsepeti | ota_tr | N | account | |
| `otelz` | Otelz | Otelz | ota_tr | N | mixed | leading domestic channel for small hotels |
| `jolly` | Jolly | Jolly Tur | ota_tr | N | account | |
| `setur` | Setur | Setur | ota_tr | N | account | |
| `touristica` | Touristica | Touristica | ota_tr | N | account | |
| `hotelbeds` | Hotelbeds / WebBeds (Toptancı) | Wholesaler / bed bank | wholesale | N | account | |
| `tour_operator` | Tur Operatörü / Acente | Tour operator / travel agency | b2b | N | account | generic; create one source per agency if desired |
| `corporate` | Kurumsal Firma | Corporate account | b2b | N | account | Opera market CORP |
| `gds` | GDS (Sabre / Amadeus / Travelport) | GDS | b2b | N | mixed | Opera SAB/APL |
| `group` | Grup Rezervasyonu | Group booking | b2b | N | mixed | |
| `other` | Diğer | Other | other | N | hotel | custom |

Cloudbeds' structure is a good template: **Primary sources** (Walk-in, Phone, Email, Website) vs **Third-party sources** (OTAs, Wholesalers, Travel agents, Corporate clients), each with an active toggle and its own taxes/fees ([Cloudbeds – reservation sources](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/7256818626203-Reservation-Sources-Everything-You-Need-to-Know)). Opera goes further with three axes (Market code, Source code, Origin code) — for a small hotel one `source` plus an optional `segment` (leisure/business/group) is enough.

Per-channel settings worth seeding: `commission_pct`, `default_collected_by`, `default_payment_terms`, `settlement_lag_days`, `color` (for the calendar), `requires_voucher_no`, `external_ref_label` (e.g. "Booking.com rezervasyon no").

---

## PART B — ROOM TYPES CATALOGUE (TR / EN)

### B0. Modelling note

Real room names are **composites**: *Deluxe (tier) Double (occupancy) Sea View (view) with Balcony (feature)*. Seed the vocabulary as **tags in five dimensions** and let the hotel compose a `room_type` from them, with an overridable display name:

`room_type = { base_occupancy_type, tier, view, building_type, features[] }` → auto-name "Deluxe Çift Kişilik Deniz Manzaralı Oda" / "Deluxe Double Sea View Room".

Hotelminder's advice: the lever is naming categories **consistently** across PMS, booking engine and OTA listings, not inventing more of them ([Hotelminder](https://www.hotelminder.com/hotel-room-types-categories-classifications-guide)). Booking.com's extranet requires per room category: name, bed configuration, room size, max occupancy, number of rooms ([Booking.com extranet guide](https://www.elopms.com/blog/how-to-set-up-booking-com-extranet)).

### B1. By occupancy / bed setup (`group = occupancy`)

| code | tr_name | en_name | abbr | default_enabled | note |
|---|---|---|---|---|---|
| `single` | Tek Kişilik Oda | Single Room | SGL | Y | one single bed, 1 guest |
| `double` | Çift Kişilik Oda (Double) | Double Room | DBL | Y | one double/queen/king bed, 2 guests |
| `twin` | İki Ayrı Yataklı Oda (Twin) | Twin Room | TWN | Y | two single beds |
| `double_or_twin` | Çift Kişilik veya Twin Oda | Double or Twin Room | DBL/TWN | Y | Booking.com BCRT 24 "Twin/Double" — flexible setup |
| `triple` | Üç Kişilik Oda | Triple Room | TRP | Y | 3 singles or double + single |
| `quad` | Dört Kişilik Oda | Quadruple Room | QUAD | N | two doubles, or double + 2 singles |
| `king` | King Yataklı Oda | King Room | KNG | N | 180×200 bed |
| `queen` | Queen Yataklı Oda | Queen Room | QN | N | 160×200 bed |
| `double_double` | İki Çift Kişilik Yataklı Oda | Double-Double Room | DD | N | two double beds (US style) |
| `hollywood_twin` | Hollywood Twin (Birleştirilebilir Yataklar) | Hollywood Twin | HT | N | two singles pushed together with one headboard |
| `family` | Aile Odası | Family Room | FAM | Y | 4–6 guests, often 2 rooms or double + bunk |
| `connecting` | Bağlantılı Oda | Connecting Room | CONN | N | internal door between rooms; sell as pair |
| `adjoining` | Bitişik Oda | Adjoining Room | ADJ | N | shared wall, no door |
| `adjacent` | Yakın Odalar | Adjacent Rooms | — | N | same floor/corridor |
| `dormitory` | Yatakhane (Ranzalı) | Dormitory | DORM | N | sold per bed; see B7 |
| `single_use_double` | Tek Kişi Kullanımlı Çift Kişilik Oda | Double for Single Use | DSU / SUD | N | pricing variant rather than a physical type |
| `studio_room` | Stüdyo Oda | Studio Room | STU | N | bed + living + kitchenette in one space |
| `multi_bedroom_2` | İki Yatak Odalı | Two-Bedroom Unit | 2BR | N | |
| `multi_bedroom_3` | Üç Yatak Odalı | Three-Bedroom Unit | 3BR | N | |
| `murphy` | Katlanır Yataklı Oda (Murphy) | Murphy Room | — | N | wall bed, day-use/work layout |

Sources: [RateGain](https://rategain.com/blog/comprehensive-guide-to-the-different-types-of-hotel-rooms/), [HotelTechReport](https://hoteltechreport.com/news/room-type), [setupmyhotel 23 room types](https://setupmyhotel.com/hotel-staff-training/front-office-training/23-room-types-or-types-of-room-in-hotels-resorts/), [eSky TR](https://www.esky.com.tr/seyahat-tavsiyeleri/oteller/otelde-konaklama/otellerde-oda-turleri), [turizmebakis](https://www.turizmebakis.com/otel-oda-tipleri/).

### B2. By category tier (`group = tier`) — ascending

| code | tr_name | en_name | default_enabled | typical size (TR sources) |
|---|---|---|---|---|
| `economy` | Ekonomik Oda | Economy Room | N | smallest, often interior/no view |
| `budget` | Bütçe Oda | Budget Room | N | |
| `basic` | Temel Oda | Basic Room | N | |
| `standard` | Standart Oda | Standard Room | Y | 18–25 m² (bedinroom) |
| `classic` | Klasik Oda | Classic Room | N | marketing synonym of standard |
| `comfort` | Comfort Oda | Comfort Room | N | between standard and superior |
| `superior` | Superior Oda | Superior Room | Y | 25–30 m², 20–30% larger than standard |
| `deluxe` | Deluxe Oda | Deluxe Room | Y | 30–40 m², better view/furnishing |
| `premium` | Premium Oda | Premium Room | N | |
| `premier` | Premier Oda | Premier Room | N | |
| `luxury` | Lüks Oda | Luxury Room | N | |
| `executive` | Executive Oda | Executive Room | N | business amenities, lounge access in big hotels |
| `club` | Club Oda | Club Room | N | club-floor/lounge access |
| `signature` | Signature Oda | Signature Room | N | |
| `grand_deluxe` | Grand Deluxe Oda | Grand Deluxe Room | N | |
| `deluxe_plus` | Deluxe Plus Oda | Deluxe Plus Room | N | common TR marketing suffix ("Plus") |

Sources: [bedinroom TR](https://www.bedinroom.com/tr/blog/otellerdeki-oda-t%C3%BCrleri-aras%C4%B1ndaki-fark-kapsaml%C4%B1-rehberiniz-3492), [Octorate](https://www.octorate.com/types-of-hotel-rooms/), [Leonardo Hotels](https://www.leonardo-hotels.com/blog/hotel-room-types-explained-from-standard-rooms-to-presidential-suites).

### B3. Suites (`group = suite`)

| code | tr_name | en_name | default_enabled | note |
|---|---|---|---|---|
| `junior_suite` | Junior Suit | Junior Suite | Y | 35–50 m², sitting area in same room |
| `suite` | Suit Oda | Suite | Y | separate living room by wall/door (the defining trait) |
| `senior_suite` | Senior Suit | Senior Suite | N | Cappadocia hotels use Junior/Senior/Royal Cave Suite |
| `deluxe_suite` | Deluxe Suit | Deluxe Suite | N | |
| `family_suite` | Aile Suiti | Family Suite | N | 2 bedrooms + living |
| `executive_suite` | Executive Suit | Executive Suite | N | |
| `honeymoon_suite` | Balayı Suiti | Honeymoon Suite | N | |
| `corner_suite` | Köşe Suit | Corner Suite | N | |
| `duplex_suite` | Dubleks Suit | Duplex Suite | N | two floors inside |
| `loft_suite` | Loft Suit | Loft Suite | N | |
| `penthouse` | Çatı Katı Suiti (Penthouse) | Penthouse Suite | N | |
| `terrace_suite` | Teraslı Suit | Terrace Suite | N | |
| `jacuzzi_suite` | Jakuzili Suit | Jacuzzi Suite | N | |
| `garden_suite` | Bahçe Suiti | Garden Suite | N | |
| `pool_suite` | Havuzlu Suit | Pool Suite | N | |
| `spa_suite` | Spa Suit | Spa Suite | N | |
| `studio_suite` | Stüdyo Suit | Studio Suite | N | |
| `one_bedroom_suite` | Bir Yatak Odalı Suit | One-Bedroom Suite | N | |
| `two_bedroom_suite` | İki Yatak Odalı Suit | Two-Bedroom Suite | N | |
| `king_suite` | King Suit | King Suite | N | |
| `grand_suite` | Grand Suit | Grand Suite | N | |
| `ambassador_suite` | Büyükelçi Suiti | Ambassador Suite | N | |
| `royal_suite` | Kral Dairesi | Royal Suite | N | classic décor, "fit for a king" |
| `presidential_suite` | Başkanlık Suiti | Presidential Suite | N | most expensive; living, dining, kitchen |
| `sultan_suite` | Sultan Suiti | Sultan Suite | N | Ottoman-themed Istanbul naming |
| `pasha_suite` | Paşa Suiti | Pasha Suite | N | Ottoman-themed |
| `harem_suite` | Harem Suiti | Harem Suite | N | Ottoman-themed |

Sources: [neredekalinir – suit çeşitleri](https://neredekalinir.com.tr/suit-oda-ne-demek-suit-oda-ozellikleri-ve-cesitleri/), [sevenforlife](https://sevenforlife.com/konaklayabileceginiz-otel-odasi-cesitleri/), [Hoteza](https://hoteza.com/hospitality-tips/guide-room-categories-everything-you-wanted-know-never-wanted-ask), Cappadocia examples: [Kappadoks](https://www.kappadoks.com/en/rooms-suites), [Seki Cave](https://www.sekicavehotel.com/en/room).

### B4. By view / location (`group = view`)

| code | tr_name | en_name | default_enabled | note |
|---|---|---|---|---|
| `sea_view` | Deniz Manzaralı | Sea View | Y | |
| `side_sea_view` | Yan Deniz Manzaralı | Side / Partial Sea View | N | |
| `land_view` | Kara Manzaralı | Land View | N | resort term |
| `garden_view` | Bahçe Manzaralı | Garden View | N | |
| `pool_view` | Havuz Manzaralı | Pool View | N | |
| `city_view` | Şehir Manzaralı | City View | Y | |
| `bosphorus_view` | Boğaz Manzaralı | Bosphorus View | Y (Istanbul) | |
| `golden_horn_view` | Haliç Manzaralı | Golden Horn View | N | Istanbul |
| `hagia_sophia_view` | Ayasofya Manzaralı | Hagia Sophia View | N | Sultanahmet |
| `blue_mosque_view` | Sultanahmet Camii Manzaralı | Blue Mosque View | N | Sultanahmet |
| `marmara_view` | Marmara Manzaralı | Marmara Sea View | N | Istanbul |
| `old_city_view` | Tarihi Yarımada Manzaralı | Old City View | N | Istanbul |
| `panoramic_view` | Panoramik Manzaralı | Panoramic View | N | |
| `mountain_view` | Dağ Manzaralı | Mountain View | N | |
| `lake_view` | Göl Manzaralı | Lake View | N | |
| `river_view` | Nehir Manzaralı | River View | N | |
| `forest_view` | Orman Manzaralı | Forest View | N | |
| `valley_view` | Vadi Manzaralı | Valley View | N | Cappadocia |
| `courtyard_view` | Avlu Manzaralı | Courtyard View | N | |
| `street_view` | Sokak Manzaralı | Street View | N | |
| `no_view` | Manzarasız | No View | N | |
| `interior` | İç Oda (Penceresiz) | Interior Room (No Window) | N | |
| `attic` | Çatı Katı Odası | Attic / Roof Room | N | |
| `top_floor` | Üst Kat | Top Floor | N | |
| `high_floor` | Yüksek Kat | High Floor | N | |
| `mezzanine` | Ara Kat | Mezzanine | N | |
| `ground_floor` | Zemin Kat Odası | Ground Floor Room | N | |
| `basement` | Bodrum Kat Odası | Basement / Lower-Ground Room | N | |
| `beachfront` | Denize Sıfır | Beachfront | N | |

Istanbul naming evidence: [museumpass.istanbul](https://museumpass.istanbul/best-5-star-hotels-in-sultanahmet/), [themostperfectview](https://www.themostperfectview.com/istanbul-hotels-best-views).

### B5. By building / unit type (`group = building`)

| code | tr_name | en_name | default_enabled | note |
|---|---|---|---|---|
| `hotel_room` | Otel Odası | Hotel Room | Y | the default |
| `studio` | Stüdyo | Studio | N | |
| `apartment` | Apart / Daire | Apartment | N | Booking BCRT 1 |
| `aparthotel_unit` | Apart Otel Ünitesi | Aparthotel Unit | N | TR regulation: apart otel ≥10 units with kitchen |
| `holiday_home` | Tatil Evi | Holiday Home | N | Booking BCRT 29 |
| `entire_house` | Müstakil Ev | Entire House | N | Airbnb "entire home" |
| `private_room_in_home` | Ev İçinde Özel Oda | Private Room (in home) | N | Airbnb |
| `shared_room` | Paylaşımlı Oda | Shared Room | N | Airbnb |
| `bungalow` | Bungalov | Bungalow | N | Booking BCRT 27 |
| `villa` | Villa | Villa | N | Booking BCRT 31 |
| `private_pool_villa` | Özel Havuzlu Villa | Private Pool Villa | N | |
| `chalet` | Şale (Dağ Evi) | Chalet | N | Booking BCRT 28 |
| `cabin` | Kulübe / Ahşap Ev | Cabin | N | |
| `tiny_house` | Tiny House | Tiny House | N | |
| `duplex` | Dubleks | Duplex | N | |
| `maisonette` | Mezonet | Maisonette | N | |
| `cottage` | Kır Evi | Cottage | N | |
| `tent` | Çadır | Tent | N | Booking BCRT 33 |
| `glamping_tent` | Glamping Çadırı | Glamping Tent | N | |
| `safari_tent` | Safari Çadırı | Safari Tent | N | Airbnb |
| `yurt` | Otağ / Yurt | Yurt | N | |
| `dome` | Kubbe Ev (Dome) | Dome | N | |
| `a_frame` | A-Frame Ev | A-Frame | N | |
| `treehouse` | Ağaç Ev | Treehouse | N | |
| `cave_room` | Mağara Oda | Cave Room | N | Cappadocia (Deluxe Cave, Cave Suite…) |
| `stone_house` | Taş Ev | Stone House | N | Cappadocia / Aegean |
| `konak` | Konak | Konak (Historic Mansion) | N | TR heritage |
| `yali` | Yalı | Yalı (Bosphorus Waterside Mansion) | N | Istanbul |
| `pansiyon` | Pansiyon | Guesthouse / Pension | N | TR regulation: 3–25 rooms |
| `highland_house` | Yayla Evi | Highland House | N | Black Sea |
| `farm_stay` | Çiftlik Evi | Farm Stay | N | |
| `houseboat` | Yüzen Ev / Tekne | Houseboat / Boat | N | |
| `caravan` | Karavan | Caravan / Camper | N | |
| `mobile_home` | Mobil Ev | Mobile Home | N | Booking BCRT 32 |
| `container_house` | Konteyner Ev | Container House | N | |
| `annex_building` | Ek Bina | Annex | N | |

Sources: Booking.com property/room class codes ([PCT](https://developers.booking.com/connectivity/docs/codes-pct), [BCRT](https://developers.booking.com/connectivity/docs/codes-bcrt)); Airbnb categories (caves, domes, treehouses, tiny homes, yurts, shepherd's huts, houseboats, riads, ryokans…) ([Kosupa](https://en.kosupatravel.com/entry/2025/01/29/stay-in-various-types-of-accommodations-with-airbnb-a-guide-to-different-property-types), [Autorank](https://www.autorank.com/blog/airbnb-categories-the-secret-to-more-bookings-and-how-to-qualify)); TR facility regulation ([mevzuat.gov.tr](https://www.mevzuat.gov.tr/MevzuatMetin/21.5.1134.pdf)).

### B6. By feature / concept (`group = feature`, multi-select tags)

| code | tr_name | en_name | default_enabled |
|---|---|---|---|
| `balcony` | Balkonlu | Balcony | Y |
| `terrace` | Teraslı | Terrace | Y |
| `jacuzzi` | Jakuzili | Jacuzzi | N |
| `bathtub` | Küvetli | Bathtub | N |
| `swim_up` | Swim-up (Havuza Açılan) | Swim-up | N |
| `private_pool` | Özel Havuzlu | Private Pool | N |
| `accessible` | Engelli Erişimine Uygun | Accessible (Disabled-friendly) | Y |
| `pet_friendly` | Evcil Hayvan Kabul Edilen | Pet-friendly | N |
| `smoking` | Sigara İçilebilen | Smoking | N |
| `non_smoking` | Sigara İçilmeyen | Non-smoking | Y |
| `kitchenette` | Mini Mutfaklı | Kitchenette | N |
| `full_kitchen` | Mutfaklı | Full Kitchen | N |
| `day_use` | Günübirlik (Day Use) | Day Use | N |
| `honeymoon` | Balayı Odası | Honeymoon | N |
| `business` | İş (Business) Odası | Business | N |
| `spa` | Spa Odası | Spa Room | N |
| `loft` | Loft | Loft | N |
| `garden_room` | Bahçe Odası / Bahçe Girişli | Garden Room | N |
| `annex` | Ek Bina Odası | Annex Room | N |
| `fireplace` | Şömineli | Fireplace | N |
| `private_hamam` | Hamamlı | Private Hamam | N |
| `sauna` | Saunalı | Sauna | N |
| `rooftop_access` | Çatı Terası Erişimli | Rooftop Access | N |
| `ottoman_style` | Osmanlı Tarzı | Ottoman-style | N |
| `adults_only` | Sadece Yetişkin | Adults Only | N |
| `long_stay` | Uzun Konaklama | Long Stay | N |
| `hypoallergenic` | Alerjen Dostu | Hypoallergenic | N |
| `women_only` | Kadınlara Özel | Women-only | N |
| `workspace` | Çalışma Alanlı | Workspace | N |
| `sea_facing_balcony` | Deniz Manzaralı Balkonlu | Sea-facing Balcony | N |
| `interconnecting_capable` | Bağlanabilir | Can Connect | N |

Turkish terminology confirmed via [turizmebakis](https://www.turizmebakis.com/otel-oda-tipleri/) and [acemiturizmci](http://acemiturizmci.blogspot.com/2017/11/oda-tipleri.html) (bağlantılı oda, engelli odası, yakın odalar, sigara içilmeyen oda).

### B7. Hostel / other (`group = hostel`)

| code | tr_name | en_name | default_enabled | note |
|---|---|---|---|---|
| `bed_in_dorm` | Yatakhanede Yatak | Bed in Dormitory | N | Booking BCRT 26; inventory unit = bed |
| `mixed_dorm` | Karma Yatakhane | Mixed Dorm | N | |
| `female_dorm` | Kadınlara Özel Yatakhane | Female-only Dorm | N | |
| `male_dorm` | Erkeklere Özel Yatakhane | Male-only Dorm | N | |
| `dorm_4` / `dorm_6` / `dorm_8` / `dorm_10plus` | 4 / 6 / 8 / 10+ Yataklı Yatakhane | 4 / 6 / 8 / 10+ Bed Dorm | N | size variants |
| `double_bed_dorm` | Çift Kişilik Yataklı Yatakhane | Double-bed Dorm | N | Hostelworld |
| `capsule` | Kapsül / Pod | Capsule / Pod | N | |
| `private_room_hostel` | Özel Oda (Hostel) | Private Room | N | |
| `private_bunk_room` | Ranzalı Özel Oda | Private Bunk Room | N | |
| `ensuite` | Özel Banyolu | En-suite | N | modifier |
| `shared_bathroom` | Ortak Banyolu | Shared Bathroom | N | modifier |
| `whole_dorm` | Tüm Yatakhane (Özel) | Entire Dorm (private hire) | N | |

Source: [Hostelworld – room types](https://www.hostelworld.com/blog/hostel-room-types/), [St Christopher's](https://support.st-christophers.co.uk/hc/en-us/articles/14536716543261-Room-types-explained).

### B8. Room-type attributes used by PMSs (schema checklist)

From Cloudbeds accommodation types, Booking.com extranet/managing room types, Opera room types, StayNTouch:

| field | type | note |
|---|---|---|
| `code` | string | short code (STD, DLX, JRS…) |
| `name_tr`, `name_en` | string | composed or overridden |
| `description_tr/en` | text | |
| `group/category` | enum | occupancy/tier/suite… (or tags per B0) |
| `max_occupancy` | int | hard cap |
| `max_adults`, `max_children`, `max_infants` | int | Cloudbeds "Max Adults / Max Children" |
| `base_occupancy` (adults included in rate), `children_included` | int | Cloudbeds "Adults included in rate" |
| `bed_configurations[]` | list | {bed_type, count}, with alternates (e.g. 1 King **or** 2 Singles) — Cloudbeds "bed layout" |
| `size_m2` | decimal | Booking requires room size |
| `view` | enum | B4 |
| `floor` / `floors[]` | string | |
| `smoking_policy` | enum | smoking / non-smoking / both |
| `accessible` | bool | |
| `amenities[]` | tags | Wi-Fi, AC, minibar, safe, kettle, TV, hairdryer… (Booking RMA codes) |
| `base_rate` / default rate plan | money | |
| `extra_adult_charge`, `extra_child_charge` (with age bands), `extra_bed_allowed`, `cot_allowed` | money/bool | Cloudbeds extra person fees |
| `unit_count` (number of physical rooms) | int | |
| `rooms[]` | list | physical rooms with number, floor, status, specific view/feature overrides |
| `sort_order`, `color`, `images[]` | | |
| `ota_mapping` | map | Booking.com room id / Airbnb listing id |
| `min_stay`, `max_stay` | int | optional |
| `is_active`, `sell_online` | bool | |

Sources: [Cloudbeds accommodation types](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360038464274-Create-and-manage-your-accommodation-types), [Cloudbeds extra person fees](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/231646927-Base-Rates-and-Availability-Matrix-How-to-Add-Extra-Person-Fees), [Booking.com managing room types](https://developers.booking.com/connectivity/docs/room-type-and-rate-plan-management/managing-room-types), [OPERA room types](https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/room_types.htm), [StayNTouch](https://stayntouch.freshdesk.com/support/solutions/articles/24000046720-how-to-set-up-room-types-and-rooms).

### B9. Bed types (`bed_type` seed) with sizes

| code | tr_name | en_name | width×length (cm) | sleeps | default_enabled |
|---|---|---|---|---|---|
| `single_90` | Tek Kişilik Yatak (90) | Single Bed | 90×190 / 90×200 | 1 | Y |
| `single_100` | Tek Kişilik Yatak (100) | Single Bed (wide) | 100×200 | 1 | N |
| `single_120` | Geniş Tek Kişilik (120) | Small Double / Large Single | 120×200 | 1 | N |
| `double_140` | Çift Kişilik Yatak (140) | Double Bed | 140×190 / 140×200 | 2 | Y |
| `double_150` | Çift Kişilik Yatak (150) | Double Bed (150) | 150×200 | 2 | N |
| `queen_160` | Queen Yatak (160) | Queen Bed | 160×200 | 2 | Y |
| `king_180` | King Yatak (180) | King Bed | 180×200 | 2 | Y |
| `super_king_200` | Super King (200) | Super King Bed | 200×200 | 2 | N |
| `twin_pair` | İkiz Yatak (2×90) | Twin Beds | 2 × 90×190 | 2 | Y |
| `hollywood_twin` | Birleştirilmiş İkiz Yatak | Hollywood Twin (joined) | 2 × 90 joined | 2 | N |
| `sofa_bed` | Çekyat (Kanepe Yatak) | Sofa Bed | varies | 1–2 | Y |
| `bunk_bed` | Ranza | Bunk Bed | 2 × 90×190 stacked | 2 | N |
| `extra_bed` | İlave Yatak (Katlanır) | Extra / Rollaway Bed | ~80×190 | 1 | Y |
| `baby_cot` | Bebek Yatağı (Beşik) | Baby Cot / Crib | 60×120 | 1 infant | Y |
| `floor_mattress` | Yer Yatağı | Floor Mattress / Futon | varies | 1 | N |
| `daybed` | Sedir / Divan | Daybed | varies | 1 | N |
| `murphy_bed` | Duvar Yatağı | Murphy (Wall) Bed | varies | 1–2 | N |
| `water_bed`/`round_bed` | Su Yatağı / Yuvarlak Yatak | Water / Round Bed | — | 2 | N |
| US reference: Twin 99×191, Full 137×191, Queen 152×203, King 193×203, California King 183×213 | | | | | |

Booking.com bed-type bands (OTA RMA codes): Single 90–130 cm, Double 131–150 cm, Large double (Queen) 151–180 cm, Extra-large double (King) 181–210 cm, plus "extra long (>2 m)", bunk bed, sofa bed, futon ([Booking.com RMA codes](https://developers.booking.com/connectivity/docs/codes-rma), [Booking.com bed guide](https://www.booking.com/articles/the-complete-guide-to-hotel-rooms-and-hotel-room-beds.html)). Turkish standard sizes: tek kişilik 90×190, çift kişilik 140×190, Queen 160×200, King 180×200 ([Koçtaş](https://blog.koctas.com.tr/yatak-olculeri-rehberi-en-uygun-yatak-boyutunu-secin/), [Bellona](https://www.bellona.com.tr/blog/icerik/cift-kisilik-yatak-olculeri)).

### B10. Booking.com room-type (BCRT) codes — useful for channel mapping (verify on developers.booking.com; page was blocked)

1 Apartment · 4 Quadruple · 5 Suite · 7 Triple · 8 Twin · 9 Double · 10 Single · 12 Studio · 13 Family · 24 Twin/Double · 25 Dormitory room · 26 Bed in dormitory · 27 Bungalow · 28 Chalet · 29 Holiday home · 31 Villa · 32 Mobile home · 33 Tent. (5 and 24 confirmed in search snippets; others from memory of the same table — verify before hard-coding.)

Booking.com property class types (PCT): hotel, apartment, hostel, motel, resort, bed_and_breakfast, villa, guesthouse, holiday_home, aparthotel, lodge, homestay, country_house, capsule_hotel, campground, inn, ryokan, riad, chalet, holiday_park, tent, love_hotel, pension ([PCT codes](https://developers.booking.com/connectivity/docs/codes-pct)).

---

## PART C — EXTRA / ANCILLARY SERVICES & HOW PMSs MODEL THEM

### C1. Extra services — seed table

`group`: `fnb`, `stay`, `transport`, `comfort`, `family`, `wellness`, `business`, `storage`, `activity`, `fees`, `retail`. `unit`: `per_booking`, `per_night`, `per_person`, `per_person_night`, `per_item`, `per_hour`, `per_day`, `per_bag_day`, `per_kg`, `per_use`.

| code | tr_name | en_name | group | unit | default_enabled | note |
|---|---|---|---|---|---|---|
| `breakfast` | Kahvaltı | Breakfast | fnb | per_person_night | Y | if not included in rate |
| `half_board` | Yarım Pansiyon | Half Board | fnb | per_person_night | N | board supplement |
| `full_board` | Tam Pansiyon | Full Board | fnb | per_person_night | N | |
| `room_service` | Oda Servisi | Room Service | fnb | per_item | N | |
| `minibar` | Minibar | Minibar | fnb | per_item | Y | itemised consumption |
| `restaurant_charge` | Restoran / Kafe Hesabı | Restaurant / Café charge | fnb | per_item | N | "oda hesabına yaz" (charge to room) |
| `welcome_package` | Karşılama Paketi (Şampanya, Meyve, Çiçek) | Welcome package | fnb | per_booking | N | honeymoon/birthday upsell |
| `airport_transfer` | Havalimanı Transferi (IST / SAW) | Airport Transfer | transport | per_booking (per vehicle) | Y | direction, flight no, pax, vehicle |
| `private_transfer` | Özel Transfer | Private transfer (intercity) | transport | per_booking | N | |
| `parking` | Otopark | Parking | transport | per_night | N | |
| `valet` | Vale | Valet | transport | per_use | N | |
| `bike_rental` | Bisiklet Kiralama | Bike Rental | transport | per_day | N | |
| `car_rental_commission` | Araç Kiralama (Aracılık) | Car rental (referral) | transport | per_booking | N | commission income |
| `late_checkout` | Geç Çıkış | Late Check-out | stay | per_booking | Y | tiered by hour |
| `early_checkin` | Erken Giriş | Early Check-in | stay | per_booking | Y | |
| `day_use` | Günübirlik Kullanım | Day Use | stay | per_booking | N | |
| `room_upgrade` | Oda Yükseltme | Room Upgrade | stay | per_night | N | |
| `extra_bed` | İlave Yatak | Extra Bed | family | per_night | Y | |
| `extra_person` | İlave Kişi | Extra Person | family | per_person_night | Y | |
| `baby_cot` | Bebek Yatağı | Baby Cot | family | per_night | Y | often free |
| `child_supplement` | Çocuk Ücreti | Child Supplement | family | per_person_night | N | age bands |
| `babysitting` | Çocuk Bakımı | Babysitting | family | per_hour | N | |
| `pet_fee` | Evcil Hayvan Ücreti | Pet Fee | fees | per_night | N | |
| `cleaning_fee` | Temizlik Ücreti | Cleaning Fee | fees | per_booking | N | apartments |
| `damage_fee` | Hasar Bedeli | Damage Fee | fees | per_item | N | |
| `smoking_fine` | Sigara Cezası | Smoking Penalty | fees | per_item | N | |
| `lost_key` | Kayıp Anahtar / Kart | Lost Key Card | fees | per_item | N | |
| `no_show_fee` | No-show Ücreti | No-show Fee | fees | per_booking | N | |
| `cancellation_fee` | İptal Ücreti | Cancellation Fee | fees | per_booking | N | |
| `city_tax` | Konaklama Vergisi | Accommodation Tax | fees | per_night (%) | Y (TR) | 2% TR; shown separately on folio |
| `laundry` | Çamaşır Yıkama | Laundry | comfort | per_item / per_kg | Y | |
| `ironing` | Ütü | Ironing | comfort | per_item | N | |
| `dry_cleaning` | Kuru Temizleme | Dry Cleaning | comfort | per_item | N | |
| `extra_cleaning` | Ekstra Temizlik | Extra Housekeeping | comfort | per_use | N | |
| `luggage_storage` | Bagaj Emaneti | Luggage Storage | storage | per_bag_day | Y | own service or via platform (C2) |
| `luggage_storage_platform` | Bagaj Emaneti (Bounce vb. Platform) | Luggage storage via platform | storage | per_bag_day | N | money collected by platform → commission receivable |
| `safe_box` | Kasa Kullanımı | Safe Deposit Box | comfort | per_night | N | |
| `wifi_premium` | Premium Wi-Fi | Premium Wi-Fi | business | per_night | N | |
| `printing` | Yazdırma / Fotokopi / Tarama | Printing / Copy / Scan | business | per_item | Y | |
| `meeting_room` | Toplantı Odası | Meeting Room | business | per_hour / per_day | N | |
| `sauna` | Sauna | Sauna | wellness | per_use | N | |
| `hamam` | Hamam | Turkish Bath | wellness | per_use | N | |
| `spa_treatment` | Spa / Masaj | Spa / Massage | wellness | per_item | N | |
| `gym` | Spor Salonu | Gym | wellness | per_use | N | |
| `pool_access` | Havuz Kullanımı | Pool Access (non-guest) | wellness | per_use | N | |
| `tour_sale` | Tur Satışı (Boğaz Turu, Kapadokya vb.) | Tour / Excursion | activity | per_person | Y | often commission-based |
| `museum_pass` | Müze Kart / Müze Bileti | Museum pass / tickets | activity | per_item | N | |
| `transport_card` | İstanbulkart Satışı / Yükleme | Transit card sale / top-up | activity | per_item | N | Istanbul |
| `sim_card` | SIM Kart | SIM card | retail | per_item | N | |
| `shop_item` | Mağaza Ürünü (Su, Atıştırmalık, Hediyelik) | Retail item | retail | per_item | Y | stock-tracked |
| `phone_calls` | Telefon Görüşmesi | Phone Calls | business | per_unit | N | |
| `rollaway_misc` / `other_service` | Diğer Hizmet | Other service | retail | per_item | Y | free-text custom |

Sources: [AxisRooms ancillary services](https://blog.axisrooms.com/hotel-ancillary-services/), [Canary – 12 ancillary ideas](https://www.canarytechnologies.com/post/12-hotel-ancillary-revenue-ideas), [Mews ancillary revenue](https://www.mews.com/en/blog/hotel-ancillary-revenue), [Little Hotelier extras](https://www.littlehotelier.com/online-accommodation-booking-engine/).

### C2. Luggage-storage platforms (owner uses Bounce)

| Platform | Pricing to traveller | Partner ("host") model | Payout to hotel | Notes |
|---|---|---|---|---|
| **Bounce** | per bag per day | Hotel listed as a Bounce location; guest books in app, shows QR at desk; hotel scans QR at drop-off and pick-up | Commission per bag per calendar day (fixed amount or %) paid by Bounce; also 15% referral commission if hotel sends guests to other Bounce spots; $10,000 protection per bag; no setup fee | [Bounce for Hotels](https://bounce.com/partner/hotels), [Store partner agreement](https://bounce.com/legal/store-partner-agreement), [Affiliate](https://bounce.com/ls/affiliates) |
| **Radical Storage** | flat daily rate (~€5/day) | Partners called "Angels"; sign up via Angel application; commission per booking varies by location | Periodic payout | 16,500+ spots, strong in Europe; $3,000 insurance ([Radical](https://radicalstorage.com/travel/best-luggage-storage-apps/), [LinkedIn](https://www.linkedin.com/company/radicalstorage)) |
| **LuggageHero** | hourly with daily cap | Host integration (Guesty/Hostfully); 15% commission on each paid booking; guests get 2 free hours | Automated | [LuggageHero hosts](https://luggagehero.com/blog/luggage-storage-airbnb-hosts-guide/) |
| **Stasher** | flat daily | "StashPoint" host; free to join; commission per bag | Monthly bank transfer | [Stasher – become a host](https://stasher.com/becomeahost) |
| **Nannybag** | flat daily (~€6) | Partner shops/hotels; commission per bag | Periodic | 10,000+ locations, €1,500 insurance ([LuggageWarden](https://luggagewarden.com/compare/nannybag-vs-stasher)) |
| **LUGGit** | pickup/delivery | Property manager referral; 10% guest discount; monthly commission reports | Monthly | [LUGGit](https://luggit.app/partnerships/luggage-storage-for-hotels) |
| **Own service** | hotel sets price (or free for guests) | — | Cash/card at desk | simplest; most small hotels keep it free for in-house guests and charge walk-ins |

Modelling: a platform-collected luggage sale has **zero cash at the desk**; record it as a `standalone_sale` with `collected_by = platform`, `commission_receivable = amount × rate`, plus bag count/day for the later payout match. Non-guest customers need a sale **not tied to a reservation** (see C3).

### C3. How PMSs model extras (folio charge vs standalone sale)

| PMS | Mechanism | Sold without a reservation? |
|---|---|---|
| **Cloudbeds** | *Items & Services* catalogue (name, SKU, code, price, tax, stock) posted to a folio; *Add-ons* exposed in the booking engine; *POS app* posts items to an in-house folio; non-guest retail sales go through a **House Account** (e.g. "Retail Sales") | Yes, via House Account / tap-to-pay ([Cloudbeds products](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/218512067-Products-Everything-You-Need-to-Know), [Sell to non-guests](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/40476575921179-Sell-Retail-Products-to-Non-Guests-through-House-Accounts)) |
| **Mews** | *Products* attached to a service: **Bookable products** (sold with a reservation; charging modes once / per person / per night / per person per night; fixed or relative price e.g. 10% of room) vs **Additional services** (sold with or without a reservation, custom price each time); Mews POS "charge to room" | Yes, via Additional services / POS ([Mews products](https://help.mews.com/s/article/create-or-delete-a-product?language=en_US), [Bookable vs additional](https://community.mews.com/stage-2-preparing-for-go-live-80/bookable-products-vs-additional-services-in-mews-know-the-difference-2484)) |
| **Oracle OPERA** | Revenue *transaction codes* in groups/subgroups (Room, F&B, Minibar, Laundry, Telephone…), packages, posted to Guest ledger / AR; non-resident charges go to **pseudo rooms / posting-master (PM) / house accounts** | Yes, via PM/house account ([OPERA transaction codes](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.4/ocsuh/c_admin_financial_cashiering_about_transaction_codes.htm), [Prostay house accounts](https://www.prostay.com/blog/hotel-house-accounts/)) |
| **Little Hotelier** | *Extras* offered at booking (after room selection, before payment) and via pre-stay upsell e-mails; items like breakfast, parking, late checkout, wine, spa, bike rental | Limited; primarily reservation-attached ([Little Hotelier booking engine](https://www.littlehotelier.com/online-accommodation-booking-engine/)) |
| **eZee Absolute** | *Extra charges* on folio; POS module; city ledger for companies | Via POS |
| **Elektraweb (TR)** | POS *adisyon* closed to Nakit / Kredi Kartı / **Oda Hesabı** (charge to room) / Cari; folio lines in front office | Yes, POS adisyon without room ([Elektraweb POS](https://poskilavuz.elektraweb.com/pos-kullanim-rehberi/kullanim)) |

### C4. Recommendation for this app

- `service_catalog` (seed C1) with `unit`, `price`, `vat_rate`, `subject_to_accommodation_tax` (bool), `group`, `is_stock_item`, `commission_pct` (for tours/platform sales), `active`.
- `folio` belongs to a reservation **or** to a `standalone_sale` (walk-in customer, optional name/phone) **or** to a `house_account` (e.g. "Bounce bagaj", "Restoran dış müşteri").
- `folio_line` = {service_code, qty, unit_price, tax, date, posted_by, note}; room nights are just lines too.
- Payments (Part A) attach to the folio, never directly to the reservation; a folio can be split (guest vs company).
- Daily "Kasa" screen = sum of lines by payment method where `affects_cash_drawer`, plus a separate "Receivables" panel (VCC to charge, platform payouts pending, cari balances, luggage-platform commissions).

---

## SOURCES (all consulted via search; direct fetch blocked where noted)

Payments: [Booking.com VCC](https://partner.booking.com/en-us/help/policies-payments/payment-products/everything-you-need-know-about-virtual-credit-cards) · [Booking.com VCC in PMS](https://partner.booking.com/en-us/help/channel-manager/credit-card/charging-virtual-credit-card-your-property-management-system-or) · [StayNTouch VCC lifecycle](https://www.stayntouch.com/articles/hotel-virtual-card-processing) · [Zeevou Booking.com](https://zeevou.com/blog/booking-com-payment-methods-channel-collect-vs-hotel-collect-vcc/) · [Expedia EVC docs](https://developers.expediagroup.com/supply/lodging/docs/booking_apis/reservations/learn/evc/) · [Cloudbeds Expedia Collect vs Hotel Collect](https://myallocator.cloudbeds.com/hc/en-us/articles/206255357-What-is-the-difference-between-Expedia-Collect-and-Hotel-Collect-bookings) · [Agoda payment methods](https://partnerhub.agoda.com/what-are-the-different-payment-methods-and-how-do-they-work/) · [Agoda UPC on ePass](https://agodapropertypartnerhelp.zendesk.com/hc/en-us/articles/360001082068-How-do-I-get-paid-via-UPC-on-ePass) · [Airbnb payouts (Smoobu)](https://www.smoobu.com/en/blog/airbnb-payment-options/) · [Hostelworld payments](https://support.hostelworld.com/knowledge/understanding-how-payments-work-on-hostelworld) · [Ostrovok](https://corp.ostrovok.ru/) · [Cloudbeds add payment](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/217997388-Add-reservation-payments-as-a-record) · [Cloudbeds Payments](https://www.cloudbeds.com/payments/) · [Mews take a payment](https://help.mews.com/s/article/take-a-payment?language=en_US) · [Mews Connector API payments](https://docs.mews.com/connector-api/operations/payments) · [OPERA transaction codes](https://docs.oracle.com/cd/E53533_01/opera_5_5_1_0_core_help/transaction_codes.htm) · [OPERA Cloud source codes](https://docs.oracle.com/en/industries/hospitality/opera-cloud/23.1/ocsuh/t_admin_booking_configuring_source_codes.htm) · [OPERA Cloud origin codes](https://docs.oracle.com/en/industries/hospitality/opera-cloud/23.1/ocsuh/t_admin_booking_configuring_origin_codes.htm) · [Little Hotelier payments](https://www.littlehotelier.com/hotel-payment-processing/) · [eZee pay methods](https://yanoljacloudsolution.freshdesk.com/en/support/solutions/articles/9000234658-how-to-define-pay-payment-methods-in-eZee-absolute-) · [Elektraweb ödeme](https://kilavuz.elektraweb.com/untitled-1/2.1.-otel-paket-programinda-oen-kasa-islemleri/2.1.1.-folyo-islemleri/2.1.1.2.-oedeme) · [Elektraweb POS](https://poskilavuz.elektraweb.com/pos-kullanim-rehberi/kullanim) · [Acente2](https://www.acente2.com/otel-rezervasyon-yazilimi) · [Sedna Hotel](https://www.kod.com.tr/Product/SednaHotel) · [HotelRunner Ödeme Al](https://hotelrunner.com/tr/blog/teknoloji/guvenli-online-tahsilatta-yeni-donem-odeme-al-butonu/) · [Paynet link ile ödeme](https://www.paynet.com.tr/blog/link-ile-odeme-teknolojisi) · [Papara QR](https://blog.papara.com/paparada-qr-ile-odeme-nasil-alinir/) · [FAST limits](https://hesap.com/hesap-defteri/fast-nedir-limiti-ne-kadar) · [Ödeal havale/EFT/SWIFT](https://odeal.com/blog/para-transferi-nedir/) · [Yemek kartı POS](https://vrest.com.tr/blog/yemek-karti-pos-entegrasyonu-2026) · [TCMB crypto regulation](https://www.alomaliye.com/2021/04/16/odemelerde-kripto-varliklarin-kullanilmamasina-dair-yonetmelik/) · [BDDK installments](https://www.hesapkurdu.com/kredi-karti/rehber/kredi-kartinda-hangi-harcamalar-taksitlendirilir) · [Konaklama vergisi](https://birfatura.com/konaklama-vergisi-ertelendi-derken/) · [Provizyon](https://www.barboon.net/blog/provizyon-ne-demek-otellerde-provizyonun-anlami/) · [Kapora/ön ödeme/depozito](https://www.tatilhatti.com/seyahat-rehberi/odeme-yontemleri-ve-odeme-kosullari) · [Chargebacks (Chargebacks911)](https://chargebacks911.com/hotel-chargebacks/) · [Mews chargebacks](https://www.mews.com/en/blog/hotel-chargebacks-how-to-handle) · [Credit-card reconciliation (Data Plus)](https://dphs.com/hotel-credit-card-reconciliation/) · [Split folios (StayNTouch)](https://www.stayntouch.com/articles/hotel-guest-payment-options) · [Cloudbeds reservation sources](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/7256818626203-Reservation-Sources-Everything-You-Need-to-Know) · [Mews origins](https://help.mews.com/hc/en-us/articles/360001892138-Reservation-report) · [Turkish OTAs (HotelRunner)](https://hotelrunner.com/tr/blog/satis-pazarlama/turk-online-seyahat-acenteleri-1/) · [Turkish OTAs (neredekalinir)](https://neredekalinir.com.tr/en-iyi-otel-bulma-siteleri-populer-konaklama-siteleri-ve-otel-uygulamalari/) · [Google free booking links](https://hoteltechreport.com/news/google-free-booking-links)

Room types: [RateGain](https://rategain.com/blog/comprehensive-guide-to-the-different-types-of-hotel-rooms/) · [HotelTechReport](https://hoteltechreport.com/news/room-type) · [Hotelminder](https://www.hotelminder.com/hotel-room-types-categories-classifications-guide) · [Hoteza](https://hoteza.com/hospitality-tips/guide-room-categories-everything-you-wanted-know-never-wanted-ask) · [Octorate](https://www.octorate.com/types-of-hotel-rooms/) · [setupmyhotel](https://setupmyhotel.com/hotel-staff-training/front-office-training/23-room-types-or-types-of-room-in-hotels-resorts/) · [Booking.com BCRT](https://developers.booking.com/connectivity/docs/codes-bcrt) · [Booking.com PCT](https://developers.booking.com/connectivity/docs/codes-pct) · [Booking.com RMA bed codes](https://developers.booking.com/connectivity/docs/codes-rma) · [Booking.com bed guide](https://www.booking.com/articles/the-complete-guide-to-hotel-rooms-and-hotel-room-beds.html) · [Airbnb categories](https://www.autorank.com/blog/airbnb-categories-the-secret-to-more-bookings-and-how-to-qualify) · [Hostelworld room types](https://www.hostelworld.com/blog/hostel-room-types/) · [bedinroom TR](https://www.bedinroom.com/tr/blog/otellerdeki-oda-t%C3%BCrleri-aras%C4%B1ndaki-fark-kapsaml%C4%B1-rehberiniz-3492) · [eSky TR](https://www.esky.com.tr/seyahat-tavsiyeleri/oteller/otelde-konaklama/otellerde-oda-turleri) · [turizmebakis](https://www.turizmebakis.com/otel-oda-tipleri/) · [neredekalinir suit](https://neredekalinir.com.tr/suit-oda-ne-demek-suit-oda-ozellikleri-ve-cesitleri/) · [acemiturizmci](http://acemiturizmci.blogspot.com/2017/11/oda-tipleri.html) · [Cappadocia: Kappadoks](https://www.kappadoks.com/en/rooms-suites) · [TR facility regulation](https://www.mevzuat.gov.tr/MevzuatMetin/21.5.1134.pdf) · [Koçtaş bed sizes](https://blog.koctas.com.tr/yatak-olculeri-rehberi-en-uygun-yatak-boyutunu-secin/) · [Cloudbeds accommodation types](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360038464274-Create-and-manage-your-accommodation-types) · [StayNTouch room setup](https://stayntouch.freshdesk.com/support/solutions/articles/24000046720-how-to-set-up-room-types-and-rooms)

Services: [Bounce for Hotels](https://bounce.com/partner/hotels) · [Bounce partner agreement](https://bounce.com/legal/store-partner-agreement) · [Stasher host](https://stasher.com/becomeahost) · [LuggageHero hosts](https://luggagehero.com/blog/luggage-storage-airbnb-hosts-guide/) · [Radical Storage apps comparison](https://radicalstorage.com/travel/best-luggage-storage-apps/) · [Valerie & Valise comparison](https://www.valerievalise.com/luggage-storage-apps/) · [Cloudbeds products](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/218512067-Products-Everything-You-Need-to-Know) · [Cloudbeds non-guest sales](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/40476575921179-Sell-Retail-Products-to-Non-Guests-through-House-Accounts) · [Mews bookable vs additional](https://community.mews.com/stage-2-preparing-for-go-live-80/bookable-products-vs-additional-services-in-mews-know-the-difference-2484) · [Prostay house accounts](https://www.prostay.com/blog/hotel-house-accounts/) · [AxisRooms ancillary](https://blog.axisrooms.com/hotel-ancillary-services/) · [Canary ancillary ideas](https://www.canarytechnologies.com/post/12-hotel-ancillary-revenue-ideas)
