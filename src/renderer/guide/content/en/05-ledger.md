# The ledger and expenses

The **Ledger and cash** screen is the hotel's daily income and expense book: the day's payments, expenses, the day summary and the cash drawer. Payments come from reservations, so they are never typed into the ledger again; here you enter expenses, sales that are not rooms and, when needed, reservation payments.

## Opening the ledger {#open-ledger}

Open **Money → Ledger and cash** in the left menu. On the phone it is the **Cash** button of the bottom menu. The screen opens on today.

![Ledger and cash](ledger)

- The **Day** and **Month** buttons switch between the day view and the month view.
- Use the arrows to go to the previous or next day; click the date to pick a day.
- **Order**: lists payments **By method** (Cash, Credit card, IBAN… groups) or **By time**. Your choice is remembered for you.

## The day's payments {#ledger-payments}

In the **Payments** table every payment taken that day is one line: time, room, guest, type (payment, deposit, refund), method, channel, amount, value in the base currency and who recorded it.

- An **x** at the start of a line means the owner or manager has received the money. See [Receiving the money](guide:payments#handover).
- A line marked "No rate" is a foreign-currency payment whose rate was unknown when it was saved; it is left out of the base currency totals. Open the line and type the rate.

## Adding an expense {#add-expense}

Record every amount that leaves the drawer or the bank as an expense: groceries, bills, repairs, stationery…

1. Press **Add expense**.
2. Type the **Description** (for example "Groceries (water, tea, sugar)"). Earlier descriptions are suggested as you type; choosing the same wording keeps the reports on one line.
3. Type the **Amount** and currency.
4. Choose the **Section** (for example General). There may be a separate section for the owner's private expenses (**Owner's expenses**); only the owner sees it. Expenses in this section are **not paid from the drawer**: the owner first takes the cash with **Receive**, then enters the expense from outside the drawer. This way the drawer matches the real cash for every role.
5. Choose the **Method**.
6. If the money came out of the reception drawer, leave **Paid from the drawer** on; it is taken off the cash drawer.
7. If you like, enter product, quantity and unit price under **Product lines**. With products, price changes and "top spending" are followed by product group.
8. Press **Save**.

![Expense window](expense-dialog)

> [!tip]
> For a bulk purchase from a supplier, record the expense with **Enter a purchase** on the **Supplies** screen; product prices are updated too. Salaries and advances come from the **Staff** screen, the laundry invoice from the **Laundry** screen; they show a lock icon in the ledger and are changed on their own screens.

Correct a wrong expense with **Edit** or **Void** from the **Expense actions** button. A voided expense is not deleted; it stays struck through.

## Day summary and day note {#day-summary}

The **Day summary** box shows **Income**, **Expenses** and **Day net** in the base currency. Write anything important about the day in the **Day note** (a cash difference, a day off, an incident) and press **Save** under it.

If there is an expense section or salary payment you may not see, the screen says **Partial view**; the totals are counted only from the lines you see. Staff payments from the drawer (an advance, salary in cash) are drawer movements, so everyone who sees the drawer sees them.

## Month view {#ledger-month}

Press **Month** to see every day of the month on one line: income, expenses and net. **Month totals** are at the top. Click a day and use **Show the day** to switch to it.

## Description list {#expense-dictionary}

The same expense may be written in different ways ("groceries", "Grocery shopping", "GROCERIES"). Open the **Description list** to see the spellings and bring them together with **Rename** or **Merge**. Amounts do not change; only the grouping in the reports is put right.

## Closing the day {#day-closing}

Some hotels close the day every night, so nobody can quietly add records to it afterwards. This is off by default; the hotel owner turns it on in **Settings → Calendar → Day closing**.

1. When it is on, a **Close the day** button appears above the day in the ledger.
2. It asks "Close …?"; confirm.
3. The day is marked as **Closed day**.

Adding or changing a record on a closed day needs permission and a **Reason (closed day)**; every change goes into the audit log. Someone with permission can open the day again with **Reopen day**.
