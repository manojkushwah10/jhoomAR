# Device testing checklist

Automated tests cover everything up to the moment the phone hands off to its AR app. **Camera/AR itself can only be checked on a real phone** — please run this list and fill in the results table.

**URL to test:** `https://<your-vercel-url>/products/demo-jhoomar`
(Phones can't open `localhost`, so use the Vercel link or a preview link. The dev server's WiFi address — `http://192.168.x.x:3000` — shows the page and the 3D view, but **Android's AR viewer refuses plain `http://` links**, so "Open camera" can't work there. Always test AR on an `https://` link.)

**If something goes wrong:** open the page with `?ardebug=1` added (e.g. `…/products/demo-jhoomar?ardebug=1`). A grey diagnostics box appears under the AR buttons — send a screenshot of it after trying.

**Before you start**
- Android: Chrome up to date; *Google Play Services for AR* installed (Play Store → search "Google Play Services for AR"). Most phones from 2019 onwards support it.
- iPhone: iOS 16 or newer, Safari.
- A room with a clear floor area about 1 m wide and good light.
- A measuring tape (to check real size).

---

## A. Android — Chrome (Scene Viewer)

| # | Step | Expected |
|---|---|---|
| A1 | Open the product page | Poster photo shows straight away; page doesn't jump while loading |
| A2 | Wait 2–3 s, then drag on the photo | Jhoomar rotates in 3D; pinch zooms; the page still scrolls when you swipe up/down outside the jhoomar |
| A2b | Tap the ⇈ button 3 times, then ⇊ 5 times, then ↺ | ⇈ swings the view over the top (you see the top of the canopy and arms); ⇊ goes underneath (you see the bottom); ↺ goes back to the start view |
| A3 | Tap **View in your room** | A sheet asks "How high is your ceiling?" with 9 / 10 / 11 / 12 ft |
| A4 | Pick your ceiling height, tap **Open camera** | On phones where Chrome can do AR (most recent Android phones), the camera opens **right inside Chrome** in one tap — tap **Allow** if it asks. Otherwise Google's AR viewer opens. Time from tap to camera: ____ s (target < 3 s on 4G) |
| A4b | (Optional) Tap **Or open in Google's AR viewer** under the button | Google's AR viewer opens. If it can't (the page slides and comes back), a gold box says so and **Open camera** still works. If there's no in-Chrome AR either, the message says to install/update "Google Play Services for AR" and the **Google** app. |
| A5 | Point the camera at the floor where the jhoomar would hang; move the phone slowly | In the in-Chrome camera: only a small name pill and a phone-sweeping animation are on screen — no buttons, no text popups, and **no big dark box on the floor**. When it's placed the phone buzzes briefly, the animation goes away and the jhoomar appears with a soft shadow (no gold circle). In Google's AR viewer: a soft gold circle appears on the floor |
| A6 | Step back and look up | The jhoomar hangs above the circle, its top touching (or very close to) the ceiling |
| A7 | Measure: floor to the bottom of the jhoomar (bottom crystal) | 9 ft: ≈ 145 cm · 10 ft: ≈ 175 cm · 11 ft: ≈ 205 cm · 12 ft: ≈ 235 cm (± 10 cm is fine) |
| A8 | Hold the tape up to the jhoomar's widest point | ≈ 80 cm |
| A9 | In the in-Chrome camera, stand ~2 m from the wall, point at the floor in the middle of the room | The jhoomar hangs **above the spot you pointed at** (1–2.5 m away), never on or inside the wall, straight down from the ceiling. Point at a table first: it should **not** sit on the table — it waits for the floor. **One finger** left/right: it spins in place (doesn't move or tilt). **Two fingers:** slide — it moves across the room, still hanging at the ceiling; pinch — bigger/smaller, % shows at the top, top stays at the ceiling; twist — it spins. **Double-tap** — real size. Walk around and under it, look up: it stays in the same place. Note any slow drift: ____ |
| A10 | Look at it closely | Brass looks metallic; bulbs look lit (glowing); crystals look like clear/frosted glass |
| A11 | Tap the back arrow | You're back on the product page |
| A12 | Tap **Enquire on WhatsApp** | WhatsApp opens with a message containing the product name, code JH-DEMO-08 and the link |

## B. iPhone — Safari (AR Quick Look)

| # | Step | Expected |
|---|---|---|
| B1 | Open the product page | Poster shows straight away |
| B2 | Drag / pinch on the photo | Rotates and zooms in 3D |
| B3 | Tap **View in your room** → pick height → **Open camera** | Apple's AR view opens. Time: ____ s (file is ~2 MB) |
| B4 | Tap **AR** at the top (if it opens in "Object" mode) and point at the floor | Soft gold circle on the floor |
| B5 | Step back, look up | Jhoomar hangs at ceiling height above the circle |
| B6 | Measure floor → bottom of the jhoomar | Same numbers as A7 |
| B7 | Pinch | Size stays fixed |
| B8 | Look closely | Brass metallic; bulbs glowing; crystals semi-transparent (Quick Look shows simpler glass than the browser — note how it looks) |
| B9 | Tap ✕ | Back on the page |
| B10 | Tap **Enquire on WhatsApp** | WhatsApp opens with the pre-filled message |

## C. Laptop — any browser

| # | Step | Expected |
|---|---|---|
| C1 | Open the product page | 3D viewer on the left, a QR code box "See it in your room" on the right, no "View in your room" button |
| C2 | Scan the QR code with a phone camera | Product page opens on the phone **with the ceiling-height sheet already open** |

## D. Things that should fail gracefully

| # | Step | Expected |
|---|---|---|
| D1 | Android phone **without** Google Play Services for AR (or a very old phone) → Open camera | You come back to the page with the message "This phone can't show it in your room. You can still rotate it in 3D above." |
| D2 | Open the page inside the Instagram / Facebook in-app browser | No AR button (those browsers can't open AR). 3D still works. |
| D3 | Slow connection (Chrome DevTools → "Slow 4G", or a weak signal) | Photo shows first; "Loading 3D…" then rotation works |

---

## Results

| Phone (model + OS) | Browser | A/B steps that passed | Problems seen (step #, what happened, screenshot) |
|---|---|---|---|
| | | | |
| | | | |

Please send screenshots or a screen recording of A6/B5 (the jhoomar hanging) and any failures.

## Known limits (not bugs)

- The AR preview does **not** light up the real room.
- Scene Viewer and Quick Look have no "ceiling detection", which is why you point at the floor and choose your ceiling height. Automatic ceiling detection is a phase 2 experiment (Android only).
- Glass looks best in the browser 3D viewer; Quick Look and Scene Viewer render crystals more simply.
