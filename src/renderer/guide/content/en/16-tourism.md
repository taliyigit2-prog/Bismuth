# Ministry (tourism) statistics

Between the 1st and the 10th of each month, the previous month's accommodation statistics are entered in the Ministry of Culture and Tourism's panel: **Total arrivals** and **Total nights**, country by country. Bismuth prepares this table in seconds from the Excel file you download from KBS.

## Preparation: downloading the KBS list {#kbs-file}

1. After the month ends, sign in to KBS.
2. Download last month's **"EGM Konaklayan Listesi"** (guest list) Excel file (its name looks like "EGM_Konaklayan_Listesi_…xlsx").
3. Save the file where you can find it on the computer.

Bismuth does not read or keep the names, ID numbers or gender in the file; it only counts nationalities and arrival and departure days.

## Preparing the table {#tourism-steps}

Open **Reports → Tourism statistics** in the left menu. Between the 1st and the 10th you can also come here from the reminder on the Today screen with **Open Tourism statistics**.

![Tourism statistics](tourism)

**1. Choose the KBS list.** Drag the file onto the area on the screen or press **Choose file** and pick it. The program shows the file's month, the number of lines, same-day arrivals and departures, and the guests still in the house.

**2. Check nationalities.** Some countries may be spelled differently in KBS (such as "TÜRKYİE"). The program makes a suggestion:

- If the suggestion is right, press **Accept**.
- For spellings it does not match by itself or does not know, such as Cyprus, choose the right country from the list and press **Confirm**.

A match you confirm is remembered for the following months; you are not asked again every month.

The **In-house guests** box: nights of guests still in the hotel at the end of the month are counted up to their planned check-out in Bismuth. If that is wrong, choose the check-out day with **Correct**.

**3. Ministry table.** The table comes in the order of the ministry panel: **Country**, **Arrivals**, **Nights**; below it the totals, the number of beds and occupancy.

- Use **Copy table** to copy the whole table, or the copy button on a line to copy one line, and paste it into the ministry panel. Copying is off while a spelling is still waiting for confirmation.
- If you write a country under a different name in the panel, change the name with the button on the country name; the new name is used in the following months too.
- Use **Download Excel** or **Download CSV** to get it as a file.

## Rules {#tourism-rules}

- A person who arrives and leaves on the same day counts as **1 night**.
- All nights of a stay are counted in the **month of arrival**, including nights that run into the next month.
- Occupancy = nights ÷ (number of beds × days in the month). The number of beds is the real number in your rooms.

## The reported mark {#tourism-reported}

After entering the table in the ministry panel, press **Mark as reported**. The date and your name appear in the **Reporting history** list; the reminder on the Today screen goes away. If you marked it by mistake, **Remove the mark**.

## Comparison with Bismuth's records {#tourism-compare}

At the bottom of the screen the KBS figures are compared with the stays entered in Bismuth for the same month:

- differences by country,
- people **without nationality** (enter the nationality on the guest card),
- stays **not in KBS** (they may not have been reported; check),
- arrivals **not in Bismuth**.

The ministry always gets the KBS figures; the comparison is only a check.
