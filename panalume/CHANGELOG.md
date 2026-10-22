# Changelog

## 0.34.0

- **Older tablets.** Panalume now runs on older iPads and Macs (Safari 14 and 15, e.g. iPads that stop at iPadOS 15), which showed a blank screen before. Newer devices are unchanged.
- **Vacuum: clean chosen rooms.** Tap one or more rooms on the vacuum card, then **Clean**. Rooms are cleaned in the order you tap them. The rooms come from Home Assistant: match the vacuum's rooms to your areas in its settings in Home Assistant (Dreame, Roborock and others support this). With the Dreame integration, its own room list works too.
- **Vacuum: map.** The vacuum card can show the vacuum's map, e.g. the Dreame integration's map camera. It's found automatically, and on bigger cards it takes the place of the round button.
- **Power flow: appliances.** Add up to four appliances to the power flow card, such as a heat pump or hot tub. Each shows its own power around the house, with a matching icon.

## 0.33.0

- **Lawn mower card.** For robot mowers (Husqvarna Automower, Gardena, Worx Landroid, Mammotion and others). A big round button starts, pauses or resumes mowing, with a ring showing the battery, and **Dock** sends it home. Underneath: the status, the mower's own activity in plain words (e.g. *Parked until the next start*), the next scheduled start and operating hours. It finds the mower and its sensors automatically, only shows what the mower supports, and small cards become a single row.
- **Photo frame card.** A slideshow of a folder or album from Home Assistant's media browser: your own media folders, Immich albums (with the Immich integration) and other photo sources. Photos fade from one to the next with a slow zoom; tap for the next one. Choose the album with **Choose** in the card's settings, and set the seconds per photo, shuffle or in order, and whether to fill the card or show the whole photo. New photos appear on their own.
- **States in your language.** Panalume now uses Home Assistant's own translations, so states appear in Home Assistant's language: *Ligado*, *Aberto*, *A aquecer* in Portuguese, *Eingeschaltet* in German, and so on. That covers state text on every card, lights, thermostat modes, weather and the vacuum and mower status. English setups are unchanged, and Panalume's own menus stay in English.
- **Camera sound.** The full-screen live view has a speaker button for cameras that send sound. It can be added to a camera card too, under **Speaker button**.
- **Custom CSS for parts of a card.** A card's **Custom CSS** can now style parts inside it as well as the card itself, e.g. `& .name { white-space: normal }`. Buttons also have a **Wrap long names onto two lines** option.
- The People card no longer splits a single word (e.g. *Ausente*) across two lines.

## 0.32.0

- **Hidden cards no longer leave gaps on phones.** When a card is hidden by its **Visible when** template, the automatic phone layout leaves it out, so the cards below move up and small cards pair up again. On a phone with its own layout, rows left empty by hidden cards close up too. Tablets and desktops keep their layout as it is, and while editing every card is still shown.
- **Hue light card with scenes** (contributed by Asben91). The Light card for a Philips Hue room or zone, with the room's Hue scenes as buttons instead of colour buttons: tap one to set it, and dynamic scenes play animated. Scenes are found automatically in Hue's own order, or pick your own (from any room, in your order). The scene row scrolls sideways when there are many.
- **Robot vacuum card: map picker.** A **Map** dropdown next to suction power switches between your vacuum's maps (e.g. Roborock's *selected map*). It's found automatically, can be set by hand under **Map picker**, and hidden with **Show**.
- **Inter is built in.** The default font no longer loads from Google Fonts, so Panalume makes no requests outside your home network. It looks the same, loads a little faster, and works on tablets with no internet access. Dashboards that had the old Google link saved switch over automatically, and you can still add any Google Font under **Theme**.
- Service actions: the **Data** box now shows an example, and explains that a script's fields go straight in when you call the script directly (`script.my_script`), with no `"data"` wrapper.

## 0.31.1

- **Sensor card: hide parts, and values that fit.** New **Show** buttons hide the icon, name, value or unit. The value now shrinks to fit the card, so a long state like *Detected* is no longer cut off on a small card, and **Value size %** sets its size yourself without making everything else bigger. **Value** now says it can be your own text, no template needed.
- **Binary sensors in Home Assistant's words.** Door, window, motion, moisture, plug and other binary sensors now show *Open* / *Closed*, *Detected* / *Clear*, *Wet* / *Dry*, *Plugged in* / *Unplugged* and so on, as Home Assistant does, instead of *On* / *Off*, on every card.
- **Alarm panel scales with the card.** Making the card smaller or bigger now resizes the buttons and keypad too, instead of only the text.
- **Clearer theme settings.** Colour and blur settings now say what they change: **Accent colour** (sliders, dials, graphs, links, selected buttons), the **"On" colour** (icons and toggles of things that are on; lights use their own colour), **Secondary text**, **Card content size %** and **Card glass blur** (0 is fastest on older tablets).

## 0.31.0

- **Calendar card.** Today's and upcoming events from your Home Assistant calendars (Google, CalDAV, Local calendar, holidays…), grouped by day, each calendar in its own colour. Events on now are highlighted, finished ones drop off, and tapping an event shows its location and description. Choose how many days ahead and how many events; small cards show just the next few.
- **Energy cards in your own currency.** The Energy usage and Predbat cards now use the currency set in Home Assistant (Settings → System → General) instead of always £ and p — e.g. 1,48 € and 24,5 ct/kWh in Germany, 1,48 kr. and 24,5 øre/kWh in Denmark — with numbers written the local way (2,4 kW). Price sensors in ct/kWh, øre/kWh or ¢/kWh are understood too. The Octopus cards stay in pounds and pence.
- **Robot vacuum card** (contributed by Asben91). A round button (with a battery ring, when the vacuum reports one) starts, pauses or resumes cleaning, with the status under it, a **Dock** button, a **Locate** (beep) button and a suction-power picker. It only shows what the vacuum says it supports, and picks up battery, area-cleaned, time and error sensors automatically when the integration has them (Roborock, Ecovacs, Dreame, Valetudo, SwitchBot…). Small cards become a single row.
- **Air fryer card** (contributed by FORCEGC). Pick a smart plug's power sensor and the card shows when the air fryer is cooking, paused or finished, a cook timer, when it started and finished, and the power it's drawing; no air-fryer integration needed. Taking the basket out to shake the food doesn't stop the clock: a power cut of up to 3 minutes (*Keep timing through no power for up to*) counts as part of the same cook, shown as *Paused*, and the finished time is the whole cook with the paused time noted. Dips under 30 seconds (the thermostat) are ignored. The cook is worked out from Home Assistant's history, so it survives a reload and every screen shows the same time. **Cooking above (W)** (50 by default) sets the power that counts as cooking.
- **Editing toolbar on the bottom edge, and a dockable editor panel** (contributed by FORCEGC). On phones the Done / undo / view / device toolbar used to sit halfway up the screen over your cards; it's now a strip along the bottom edge on every screen, with the editor as a proper bottom sheet above it. Three new toolbar buttons put the editor panel on the left, right or along the bottom (tap the highlighted one to hide it), remembered on each device.
- Fixed: one card with an invalid entity ID (e.g. a Zappi card added where there's no Zappi, which filled in `sensor._status`) stopped live updates on the whole dashboard. Invalid IDs are now left out, so the other cards keep updating, and new cards no longer fill in IDs for devices that aren't there.
- Fixed: the weather card's hourly forecast and the solar card showed AM / PM on some Android tablets. They now use 24-hour time like the rest of Panalume.

## 0.30.1

- Weather card: today's high and low now sit beside the temperature instead of under it, so they no longer push the forecast off the bottom of a small card.

## 0.30.0

- **Live cameras are real live video.** Live mode used to be a stream of still pictures, which some cameras (e.g. Generic Camera) only give out every few seconds. It now plays the camera's video the way Home Assistant's own dashboard does: WebRTC first (near-instant), then HLS, and only falls back to pictures for cameras that can't stream. Full screen uses it too, and the last picture shows while the video starts.
- **Weather card: today's high and low.** Tick **Show today's high and low** to see them under the current temperature. Condition names read properly too ("Partly cloudy" rather than "Partlycloudy").

## 0.29.0

- **Cameras come back after the screen's been off.** Tablets that turn their screen off (e.g. Fully Kiosk with the lights) could come back to "Video stream failed" or no picture. Cameras now start afresh when the screen comes back on (Fully Kiosk's screen-on too, with its JavaScript interface enabled), restart by themselves if nothing new has shown for 90 seconds, and a dropped video stream is retried instead of giving up.
- **Blink cameras update.** Blink only keeps the last picture it took; the camera card now asks for a new one on each refresh (**Take a new picture each refresh**, on by default for Blink; each picture uses the camera's battery, so use a long refresh).
- **Zappi card: cheap hours only count in a dispatch.** Set the new **Intelligent dispatching sensor** and only charging during an Octopus dispatch counts towards the 6 cheap hours, so charging from solar no longer uses them up.
- **Home battery card:** the time it'll be full / empty shows the day when it isn't today (e.g. *Tuesday ~12:15*), and today's in / out show kWh.
- **Energy usage card:** a second live solar and battery sensor, and units on every figure (kW live, kWh for the totals and each hour).
- **Light card:** pick the colour buttons from a palette of named colours instead of typing colour codes.
- **Sidebar for everyone, automatically.** After an update that changes who can open Panalume, the app re-adds its sidebar entry itself, so non-admin users get it without turning *Show in sidebar* off and on.

## 0.28.0

- **Panalume is in every user's sidebar.** Home Assistant users who aren't admins can now open it too (before, the sidebar entry was admin-only).
- **Only admins can edit.** Other users get the dashboard without the edit pencil, and the app won't save layout changes from them.
- Note: Panalume talks to Home Assistant with its own access, not each user's, so a restricted user can see and control whatever is on the dashboard.

## 0.27.5

- **Thermostat card: no more "Idle" for units that don't say what they're doing.** Some units (e.g. Tuya air conditioners, and most water heaters) only report their mode, not whether they're heating or cooling right now, and the card showed them as Idle. It now shows their mode instead (Heat, Cool, Dry…).

## 0.27.4

- **Sliders show the value while you drag.** The Intelligent Octopus charge target now updates its "Charge target 80%" as you move it, and every slider (charge target, light brightness, volume, blind position, Number card) shows the value it's at in a small tag at the end of the fill until you let go.

## 0.27.3

- **Electric vehicle card: Skodas on MySkoda.** Cars from the MySkoda integration (Enyaq, Elroq…) are now recognised and filled in: battery, range, charging state, power, charge limit, *Charger connected*, lock, air conditioning and mileage. They also appear in the card's **Device** box, so you can switch between, say, a Skoda and a Renault.
- "Ready for charging" and "conserving" no longer count as charging; they show as *Ready to charge* and *Holding charge*.

## 0.27.2

- **Intelligent Octopus card: more than one car.** Add up to three cars' battery %, each with an optional plugged-in sensor (e.g. *Charger connected*). Only the car that's plugged in is shown, with its name; if two are plugged in both show. A car without a plugged-in sensor always shows, as before.

## 0.27.1

- **Power flow card: two solar arrays and two batteries.** Fill in **Second solar power** or **Second battery power** (with its own invert and battery %) and they're drawn side by side, each with its own figure and flow line to the house. Each can have a label (e.g. Pylontech / Powerwall); the calculated home power includes both. Cards with one of each look as before.

## 0.27.0

- **Camera card plays video for cameras whose pictures fail.** Some cameras (e.g. Tapo) can't give Home Assistant a still picture in time, so the card stayed black with a broken-image icon. If a camera's pictures fail twice, or live mode gets nothing for 12 seconds, and the camera can stream, the card now plays Home Assistant's video stream instead, the way HA's own dashboard does ("Starting video…" while it starts). **Mode → Video stream** always uses it.
- The camera card no longer shows a broken-image icon: it says when there's no picture or the video didn't start.

## 0.26.9

- **Remove an entity from a card.** Every entity setting now has a **×** at its end to clear it, so that part of the card goes away. Before, you could only swap one entity for another.

## 0.26.8

- **Home battery card: time remaining.** A capacity typed in as a number (e.g. 17.5) is now reduced by the battery's state of health when that's set, so the kWh available and the time to the reserve are closer to reality. If you have your own time-remaining sensor, set it as the new **Time remaining sensor** and the card shows that instead of its estimate.

## 0.26.7

- **Electricity price card: Intelligent dispatches priced straight away.** The Octopus integration only marks a dispatch's half-hours as cheap a while after they're planned, so the card could say "6.6p from 12:30" when the dispatch (and the cheap rate) started at 12:00. The card now prices planned and running dispatches at your off-peak rate itself. Only the first 6 hours of dispatches between middays count as cheap, as Octopus bills it; beyond that a dispatch outside the off-peak window shows the normal rate. The 6 hours can be changed in the card's settings.

## 0.26.6

- Fixed: on the heat pump card the heating zone could be pushed under the hot water button and cut off. On cards under about 560 px wide the hot water, Boost (now just its icon) and heating share one row in short form, and the graph shrinks to make room if they ever need two rows.

## 0.26.5

- **Heat pump card: heating target.** The heating zone now shows its target as well as the current temperature (e.g. 17.9° → 20.0°), with − / + buttons beside it to change it.
- The heat pump's "flow" figure is labelled **target flow**, as that's what the Octopus sensor is.

## 0.26.4

- **Hot tub card shrinks down.** Make it short (under about 300 px) and it switches to a compact layout: a smaller tub showing the water temperature, with the name, status, target − / + and a row of icon buttons for the pumps, light, economy and standby beside it. As it gets taller the status lights and filter reminders come back; at its smallest it keeps the tub, name, status and target.
- Fixed: at medium sizes (e.g. 400 × 270) the hot tub card's controls overlapped each other; it now uses the compact layout until there's room for the full one.

## 0.26.3

- **Washer and dryer: smoother drum.** The drum turns steadily without jumping back to the start, and speeds up and slows down smoothly when the washer goes into or out of its spin.
- **Washer, dryer and dishwasher: smaller time left.** The "1h 41m" is a more sensible size and sits on one line with when it'll be done.

## 0.26.2

- **Energy flow card: battery and export figures fixed.** SolarEdge's battery → house template sensor can read far more than the house is using, which made the battery look like it was putting out over 4 kW (and the flow into export too big). The card now caps the battery and solar routes at what the house uses and the panels make.
- **Energy flow card uses your SolarEdge battery automatically.** If **Battery power** is left blank (e.g. on a card set up before it was filled in for you), the SolarEdge battery sensor is used, the right way round. Setting one yourself still takes priority.

## 0.26.1

- **EV card: chips no longer stack.** When there isn't room for Plugged, Locked and Climate side by side, they stay on one row as icons only (hover for the state) instead of piling on top of each other and pushing the car's name off the card.
- **Electricity price card: Saving Sessions don't count as a price change.** The "next price" line skipped straight to the session start (e.g. "27.5p from 18:00") even though the rate stayed the same; it now shows when the price actually changes.
- **Energy flow card stops flickering.** Solar, grid and battery sensors often report a moment apart, and the card briefly showed in-between figures. It now waits for the readings to settle before redrawing.

## 0.26.0

- **Electric vehicle card: Renault, Dacia and Alpine cars.** Cars from the Renault integration now fill in properly: battery, range, charge state in plain English ("Not charging", "Waiting for its charging schedule"), time left, target, plug and mileage. The Climate chip presses the car's *Start air conditioner* button and shows when the air conditioning is running.
- **Pick the car.** A new EV card fills in a car that isn't on another EV card yet, and the **Device** box at the top of its settings switches between all your cars, whatever the make, filling in every entity at once. A name you typed yourself is kept.
- **EV card shrinks properly.** The percentage scales with the ring so it never overlaps it. Short cards show the time left first and drop the mileage and then the status line, and keep one row of chips, leaving out any that don't fit rather than cutting them in half.

## 0.25.2

- **Space evenly works with mixed shapes and sizes.** Cards stacked on top of each other (e.g. two cards in a column next to tall thermostats) are spaced as one column and stay together; for **↕**, cards side by side are spaced as one row. Before, ↕ on a row of cards turned it into a staircase.

## 0.25.1

- **Space evenly** now takes in the gap to the card just beyond each end of the selection (e.g. the card to the right of a row), not only the edge of the view, so the whole row ends up with the same gaps. ↕ does the same with the cards above and below.

## 0.25.0

- **Camera: tap for full screen.** Tapping a camera card opens a full-screen live view; the × in the top right (or Esc) closes it. Cards imported from ha-fusion get it too. Any card can also use the new **fullscreen** tap action to open a chosen camera.
- **Switch a card to another device in one go.** Cards with several entities from one device (3D printer, washer, dryer, Zappi…) have a **Device** box at the top of their settings: pick the other device (e.g. your X1C instead of the P1S) and every entity moves across. Ones the other device doesn't have are cleared, and you're told how many.
- **Space evenly.** Select several cards and use *Space evenly ↔* or *↕* to make the gaps between them equal. If the outer card is close to the edge of the view (or the sidebar), that edge gets the same gap.
- **Phone layout closes gaps.** On a custom phone layout, deleting a card (or any edit that leaves an empty strip across the screen) moves everything below up, so there's no gap to fill by hand. Side-by-side cards keep their rows.
- **Small 3D printer card shows more:** time left, progress and layer, nozzle and bed temperatures, the filament (when wide enough), a light button, and the last print's name when it's finished. An idle printer shows a printer icon instead of "0%".
- Washer, dryer, dishwasher, printer and EV cards: the text in the little chips now lines up with the text above them.

## 0.24.1

- **Zappi card: Intelligent Octopus Go's 6 cheap hours.** Tick *Intelligent Octopus Go: track the cheap charging hours* and the card shows how much of the day's cheap charging is left (e.g. "4h 50m cheap charging left · ≈35 kWh at this rate"), with a bar that turns amber once it's used up. It counts only the time the car actually charged, midday to midday as Octopus does, from the Zappi's power history, so it's right even if the dashboard was closed. The number of hours can be changed.

## 0.24.0

- **New name: Panalume.** Same dashboard, new name (another Home Assistant dashboard had a very similar one). It installs as a new app from the same repository and copies your dashboard across from the old one automatically.
- The GitHub repository is now **leacho73/panalume**. The old address redirects, so Home Assistant keeps finding updates.

## 0.23.2

- Sun card: the moon's path is back to a single line all day (the faint daytime style in 0.23.1 is gone). The set moon is still no longer drawn on top of the setting sun.

## 0.23.1

- Sun card: the moon's path is now a clear line only while the sun is down, and a faint dotted one in daylight, so it no longer looks as if the moon was bright in the sky at lunchtime. The dimmed moon below the horizon is no longer drawn on top of the setting sun.

## 0.23.0

- **3D printer card.** A progress ring around a picture of the model, what it's printing, time left and finish time, layers, nozzle / bed / chamber temperatures, the filament in use and its colour, Pause / Resume, Stop (asks first), the chamber light and print speed. Bambu Lab printers fill in automatically (the online one is picked); OctoPrint gets the basics. Wide, tall and single-row layouts.
- **Door lock card.** A big padlock whose shackle lifts when it's unlocked, coloured by state. Tap to lock; unlocking takes a second tap (or choose lock and unlock, or never). Optional door sensor, battery and an Open door button for locks that can release the latch. Small cards become a row with a Lock / Unlock button.
- **The moon on the Sun card.** Its path through the day alongside the sun's, and a disc showing tonight's shape (crescent, half, gibbous, full). Taller cards add the phase, how much is lit, and moonrise and moonset. Worked out from your location; no sensor needed. **Show the moon** turns it off.
- **Change several cards at once.** Select cards of the same type and show or hide a part (e.g. the light card's warm / cool and colour dots) or flip an on / off setting on all of them with one tap.
- **Copy to another view.** Next to Duplicate: copies the selected card(s) to another view, in the same spot if it's free there, otherwise underneath.
- **Cover card:** the icon, state, buttons and slider can each be hidden, and the buttons drop underneath when the slider is hidden or the card is narrow, so the name isn't squashed.
- **Main is now called Tablet**, and the phone / desktop options read *Same as tablet*, *Automatic*, *Its own layout* (the picker at the bottom shows e.g. *Phone (automatic)*).
- **No sidebar:** turning it off keeps its cards for later, and views without a Navigation card get a small views menu in the corner.
- Fixed: the Energy flow card trusted route sensors that didn't add up, e.g. showing the battery at 2.4 kW when it was supplying 3.4 kW. Routes are now checked against the battery power sensor or the house total. SolarEdge's battery power sensor is picked up automatically for new cards.

## 0.22.1

- Fixed: making a Climate group card a bit shorter switched it to the side-by-side layout while it still had spare space. It now loses the spare space first and only goes side by side once the unit rows no longer fit underneath.

## 0.22.0

- **Climate group card.** Several thermostats or AC units on one card, e.g. upstairs and downstairs air conditioning. One − / + changes them all (targets that differ meet in the middle first), mode buttons set them all (Off turns them all off), and a fan speed picker sets every unit that's on. The header shows what they're doing, the average temperature and how many are on. Below, each unit has its own row: power button, what it's doing, and its own − / +; tap its name for the more-info pop-up. Smaller cards drop the unit rows, then the fan picker, then the modes. Your climate entities are filled in when you add it.
- Fixed: the Text / Markdown card showed a scrollbar when a heading only just filled the card. Text is now centred top to bottom; text that's genuinely too long scrolls without a scrollbar.

## 0.21.4

- Fixed: making a card narrower let the joined card beside it widen over a card underneath. A neighbour taking up the freed space now stops at the usual gap from anything in its way.
- Fixed: making a card taller could push a row of cards below it down by different amounts, leaving the row out of line. Rows now stay level.
- New animated preview in the README.

## 0.21.3

- Fixed: making a card shorter pulled the cards joined below it up underneath other cards (e.g. a wide card below two cameras slid under the second camera). Cards moving up now stop at the usual gap below anything in their way, along with whatever is joined below them. The same goes for a column closing up after you drag a card out of it.

## 0.21.2

- Fixed: making a card taller slid it over a card below that wasn't quite at the usual gap. Cards below are now pushed down once the growing edge reaches them (keeping the usual gap), along with whatever is joined below them, and so on down the column.

## 0.21.1

- Fixed: making the sidebar narrower left its cards at their old width, hanging off its edge. Sidebar cards now scale to fit the sidebar's width (as the main area's cards already did), and any that are already too wide are squeezed in on screen and saved when you open the editor.
- Fixed: clearing the width box and pausing before typing a new number stopped cards being refitted.

## 0.21.0

- **Magnet for moving and resizing.** Cards sitting at the view's usual gap (worked out from your layout) or touching are joined:
  - Make a card taller or shorter and the cards joined below it move with it.
  - Drag a card's side edge and the joined card beside it narrows or widens to keep the row filled. Drag its top edge and the joined card above gives or takes the space.
  - Drop a card between two others in a column and it slots in at the usual gap, pushing the rest down. Drag one out of a column and the gap closes up.
  - Move or resize a card to within 5 px of the usual gap from another and it snaps to exactly that gap. A card further away stays independent.
  - Hold Shift to do any of this freely, without the magnet.

## 0.20.2

- Fixed: the Energy flow card cut small flows (e.g. 45 W of export next to 2 kW of solar) off the bottom of the chart. Every flow now gets a visible band and a bar tall enough for its label, and labels never overlap or run off the edge.

## 0.20.1

- Fixed: in the editor, pressing on any card made a long, scrolled sidebar jump back to the top until you let go. The sidebar now stays put, and dragging cards in and out of it still works.
- People card: avatars and names stay level when someone's status wraps onto a second line.

## 0.20.0

- **Solar card** (Add → Energy): generating now (and % of your system size), today's kWh against the forecast with what's still to come, whether today is above or below forecast, today's curve of actual output over the Solcast forecast and its likely range, where the solar is going (house / battery / export), tomorrow's forecast and, on a tall card, the next five days. Fills itself in for SolarEdge-style sensors and Solcast or Forecast.Solar. Shrinks to a strip.
- **Energy flow card** (Add → Energy): how self-powered the house is right now, solar / battery / house figures, and a live flow chart from where power comes from (solar, battery, grid) to where it goes (house, battery, export), each band as thick as the power on that route. Uses per-route sensors when your integration has them, otherwise works the routes out from solar, grid and battery power.
- People card: long statuses (e.g. room names) wrap onto a second line instead of being cut off.
- Cards can now keep entities they only read indirectly up to date (e.g. Solcast's day-by-day forecasts).

## 0.19.0

- **Sunrise & sunset card** (Add → Info): today's sun path drawn from your Home Assistant location, where the sun is now, and a countdown to the next sunrise or sunset. Sunrise, solar noon and sunset; on a big card also dawn, dusk and day length with the change since yesterday. Shrinks down to a thin strip or a tiny tile.
- **People card templates**: the status line and name can be templates, written once for everyone with `entity_id` as each person, e.g. which room they're in from presence sensors.
- **More info on cards without a single entity** (Zappi / Eddi, energy and appliance cards) now works: it opens the card's main entity, and the Zappi / Eddi card opens its own power reading, i.e. the last 24 hours of charging. The More info and Toggle actions also have an **Entity** picker to open any entity you like.

## 0.18.1

- Fixed: cards placed past the right-hand edge in an existing layout (e.g. from widening the sidebar before 0.18.0) still hung off the screen. Any view whose cards run past the edge is now squeezed to fit, with equal gaps kept and the right margin matching the left, and opening the editor saves the fitted positions.

## 0.18.0

- **Sidebar keeps its size** with *Fit the whole view on screen*: only the main area shrinks to fit, so the sidebar no longer changes size as you switch views. **Layout → Sidebar → When a view shrinks to fit the screen** brings back the old behaviour if you prefer it.
- **Changing the sidebar width no longer pushes cards off the screen.** Cards that would go over the edge (or that filled the width) are scaled across to fit, keeping equal gaps equal. The same happens when you turn the sidebar on or off or change the design width. Cards already off the edge come back the next time you change the width.
- **Camera fit: Auto** (new default) fills the card unless the picture is a very different shape from it, e.g. a wide dual-lens camera, which is then shown whole instead of heavily cropped. Also *Fill the card (crops edges)* and *Whole picture*. Existing camera cards switch to Auto.
- Navigation card: the views share the card's height, so a short card no longer cuts off the last view or shows a scrollbar.

## 0.17.0

- **Energy usage card** (Add → Energy), like Home Assistant's energy dashboard but live: hourly bars of where the house's energy came from (grid, solar, battery) above the line and where spare energy went (export, battery charging) below it. Today's kWh used, from grid, solar, exported and self-sufficiency, plus **cost, earnings and net** from HA's own cost statistics. A dotted line shows the price paid per kWh each hour, and the header shows what the house is using right now and the current import / export price. Tap an hour for its breakdown and cost. Sources and prices come from Home Assistant's Energy settings; HA's 5-minute statistics are read every minute and the current hour is topped up live from your power sensors in between. Today or yesterday.

## 0.16.2

- Fixed: the Zappi / Eddi card and the power flow's EV figure used the myenergi hub's "power charging" sensor, which adds up every Zappi and Eddi (e.g. a 7 kW car charge plus a 3 kW immersion showed as 10 kW). They now use each device's own reading. Existing cards correct themselves; nothing to change.
- Zappi / Eddi card shows power in kW (7.2 kW) from 1 kW up, and watts below.

## 0.16.1

- Octopus rates: Power Ups that Octopus only lists as *available* (often for other regions) are no longer shown as if they're happening. Only Power Ups you're in count.
- Octopus rates: back-to-back sessions show as one, e.g. two 1-hour Free Electricity sessions read "11:00–13:00" instead of just the first hour.

## 0.16.0

- **Hot tub card** (Add → Controls): a top-down tub that warms in colour with the water, ripples and bubbles while the pumps run, steams while heating and glows with the light on. Target temperature − / +, pump (Off → Low → High) and light buttons, WaterCare mode, economy and standby, status lights (heating, circulation, ozone, filter cycle, winter mode) and maintenance reminders (rinse / clean filter, change water) that turn amber when due and red when overdue. Gecko (in.touch2) spas are detected automatically.
- **Washing machine, Tumble dryer and Dishwasher cards** (Add → Controls): a porthole whose drum turns while running (fast on spin) or a dish rack with spray, ringed by progress; time left and when it'll finish, programme and phase, settings (spin, temperature, dry level), alerts (salt / rinse aid low, door open, leak sensors) and Pause / Resume / Stop. Detects Samsung SmartThings washers, Home Connect (Bosch / Neff / Siemens) dishwashers and hOn (Haier / Candy / Hoover) dryers.
- **Octopus rates** now knows about Octoplus sessions: during Free Electricity or a Power Up the price shows as FREE (with the usual price beside it) and a countdown; during a joined Saving Session a banner shows what each kWh saved earns; the next session is shown under the price. The cheapest 2 hours counts free slots as 0p and avoids Saving Sessions, and free slots are drawn in teal on the chart.

## 0.15.0

New address options for wall tablets:
- `?view=Upstairs` opens a screen on a chosen view (its name or id), e.g. downstairs tablets on Downstairs and upstairs ones on Upstairs.
- `?return=5` goes back to that view (and closes any pop-up) after 5 minutes without a touch.
- `?noedit` hides the edit pencil and turns off the E shortcut.

Fixed: address options added to Home Assistant's address bar (e.g. in Fully Kiosk) were ignored, because Panalume runs inside a frame of HA's page. All options (`?device`, `?fit`, `?kiosk`, `?view`, `?return`, `?noedit`) are now read from HA's address as well.

## 0.14.0

- **Predbat card** (Add → Energy): what Predbat is doing now and until when, battery %, cost today, cost of the rest of the plan and yesterday's savings. A 24-hour plan chart shows charge (green) and export (yellow) windows, predicted battery %, car charging and import rates, followed by a list of the next charge / export slots. Charge / Export / Hold buttons force that for the current half-hour, and there's a Predbat mode picker. Predbat's own plan summary can be shown too. Entities are detected automatically, and the card is added to the ha-fusion import's Energy view.

## 0.13.0

- **Smart alignment** while editing: dragged or resized cards snap to the edges of other cards, with pink guide lines showing what lined up. Resizing also snaps to the same height or width as other cards (they're outlined while it matches).
- **Shift-drag** now moves a card freely to the pixel (no snapping). Shift-click still adds / removes cards from the selection.
- Wall tablets (*Fit the whole view on screen*): when a tall view is shrunk to fit, the cards now widen to use the full screen width instead of leaving a gap on the right.
- Navigation card: views sit centred in the card, and a short card no longer shows a needless scrollbar.
- Entity pickers (People card and other lists): the list opens again when you click back into the box after picking.

## 0.12.2

- Fixed live cameras showing a frozen picture in the add-on. Home Assistant's add-on proxy waits for a response to finish before passing it on, and a live stream never finishes. Live streams now go straight to Home Assistant, and if that isn't possible (e.g. HA uses SSL) the card falls back to refreshing snapshots about twice a second.

## 0.12.1

- Light card: removed the big brightness % on the right — it was already shown under the name.

## 0.12.0

- **Home battery card** (Add → Energy): charge %, kWh left of usable capacity, charging / discharging power, time until full or until your backup reserve (with clock time), status, health, temperature, today's in / out and a 24-hour charge graph. SolarEdge batteries are detected automatically; any other battery can be picked by hand. Wide cards put the graph alongside. Also added to the ha-fusion import's Energy view.
- **Camera fixes**: live cameras now stream over a websocket instead of a long-running image request. Browsers only allow a handful of those at once, so live cameras used to freeze after a while, and choosing a different camera changed the name but not the picture. Streams also reconnect themselves if they drop and pause while the screen is off.

## 0.11.1

- Phone layout: small cards that sit side by side on the main layout (e.g. two thermostats) now pair up two-per-row on phones instead of stacking at half width.
- New README with screenshots.

## 0.11.0

- **Live updates**: when you save changes on one screen, every other open screen (wall tablets, phones…) picks up the new layout within a second — no more reloading Fully Kiosk. Screens that are in edit mode are left alone.
- After an add-on update, open screens reload themselves onto the new version.

## 0.10.2

- Fixed: high-resolution tablets were detected as desktops (they report a wide screen), so they used the desktop's "actual size, centred" setting and showed a gap down each side. Touch-only screens are now always treated as tablets. Layout → Devices shows which device the current screen is using.
- Thermostat card adapts to its size: when there isn't room for the dial it switches to a compact − temperature + layout, and mode labels only show when they fit.

## 0.10.1

- Fixed wall-tablet mode (*Fit the whole view on screen*): when a view is shrunk to fit, the sidebar now stays at the screen edge and the main area stretches to fill the full width, instead of the whole dashboard being centred with gaps down both sides.

## 0.10.0

- **Thermostat card redesigned**: a dial you can drag to set the temperature (or use −/+), with the current temperature marked on it. The card glows orange when heating, blue when cooling, grey when off, with a pulsing heating/cooling indicator. Labelled mode buttons, plus preset and fan pickers when the device has them. Wide cards put the dial on the left. Water heaters without a target show their current temperature.
- **Light card redesigned**: glows in the light's actual colour (brighter as it's turned up), big brightness %, a gradient brightness slider, warm / neutral / cool buttons and colour buttons (choose your own colours). Light groups show how many are on, e.g. "9/12 on".
- Both cards have show/hide sections.

## 0.9.0

- **Kiosk mode**: hide Home Assistant's header bar above the dashboard. Turn it on per device in Layout ("Hide Home Assistant's header bar"), or add `?kiosk` to a screen's URL (`?kiosk=0` turns it off).

## 0.8.0

- **Sizing per device** (Layout tab → Sizing):
  - *Fill the screen width* — scroll down for more (default for tablets and phones).
  - *Fit the whole view on screen* — shrinks a tall view so nothing needs scrolling; made for wall tablets.
  - *Actual size, centred* — big monitors show the layout at 100% instead of blowing it up (now the default for desktops).
- Any screen can be forced with `?fit=width`, `?fit=screen` or `?fit=actual` in its URL.

## 0.7.0

- **Card size −/+**: select a card in edit mode and use the −/+ under it to make everything inside it (text, buttons, toggles, sliders) smaller or bigger without changing the card's box. Also in Style → Content size.
- **Card content size for all cards** in Theme, to shrink or grow every card at once.
- Toggles and sliders now scale with the card's font size instead of staying a fixed size.
- Fixed: with the edit panel hidden, the dashboard still left space for it and didn't use the full screen width.
- Phone: navigation sits across the top of every view, followed by the clock / weather from the sidebar; text blocks go to the bottom.

## 0.6.1

- Edit mode now scales the layout to fill the screen (like view mode), so cards can be dragged all the way to the right on wide screens.
- The edge of the layout is marked with a dashed outline and its design width while editing.

## 0.6.0

- New add-on ID and repository address.

## 0.5.0

- New name, icon and logo.
- Show / hide sections on the Weather card (icon, temperature, condition, humidity, wind, forecast, lows) and the Power flow card (solar, grid, battery, EV, home, flow lines).

## 0.4.0

- One main layout shown on every device: desktop scales it, phone gets an automatic single-column version. Phone or desktop can be switched to their own custom layout.
- New cards are added to every layout; Delete removes a card everywhere.
- Groups: rooms drag as one. Double-tap a card to move it alone. Shift/Ctrl-click or drag a box to select several, then group, ungroup, align or make the same size.
- Show / hide sections on the EV, Octopus rates, Octoplus sessions, Intelligent Octopus, Energy cost today, Heat pump and Zappi/Eddi cards (chips in Content, or the eye beside each field).

## 0.3.0

- **Import from ha-fusion** (Layout tab): rooms, buttons with their templates, cameras and sidebar, plus an auto-built Energy view.
- Icons from other sets (tabler, mingcute, solar…) via Iconify.
- Templates can use `entity_id` for the card's entity; button icon colour can be a template.
- New cards: Template lines, Divider.
- Renault EVs detected alongside Audi / VW.

## 0.2.0

- Energy cards: Octopus rates, Octoplus sessions (Saving Sessions, Power Up / Down, Free Electricity, with Join), Intelligent Octopus, Energy cost today, Heat pump, Zappi / Eddi, Electric vehicle.
- Entities are auto-detected when an energy card is added.

## 0.1.0

- First release: free-layout drag-and-drop dashboard with sidebar, drag-to-resize, per-card styling, live HA templates, pop-ups, theme editor, undo and 22 card types.
