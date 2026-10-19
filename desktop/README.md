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
  "Registered tunnel connection". No internet: retries every minute; nothing is sent. The control page and
  every other path are never served through the link.
- Not available offline: the public web links, /live, phone control, login.

## Build

```bash
npm ci && npm run build:desktop          # web app → desktop/web (mode "desktop": local store, bundled fonts)
cd desktop && npm ci
npx electron-builder --win msi nsis portable # on Windows (or CI). On Linux without Wine:
npx electron-builder --win zip -c.win.signAndEditExecutable=false
```

CI: `.github/workflows/desktop.yml` builds the .msi, the installer .exe and the portable .exe on `windows-latest` for every
push to main that touches the app, and publishes them as a GitHub Release.
