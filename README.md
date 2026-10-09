# Rinkboard

Browser-based ice hockey scoreboard. Open the **display** on a TV, run the **control** from your phone, share the display link/QR with spectators.

## Links (like ScoreLeader's `/b/CODE`)

| Link | Who | Can edit? |
|---|---|---|
| `/b/CODE` | public display — TV, spectators' phones, QR | no |
| `/o/CODE` | OBS overlay / score banner | no |
| `/c/CODE?k=KEY` | operator — keep this private | yes |
| `/live` | tournament page: all games, running ones first | no |

Create a game on `/` (optionally pick your own code). You get the operator link; the QR/Share button shows all three.
The key is remembered in the operator's browser, so reopening `/c/CODE` on the same phone still works.
Writes go through a Supabase function that checks the key, so the public links are read-only even for someone who reads the source.

## Options (⚙ on the control page)

Mirrors the PC Scoreboards options dialog:

- **Game** — full/minimal layout, period length, number of periods, OT label, clock direction up/down, 3v3/4v4/5v5, timeout 1 & 2 durations, timeout warning time, goal indicator on/off + auto-off, custom penalty lengths
- **Teams** — names, colors, logos (upload or URL)
- **Keys** — rebind every keyboard shortcut (click, press key)
- **Colors** — theme presets + per-element colors (background, clock, scores, period, shots, penalty player/time, goal)
- **Sounds** — real arena samples (horn, long looping horn, short horn, buzzer) or synth / beep / none for: horn, buzzer, end of period, timeout start, timeout warning, timeout end. Samples are in `public/sounds/`; the synth plays if a file can't load.
- **Text** — control page language (English / ไทย), rename every display label (Thai etc.), font, 7-segment digit style
- **Banner** — OBS overlay at `/banner?g=CODE`: choose fields, mirror, chroma-key color, banner/clock colors
- **Other** — scoreboard title or banner image, top-left/right pictures, logo, confirm toggles, new game, reset options

Features: game clock with tenths under 1:00 · periods 1/2/3/OT/SO · goals · shots on goal · penalties with player number and live countdown (2/4/5/10 min) · power-play strength badge (5v4, 4v3, …) · 3v3 / 4v4 / 5v5 mode · team names & colors · 4 themes (dark arena, light, LED classic, ice) · timeouts (0:30 / 1:00) · goal flash · horn (button + automatic at 0:00) · keyboard shortcuts · QR share · shootout attempts (● / ○ on the display and banner) · game summary export (📋 Summary → copy / .txt / .csv with goals, penalties, timeouts, running score) · Thai control page.

Shootout: in period **SO** each team card gets Goal / Miss / undo buttons. The deciding goal is not added by itself — tap **+ GOAL** for the winner when it's decided.

Keyboard (control page): `Space` start/stop · `H`/`A` goal · `J`/`S` shot · `N` next period · `B` horn · `↑`/`↓` ±1 s.

## Deploy to Vercel (5 minutes)

1. Push this folder to a GitHub repo.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Framework: **Vite** (auto-detected). Deploy.
3. You get `https://<project>.vercel.app`. Rename the project in Settings → General if the name is taken.

At this point it works in **local mode**: display and control must be in the same browser (e.g. a laptop plugged into the TV, with the control tab open). For phone → TV sync, add Supabase:

## Live sync with Supabase (free)

1. [supabase.com](https://supabase.com) → New project (free tier).
2. SQL Editor → paste `supabase.sql` → Run.
3. Project Settings → API → copy **Project URL** and **anon public** key.
4. Vercel → Project → Settings → Environment Variables:
   - `VITE_SUPABASE_URL` = project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
5. Deployments → Redeploy. The home page now says "live sync on".

The anon key only allows reading. Scores can only be changed through the `save_game` function with the game's operator key, which lives in a table nobody can read — so sharing the public link (or even the source) never lets anyone edit a game.

Re-run `supabase.sql` whenever you update the app: it is safe to run again and adds new functions (e.g. `server_now()`, which keeps the clock on every device in step even when a phone's system time is wrong).

Checklist after the redeploy: `/` shows **live sync on**; create a game on a laptop, open its `/b/CODE` link on a phone, tap + GOAL on the laptop → the phone updates within a second. If the phone shows "Board not found", the SQL did not run (table missing); if the home page still says "local mode", the env vars are not on the Production environment or the deploy ran before they were added.

## Run locally

```bash
npm install
cp .env.example .env   # optional: add Supabase keys
npm run dev
```

## Use it at the rink

- TV/laptop: open `/board?g=yourcode`, press F11, tap **"tap to enable horn"** once (browsers need a tap before playing sound).
- Phone: open `/control?g=yourcode`. Settings → team names, colors, period length, 3v3/5v5, theme.
- QR button on the control page shows a QR for spectators to follow on their phones.
- OBS / stream overlay: add `/board?g=yourcode` as a Browser Source (1920×1080).

## Tests

```bash
npm run test:unit            # game logic (node:test)
npm run test:e2e:install     # once, downloads Chromium
npm run test:e2e             # Playwright: control + display in one browser, local mode
```

## Project layout

```
src/game.js      pure game logic (clock, penalties, strength) — no React
src/sync.js      Supabase realtime or localStorage+BroadcastChannel fallback
src/useGame.js   React hook binding the store
src/Board.jsx    TV display
src/Control.jsx  operator panel + sheets (penalty, set clock, settings, QR)
src/styles.css   layout + themes
supabase.sql     table + policies + realtime
tests/unit       game.js unit tests · tests/e2e  Playwright flows
```
