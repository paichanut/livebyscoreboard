# Live by Scoreboard — offline desktop app (Windows)

One computer, no internet: the control page opens on the laptop screen and the scoreboard opens
**full screen on the second screen (HDMI)** by itself. Plug the HDMI in later and it moves there.
Both windows are one program, so there is always exactly one game; it is saved on the computer and
is still there after a restart.

- Display window: F11 or double-click = full screen on/off. Closing it only hides it; Control → Display brings it back.
- The control window always opens in front and keeps the keyboard. **F4** switches: in Control it shows
  the scoreboard, in the scoreboard it goes back to Control. With only one screen the scoreboard waits
  behind the control window.
- HDMI shows the same picture as the laptop? Windows is set to *Duplicate*: press **Win + P → Extend**.
- Horn / buzzer play without tapping first (no browser autoplay block).
- OBS on the same computer: use **Window Capture** on the Display window.
- **Updates:** install with the **Setup .exe** and the app updates itself: when the computer is online it
  checks GitHub Releases ~5 s after start, downloads in the background and installs when the app closes, or
  right away with Control → status line → "Update … ready · Restart" (the game is kept). Never mid-game on its
  own. The .msi and portable copies only say "New version … · Download". Code: `updater.cjs`, `preload.cjs`.
- **Online link + Telegram** (Control → 🌐 Online link, off by default): `share.cjs` serves the scoreboard
  (`/b/main`) and OBS banner (`/o/main`) read-only on `http://127.0.0.1:47615` (OBS on this computer can use
  that, no internet needed) and, when turned on, opens a Cloudflare quick tunnel (`cloudflared`, downloaded
  once into the app's data folder) → `https://….trycloudflare.com`. Viewers get the live state by long polling
  (`/api/state/main?v=…`; quick tunnels don't carry Server-Sent Events). The link is shown and sent to Telegram
  (bot token + chat ID, kept in `share.json` in the data folder, never in the game) only after cloudflared reports
  "Registered tunnel connection" and the public address passes its health check. No internet: retries every minute;
  nothing is sent. Dynamic controller links carry a private key, exchanged for a cookie on first visit.
  Fixed Vercel controller links require an operator login.
- Not available offline: the public web links, /live, phone control, login.

## Build

### Fixed links and small ice screens

In **Online link**, pair a unique machine name with your existing operator username and password.
The password is used once and is not saved. This creates permanent Vercel addresses:
`https://livebyscoreboard.vercel.app/b/MACHINENAME` (watch), `/o/MACHINENAME` (OBS), and
`/c/MACHINENAME` (controller, operator login required). The address finds the desktop's current
Cloudflare tunnel. The desktop must be running with Online link enabled; local scoring still works offline.
An offline desktop shows an offline page instead of creating a separate cloud game.

Telegram sends both the fixed Vercel links and dynamic Cloudflare links after the tunnel is verified.
Registration uses the existing Supabase operator/game-key functions; no database migration is required.
The registration key stays in the desktop's settings, and stale connections expire after three minutes.

Small ice has three buttons: **Display A** (rink A), **Display B** (rink B), and **Display C** (center,
both rinks). A and B open independent windows you can move to your screens; F11 toggles full screen.
C keeps the automatic HDMI placement. The same three choices appear in Telegram.

Select **3v3** for IIHF 3x3 playing penalties: a penalty shot, with three skaters per side.
The optional standard overtime rules use the separate manpower procedure.
Reference: [IIHF 3x3 Ultimate Hockey](https://www.iihf.com/en/static/71162/3x3_ice_hockey).

```bash
npm ci && npm run build:desktop          # web app → desktop/web (mode "desktop": local store, bundled fonts)
cd desktop && npm ci
npx electron-builder --win msi nsis portable # on Windows (or CI). On Linux without Wine:
npx electron-builder --win zip -c.win.signAndEditExecutable=false
```

CI: `.github/workflows/desktop.yml` builds the .msi, the installer .exe and the portable .exe on `windows-latest` for every
push to main that touches the app, and publishes them as a GitHub Release.
