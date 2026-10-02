# NYT via Library — one-click library pass

Double-click one shortcut and it will:

1. Open your library's NYT pass page (in a separate automated browser).
2. Enter your library card number (and PIN if asked).
3. Take the NYT redeem link the library issues and open it in **your normal browser**
   (Edge/Chrome), where you're already signed in to NYT.
4. You click **Redeem** there (leave any newsletter boxes unchecked), and read.

**Why the last click is yours:** NYT blocks automated browsers ("You have been blocked
from The New York Times because we suspect that you're a robot"). So the script never
loads nytimes.com itself; NYT only ever sees you in your own browser.

First time only: open nytimes.com in your normal browser and log in, so the redeem
page just needs one click afterwards.

## Homewood Public Library (JCLC)

`.env.example` is already set to Homewood's pass page:
`https://www.jclc.org/c/auth/ny/nyt_homewood.aspx`

- JCLC codes last **24 hours**, so run the shortcut once a day when you want to read.
- Your card must be current, with less than $5 in fines, or the library page will refuse it.
- If the library page asks for a PIN, put it in `LIBRARY_PIN`.

## One-time setup

1. Install [Node.js](https://nodejs.org/) 18 or newer.
2. Copy `.env.example` to `.env` and fill in:
   - `LIBRARY_PASS_URL`: the library page that gives out the NYT pass.
   - `LIBRARY_CARD_NUMBER` (+ `LIBRARY_PIN` if your library uses one).
3. In this folder run `npm run setup` (installs the automation browser). The launchers also do this on their first run.

`.env` stays on your computer only; it is git-ignored.

## The "link"

A plain web link can't type into other websites, so the shortcut runs a small local script:

| OS | Launcher | Make it a desktop/Dock link |
|---|---|---|
| macOS | `NYT via Library.command` | Drag it to the Dock, or right-click > Make Alias and move the alias to the Desktop |
| Windows | `nyt-via-library.bat` | Right-click > Send to > Desktop (create shortcut). For a daily automatic run, see below. |
| Linux | `nyt-via-library.sh` | Make a `.desktop` launcher pointing at it |

Or from a terminal: `npm start`.

## Automatic daily run (Windows)

JCLC passes last 24 hours, so let Windows get a fresh one every day. At the time you
pick, the library step runs and the NYT redeem page opens in your browser, ready for
your one click. Once redeemed, the pass is on your NYT account, so the NYT app and
nytimes.com on your iPhone should work too, signed in to the same account.

1. Finish the one-time setup above (`.env` filled in).
2. Double-click **`schedule-daily.bat`**, enter a time (24-hour clock, e.g. `06:30`), and say **Y** to a test run.

Details:
- The task is called **NYT via Library (daily)** in Task Scheduler.
- It runs while you're signed in to Windows. If the PC was off or asleep at that time, it runs as soon as you're back.
- The automated window opens briefly for the library step and closes itself. If the library step goes wrong, it stays open so you can finish by hand.
- Pick a time you're usually at the PC, since the Redeem click is yours.
- Each run is logged to `logs\nyt-pass.log`.
- To stop it, double-click **`unschedule-daily.bat`**.

## When something changes

- **"Blocked … we suspect that you're a robot"** in your normal browser: that's NYT flagging your network, often after an earlier automated attempt. Wait a while (it usually clears within hours), then open nytimes.com normally and log in.
- **It gets stuck**: the browser stays open so you can finish by hand, and a screenshot is saved in `screenshots/`.
- **The library step fails**: run `npm run inspect`. It opens the library page without typing anything and writes its fields, buttons and links to `library-page-report.txt` (no passwords in it). Share that report to get exact selectors, or copy `selectors.example.json` to `selectors.json` and point the keys at the right fields/buttons.

`NYT_FULL_AUTO=true` in `.env` brings back the old behaviour (log in, uncheck newsletters and redeem inside the automated browser), but expect NYT to block it.

## Test

`npm test` runs against mock library and NYT pages (no real sites or accounts):
- hand-off with a script redirect and with a real HTTP 302: the redeem link is opened in the normal browser and NYT is never loaded in the automated one;
- full auto: the pass is redeemed, no newsletter opt-ins are submitted, no subscribe link is clicked, and it ends on the home page.
