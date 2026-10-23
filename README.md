# Orb Survey

On-site survey app for Orb Interiors. Walk a plot with the customer and the builders, mark what is wrong with the WINNER plan, and send the office a marked-up PDF and a spreadsheet. The office redraws the room in WINNER by hand.

It runs in Chrome on an Android phone or tablet. Install it from the browser. There is no Play Store app, no account, and no server. Plans, measurements, and photos stay on that phone.

## How to use it on site

1. Open the site in **Chrome** (the address is at the bottom of this page). The first open needs a signal. After that it works with no signal.
2. Tap **Install**, or use the Chrome menu and choose **Install app** / **Add to Home screen**. Use the icon on the home screen from then on.
3. Tap **New project** and type the site name, for example `Crofts Bank Road`.
4. Tap **Add WINNER plans** and select every PDF at once. Each PDF becomes one plot. The name is read from the plan (`Flat 5 - Design - 1`). If the PDF has no name, the file name is used.
5. Open a plot. It opens on the **plan** page. The chips along the top switch to the perspective, the other plan, and the wall elevations.
6. **Move** is the starting tool. Drag with one finger to pan. Pinch with two fingers to zoom. The **+**, **−**, and **Fit** buttons do the same if gloves make a pinch awkward.
7. **Wall.** Tap Wall. Drag along the wall, or tap one end and then the other. The length box opens. Press measure on the DISTO, or type the millimetres.
8. **Pins.** Tap Ceiling, Beam, Soil, Water, Sink, Power, Opening, Heat, or Note, then tap the plan. Fill the boxes. Take a photo if the office needs to see it.
9. **Low ceiling.** Tap Low ceiling and drag a box around the lowered area. Enter the height inside that zone.
10. **Beam.** Position along the wall, the width of the beam, and the height underneath.
11. Tap **List** to see every mark on that plot. A number on the List button means a box is still empty.
12. On the project screen, set each plot to **Not started**, **In progress**, or **Done**. The first mark moves a plot from Not started to In progress on its own.
13. Tap **Share** for this plot, or **Share PDF** / **Spreadsheet** for the whole project. Android offers the share sheet. If it does not, the file downloads.
14. At the end of the day tap **Back up this phone** and keep that file (email it to the office, or put it in Drive). **Restore a backup** puts it back. Plots that exist only on this phone are kept.
15. There is no Save button. Every change is stored as you make it.

### The DISTO

On the laser, before you start:

- Bluetooth **on**
- **Autosend** on (so the measure button sends the number)
- **Keyboard mode off** (if it is on, the laser also types into the box and the number appears twice)
- Distance units on the laser can stay in metres. The app always records millimetres.

In the app, tap the **DISTO** button at the top and tap **Connect DISTO**. Pick the X6. The button shows the last reading once a shot arrives. If the link drops, the app tries to connect again.

Press measure on the laser while a measurement box is open. The millimetres land in that box and the next empty box is selected. You can also tap **Distance**, **Horizontal**, or **Vertical** in the DISTO panel to put that figure in the box.

- A normal wall length is the **distance**.
- Shooting up at a ceiling, or up at the underside of a beam, use **Vertical** when the app offers it. The X6 tilt sensor works out the vertical component.
- Put the DISTO on the floor and shoot straight up when you want a floor-to-ceiling height. The laser measures from itself, not from the floor.
- If the laser is on the stand, type the stand height into **Height of the DISTO above the floor**. A **From floor** button then adds that on.
- With the **DST 360-X** fitted, leave the stand still, take two shots, and tap **Point A** then **Point B**. **Between points** is the straight-line distance between those two shots. Use it when you cannot shoot along a wall. A plain wall shot does not need the stand.

If Bluetooth will not connect, type the number. Every box accepts typing. **Practise without the laser** (inside the DISTO panel) feeds made-up readings through the same path, for trying the app at a desk.

## What the X6 connection actually uses

The X6 is more than a tape. This app uses the parts that help a kitchen survey and leaves the rest alone.

| Used | Why |
| --- | --- |
| Distance, from the measure button | Drops straight into the open box. This is the main action on site. |
| Inclination from the 360° tilt sensor | Turns a tilted shot into a horizontal run and a vertical rise. That is the height under a beam and the ceiling height when you cannot hold the laser perfectly plumb. |
| Point-to-point angles, only when the DST 360-X is sending them | Two shots from a stand that has not moved give the distance between two points you cannot shoot directly. |
| Remote measure | Optional. The button on the laser is the reliable way. |

Not used, on purpose: the pointfinder camera, the compass, and tracking / continuous measure. They do not speed up marking a plan, and the pointfinder picture never arrives over this Bluetooth channel.

The Bluetooth profile is the one Leica DISTO Transfer uses. It is not written out in the X6 user manual. Independent captures of the same profile:

- Service `3ab10100-f831-4395-b29d-570977d5bf94`.
- On an X3 or later (the desktop software treats X3, X4, D5, and X6 as one family; the X6 is model id 13) a measurement is a 20-byte `BASIC_MEASUREMENT_VALUES` indication (`3ab1010d`): distance in metres, inclination in radians from horizontal, then units and a timestamp. The float stays in metres even when the laser display is set to another unit.
- With a DST 360, a 12-byte `P2P_MEASUREMENTS` indication (`3ab1010f`): azimuth and zenith in radians. Zenith is down from vertical. The low byte of the timestamp pairs it with the basic packet. The layout was checked against a Leica desktop XYZ export on an **X3 + DST 360** (within 2.5 mm). The same desktop code path includes the X6. It has **not** been confirmed on an X6 + DST 360-X, because that hardware was not available here.
- Commands are UTF-8 plus CRLF written to `COM_RECEIVE` (`3ab10120`). After connecting, the app sends `raiseEvent 100` (required before an X3 will send indications) and `getSoftwareVersion app`. `raiseEvent 10` is the remote trigger, verified on an X3. `raiseEvent 12` is never sent: on an X3 it returns error 245 and stops the stream.
- Battery is the standard Bluetooth battery service.

Those bytes were captured on a D2 / D2G and on an X3 with a DST 360, not on a physical X6. Treat the first connection to the real X6 as a check: connect, take one level shot and one tilted shot, and confirm the millimetres match the laser before you rely on it in a flat. If the X6 firmware does not send `3ab1010d`, the app also listens to the older 4-byte distance characteristic used by the D2.

Horizontal and vertical distances are calculated in the app (`distance × cos(inclination)` and `distance × sin(inclination)`). The on-screen Smart Horizontal / P2P line that the laser shows is sent on the keyboard channel, not on this measurement channel, which is why keyboard mode must be off.

## Install on the phones

The live address, once GitHub Pages is switched on, is:

**https://mattis-orb.github.io/orb-survey/**

The site is a private copy of the plans only in the sense that they never leave the phone. The app itself is a public web page. Do not put customer PDFs in this git repository.

### Turning the site on (repo owner, once)

GitHub Pages is not enabled on this repository yet, and a workflow can only publish from the default branch. Two steps:

1. Merge the pull request into `main`.
2. On GitHub open **Settings → Pages → Build and deployment**, and set **Source** to **GitHub Actions**.

The workflow `.github/workflows/pages.yml` then builds and publishes on every push to `main`. If GitHub asks to approve the **github-pages** environment, that prompt is under **Settings → Environments → github-pages**.

Until those two steps are done, the address above will 404. Chrome on the phone needs the **https** address. Web Bluetooth does not work on a plain `http` page.

## For someone changing the app

```bash
npm install
npm test
npm run dev
```

`npm test` checks WINNER name parsing, the DISTO byte decoder, and the spreadsheet. `npm run build` makes the `dist/` folder. The Pages workflow sets `GITHUB_PAGES=true` so the built files expect to live at `/orb-survey/`.

## Known limits

- No physical X6 or DST 360-X was connected during development. Distance, tilt, and point-to-point decoding follow captures from a D2/D2G and an X3 + DST 360, which share the desktop software’s “X3 or later” path with the X6. Confirm the first shots against the laser’s own screen.
- `raiseEvent 100` and `raiseEvent 10` are verified on an X3. X6 firmware can differ. The measure button on the laser, with Autosend on, is the path to use on site.
- All-zero point-to-point packets (what arrives with no stand, when they arrive at all) are ignored. Point A / Point B only work when the stand is sending real angles.
- Survey data lives in this Chrome profile on this phone. Uninstalling the icon does not always delete it, but clearing the site data does. Keep the daily backup.
- Photos are shrunk to a long edge of 1600 pixels. The exported PDF uses standard fonts, so unusual symbols in notes are replaced.
- The marked-up PDF includes the plan page plus any other page you marked, then a list and the photos. It is for the office and the builders. It is not a file WINNER can import.
