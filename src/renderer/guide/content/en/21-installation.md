# Installation and new versions

This section covers installing Bismuth on a Windows or Mac computer, the warnings that appear the first time it opens, writing the setup details on paper and installing a new version. No technical knowledge is needed; double-clicking is enough. For the setup wizard after installing, see [First setup](guide:getting-started#setup).

## Good to know first {#install-basics}

- Bismuth works **without the internet**. Once it is installed you do not need the internet; your records stay on this computer.
- Bismuth **does not update itself** and sends no data anywhere. When a new version comes out, you install it by hand.
- The installer is **unsigned**: a signature is a fee the publisher pays Microsoft or Apple every year. This is why Windows and Mac show a warning the first time. The warning does not mean the program is harmful; the buttons to press are listed below. The warning appears **only once**.
- No administrator password is needed; the program is installed only for the user who installs it.

The files are on the project page under **Releases**, in the **Assets** list of the newest version:

- Windows 10 or 11 (most computers): **Bismuth-Setup.exe**
- Windows with an ARM processor (rare): **Bismuth-Setup-arm64.exe**
- Mac with an Apple chip (M1, M2, M3, M4): **Bismuth.dmg**
- Mac with an Intel processor: **Bismuth-Intel.dmg**

If you are not sure, choose **Bismuth-Setup.exe** for Windows. On a Mac, open the Apple menu → **About This Mac**: if it says **Chip: Apple M…**, download **Bismuth.dmg**; if it says **Processor: Intel**, download **Bismuth-Intel.dmg**. A wrong file does no harm; download the right one and try again.

## Installing on Windows {#install-windows}

1. Double-click the **Bismuth-Setup.exe** you downloaded. If the browser says the file "is not commonly downloaded", press the **⋯** button next to it and choose **Keep anyway**.
2. If the blue **"Windows protected your PC"** window appears, press **More info**, then **Run anyway**.
3. In the installer window press **Next**, then **Install**; when it finishes, press **Finish**.
4. A **Bismuth** shortcut appears on the desktop and in the Start menu.

> [!warning]
> Whichever Windows user you installed Bismuth with on the hotel's shared computer, open it with **that same user** every day. If another Windows user opens it, they see their own empty data; the hotel's records are in the folder of the user who installed it.

If this computer will be the hotel's **main computer**, Windows may ask a firewall question the first time it opens; tick **Private networks** and press **Allow access**. If the computer will work alone, press **Cancel**; nothing breaks.

## Installing on a Mac {#install-mac}

1. Double-click the **.dmg** file; in the window that opens, drag the **Bismuth** icon onto the **Applications** folder.
2. Double-click **Bismuth** in **Applications**. The Mac shows a "could not be opened" warning: press **Done** (do not press **Move to Trash**).
3. Open the Apple menu → **System Settings** → **Privacy & Security** and scroll to the bottom. On the **"Bismuth" was blocked** line press **Open Anyway**, type your Mac password if asked, and press **Open** in the last window.
4. From now on no warning appears; you open Bismuth from Launchpad or the Dock.

If the line does not appear, look at **Privacy & Security** right after you see the warning in step 2; the line appears shortly after and stays for about an hour. If it is still missing, open Bismuth again.

The first time it opens, or after a new version, the Mac may ask "Bismuth wants to use confidential information stored in your keychain". Type your Mac password and press **Always Allow**; if you press **Deny**, Bismuth cannot read the key.

## Write the setup details on paper {#install-paper}

At the end of the setup wizard the **Write it on paper** step appears. Two pieces of information are shown once:

- **Recovery codes**: to set a new password if you forget yours.
- **Bismuth key**: to open the encrypted backups in Drive on a new computer. If it is lost, those backups cannot be opened.

If you press **Print**, both are printed on one A4 sheet (with the key's QR code); you can also copy them by hand. Then tick **I have written it down** and press **Open the program**. Keep the sheet in a safe or somewhere secure away from the computer; do not photograph or share it. If the key cannot be shown at that moment, the program says so; you get the key later from **Settings → Backup → Show the key**. More: [The Bismuth key](guide:backup#backup-key).

## The Google Drive folder {#install-drive}

An encrypted copy of each backup goes to the hotel's Google Drive. For this, install the **Google Drive desktop** app on the main computer and sign in with the hotel's account. Then press **Find the Drive folder** in **Settings → Backup**: Bismuth looks at the known Drive folders on this computer and saves the one it finds. If it finds none it says so; then check that the Drive app is running, or pick the folder yourself with **Choose folder**. Bismuth never connects to Google; it only writes files into the folder on this computer. More: [The Google Drive copy](guide:backup#drive-copy).

## Installing a new version {#install-update}

1. Press **Settings → Backup → Back up now**.
2. Close Bismuth.
3. Download the new version's installer and open it as above. On Windows it installs **over** the old version; on a Mac drag **Bismuth** to **Applications** and choose **Replace**. If a warning appears again, follow the same steps.
4. Open Bismuth; all your records are in place. If needed the program adapts the data layout itself and first makes a copy named **Before update**.

> [!warning]
> Do not install an older version over the records of a newer one; the older version may not be able to open the new data. Bismuth on the main computer and on the Mac must be the same version: update the hotel computer first, then the Mac.

## Uninstalling Bismuth {#install-uninstall}

Uninstalling does **not** delete your records; the data folder stays, and if you install again later everything is there.

- **Windows:** Start → Settings → Apps → **Bismuth** → **Uninstall**.
- **Mac:** drag **Bismuth** from the **Applications** folder to the Trash.

If you also want to delete your records (for example when selling the computer), first make a backup with **Back up now** and copy it somewhere safe. The data folder's location is shown in **Settings → Backup → Data folder**; **Open folder** opens it.

## Installation problems {#install-problems}

**On Windows there is no "Run anyway" button.** Press **More info** first; the button appears below. If the computer is managed by a company or school policy, the administrator may have blocked the app.

**On a Mac the "Open Anyway" line does not appear, or it says "damaged".** Make sure you opened Bismuth from the **Applications** folder, not from Downloads, and repeat the steps above. If that does not work, tell the person who set the program up for you, or the developer.

**The Mac says "This app is not supported on this Mac".** You downloaded the wrong file (an Apple-chip Mac needs **Bismuth.dmg**, an Intel Mac needs **Bismuth-Intel.dmg**). Download the right one.

**The program does not open, nothing happens.** Bismuth opens only once at a time; it may be minimized (taskbar or Dock). If it still does not open, restart the computer. Your data is not deleted; do not delete the data folder, and tell the hotel owner.
