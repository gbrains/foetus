# NYT via Library — one-click pass + login

Double-click one shortcut and it will:

1. Open your library's NYT pass page.
2. Enter your library card number (and PIN if asked).
3. Follow the hand-off to NYTimes.com and redeem the pass.
4. Uncheck every newsletter / marketing / "send me updates" box on the way.
5. Log in to your NYTimes.com account.
6. Finish on the NYTimes.com home page, in a normal browser window you keep reading in.

It never clicks anything that mentions subscribing, trials, prices, or payment.

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
   - `NYT_EMAIL` / `NYT_PASSWORD`.
3. In this folder run `npm run setup` (installs the automation browser). The launchers also do this on their first run.

`.env` stays on your computer only; it is git-ignored.

## The "link"

A plain web link can't type into other websites, so the shortcut runs a small local script:

| OS | Launcher | Make it a desktop/Dock link |
|---|---|---|
| macOS | `NYT via Library.command` | Drag it to the Dock, or right-click > Make Alias and move the alias to the Desktop |
| Windows | `nyt-via-library.bat` | Right-click > Send to > Desktop (create shortcut) |
| Linux | `nyt-via-library.sh` | Make a `.desktop` launcher pointing at it |

Or from a terminal: `npm start`.

## When something changes

- **CAPTCHA / "are you a robot"**: the script pauses and waits up to 5 minutes for you to solve it in the window.
- **It gets stuck**: the browser stays open so you can finish by hand, and a screenshot is saved in `screenshots/`.
- **The library step fails**: run `npm run inspect`. It opens the library page without typing anything and writes its fields, buttons and links to `library-page-report.txt` (no passwords in it). Share that report to get exact selectors, or copy `selectors.example.json` to `selectors.json` and point the keys at the right fields/buttons.

The browser profile is kept in `.browser-profile/`, so NYT may remember your login between runs.

## Test

`npm test` runs the whole flow against mock library and NYT pages (no network, no real accounts), and checks that the pass is redeemed, no newsletter opt-ins are submitted, no subscribe link is clicked, and the run ends on the home page.
