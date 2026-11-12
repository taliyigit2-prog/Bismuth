# Hotel PMS / front-desk feature research

Target: a fully offline desktop app (Windows + macOS) for a 19-room, 5-floor hotel in Istanbul that today runs on Google Sheets (reservation grid, daily ledger, monthly/yearly summaries, staff salary tables). No OTA/channel-manager integration, no e-invoice (fatura), no internet requirement.

Research date: 2026-10-01. Method: WebSearch summaries plus direct fetches of GitHub repositories and SourceForge. Note: most vendor sites (Elektraweb, Sedna, HotelRunner, Cloudbeds help centre, Mews, Oracle docs, hoteldruid.com, mevzuat.gov.tr, lexpera) were blocked by the network proxy, so for those the facts below come from search-engine extracts of the pages, not the pages themselves. Legal numbers (labour law, tax rates, KBS) are consistent across several independent Turkish sources but should be re-verified against the official text before being hard-coded; the plan treats them as **defaults the owner can edit**.

---

## 0. Executive summary

- Every PMS, open-source or commercial, converges on the same skeleton: **Guest profile -> Reservation (one per booking, possibly several rooms) -> Room-night rows (one per room per night, the thing that cannot double-book) -> Folio (the running account) -> Folio lines (charges, discounts, taxes) and Payments (multi-method, multi-currency) -> an immutable close (checkout/invoice) -> an audit log.** The Google-Sheets model collapses reservation, folio and payment into one coloured cell; that is the root of the pitfalls in section 5.
- Second universal layer: **room status (housekeeping) is separate from reservation status**, with explicit Out-of-Order (removed from inventory) vs Out-of-Service (blocked but still counted) and a business date that is "closed" every night.
- Turkish specifics an offline app must at least *store and print*: KBS identity fields (law 1774), the registration card (konaklama belgesi), the VUK md. 240 daily guest list (günlük müşteri listesi), and prices that separate 10% KDV from the 2% konaklama vergisi. None of these need internet; they need the right fields and a printable/exportable list.
- Labour defaults (4857 sayılı İş Kanunu): 45 h/week, max 11 h/day, overtime +50% (fazla çalışma) or +25% (fazla sürelerle çalışma), 270 h/year cap, national holiday worked = +1 daily wage, 24 h weekly rest, annual leave 14/20/26 days by seniority (min 20 if <=18 or >=50), daily wage = monthly/30, hourly = monthly/225.
- Highest-value features the owner has not listed: a proper folio with partial/split payments and deposits; a night "day-close" with cashier shift counts; audit log with mandatory reasons for voids/edits; KBS/registration-card data capture and printable daily lists; guest history + repeat-guest recognition; waitlist/overbooking guard; OOO/OOS room blocks; shift handover log and lost & found; OTA commission tracking per booking (no integration needed, just a field); automatic verified backups.

---

## 1. Open-source hotel PMS review

### 1.1 QloApps (github.com/Qloapps/QloApps) — the reference open-source PMS

| Item | Finding |
|---|---|
| Popularity | ~14.2k GitHub stars; by far the most-starred open-source hotel system |
| Licence | Core OSL-3.0 (Open Software License); Webkul modules have their own licences; other modules AFL-3.0 |
| Stack | PHP 8.1–8.4, MySQL 5.7–8.4, Apache/Nginx/IIS; derived from PrestaShop 1.6 (web shop paradigm: room type = product, room = stock unit, booking = order) |
| Scope | PMS + booking engine + hotel website; back office at `admin-dev`, modules under `modules/`, REST webservice |
| Demo / docs | demo.qloapps.com (demo@demo.com / demodemo); docs.qloapps.com; forums.qloapps.com |

Feature inventory gathered from README, release notes and add-on pages:
- Room types with per-room-type amenities, images, max occupancy (adults/children/infants); physical rooms (`htl_room_information`: id_product, id_hotel, room_num, comment).
- **Advance / partial payment**: book by paying a configurable % or amount; balance due at check-in (QloApps "Partial Payment Feature").
- **Refund rules**: per rule, payment type, deduction from advance or from total, number of days before arrival; refund requests queue ("Manage Refund Request"), full or partial refund (QloApps "Manage Refund Rules").
- **Advance pricing / feature pricing**: price overrides by date range and weekday (`HotelRoomTypeFeaturePricing` + `...Restriction`), i.e. seasons and weekend pricing.
- **Occupancy-based pricing** add-on: different rates for 1/2/3 adults, children, infants, applicable to room types and to service products.
- **Service products / extras** (`RoomTypeServiceProduct`, `ServiceProductOrderDetail`, `ServiceProductOption`): breakfast, airport transfer etc., can be added or re-priced while editing an order.
- **Housekeeping add-on**: columns for dirty / clean / out-of-order with drag-and-drop status change, printable checklist.
- **Room disable dates** (`HotelRoomDisableDates`) = out-of-order blocks per room with date range and reason; **order restrict dates** (`HotelOrderRestrictDate`) = booking window.
- **Booking status + status history** (`HotelBookingStatus`, `HotelBookingStatusHistory`) = per-booking audit trail of status changes; **booking documents** (`HotelBookingDocument`) = attach ID/passport scans to a booking.
- **Connected rooms** (`HotelConnectedRoom`) for family/adjoining room bookings.
- Taxes per room type, employees with permission profiles, reports/statistics, multi-currency and multi-language inherited from PrestaShop.

Data-model ideas worth copying: `HotelBookingDetail` is effectively one row per room per booking with date_from/date_to, adults/children, room number, check-in/check-out flags and is_refunded — the "room-night" layer. Separate tables for refund rules, feature pricing restrictions and disable dates keep policy out of the reservation row.

UI: PrestaShop-style admin with left menu, "Book Now" screen for front-desk bookings, a reservation calendar, order (folio) page listing room lines + service lines + payments.

### 1.2 HotelDruid (hoteldruid.com, SourceForge)

| Item | Finding |
|---|---|
| Licence | AGPL |
| Stack | PHP; MySQL, PostgreSQL **or SQLite**; web UI, 9 languages |
| Scale | "from B&Bs with a few apartments to hotels with hundreds of rooms" |

Features (SourceForge + vendor pages via search):
- Month table (tape chart) with drag & drop; automatic room assignment by user-defined rules; group bookings.
- **Periods and rates**: the calendar is split into periods (seasons); each rate has a price per period; **default deposit per rate**.
- **Extra costs**: added to the base rate, either *single* (once per stay) or *daily/weekly*; used for cleaning fees, extra beds, special offers; restrictions (min stay etc.) attached to rates.
- Multi-user with groups and privileges; customised documents (receipts, invoices, e-mails, forms) with templates; statistics on occupancy and revenue (comparative); **built-in backup system**; public availability pages; electronic POS.
- Known weakness: thin documentation.

Idea to keep: "single vs daily" extra-cost flag, deposit default per rate plan, and the period/rate matrix which maps directly onto the owner's seasons.

### 1.3 Odoo hotel modules

- **OCA vertical-hotel** (github.com/OCA/vertical-hotel, AGPL-3, Odoo 19): `hotel` (folio and hotel configuration), `hotel_housekeeping`, `hotel_reservation` (reservations + reservation summary board), `hotel_restaurant`, `report_hotel_reservation`, `report_hotel_restaurant`.
- **Serpent CS OdooHotelManagementSystem** (232 stars): entities `hotel.folio`, `hotel.folio.line`, `hotel.room`, `hotel.room.type`, `hotel.reservation`, `hotel.service`, `hotel.housekeeping`; modules `board_frontdesk`, `hotel_pos_restaurant`.
- Model lesson: Odoo cleanly separates **Reservation** (intent: dates, room type, guest, state draft/confirm/done/cancel) from **Folio** (the account opened at check-in, with room lines and service lines that become invoice lines) and uses the generic accounting module for payments. Housekeeping is a task list per room with activity types and inspector sign-off.

### 1.4 Other GitHub projects with transferable ideas

| Repo | Licence / stack | Ideas worth borrowing |
|---|---|---|
| kamalxmax-netizen/open-hotel-pms | MIT; Next.js + Supabase/Postgres | Operations-first design "how a small hotel runs a shift": arrivals/departures/in-house, room diary; guest profiles with **duplicate detection/merge** and an **accompanying-guest model**; night audit with **business-date gating** and no-show handling; **operational logbook** (notes, reminders, archive); deposit tracking as an **event model** (held/applied/refunded/forfeited); **day-use rooms**; **planned room moves**; group check-in wizard; monthly audit; receipts and tax invoice numbering; housekeeping floor stock |
| scan2plate-hub/scan2plate PR #28 (hotel PMS design) | design doc | **Room-night lock rows** keyed `{roomId}__{YYYY-MM-DD}` so two receptionists cannot book the same night; stay = half-open interval `[checkIn, checkOut)`; **folio is mutable, invoice is an immutable snapshot** raised at checkout with a serial number taken inside the same transaction; payments go `PENDING -> settled/failed` and settled payments can never be edited; housekeeping task state machine `DIRTY -> ASSIGNED -> CLEANING -> CLEANED -> INSPECTED -> AVAILABLE` and **room status is derived from the task, never stored twice**; cleaner cannot inspect own work; only a CRITICAL maintenance ticket removes a room from inventory and resolution returns it to DIRTY, never straight to available; audit logs and night audits top-level and immutable |
| harshuDev/hotel-pms PR #9 (night audit) | design doc | `close_business_date()` is one transaction: post each occupied room's nightly charge, close the date, open the next; **refuses if a cashier shift is still open**; unique index "one room charge per room-night" makes retries idempotent; charges carry their own business date; no-show marking deliberately left to a human |
| mvsiyad/Hotel-PMS | not stated | 7 roles (PMS_ADMIN, HOTEL_MANAGER, FRONT_DESK, SUPERVISOR, HOUSEKEEPING, MAINTENANCE, RESTAURANT); room status as a finite-state machine; reservation lifecycle PENDING -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT / CANCELLED; maintenance tickets; full action history |
| kryshandy/hotel_management | not stated; Node + **SQLite** | Tables: accommodation types, rooms, rates, **availability blocks**, reservations, guests, service requests, housekeeping tasks (arrival prep, departure clean, stayover, turndown, inspection, deep clean), **engineering tickets with priority/owner/due date; an unresolved out-of-order ticket automatically removes the room from availability**; 8 roles incl. a read-only *viewer* |
| mehedijaman/hotelio | MIT; Laravel | Conventional CRUD PMS; nothing unusual |
| mrdiep/hotel-management-app | not stated; **Electron + Vue + SQLite** | Proof that a local Electron+SQLite hotel app is a known pattern; no backup story documented |
| XREFS0/masa-hotel-reservation-sqlite, HotinGo (Tkinter) | desktop + SQLite | Availability matrix UI, receipts |

---

## 2. Commercial PMS feature inventories

### 2.1 Vendor notes

- **Cloudbeds**: drag-and-drop calendar, one-click check-in/out, split bookings, folio tools (current guest folios with balance/charges/method), housekeeping board (room condition + front-desk status, assign housekeeper), configurable **automatic night audit** with permission control; night-audit report set: expected check-outs, expected check-ins/no-shows, room rate variance, trial balance, **in-house / police report**; **Deposits Ledger** (advance deposits held as a liability until consumed; consume before refunding to allow partial refunds); payout/commission report for OTAs; multi-currency FAQ.
- **Mews**: timeline (tape chart) with key guest details; housekeeping auto-adjusting to checkouts/arrivals/priority; activity report on when rooms are cleaned and returned to inventory; **guest profile aggregates stay history and total revenue** automatically; RevPAR/ADR, manager, reservation, accounting, bills/invoice summary and occupancy reports; multi-currency; automated invoice reminders. Reservation states (Connector API): Inquired/Optional -> Confirmed -> Started (checked in) -> Processed (checked out) / Canceled.
- **Little Hotelier**: aimed at <20 rooms; calendar with 2-week/1-month views showing reservations, availability, occupancy % and housekeeping status; check-in/out on mobile; payments; performance reports; deposit guidance.
- **Oracle OPERA Cloud**: modules front desk (arrivals, in-house, departures, room assignment, **registration cards**, guest messages), reservations, profiles (VIP, routing instructions), cashiering (postings with detailed history, billing windows), **routing instructions** (send charges by transaction code to another folio window/profile — the general form of "company pays room, guest pays extras"), housekeeping (daily cleaning schedule, task sheets), **Out-of-Order vs Out-of-Service with reason codes and return date/status**, automated night audit, A/R (city ledger), block/group management, extensive report library.
- **eZee Absolute / FrontDesk**: 2-click reservation, group management, housekeeping, one-click night audit, travel agent (commission) accounts, **guest history, ledger accounts**, billing; **audit trails** for transactions, blocked rooms and night audit.
- **Hotelogix**: front desk, housekeeping scheduler with real-time status, guest profiles with preferences/special requests, 100+ built-in reports (reservations, accounting, night audit, folios, housekeeping schedule), **audit trail of every user action**, role-based access.
- **Elektraweb** (Turkey, 28 modules): ön büro (rezervasyon, resepsiyon, housekeeping, fatura, folyo, **emniyet kimlik bildirimi/KBS listesi**), housekeeping panel (oda durumları temiz / kirli / kontrol edilecek / arızalı, görev dağıtımı, minibar girişi, oda hazır bildirimi), reports grouped as Günlük Raporlar (incl. **Official Guest List** = the VUK 240 list, Daily Control Reports), Rezervasyon Raporları (reservation guest list / rooming list), Gelir Raporları, **Forecast** (monthly occupancy chart, room/bed occupancy, arrivals, revenue tabs), Satış & Pazarlama, KBS Raporu under "Resmi Formlar"; CRM "Durum" screen = house status. Elektraweb Mini is their small-hotel edition.
- **Sedna (KOD)**: Antalya-heavy ön büro + muhasebe + stok; folio, **oda blokaj**, reservations, SedEX task module; **revenue records are never physically deleted — deletion is a logical flag and transfers are traceable** (a good rule for the audit log).
- **Hotech**: full ecosystem (CRM, finance, ön büro, cost analysis); generic Turkish PMS checklist from Turkish sources: reservation, room inventory, key management, check-in/out, pricing, graphical room-assignment, dirty/clean management, **günlük döviz kurları**, tadilat/arıza (renovation/fault) management, invoice form design.
- **HotelRunner PMS**: Oda Takvimi (room calendar) where you can change room, complete check-in, mark No-Show and create a reservation without opening the booking; PMS Raporları incl. guests by country (misafir sayısı, geceleme, oran); kasa işlemleri, kat hizmetleri, misafir ilişkileri.

### 2.2 Consolidated standard module list (and relevance for a 19-room offline app)

Legend: **Must** = needed to replace the sheets correctly; **Should** = high value, modest effort; **Nice** = later; **Skip** = not needed without OTA/internet.

| Module | What it contains in commercial PMS | Relevance |
|---|---|---|
| Front desk / tape chart | Rooms as rows, days as columns, bars per stay, colour = status, drag to move/extend, unassigned lane, filters by room type/floor, 7/15/30-day views, legend, today line, OOO hatching | Must (replaces the grid; keep the owner's colour semantics) |
| Reservations | Guest, dates, room(s), adults/children, rate plan, price per night (editable per night), source/channel, notes, status, confirmation number, arrival time, deposit required/paid, cancellation policy | Must |
| Check-in / check-out | Assign room, capture ID (KBS fields), print registration card, settle balance, mark room dirty on checkout, early check-in / late checkout flags and fees | Must |
| Folio and payments | Charges by type (room night, extra, tax, discount, adjustment), payments by method and currency with rate, balance, split folio, voids/refunds linked to original, receipt printing | Must |
| Deposits / advance payments | Deposit due date, held as liability, applied on arrival, refund/forfeit on cancel/no-show | Must |
| Cancellation / no-show policies | Rule per rate plan or channel: free until X days, otherwise charge Y; no-show charge; audit of who applied it | Should |
| Housekeeping board | Room status VD/VC/VI/OD/OC, assign to staff, per-floor list, "checkouts first" ordering, inspection sign-off, minibar entry, DND/refused service | Must (owner asked) |
| Maintenance / work orders | Ticket per room/asset: priority, assignee, due date, photos, status; **preventive schedule** (recurring reminders); OOO blocking | Must (owner asked for reminders) |
| Guest profiles & history | Merge duplicates, nationality, ID data, phone/e-mail, preferences, notes, VIP level, stay count, total spend, last stay, accompanying guests | Should |
| Blacklist / VIP flags | See section 7 | Must (owner asked) |
| Group / multi-room bookings | One booking, many rooms, one master folio or split per room, rooming list | Should |
| Rate plans / seasons / weekend pricing | Periods x rate plan matrix, weekday/weekend, occupancy-based, min-stay, per-night override | Should |
| Extras / services | Breakfast, parking, transfer, luggage, extra bed, pet, late checkout — single vs per-night, posted to folio | Should |
| Night audit / day close | Posts room charges, flags unarrived, locks the day, produces daily report pack | Should (simplified "Gün Sonu") |
| Cashier shift close | Opening float, cash in/out per user and currency, closing count, variance | Should |
| City ledger / A/R | Company or agency accounts paid later, statements, ageing | Nice (Expedia/Ostrovok pay-later bookings could use it) |
| Reports & KPIs | See section 6 | Must |
| Users, roles, audit trail | Role matrix, per-action permissions, who/when/what/why log | Must (owner asked for roles) |
| Lost & found | Item, room, date found, finder, storage place, returned to/when | Nice |
| Shift handover / logbook | Dated notes per shift, open issues, acknowledgements | Should |
| Task management | To-dos assigned to staff with due dates, tied to room/guest | Nice |
| Multi-currency | Price list currency, daily rate table, payment in any currency, fixed rate per transaction | Must (owner asked) |
| Registration card printing | Konaklama belgesi with legal fields and signature line | Must (legal) |
| Channel manager, booking engine, online payments, guest messaging | | Skip |

---

## 3. Turkey-specific legal and operational data to store

### 3.1 KBS — Kimlik Bildirim Sistemi (1774 sayılı Kimlik Bildirme Kanunu)

- Who/what: hotels, motels, pansiyons, holiday villages, apart-hotels and similar must report every guest's identity to the general law-enforcement unit of the area — **Emniyet (police) in urban areas, Jandarma in rural areas** — through the electronic KBS. Istanbul city hotels report to EGM's KBS.
- Timing: the rule is "instant" reporting — the **arrival (giriş) record must be entered on the day the guest starts staying**, and the **departure (çıkış) record when the guest leaves**; forgotten check-outs leave the guest "still in the hotel" in the system and are a frequent inspection finding. Even one-hour/day-use stays must be recorded.
- Penalties: per sources quoting the 2026 revalued fines, 85,437 TL for a first violation, doubling each time (170,874 / 341,748 / 683,496 TL) and licence cancellation at the fourth.
- Fields the KBS screen asks for (consistent across HotelRunner, Homesberg, HMS Otel, Öner Bilişim summaries):
  - **Turkish citizens**: TC kimlik no, ad, soyad, doğum tarihi, giriş tarihi (+ saat), oda numarası, konaklama adresi (the hotel). Several integrations also send anne adı, baba adı, uyruk and çıkış tarihi.
  - **Foreigners**: belge türü (pasaport / kimlik / ikamet), **geçerli belge numarası**, ad, soyad, cinsiyet, doğum tarihi, doğum yeri, uyruk, giriş/çıkış tarihi, oda numarası; practical advice is to also note visa type / entry stamp.
  - Children and accompanying persons are reported as separate persons with the same fields (an "accompanying guest" model as in open-hotel-pms).
- KVKK: the Personal Data Protection Board's principle decision for tourism/hotels says hotels must **stop photocopying ID cards** and destroy previously collected copies; record the identity *fields* instead. So the app should store fields, not images, by default (an optional attachment should be a conscious owner decision with retention rules).
- Minimum app support (no integration): store the fields above on the guest/stay; show an "unreported" flag per arrival/departure; print/export a **KBS list** (Elektraweb has "KBS Listesi" under police lists) of today's arrivals and departures so reception can type them into the KBS site; record "reported at / by" when done.

### 3.2 Registration card (konaklama belgesi / kimlik bildirme belgesi)

Per the Kimlik Bildirme Kanunu application regulation as summarised by Turkish sources, the guest-filled, signed form contains: ad ve soyad, ikametgâh adresi, doğum yeri ve tarihi, meslek, uyruk, beraberindeki eş ve çocuklar, imza — plus the hotel's own fields (oda no, giriş/çıkış tarihi, kişi sayısı, fiyat, ödeme şekli, KVKK aydınlatma/consent line). The app should print this from the reservation at check-in and let the guest sign on paper.

### 3.3 Günlük müşteri listesi (Vergi Usul Kanunu md. 240)

Hotels, motels and pansiyons (including basit usul taxpayers) must keep **serially numbered daily guest lists** laid out by room/bed plan, printed by an authorised printer or notarised, containing the taxpayer's name/title/address, **room numbers with the guest's name, surname and room price**, and the date. Elektraweb's "Official Guest List" report reproduces exactly this (room charge in local currency for rooms occupied on a date). The app should produce a daily "Günlük Müşteri Listesi" view/print (room no, guest, nightly price in TL) that the accountant can transcribe to the official book.

### 3.4 Taxes relevant to pricing only

- **KDV on accommodation (geceleme hizmeti)**: 10% since July 2023 (was 8%).
- **Konaklama vergisi**: 2% on the KDV-exclusive accommodation price; it is **not** part of the KDV base. Example from sources: 15,000 TL net -> 300 TL konaklama vergisi -> 1,500 TL KDV (10%) -> 16,800 TL gross.
- The owner sells gross prices (e.g. 100 EUR). For the accountant, the app can back-compute net = gross / 1.12, KDV = net x 0.10, KV = net x 0.02, or simply report gross and let the accountant work. Make the two rates configurable settings; do not build invoicing.

### 3.5 Other licences/certificates (reminder only)
Turizm işletme belgesi or basit konaklama turizm işletmesi belgesi, fire-safety and elevator inspection certificates — store document name, number, expiry date and attach a reminder (fits the maintenance-reminder module).

### 3.6 Currency
Offline means no TCMB feed: a **daily rate table** (TL per EUR/USD/GBP/RUB, editable, dated, with "who entered") and every payment/charge stores the rate used at posting (section 5).

---

## 4. Turkish labour-law defaults for the pay-rule engine (4857 sayılı İş Kanunu)

All values below are statutory minimums/defaults; the app must expose them as editable parameters because contracts can be more generous and the owner's practice may differ.

| Rule | Default | Source |
|---|---|---|
| Normal weekly hours | 45 h; may be spread unevenly across working days but **max 11 h/day**; 2-month balancing (denkleştirme) window | md. 63 |
| Fazla çalışma (overtime) | hours beyond 45 h/week; paid at hourly wage x **1.5** (+50%) | md. 41/1-2 |
| Fazla sürelerle çalışma | if the contract week is under 45 h, hours between contract hours and 45 h are paid at x **1.25** (+25%) | md. 41/3 |
| Annual overtime cap | **270 h/year**; written worker consent required (consent now taken once, revocable) | md. 41/7-8 |
| Serbest zaman (time off instead of pay) | worker may choose 1 h 30 min off per overtime hour, or 1 h 15 min per "fazla süre" hour, to be used within 6 months without pay cut | md. 41/4-5 |
| Hafta tatili (weekly rest) | at least **24 h uninterrupted rest in every 7 days**; the unworked rest day is paid in full; work on the rest day is treated as overtime (+50%) in practice/Yargıtay | md. 46 |
| Ulusal bayram ve genel tatil (public holidays) | if not worked: normal pay; if worked: **one additional daily wage per day worked** (i.e. 2x) | md. 47 |
| Public holiday list | 1 Jan; 23 Apr; 1 May; 19 May; 15 Jul; 30 Aug; 29 Oct (starts 13:00 on 28 Oct, 1.5 days); Ramazan Bayramı 3.5 days (arife 13:00 + 3 days); Kurban Bayramı 4.5 days (arife 13:00 + 4 days) — religious dates move each year, so keep an editable holiday calendar | 2429 sayılı Kanun md. 1-2 |
| Yıllık ücretli izin (annual leave) | after 1 year of service: 1–5 yrs **14 days**, >5 to <15 yrs **20 days**, >=15 yrs **26 days**; workers aged <=18 or >=50 get at least 20 days | md. 53 |
| Leave counting | weekly rest days and public holidays falling inside the leave are **not** counted as leave days; other paid/unpaid/sick leave cannot be offset against annual leave | md. 56 |
| Leave pay | leave pay is paid **in advance** before the leave starts | md. 57 |
| Daily and hourly wage conventions | monthly salary / **30** = daily wage; monthly / **225** (30 days x 7.5 h) = hourly wage; overtime hour = hourly x 1.5 | common practice in Turkish payroll (Yargıtay) |
| Sample overtime calculation | 30,000 TL gross -> 133.33 TL/h -> 200 TL per overtime hour -> 6 h = 1,200 TL | tahanci.av.tr / pluxee |

Owner's existing conventions and how they map:
- "4 leave days per month" is effectively the weekly rest day (4 x 24 h) rather than statutory annual leave; keep both concepts: **weekly rest days** (default 1/week, worked rest day paid as +50% or banked) and **annual leave balance** (accrued per md. 53, usable after 12 months, paid in advance).
- "Unused leave paid as salary/30 per day" matches the monthly/30 daily-wage convention and is how unused *annual* leave is settled at termination; for unused weekly rest days the legal treatment is overtime pay, so let the owner pick the multiplier (1.0 or 1.5) per rule.
- Avans (advances) are deductions from the next salary; sales commission/prim is additional pay; both should be line items on a monthly payroll sheet with running balances.

Suggested rule-engine parameters: weekly_normal_hours (45), daily_max_hours (11), overtime_multiplier (1.5), extra_hours_multiplier (1.25), overtime_annual_cap (270), holiday_work_extra_days (1.0), rest_day_work_multiplier (1.5), days_in_month_for_daily_wage (30), hours_in_month_for_hourly (225), leave_table [(1,5,14),(5,15,20),(15,99,26)], leave_min_under18_over50 (20), holiday calendar (editable), commission rules (% of upsell, % of walk-in revenue, tiered).

Turkish hotel commission practice (hmsotel "Prim Sistemi", hotelpartner): common defaults are ~10% of the upsell difference, ~10% of breakfast sold at reception in room-only hotels, and monthly pooling of walk-in revenue above a threshold; tiered % by monthly revenue is also used. Model as configurable rules, computed from folio lines tagged with the selling user.

---

## 5. Pitfalls when moving from Excel to software, and how PMSs model them

| Pitfall in the sheets | How a PMS models it |
|---|---|
| **Double booking / overlapping cells** | A unique row per *room x night* (`room_nights(room_id, date)` UNIQUE). Creating or moving a reservation inserts those rows in one transaction; a conflict is refused with the clashing booking shown. Stay is `[check_in, check_out)`: the checkout day is not a night, so same-day turnover is allowed |
| **Partial payments** (cell colour "paid" vs "unpaid" cannot express 40% paid) | Folio balance = sum(charges) − sum(settled payments). Status derived: unpaid / partially paid / paid / overpaid. Colours on the chart come from the derived balance, not a typed flag |
| **Deposits / kapora** | Deposit = payment with purpose "deposit" held against the reservation (liability) until arrival, then applied to the folio; on cancellation it is refunded or forfeited per policy; every transition is an event (held → applied / refunded / forfeited) |
| **Multi-room bookings** | One `reservation` (booker, channel, confirmation no) with many `reservation_rooms`; folios either one master or one per room; rooming list print |
| **Same-day stays / day use** | Reservation type `day_use` with start/end times and its own rate; occupies the room for the day but creates no night row (or one flagged day-use row) so the room can still be sold for that night after cleaning |
| **Early check-in / late check-out** | Flags with time and fee; fee is a folio line (extra), not a price hack; housekeeping board shows "early arrival expected" / "late departure" |
| **Split payments across methods/currencies** | Several `payments` rows per folio: amount, currency, rate to TL on that date, method (cash/card/IBAN), received_by, shift_id. Folio currency is the price-list currency; reporting converts with the stored rate so historical totals never shift when rates change (rate "frozen at time of posting") |
| **Refunds** | Negative payment linked to the original payment id, with reason and approver; never delete the original |
| **No-shows** | Status `no_show` set by a human on the audit screen; policy may post a no-show charge against the deposit; room-nights released |
| **Cancellations** | Status `cancelled` with reason, who, when; nights released; cancellation fee as a charge line if the policy says so |
| **Overbooking** | Default: refuse; optional owner-level override creates an *unassigned* reservation that sits in the tape chart's unassigned lane and shows a red overbook counter until a room is freed (waitlist) |
| **Room change mid-stay** | Room move: closes the old room's remaining night rows at the move date, opens new ones; folio keeps both rate segments; old room becomes dirty; history shows the move (planned moves can be scheduled ahead) |
| **Different price per night inside a stay** | Rate stored **per night row** (`room_nights.rate, currency`), defaulted from the rate plan/season and editable per night; the folio room charge is posted per night (one charge per room-night, unique index) |
| **"Do not sell" blocks** | Out-of-Service block (room still counts in inventory, cannot be sold; reason, date range) vs **Out-of-Order** (removed from inventory and from the occupancy denominator; reason code, expected return date, return status). Housekeeping and maintenance tickets can create these |
| **Overwriting history by editing a cell** | Append-only audit log: who, when, entity, before/after, reason (reason mandatory for voids, refunds, rate cuts, deleting payments, editing closed days). Revenue rows are never physically deleted (logical delete, as Sedna does) |
| **Closed months being changed** | Business date + day close: once a day is closed, its charges/payments are locked; corrections are posted as reversal entries on the current date with a link to the original |
| **Two people editing the sheet** | Single-writer desktop DB with per-user login; the audit log gives attribution even on a shared PC |
| **Statistics computed by hand** | All KPIs derived from room_nights and folio lines, so they stay consistent with the chart |

Reservation state machine used by most PMSs (Apaleo, Mews, mvsiyad): `tentative/option` → `confirmed` → `checked_in` (in-house) → `checked_out`; side exits `cancelled`, `no_show`; optional `waitlist`. Rules: all fields editable while confirmed; once in-house only future nights editable; checked-out/cancelled are read-only except via reversal.

Room status codes (housekeeping vocabulary, setupmyhotel / frontdesko): VC vacant clean, VD vacant dirty, VI/VCI vacant inspected, OC occupied clean, OD occupied dirty, DO due out, SO stayover, DNCO did-not-check-out, OOO out of order, OOS out of service, LO lockout, DND, sleep-out, skipper (left without paying). For 19 rooms a 5-state set (dirty, clean, inspected, occupied-serviced, occupied-unserviced) plus OOO/OOS flags is enough.

---

## 6. Reporting and statistics that small hotels actually use

Definitions (foodnhotelasia, cvent, netsuite, lighthouse):
- **Occupancy %** = rooms sold / rooms available (available excludes OOO rooms) x 100.
- **ADR** = room revenue / rooms sold.
- **RevPAR** = room revenue / rooms available = ADR x occupancy.
- **TRevPAR** = total revenue (rooms + extras) / rooms available.
- **ALOS** (average length of stay) = room nights / number of stays.
- **Lead time** = booking date → arrival date (days); **pickup** = nights booked in the last N days for a future period.
- **Cancellation rate**, **no-show rate** = cancelled / no-show reservations / total.
- **Repeat-guest rate** = stays by guests with >1 stay / all stays.
- **Labour cost %** = payroll (salaries + overtime + commissions + employer cost) / total revenue (industry range 25–35% of operating cost).
- **CPOR** (cost per occupied room) = operating expenses / rooms sold; **OER** = operating expenses / revenue.
- **GOP** = revenue − operating expenses (the owner's monthly P&L).

Daily operational reports (Cloudbeds night-audit set, Elektraweb Günlük Raporlar, OPERA):
arrivals list, departures list, in-house list (konaklayan listesi), house status (occupied / vacant clean / vacant dirty / OOO / expected arrivals and departures), expected check-ins not arrived (no-show candidates), room-rate variance (rate differs from plan), cashier/shift report per user and currency, daily revenue by charge type, **KBS list** (today's arrivals/departures with ID fields), **günlük müşteri listesi** (VUK 240), housekeeping task sheet per floor, maintenance open tickets, guests with unpaid balance (high balance report), VIP/blacklist arrivals.

Monthly/yearly management reports (owner's current sheets plus PMS standards):
occupancy, ADR, RevPAR per month and year with YoY; revenue by **channel** (Airbnb/Booking/Expedia/Ostrovok/Bounce/walk-in/direct) with **commission** and net; revenue by **payment method** (cash/card/IBAN) and by **currency** (native amounts and TL equivalents); **cash vs bank reconciliation** (cash on hand per currency vs ledger; IBAN receipts vs bank statement); expenses by category and vendor; monthly P&L (revenue − expenses − payroll); best weekdays and seasonality (heat-map by weekday/month); ALOS; lead time; cancellation/no-show rates; nationality mix (HotelRunner's misafir sayısı/geceleme/oran by country); top guests by nights and spend; repeat guests; room-level performance (which rooms sell least, OOO days per room); maintenance cost per room; staff cost ratio, overtime hours per employee, leave balances; forecast (occupancy on the books for the next 30/90 days, as in Elektraweb Forecast).

---

## 7. Blacklist (do-not-rent) best practices

From autohost, guestban, hospitalityambassadeurs, NBC coverage of "no-stay lists":
- **Criteria**: objective, conduct-based (non-payment, fraud/chargeback, damage, theft, violence/threats, repeated policy violations, smoking/party damage), never based on protected traits; a written policy on who may add, who reviews, and how long an entry lives.
- **Entry fields**: full name (as on ID), date of birth, nationality, ID/passport number (hashed or masked in lists), phone, e-mail, vehicle plate, photo optional; **reason category + free-text incident summary**; incident date, room, staff involved, evidence references (photos, police report no, chargeback id); added by / approved by; severity (**warn**: allow with manager approval and prepayment; **block**: do not accept); expiry/review date; status (active / expired / removed with reason).
- **Matching**: on reservation creation and at check-in, fuzzy-match name + any of DOB / ID number / phone / e-mail; show a non-dismissable banner with the reason and severity; a "warn" level can be overridden only by manager/owner and the override is logged.
- **Governance**: entries only by manager/owner (or reception proposes, manager approves); periodic review list; KVKK: it is personal data — limit visibility to roles that need it, log every view, keep retention bounded.
- Keep it separate from the VIP/notes field so a VIP flag and a blacklist flag cannot be confused.

---

## 8. Backup, restore and data safety for a local-only app

- Store everything in a single **SQLite** file in the app-data directory (WAL mode); it is the de-facto choice for Electron/Tauri offline apps (dev.to Tauri+SQLite article, mrdiep, kryshandy).
- **Consistent snapshots** while the app runs: use the SQLite online backup API or `VACUUM INTO 'file'` (single file, no -wal, compacted). Never copy the raw .db while open.
- **Schedule**: automatic backup on app start, on exit and at a daily time; keep a rotation (e.g. last 10 automatic, 7 daily, 4 weekly, 12 monthly); manual and "safety" backups (taken automatically before any restore or migration) are never pruned.
- **Verify every backup**: `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the copy, checksum (SHA-256) stored next to it, row counts compared to the live DB; show "last verified backup: date" on the dashboard and warn loudly if older than 24 h.
- **3-2-1 rule**: local copy + second medium (USB stick / external disk folder chosen by the owner, with a "copy latest backup to USB" button) + one offsite copy (a cloud-synced folder like Google Drive or OneDrive on the same PC counts and needs no app-side internet code). Optional encryption of the backup file with an owner password.
- **Restore wizard**: list backups with date/size/verified status, take a safety backup first, verify the chosen file, refuse files from a newer app version or that fail integrity, then swap files (remove stale -wal/-shm) and restart.
- **Exports**: CSV/XLSX of every table and of the reports (reservations, ledger, guests, payroll) so the owner is never locked in and the accountant can keep working in Excel; monthly auto-export of the ledger to the backup folder.
- Schema migrations are versioned and run inside a transaction after a safety backup.
- Audit log and closed-day locks (section 5) protect against accidental or malicious edits; the backup history protects against ransomware/hardware loss.

---

## 9. Feature ideas the owner did not mention — ranked by value for a 19-room hotel without OTA integration

Ranking considers: how much it fixes real money/legal exposure, how often it is used daily, and build effort.

1. **Folio per stay with charge lines and multiple payments** (partial, split by method and currency, refunds linked to originals, balance-derived colours). Fixes the single biggest limitation of the colour-cell model.
2. **Deposit (kapora) lifecycle** — requested / received / applied / refunded / forfeited, with due-date reminders for unpaid deposits and an "arrivals without deposit" list.
3. **Audit log with mandatory reason on sensitive actions** (void, refund, rate cut, payment edit, delete, editing a closed day) plus role-based permissions. Combined with "closed day" locking this is the owner's fraud control.
4. **Day close ("Gün Sonu") + cashier shift close** — per-user, per-currency opening float, expected vs counted cash, variance, and a one-page daily report (occupancy, revenue by method/currency, arrivals/departures, unpaid balances). Replaces the hand-made daily ledger total.
5. **KBS fields on every guest + printable KBS list and registration card (konaklama belgesi)**, with an "unreported arrivals/departures" flag. Legal exposure with very high fines; zero integration needed.
6. **Günlük müşteri listesi (VUK 240) print** — room, guest, nightly TL price per day, for the accountant.
7. **Guest profiles with history, duplicate merge, nationality, preferences, VIP flag, stay count and total spend**; recognise repeat guests on booking; accompanying guests as separate persons (needed for KBS anyway).
8. **Out-of-Order / Out-of-Service room blocks** with reason and return date, driven from maintenance tickets; excluded from occupancy denominator.
9. **Preventive-maintenance scheduler** — recurring reminders per asset (boilers, AC filters quarterly, fire extinguishers, elevator inspection, legionella/water tank cleaning, smoke detectors, licence expiries) with completion log; plus ad-hoc work orders with priority/assignee/photos.
10. **Rate plans with seasons, weekday/weekend and per-night override**; price suggestion when creating a booking; extras catalogue (breakfast, transfer, parking, extra bed, late checkout) as single or per-night charges.
11. **Reservation state machine with waitlist and overbooking guard** — tentative/option with expiry, confirmed, in-house, checked-out, cancelled, no-show; unassigned lane on the tape chart; no silent overlaps.
12. **Channel commission tracking without integration** — per booking: channel, channel confirmation no, gross, commission %, net, "paid by channel / paid at hotel", payout received date; report "owed by Booking/Expedia" and net revenue by channel.
13. **Cash vs bank reconciliation screen** — expected cash per currency from the ledger vs counted; IBAN receipts to tick off against the bank statement; unexplained differences flagged.
14. **Shift handover logbook** — dated notes per shift with open items (pending arrivals, complaints, promised callbacks, wake-up calls, OOO rooms), acknowledged by the incoming user; searchable history.
15. **Lost & found register** — item, room, found by, date, storage location, returned/disposed, guest contacted.
16. **Room move and planned move** — move a stay mid-way keeping both rate segments; schedule a move for tomorrow; housekeeping sees it.
17. **Day-use and early/late fees as explicit reservation types/flags** with their own prices, so they stop being colour exceptions.
18. **Payroll sheet generated from rules** — hours/overtime/holiday/rest-day multipliers, advances, commissions from tagged folio lines, leave balances (annual vs weekly rest), unused-leave payout; printable monthly slip per employee.
19. **Forecast / on-the-books view** — occupancy and revenue for the next 30/90 days, pickup over the last 7 days, best weekdays heat-map; year-over-year comparison of the owner's monthly summary.
20. **Verified automatic backups with USB/cloud-folder copy and a restore wizard**; CSV/XLSX export of everything.
21. Housekeeping extras: inspection sign-off, "checkouts first" ordering, minibar posting, DND/refused-service note, linen/amenity consumption counts.
22. Guest-facing printables that need no internet: confirmation letter/PDF, receipt (makbuz) per payment, folio statement, registration card — all with hotel letterhead and multi-language (TR/EN/RU).
23. Document attachments with retention (contract, group rooming list) — but **no ID photocopies by default** (KVKK).
24. Printable "police/in-house report" and nationality statistics (useful for the owner's own marketing decisions).
25. Read-only "viewer" role (for the accountant) and a kiosk/lock screen for the reception PC.

---

## 10. Recommended data model skeleton

```
hotel_settings           (name, address, currency_base=TRY, kdv_rate=10, konaklama_vergisi_rate=2, checkin_time, checkout_time, business_date)
users                    (id, name, role[owner|manager|reception|accountant|viewer], pin/password_hash, active)
audit_log                (id, ts, user_id, entity, entity_id, action, before_json, after_json, reason)   -- append-only

rooms                    (id, number, floor, room_type_id, max_adults, max_children, status_hk[dirty|clean|inspected], notes, active)
room_types               (id, name, base_occupancy, description)
room_blocks              (id, room_id, kind[OOO|OOS], date_from, date_to, reason, maintenance_ticket_id, created_by, returned_at)

rate_plans               (id, name, currency, includes_breakfast, cancel_policy_id, deposit_policy_id)
rate_periods             (id, rate_plan_id, room_type_id, date_from, date_to, weekday_mask, price, extra_adult_price, min_stay)
cancel_policies          (id, name, free_until_days, penalty_type[nights|percent|fixed], penalty_value, no_show_penalty)
deposit_policies         (id, name, kind[none|percent|fixed|first_night], value, due_days_before_arrival)
extras_catalog           (id, name, price, currency, charge_mode[once|per_night|per_person_per_night], tax_rate)

guests                   (id, first_name, last_name, gender, birth_date, birth_place, nationality,
                          id_doc_type[tc|passport|id_card|residence], id_doc_number, tc_kimlik_no,
                          father_name, mother_name, phone, email, address, occupation, language,
                          vip_level, notes, marketing_consent, created_at, merged_into_id)
guest_flags / blacklist  (id, guest_id|null, name, birth_date, id_doc_number, phone, email, plate,
                          severity[warn|block], reason_code, incident_text, incident_date, room_id,
                          evidence_ref, added_by, approved_by, added_at, review_at, expires_at, status)

reservations             (id, code, booker_guest_id, channel[airbnb|booking|expedia|ostrovok|bounce|walkin|direct|agency],
                          channel_ref, status[tentative|confirmed|in_house|checked_out|cancelled|no_show|waitlist],
                          kind[overnight|day_use], created_at, created_by, arrival_time, option_expires_at,
                          rate_plan_id, cancel_policy_id, deposit_policy_id, notes, group_id,
                          commission_pct, channel_pays[bool], cancelled_at, cancel_reason)
reservation_rooms        (id, reservation_id, room_id|null, room_type_id, check_in, check_out, adults, children,
                          folio_id, status, checked_in_at, checked_out_at, early_checkin, late_checkout)
reservation_guests       (reservation_room_id, guest_id, is_primary, kbs_reported_in_at, kbs_reported_out_at, kbs_by)
room_nights              (id, room_id, date, reservation_room_id, rate, currency)      -- UNIQUE(room_id, date)

folios                   (id, reservation_id, reservation_room_id|null, guest_id, currency, status[open|closed], closed_at, closed_by, invoice_no|null)
folio_lines              (id, folio_id, business_date, kind[room_night|extra|discount|tax|penalty|adjustment],
                          description, qty, unit_price, amount, currency, room_night_id|null, extra_id|null,
                          posted_by, voided_by, void_reason, reversal_of_id)
payments                 (id, folio_id|null, reservation_id, business_date, kind[payment|deposit|refund],
                          method[cash|card|iban], amount, currency, fx_rate_to_try, amount_try,
                          received_by, shift_id, reference, deposit_state[held|applied|refunded|forfeited],
                          reversal_of_id, note)
fx_rates                 (date, currency, rate_to_try, entered_by)

cashier_shifts           (id, user_id, opened_at, closed_at, opening_float_json, expected_json, counted_json, variance_json, notes)
business_days            (date, status[open|closed], closed_at, closed_by, snapshot_json)

housekeeping_tasks       (id, room_id, date, type[departure|stayover|arrival_prep|inspection|deep_clean], assigned_to,
                          status[pending|in_progress|done|inspected], started_at, finished_at, inspected_by, notes)
maintenance_tickets      (id, room_id|null, asset, title, priority, status, reported_by, assigned_to, due_date,
                          created_at, resolved_at, cost, blocks_room[bool], photos)
maintenance_schedules    (id, asset, task, interval[days|weeks|months], last_done, next_due, responsible)
calendar_notes           (id, date, text, scope[hotel|room], room_id, created_by)
shift_log                (id, ts, user_id, text, open_item[bool], acknowledged_by, acknowledged_at)
lost_found               (id, found_at, room_id, description, found_by, storage, status, returned_to, returned_at)

expenses                 (id, date, category_id, vendor, description, amount, currency, fx_rate_to_try, method, paid_by, receipt_ref)
expense_categories       (id, name, parent_id)

employees                (id, name, role, start_date, monthly_salary, currency, weekly_hours, contract_type, birth_date, active)
pay_rules                (id, key, value)        -- weekly_hours=45, overtime_multiplier=1.5, ... (section 4)
holidays                 (date, name, half_day_from)
timesheets               (id, employee_id, date, hours, kind[normal|overtime|rest_day|holiday|leave|absent])
leave_ledger             (id, employee_id, date, kind[annual|weekly_rest|unpaid|sick], days, note)
payroll_runs             (id, employee_id, period, base, overtime_pay, holiday_pay, commission, advances, deductions, net, generated_at, approved_by)
advances                 (id, employee_id, date, amount, repaid_in_payroll_id)
commission_rules         (id, name, basis[upsell|walkin|extras], pct, tiers_json)

backups                  (id, created_at, path, size, sha256, verified[bool], kind[auto|manual|safety])
```

Key invariants to enforce in code: UNIQUE(room_id, date) on room_nights; one `room_night` folio line per room night; settled payments immutable (corrections only via reversal rows); folio_lines/payments on a closed business day are read-only; room status for the tape chart is derived (block > reservation_room status > housekeeping task); blacklist match runs on reservation create and check-in.

---

## 11. Sources

Open source
- QloApps repo: https://github.com/Qloapps/QloApps ; classes list: https://github.com/Qloapps/QloApps/tree/master/modules/hotelreservationsystem/classes ; partial payment: https://qloapps.com/partial-payment-feature-qloapps/ ; refund rules: https://qloapps.com/features/manage-refund-rules/ ; housekeeping: https://qloapps.com/qloapps-housekeeping/ ; occupancy pricing: https://qloapps.com/qloapps-occupancy-based-pricing/ ; 1.7 release: https://forums.qloapps.com/topic/8005/
- HotelDruid: https://sourceforge.net/projects/hoteldruid/ ; https://www.hoteldruid.com/en/extra_costs.html ; https://www.hoteldruid.com/
- OCA vertical-hotel: https://github.com/OCA/vertical-hotel ; Serpent CS: https://github.com/JayVora-SerpentCS/OdooHotelManagementSystem ; Odoo app store module: https://apps.odoo.com/apps/modules/12.0/hotel_reservation
- open-hotel-pms: https://github.com/kamalxmax-netizen/open-hotel-pms ; scan2plate PMS design PR: https://github.com/scan2plate-hub/scan2plate/pull/28 ; night audit PR: https://github.com/harshuDev/hotel-pms/pull/9 ; https://github.com/mvsiyad/Hotel-PMS ; https://github.com/kryshandy/hotel_management ; https://github.com/mehedijaman/hotelio ; https://github.com/mrdiep/hotel-management-app ; GitHub topic: https://github.com/topics/hotel-management-system

Commercial PMS
- Cloudbeds: https://www.cloudbeds.com/property-management-system/ ; night audit reports: https://myfrontdesk.cloudbeds.com/hc/en-us/articles/219104088 ; deposits ledger: https://myfrontdesk.cloudbeds.com/hc/en-us/articles/34261179660571 ; payout/commission report: https://myfrontdesk.cloudbeds.com/hc/en-us/articles/218511937
- Mews: https://www.mews.com/en/property-management-system ; reservation states: https://docs.mews.com/connector-api/operations/reservations ; deposits: https://www.mews.com/en/blog/hotel-deposit
- Little Hotelier: https://www.littlehotelier.com/front-desk-system/
- OPERA: https://www.exploretech.io/en/product/oracle-hospitality-opera-cloud-property-management ; OOO/OOS: https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/out_of_order_service_hsk_ooo.htm ; routing: https://docs.oracle.com/cd/E53547_01/opera_5_04_03_core_help/routing_transactions_2.htm
- eZee: https://hoteltechreport.com/operations/property-management-systems/ezee-frontdesk ; audit trails: https://www.ezeeabsolute.com/features/audit-trail.php
- Hotelogix: https://www.hotelogix.com/blog/hotel-pms-checklist ; https://www.hotelogix.com/products/property-management-system
- Elektraweb: https://www.elektraweb.com/on-buro ; reports: https://kilavuz.elektraweb.com/3.2.-raporlama-islemleri/3.2.1.-guenluek-raporlar-daily-reports ; forecast: https://kilavuz.elektraweb.com/3.2.-raporlama-islemleri/3.2.13.-forecast-raporlari-forecast-reports ; KBS list: https://kilavuz.elektraweb.com/1.oegrenme-birimi-otel-paket-programinda-rezervasyon-ve-resepsiyon-islemleri/1.3.-otel-paket-programinda-resepsiyon-islemleri/1.3.6.-polis-listeleri/1.3.6.1.-kbs-listesi-kbs-list
- Sedna: https://www.kod.com.tr/Product/SednaHotel ; Hotech: https://tr.linkedin.com/company/hotech-softwares ; HotelRunner: https://support.hotelrunner.com/tr/oda-takvimi/ , https://support.hotelrunner.com/tr/pms-raporlari/
- Apaleo statuses: https://apaleo.zendesk.com/hc/en-us/articles/13241740952476-Reservation-Status-in-Apaleo ; tape chart: https://www.rezstream.com/our-blog/14-things-your-hotel-tape-chart-should-do/ , https://support.innroad.com/support/solutions/articles/153000226394-tape-chart-overview
- Room status codes: https://setupmyhotel.com/hotel-staff-training/front-office-training/room-status-terminology-definition-in-hotels-resorts/ ; https://frontdesko.app/hotel-room-status-codes ; OOO vs OOS: https://www.prostay.com/blog/out-of-order-vs-out-of-service-rooms/
- Night audit / cashier: https://www.ezeeabsolute.com/blog/night-audit-in-hotel/ ; https://webrezpro.com/how-does-the-hotel-night-audit-work-and-why-does-it-matter/ ; https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/close_cashier.htm ; https://spendnote.app/cash-drawer-reconciliation
- Group folios / routing: https://blog.hotelogix.com/how-to-split-guest-folio-guest-billing-with-cloud-pms/ ; https://myfrontdesk.cloudbeds.com/hc/en-us/articles/27157673723931-Group-Folios
- Multi-currency: https://en.wubook.net/blog/manage-foreign-transactions-in-the-hotel ; https://connect.protel.net/files/source/pairexthelp/en_US/multi-currency-config.htm
- OTA reconciliation: https://www.phacetlabs.com/glossary/ota-reconciliation ; https://www.smartorder.ai/resources/blog/ota-commission-reconciliation-by-reservation-pms/
- Audit log / controls: https://www.weare934.com/learn/hotel-payment-sop ; https://www.davidbleser.com/blog/hotel-internal-audit-checklist--11-controls-every-gm-should-review ; https://www.hubifi.com/blog/immutable-audit-log-guide
- Shift handover / lost & found: https://oxmaint.com/industries/hospitality/front-desk-shift-handover ; https://miratag.com/en/checklist-templates/hotel-shift-handover-checklist
- Preventive maintenance: https://oxmaint.com/industries/hospitality/complete-hotel-preventive-maintenance-checklist-all-systems ; https://www.getmaintainx.com/blog/hotel-preventive-maintenance-checklist
- Guest profiles: https://www.stayntouch.com/articles/hotel-front-desk-guest-profiles ; https://webrezpro.com/how-to-increase-hotel-guest-retention-a-guide-to-managing-vip-repeat-guests/
- Blacklist: https://www.autohost.ai/blog/blacklist-hotel-guests ; https://guestban.com/do-not-rent-list-software-dnr-database-hotels/ ; https://hospitalityambassadeurs.com/hotel-black-list-undesired-guests/
- KPIs: https://www.foodnhotelasia.com/blog/horeca/hotel-kpis/ ; https://www.cvent.com/en/blog/hospitality/hotel-kpis-deep-dive ; https://www.netsuite.com/portal/resource/articles/business-strategy/hospitality-kpis.shtml ; https://www.mylighthouse.com/resources/blog/hoteliers-essential-guide-revenue-metrics ; labour cost: https://hospitality.institute/bha503/labor-cost-analysis-hotel-management-methods-practices/
- Excel vs PMS: https://qloapps.com/pms-benefits-for-hotels/ ; https://www.hostliopro.com/blog/overbooking-hotel-how-to-prevent ; https://www.bokun.io/creating-a-booking-system-in-excel

Turkey — KBS, registration card, VUK 240, taxes, KVKK
- 1774 sayılı Kimlik Bildirme Kanunu: https://www.lexpera.com.tr/mevzuat/kanunlar/kimlik-bildirme-kanunu-1774 ; yönetmelik: https://kocaeli.pol.tr/kimlik-bildirme-kanununun-uygulanmasina-dair-yonetmelik
- KBS guides: https://hotelrunner.com/tr/blog/teknoloji/kbs-nedir/ ; https://www.hmsotel.com/kbs-kimlik-bildirim-sistemi-ve-egm-entegrasyon-rehberi/ ; https://www.hmsotel.com/kbs-hakkinda-sikca-sorulan-sorular/ ; https://www.homesberg.com/kimlik-bildirim-sistemi-kbs-entegrasyonu/ ; https://www.biltekzaman.com.tr/blog/otel-pansiyon-kimlik-bildirim-zorunlulugu ; https://onerbilisim.com/blog/kimlik-bildirim-sistemi-nedir-kbs/ ; https://otelyonet.com.tr/blog/otel-kbs-bildirimi-nasil-yapilir
- Registration card: https://www.hmsotel.com/konaklama-belgesi-nedir-ne-ise-yarar/ ; https://aykutbakay.com/konaklama-formu-registration-card/
- KVKK ID-copy decision: https://www.kvkk.gov.tr/Icerik/8554/
- VUK md. 240 günlük müşteri listesi: https://www.muhasebetr.com/yazarlarimiz/neseisik/005/ ; https://www.muhasebedersleri.com/ticari-belgeler/gunluk-musteri-listesi.html
- Konaklama vergisi / KDV: https://www.parasut.com/blog/konaklama-vergisi-nedir ; https://www.turizmgazetesi.com/haber/kdv-yuzde-10-a-yukseldi-oteller-yuzde-2-de-konaklama-vergisi-oduyor/85218 ; GİB rehber: https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fonceki-dokumanlar%2FKonaklama_2023.pdf

Turkey — labour law
- 4857 İş Kanunu consolidated: https://www.lexpera.com.tr/mevzuat/kanunlar/is-kanunu-4857 ; md. 41: https://mustafabaysal.com/is-kanununun-41-maddesi-nedir/ , https://www.bienmesse.com/is-kanunu-madde-41-fazla-calisma-ucreti/ , https://www.calismatoplum.org/makale/4857-sayili-is-kanununa-gore-fazla-calisma-ve-fazla-surelerle-calisma ; md. 46: https://kubrayildiz.av.tr/is-kanunu-46-madde-hafta-tatili-ucreti/ ; md. 47: https://www.bienmesse.com/is-kanunu-madde-47-genel-tatil-ucreti/ ; md. 53: https://www.turmob.org.tr/arsiv/mbs/pratikBilgiler/asgari_izin%20s%C3%BCreleri-2023.pdf , https://www.cottgroup.com/tr/blog/calisma-hayati/item/yillik-ucretli-izin-hakkinda-bilmek-istedikleriniz ; md. 56-57: https://www.muhasebetr.com/yazarlarimiz/musacakmakci/063/ , https://www.haberturk.com/ekonomi/is-kanununda-bu-maddeye-dikkat-3901154 ; md. 63: https://www.bienmesse.com/is-kanunu-madde-63-calisma-suresi/
- 2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun: https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2429.pdf ; https://www.isvesosyalguvenlik.com/ulusal-bayram-ve-genel-tatiller-hakkinda-kanun/
- Wage conventions (30 days / 225 hours): https://www.tahanci.av.tr/fazla-mesai-hesaplama/ ; https://www.pluxee.com.tr/blog/fazla-mesai-nasil-hesaplanir-2025-mesai-ucreti-hesaplama/ ; https://mustafabaysal.com/iscinin-bir-saatlik-ucreti-nasil-hesaplanir/
- Hotel commission practice: https://www.hmsotel.com/wiki/prim-sistemi/ ; https://www.hotelpartner.com.tr/blog/otel-gelirinizi-arttirmanin-yollari-upgrade-upselling-ve-cross-selling ; https://piyzi.com/blog/personel-maas-prim-hesaplama/

Backup
- https://github.com/dreadmoreeee/sqlite-backup-check ; https://www.slingacademy.com/article/how-to-ensure-data-integrity-in-sqlite-backups/ ; https://dev.to/hiyoyok/sqlite-in-a-tauri-v2-app-simple-reliable-zero-regrets-391h ; 3-2-1: https://www.backblaze.com/blog/the-3-2-1-backup-strategy/ ; https://ifeeltech.com/blog/321-backup-rule-guide
