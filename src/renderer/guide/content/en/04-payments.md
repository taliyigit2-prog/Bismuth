# What to do when you take a payment

Every time you take money from a guest, record the payment in Bismuth **straight away**. A payment is written once; the colour in the calendar, the ledger, the cash drawer and the reports all update by themselves. This section covers taking a payment, paying in foreign currency, deposits, refunds, the cash drawer and receiving the money.

## Taking a payment on a reservation {#take-payment}

The easiest way is to take the payment from the reservation's own panel:

1. Click the reservation in the calendar.
2. Press **Add payment** at the top of the panel.
3. **Type**: **Payment** for a normal payment, **Deposit** for money taken in advance.
4. Type the **Amount** and choose the **currency** in the box next to it (TRY, EUR, USD…).
5. Choose the **Method**: Cash, Credit card, IBAN…
6. If needed, write a **Note** (for example "receipt no. 1234").
7. Press **Save**.

![Payment window](payment-dialog)

After saving, "Payment saved" appears and the colour of the bar in the calendar changes. A payment is spread over the nights in order: the first night counts as paid first. For example, in a 3-night reservation at ₺2,000 a night, a payment of ₺2,000 shows the first night as **Paid** and the other two as **Unpaid**.

The panel's **Money** tab shows **Total charges**, **Paid** and **Balance due**, with the list of all payments.

## Paying in foreign currency and the exchange rate {#currency-payment}

If the guest pays in euros, dollars or another currency, record the amount **in that currency**; do not convert it.

- The window shows a line such as "The rate will be fixed as of 14:32": the payment's value in the base currency is counted with the rate at the minute you save, and **never changes again**. Even if the rate changes the next day, this payment keeps its value.
- Without internet the program uses the last known rate; the line is marked "Last known rate".
- When the rate is known, no rate box appears; the amount is converted at that rate. To use the hotel's own rate, enter it as the **Hotel rate** on the Exchange rates screen.
- Only when no rate at all is known for that currency (the internet never came) does the window show the **Rate: TRY for 1 EUR** box; type the rate by hand (for example 49.25). It is used for that record only.
- If the reservation's account is in another currency (for example a USD payment to a EUR account), the amount is converted through the base currency; without a rate a second rate box appears.

For the hotel rate and rate sources see [Exchange rates](guide:currency).

## Deposits {#deposit}

If money was taken in advance for a reservation (bank transfer, card or cash), record it with the **Deposit** type. Nights with a deposit but not fully paid appear in the **Partly paid / deposit** colour in the calendar, with a deposit icon on the bar.

## Refunds {#refund}

If money was given back to the guest, choose **Refund** as the **Type** in the payment window and type the amount returned. To refund a parked reservation, use **Enter refund** in the park area under the calendar.

## A payment recorded by mistake {#wrong-payment}

Payments are not deleted; they are corrected or voided:

1. Open the **Ledger and cash** screen and choose the day of the payment.
2. Press the **Row actions** button at the end of the line.
3. If the amount or method is wrong, choose **Edit**; if the payment never happened, choose **Void** and write the reason.

A voided line stays struck through and is not counted in any total. Who voided it and why is written in the audit log.

> [!warning]
> If the owner or manager has **received** the money (the line has an "x"), the payment cannot be changed. That handover must be undone in the cash drawer first.

## Extra sales (not the room) {#extra-sale}

If something other than the room was sold (bag storage, transfer, laundry):

1. On the **Ledger and cash** screen press **Add payment**.
2. Choose **Extra sale** in the **For** box.
3. Enter the **Service**, **Quantity** and **Unit price**; choose the guest if you like.
4. Choose the payment method and press **Save**.

You can also enter a reservation's payment from the ledger: choose **For → Reservation** and search by guest name, room or reservation code.

## The cash drawer {#cash-drawer}

The cash drawer button in the top bar shows how much money **should be** in the drawer right now. Click it to open the **Cash drawer**:

- **Should be in the drawer**: cash payments per currency; expenses and advances paid from the drawer are taken off.
- **Not yet received**: cash, card and IBAN totals the owner or manager has not received yet; how many lines are waiting and the date of the oldest.
- **Platforms**: payments from platforms such as Booking and Airbnb this month.
- **Handover history**: who received how much, and when.

![The cash drawer](cash-drawer)

> [!tip]
> At the end of your shift, count the drawer and compare it with "Should be in the drawer". If there is a difference, write it in the ledger's **Day note**.

## Receiving the money {#handover}

The money collected at reception is received by **the owner or the manager**. Card and IBAN lines also count as received once they are compared with the bank statement; an **x** is put on the line (like the x in Excel).

1. Press the cash drawer button in the top bar.
2. Press **Receive**.
3. Choose what you are receiving: **Everything up to today** (cash, IBAN and card), **Cash only**, or the **Selected rows** you marked in the ledger.
4. Compare the **You receive** amount with the money in the drawer; write a note if you like (for example "drawer count matched").
5. Confirm with **Receive**.

To pick single lines in the ledger: on the **Ledger and cash** screen tick the boxes at the start of the lines and press **Mark received**.

If you received by mistake, press **Undo handover** on that entry in the **Handover history** and write the reason. The entry is not deleted; it stays as "Undone".

Only the owner and the manager may receive money; other roles can see the cash drawer but cannot receive.
