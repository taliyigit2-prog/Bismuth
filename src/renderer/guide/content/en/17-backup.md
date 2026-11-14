# Backup and moving data

All the hotel's records are kept on the main computer. So that nothing is lost if the computer breaks or is stolen, Bismuth **makes a backup by itself every day**: one copy on this computer and an encrypted copy in the hotel's Google Drive folder. This section covers backups, restoring, the Bismuth key and moving data to and from Excel.

## Backup status {#backup-status}

Open **Settings → Backup**.

![Backup settings](backup)

The **Backup status** box shows the **Last backup**, the **Next automatic backup** and the state of the **Google Drive copy**. The automatic backup is made every day at the hotel's quietest hour (04:00 by default) and when the program closes. If the program is closed at that hour, the backup is made a few minutes after it opens.

To make a backup at once, press **Back up now**. For example before a big change or before moving the computer.

> [!warning]
> If you see "No backup for two days" or "No copy is reaching Drive", look at it straight away: check that the Google Drive desktop app is running and the disk has free space, then press **Back up now**. The warning also appears on the Today screen.

## The Google Drive copy {#drive-copy}

Bismuth does not connect to any cloud account; it only writes files into the Google Drive folder on the computer, and the Google Drive app does the syncing. For this, the **Google Drive desktop** app must be installed on the main computer and signed in with the hotel's account.

The default folder is "My Drive/Bismuth/yedekler"; to see or change the folder, press **Find the Drive folder** under **Backup settings**: Bismuth looks at the known Drive folders on this computer (the **G:** drive on Windows, Google Drive in Finder on a Mac) and saves the one it finds; it does not connect to any network. If it finds none, or you want another folder, pick it with **Choose folder**.

## The Bismuth key {#backup-key}

Backups going to Drive are encrypted with the **Bismuth key**; not even Google can read them. If the computer breaks, you need this key to open the backup on a new computer.

1. In the **Bismuth key** box press **Show the key**.
2. **Write the key on paper** and keep it somewhere safe (for example in the safe).

When opening a Drive backup on a new computer, you type the key from the paper with **Enter the key**. Showing, entering and changing the main computer's key are done only in the main computer's own window, not from a phone or a computer connected to it from elsewhere.

> [!warning]
> If you lose the key, the encrypted backups in Drive cannot be opened. Share the key only with someone you trust.

## The backup list and restoring {#restore}

The **Backups** list shows each backup's date, kind (**Automatic**, **Manual**, **Before a restore**, **Before an update**), place (**This computer** or **Google Drive (encrypted)**) and size. Automatic backups are kept for the number of days in the setting (30 days by default).

- **Check**: checks that the backup is sound.
- **Restore**: brings the records back to how they were in that backup.

To restore:

1. Press **Restore** on the backup you want in the list.
2. Read the warning: today's data is backed up separately first; records entered after the restore stay in that safety backup.
3. Confirm with **Restore the backup**.
4. Press **Restart now**. When the program opens again, the data from the backup is there.

If you change your mind, press **Cancel the restore** before restarting. Restoring can only be done from the program window on the main computer.

## The data folder {#data-folder}

The **Data folder** box shows where on the computer the records and attachments (photos, receipts) are kept, and their size. You can open the folder with **Open folder**. Do not delete or change the files in this folder by hand.

## Moving data to Excel (export) {#export}

To open reservations, the ledger, staff or another table in Excel:

1. In **Settings → Backup**, press **Export** in the **Export and import** box.
2. Choose the **Table**, or all tables.
3. **File type**: **Excel (XLSX)** (dates and amounts formatted, each table on its own sheet) or **CSV**.
4. If you like, choose a **From** and **To** date.
5. Press **Export** and choose where to save the file.

The list holds every record in the program: besides reservations and the ledger, also rooms and room types, rooms not for sale, cash handovers, shift handovers and board notes, special days, exchange rate history, laundry prices and monthly accounts, and imports. Each role sees only the tables it can see on screen.

ID numbers are written only for roles with ID permission. Identifying notes and personal notes (**Notes to self**) are never written to any file. For a role that cannot see the owner's section or salaries, cash handover amounts are calculated without those rows.

## Bringing in old spreadsheets (import) {#import}

You can bring the old reservation, ledger and salary sheets you kept in Excel or Google Sheets into the program. Nothing is saved until the last step.

1. Press **Import**.
2. Choose the **Template**: **Reservations (room × day)** (each row a room, each column a day; in the cell "FIRST LAST (price)"), **Ledger (daily lines)** or **Salaries (employee × month)** (employee, month, salary, paid, payment method; add the employees on the Staff screen first). **Download a sample file** gives a file with the column titles ready.
3. **File**: CSV or XLSX (at most 5 MB). In Google Sheets you get it from File → Download. Press **Continue**.
4. **Columns**: check the columns the program found; if needed, choose the month, the sales channel and the payment method. Press **Preview**.
5. **Preview**: see the records to be imported and the problem lines. The same person may be spelled differently; you can merge them on the Guests screen after importing.
6. Press **Import … records**.

Problem lines are not imported. Correct them in the file and import the whole file again: lines imported before are marked **Imported** and are not written twice.

If you took in the wrong file, press **Cancel import** in the **Imports** list in the same box and write the reason: what that import wrote is not deleted, it is cancelled.

> [!tip]
> In an XLSX file the cell colours are read as payment status (red = paid). If you are importing both reservations and the ledger, switch off writing payments when importing reservations; otherwise the same income is counted twice.
