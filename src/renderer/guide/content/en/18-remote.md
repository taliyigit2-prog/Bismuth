# Remote access (Mac and phone)

The hotel owner can see the hotel's records from a Mac at home or from a phone and do the work their role allows. There is no server of ours and no paid service: the computer at the hotel becomes the **main computer**, and the other devices connect to it through a free **private network** app (NetBird). The records always stay on the main computer.

## Ways of working {#modes}

In **Settings → Remote access**, the **This computer** box has three choices:

- **Single computer**: nobody connects from elsewhere. Enough for small hotels.
- **Hotel main computer**: the real data is on this computer; other computers and phones connect to it.
- **Connect to another Bismuth**: for example the owner's Mac; it works with the data on the main computer.

These settings change only in the main computer's own window; they cannot be changed from a phone or the Mac.

When the computer becomes the **Hotel main computer**, the box says **Main computer is running** and shows the address to connect to: **From outside (NetBird)**. You can scan the QR code next to the address with the phone's camera. If NetBird is not on on this computer, it says "No private network address found"; do the setup below.

The same box also has:

- **Connections from the hotel network**: **off** by default; phones and other computers connect only through the private network (NetBird), which encrypts the connection. If you switch it on, devices on the hotel's Wi‑Fi or cable network can connect too and the **Inside the hotel (Wi‑Fi)** address appears. A warning comes up first: on the hotel network the connection is not encrypted, so the Wi‑Fi guests use must be separate from the hotel's own network (the router's "guest network"). If you are not sure, leave it off; NetBird works inside the hotel as well.
- **This computer's identity**: a number such as "4514-284E-…". The Mac remembers it when it first connects; you should see the same identity on the Mac's **Settings → Remote access** screen.
- **Port**: usually leave it as it is (7373).

## Setting up access from outside (once) {#netbird}

The hotel owner does this once; it takes about half an hour. The **Setting up access from outside** box on the screen has four steps:

1. **Install NetBird on the main computer**: on NetBird's site, open a free network with the hotel's Gmail account, join the main computer with a setup key, and in the NetBird dashboard turn off session expiry for this device.
2. **Invite the owner**: in the NetBird dashboard use **Users → Invite** to send an invitation to the owner's own email address.
3. **Install NetBird on the Mac and the phone**: the owner accepts the invitation with their own account and installs NetBird on the Mac and the phone (App Store or Google Play).
4. **Connect**: on the Mac open Bismuth and choose **Connect to another Bismuth**; on the phone scan the QR code of the "From outside" address.

The **Always on** box next to it lists what keeps the main computer reachable. Switch on **Start Bismuth when the computer starts**.

> [!tip]
> The main computer must not be switched off or go to sleep, or access from outside stops. On Windows choose Settings → System → Power → Sleep: "Never".

## Connecting from a Mac {#connect-mac}

1. Install Bismuth on the Mac and open it.
2. In the **How it runs** step of the setup, choose **Connect to another Bismuth** and press **Go to connection**.
3. Type the "From outside" address into **Main computer's address** and press **Connect**. Inside the hotel, when connections from the hotel network are on, you can also pick it under **Found on the local network**.
4. Sign in with your user name and password.

While connected, the top bar shows a **Connected to the main computer** badge. Everything you enter on the Mac is written straight to the main computer.

The Mac's **Settings → Remote access** screen shows the main computer's address, its state and the **Known identity**. If another computer answers at that address, the warning **The main computer's identity changed** comes up and nothing is sent. Only if the main computer really changed (it was taken over or set up again) compare the identity with the one on the main computer's screen and press **Accept new identity**.

The Mac keeps a **read-only copy** of all the records on the main computer. When the main computer is off or there is no internet, the screens open from this copy; the copy's time is shown at the top and records cannot be changed. It goes back to live by itself when the connection returns. While NetBird is off, the copy is updated from the encrypted box in the hotel's Drive; for this, choose the Drive folder in the Mac's **Read-only copy** box and enter the **Bismuth key** from the paper once.

## Connecting from a phone {#phone}

1. Make sure the NetBird app is on on the phone.
2. Open the main computer's address in the browser, or scan the QR code on the main computer's screen with the phone's camera.
3. Sign in with your user name and password. The PIN is not used on the phone or the Mac; it works only in the main computer's own window.
4. In the browser's menu choose **Add to Home Screen**; Bismuth then opens like an app.

![Today on the phone](phone-today)

On the phone the bottom menu has **Today · Calendar · Guests · Cash · More**. From the phone you can enter payments, report issues, change room status, mark tasks as done and see shift notes and in-house guests.

![The More menu on the phone](phone-more)

## Security {#remote-security}

- Sessions on phones and other computers end after a set time; then you sign in again. This time is chosen with **Remote session length** in the **Sign-in security** box.
- After 5 wrong passwords from the network, remote sign-in is locked for 15 minutes; the window on the main computer is not affected.
- The **Signed-in devices** list shows which device connected and when. For a device you do not know or have lost, press **Sign out** or **Remove device**.
- Where a role may sign in from is set in **Settings → Users and roles** with that role's **Remote sign-in** choice: **From anywhere**, **Only from the hotel's network** or **Off (main computer only)**.
- Showing, entering and changing the main computer's Bismuth key and choosing its Drive folder are done only in the main computer's own window. (The Mac enters the key for its own read-only copy in its own window.)
- We recommend turning on disk encryption on laptops (FileVault on a Mac, BitLocker on Windows).

## If the main computer breaks {#takeover}

Thanks to the encrypted backups in Drive and the read-only copy on the Mac, records are not lost. If the main computer breaks completely, on the Mac open **Settings → Remote access** and in the **Is the main computer broken?** box press **Make this the main computer**:

1. The window says what will happen: the latest data in the read-only copy becomes this computer's records and a new-term note is written to the Drive box.
2. Type the **Bismuth key** from the paper (it must be the same as the key entered on this computer).
3. Type **your new password** twice. Renew the other users' passwords later in **Settings → Users and roles**.
4. Press **Make main computer**. Bismuth restarts and opens as the main computer.

If the old computer comes back, it sees the new-term note and accepts no changes; its screen lists the changes the new main computer does not know about. See [The Bismuth key](guide:backup#backup-key).

## Troubleshooting {#remote-trouble}

- **I cannot connect**: is the main computer on, or asleep? Is NetBird on on both devices? Is the address right?
- **The phone does not open it**: check that NetBird is on and use the "From outside" address. The "Inside the hotel" address works only when connections from the hotel network are on.
- **"The main computer's identity changed"**: if you did not change the main computer, do not accept it and tell the hotel owner.
- **The Mac is read-only**: the main computer cannot be reached; it sorts itself out when the connection is back.
- **"The Bismuth versions differ"**: bring Bismuth on both computers to the same version.
