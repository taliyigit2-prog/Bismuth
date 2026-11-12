# Settings, users and roles

Every hotel-specific rule in Bismuth is a **setting**: times, rooms, prices, payment methods, shifts, colours, day-off rules. This section explains the **Settings** screen, user accounts and roles. Most settings can only be changed by the hotel owner.

Open **System → Settings** in the left menu. On a computer the sections are listed on the left; on the phone you pick a section in the box at the top. Sections your role may not see are left out of the list; a section you may only look at says "View only".

## General {#general}

Each user's **own** choices: **Language**, **Start screen**, **Theme**, **Density**, **Show decimals**. One person's choice does not affect anyone else. The **Lock after** time in the **Screen lock** box applies to all of the hotel's computers and is chosen by the hotel owner.

## Hotel {#hotel}

**Hotel details**: hotel name, country (public holidays follow it), city (for the weather), **Hotel e-mail address** (only to tell the weather service who is asking; can be left empty), time zone, **Check-in time**, **Check-out time** (a room not checked out after this time shows as late), **Base currency** and **Accepted currencies**. Changes apply when you press **Save**. The base currency cannot be changed once records exist.

## Rooms and types {#rooms-and-types}

- **Room types**: the types you use and their suggested prices (**Weekday rate**, **Weekend rate**). **Pick ready-made types** or **Add type**.
- **Rooms**: number, floor, type and number of beds. **Add room**, or **Add many** floor by floor.
- A room with **For sale** off shows in the calendar but is not sold (for example a staff room). A room with **In use** off leaves the calendar; its old records stay.
- When the number of beds changes, enter a **Valid from** date; past months' occupancy and ministry statistics are counted with the number at that time.

Rooms are not deleted; an unused room is switched off.

## Lists {#lists}

**Payment methods**, **Sales channels**, **Extra services**, **Expense sections**, **Laundry items** and **Product categories**. You can rename and reorder the ready lines and switch off those you do not use; lines are never deleted.

- For a payment method, if **Cash payment** is on, money taken this way goes into the cash drawer.
- For a sales channel you can enter the **Commission (%)** and **Who takes the money** (Hotel or Channel). Channels are only labels; Bismuth does not connect to sites such as Booking or Airbnb.
- For an extra service: the **Suggested price** and the **Unit** (per booking, per night, per person…).

## Shifts {#shifts}

Shift names and times (for example Day 09:00–21:00, Night 21:00–09:00). If the end is earlier than the start, the shift ends the next day. Shift handovers and tasks follow these shifts.

## Calendar {#calendar-settings}

**Highlighted days** (days shown in another colour in the calendar, for example the weekend), **Nights charged at the weekend price** (nights starting on these days take the room type's weekend price; by default Friday and Saturday; separate from the highlighted days), **Day closing** and this year's holidays. See [Closing the day](guide:ledger#day-closing).

**Calendar start year**: how far back the calendar goes. If there is an older stay, the calendar starts in that stay's year; leave it empty to start from the oldest stay.

## Status tags and colours {#status-colors}

This is where the meaning of the calendar's colours is set.

- **Automatic statuses**: the program works them out from payments and dates: Paid, Unpaid, Partly paid / deposit, Day use; Past date, empty; Empty; Not for sale. You can change their names, colours and meanings and switch off those you do not want.
- **Your own tags**: tags you put on reservations (Group, Difficult guest, Long stay…). Use **Add tag** to give a name, colour and meaning. If "Fill the calendar cell with this colour" is chosen, the tag takes the fill and the payment status moves to the border.
- The light and dark themes have their own colours. If you choose a colour that is hard to read, a "Text is hard to read on this colour" warning appears.
- The **Calendar preview** shows changes at once; **Reset to default colours** goes back to the original colours.

To see all colours and parts in the light and dark themes, the menu has **Theme preview**.

## Users {#users}

Everyone signs in under their own name; who did what is shown in the audit log. In **Users and roles**:

1. Press **Add user**.
2. Type the **Username** (it cannot be changed later), the **Display name**, the **Role** and a **Temporary password** (at least 8 characters).
3. If the employee has a staff card, link it under **Staff card**; the employee then enters their own working hours.
4. Save and give the temporary password to the employee. They choose their own password at the first sign-in.

If a user forgets their password, give a new temporary one with **Reset password**. For someone who leaves, use **Switch off account**; their records and history stay, and the account can be switched on again. The last owner account cannot be switched off.

![Users and roles](settings-users)

## Roles {#roles}

A role decides which screens a user can see and what they can change. Ready roles: **Owner**, **Manager**, **Reception**, **Accountant**, **Housekeeping**, **Employee**. The owner role sees everything and cannot be changed.

1. Choose the role in the **Roles** box.
2. For each screen choose **None**, **View** or **Edit**.
3. Press **Save**.

- **Add role** opens a new role; a new role starts without seeing anything. To start from an existing role, use **Copy** on that role.
- **May sign in remotely**: when off, users with this role can only sign in on the hotel's computers.
- **Own tasks only**: when on, users with this role only see the tasks given to them.
- **See as this role**: shows the menu and screens the way that role sees them; leave it with **Exit preview** on the strip at the top.

> [!tip]
> Hiding a screen in the menu is not protection on its own; Bismuth checks the permission again for every action. If someone without permission opens a screen by its address, it says "You don't have access to this screen".

## Audit log {#audit}

The **System → Audit log** screen (only the owner sees it by default) lists who added, changed or cancelled what, when and from which device. Use **Filter** to choose dates, person, record type and action; click a line to see the values before and after. Entries are never deleted.

## Guide setting {#guide-settings}

In **Settings → Guide** you open the guide and start the tour again. When **Show the tour to new users** is on, every user sees the short tour once, at their first sign-in.
