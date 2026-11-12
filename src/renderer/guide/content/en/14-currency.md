# Exchange rates, weather, special days

The **Exchange rates** screen holds the current rates, the hotel's own rate, a converter, the weather and holiday dates. The **Calendar notes** screen lists holidays, special days and your own notes year by year.

## Rates {#rates}

Open **Money → Exchange rates** in the left menu. There are three tabs: **Exchange rates**, **Weather**, **Holidays**.

![The Exchange rates screen](currency)

- A card for each currency: the current rate, the change since yesterday, the lowest and highest values of the last 7 days. Its source is written as **Market mid rate** or **Hotel rate**.
- With internet, rates refresh by themselves at intervals. To refresh at once, press **Update now**.
- If the **Update online** switch is off, the program never goes on the internet; the last known rates are used. Entering payments and expenses goes on as usual.
- The **CBRT** (Turkish central bank) line is only for comparison; remove it with **Hide CBRT line**.

Every payment and expense is kept with the rate of the minute it was written; even if the rate changes later, its amount does not.

## The hotel rate {#hotel-rate}

If the hotel quotes guests its own fixed rate (for example "1 € = ₺50"):

1. Press **Set hotel rate** on the currency's card.
2. Type the rate in the **TRY for 1 EUR** box (for example 50).
3. Save.

While **Quote guests this rate** is on, the converter, the guest view and new payments and expenses use the hotel rate. To go back to the market rate, press **Back to market rate**. A new rate only applies to records from now on.

## Converter {#converter}

In the **Converter** box type an amount and choose its currency; choose **Convert to**. The result and the amounts in the other currencies appear at once. **Show the guest** opens the result in a form you can show the guest. **Rounding**: **Exact**, **Whole units** or **Nearest 10**.

## Rate sources {#rate-sources}

The **Rate sources** window shows which sources the program takes rates from, in which order, and how each one is doing (**Working**, **Not reached last time**, **Resting 24 hours**). Some sources work with your own free API key; you enter the key here. For most hotels the default setting is enough.

## Weather {#weather}

The **Weather** tab shows the hourly and weekly forecast for the hotel's city; the Today screen has a small weather box too. If the place is wrong, press **Change place** and choose a city or district from the list. If you do not want the weather, switch it off with the switch on the tab.

## Special days and calendar notes {#special-days}

Open **Daily work → Calendar notes** in the left menu. Public holidays and religious holidays are added **by themselves** for every year; you add special days such as fairs, congresses and weddings, and your own notes. These days show in the calendar's heading and on the Today screen; on special days the room type's weekend price is suggested for reservations. Which nights take the weekend price is chosen separately in **Settings → Calendar → Nights charged at the weekend price** (by default Friday and Saturday nights); it does not depend on the highlighted days of the calendar.

![Calendar notes](calendar-notes)

To add a note:

1. Press **Add note**.
2. **Title** (for example "Trade fair") and **Type**: **Public holiday**, **Half-day holiday**, **Special day**, **Event** or **Note**.
3. **Which days**: **One day**, **Date range**, **Days of the week** or **List of dates**.
4. If it repeats every year, tick **Repeat every year**; choose a colour if you like.
5. Save.

To correct or cancel a day, use the buttons on its line; nothing is deleted. Use the arrows to change the year and the buttons at the top (**Holidays**, **Special days**, **Notes**) to filter by type. The days highlighted in the calendar (for example Saturday and Sunday) are set here with **Change**.

> [!tip]
> The dates of religious holidays are calculated and may be one day off the announced date ("Estimated" is shown). Press **Check holiday dates online**, or **Check now** on the **Holidays** tab of the Exchange rates screen; the program reads the announced dates and corrects the days it added itself, without touching days you changed.
