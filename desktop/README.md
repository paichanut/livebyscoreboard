# Live by Scoreboard — offline desktop app (Windows)

One computer, no internet: the control page opens on the laptop screen and the scoreboard opens
**full screen on the second screen (HDMI)** by itself. Plug the HDMI in later and it moves there.
Both windows are one program, so there is always exactly one game; it is saved on the computer and
is still there after a restart.

- Display window: F11 or double-click = full screen on/off. Closing it only hides it; Control → Display brings it back.
- Horn / buzzer play without tapping first (no browser autoplay block).
- OBS on the same computer: use **Window Capture** on the Display window.
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
