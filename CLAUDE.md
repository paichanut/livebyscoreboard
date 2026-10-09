# Rinkboard — project context for Claude Code

Web-based ice hockey scoreboard (React + Vite, hosted on Vercel, live sync via Supabase).
Owner: Pai. Built for the "3on3 Paradise 2026 OCT" tournament and future rink use; also used as an OBS overlay for streams.
Reference product we are mirroring: PC Scoreboards "Hockey Scoreboard Pro v3" (Windows desktop) and ScoreLeader's public-link model.

## Run / build

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are REQUIRED; without them every route shows Setup.jsx
npm run dev              # http://localhost:5173
npm run build            # dist/ (Vercel builds this automatically)
```

**Cloud mode only.** Production never falls back to a local store: no keys → `Setup.jsx` with the setup steps. The same-browser local store (localStorage + BroadcastChannel) still exists in `sync.js` but only for the test build (`npm run build:test` = `vite build --mode test`, which loads `.env.test` → `VITE_ALLOW_LOCAL=1`). Decision made after a tournament-day mix-up where Chrome and OBS each had their own "copy" of the game.

## Pages / routes (src/App.jsx)

| Route | File | Purpose |
|---|---|---|
| `/` | Home.jsx | create a game → operator link |
| `/b/CODE` (`/board?g=`) | Board.jsx | public TV display, read-only |
| `/o/CODE` (`/banner?g=`) | Banner.jsx | OBS overlay strip, chroma-key bg, read-only |
| `/c/CODE?k=KEY` (`/control?g=`) | Control.jsx | operator panel (phone or laptop) |
| `/live` (`/games`) | Live.jsx | tournament page: every game, newest/running first, links to `/b/CODE` |

## Architecture

- `src/game.js` — **pure** state model + mutations. No React, no network. All hockey logic lives here (clock, periods, penalties, strength 5v4/4v3, timeouts, goal flash). Keep it pure.
- `src/options.js` — options schema + `defaultOptions()` + `withDefaults()` (deep-merges defaults into older saved games). Add new options here first.
- `src/sync.js` — store abstraction. Supabase realtime when env keys set; local store only when `VITE_ALLOW_LOCAL=1` (test build), otherwise `createStore` throws and App shows Setup. Reads are public; **writes go through `save_game(id, key, state)` RPC** which checks the operator key. Rapid taps are coalesced (~80 ms). `createGamesList()` feeds the `/live` page (table-wide realtime, or a localStorage scan).
- `src/i18n.js` — control-page UI strings (`en`, `th`), `translator(lang)`. Chosen by `opts.uiLang` (Options → Text). Display labels are separate free text in `opts.labels`. Options tab names + Save/Cancel are translated; the Options body is still English.
- `src/useGame.js` — React hook `useGame(gameId, {key, canWrite})` → `[state, update(fn), access]`. `update` takes a function `(state) => newState` (use game.js mutations). `useGameId()` parses `/b|c|o/CODE` or `?g=`.
- `src/useOptions.jsx` — `useAppearance(s)` applies theme/colors/font to `<html>`; `useGameSounds(s, enabled)` plays configured sounds on events (display side only).
- `src/horn.js` — Web Audio playback. Samples from `public/sounds/*.mp3` (horn, horn-short, horn-loop, buzzer; converted from PC Scoreboards WAVs, mono 48 kbps) are decoded once after `unlockAudio()` (needs a user gesture); synth horn/buzzer/beep are the fallback. `playSound(kind)` takes a `SOUND_CHOICES` value from options.js.
- `src/Options.jsx` — tabbed options screen (Game, Teams, Keys, Colors, Sounds, Text, Banner, Other). Edits a draft copy, saves via `G.setOptions`.
- `src/styles.css` — one file. Themes are `[data-theme=...]` CSS-variable sets; per-element color overrides are `--c-*` vars set by `useAppearance`.
- `supabase.sql` — tables `games` (public select only) and `game_keys` (no access), RPCs `create_game`, `save_game`, `check_key`, `server_now`. Safe to re-run.

### Clock design (important)
The clock is NOT ticked over the network. State stores `{remainingMs, running, since}`; every device derives the current value locally with `clockRemaining(state, now)`. `now` comes from `src/clock.js` (`now()` = `Date.now()` + offset to the server), never from `Date.now()` directly: in live mode `sync.js` measures the offset via the `server_now()` RPC (fallback: HTTP Date header) on load, every 5 min and on tab focus, so a phone with a wrong system time still agrees with the TV. `TimeBadge` shows the offset when it exceeds 0.5 s. Penalties store `clockAtStart` and derive remaining from the game clock, so all screens agree without chatter. The **control page is the authority**: it stops the clock at 0, prunes expired penalties, ends timeouts (interval in Control.jsx).

### State shape (see `newGame()` in game.js)
`home/away {name, score, shots, color}`, `period` ('1'..'n','OT','SO'), `periodLengthMs`, `skaters` (3/4/5), `theme`, `clock`, `penalties[]`, `horn`/`buzzer` counters (bump = play), `timeout`, `goalFlash`, `events[]` (game log: goal/penalty/timeout/so with period + clock, capped at 400; −1 on a score undoes the last goal entry), `shootout {home[], away[]}` ('goal'|'miss'), `opts` (see options.js), `updatedAt` (used to drop stale echoes).

`summaryText(s)` / `summaryCsv(s)` in game.js render the log for export (Control → 📋 Summary).

## Decisions already made
- Game code in path, operator key in `?k=` and localStorage (`rinkboard:key:CODE`). Public links can't write even with source access.
- Options sync with the game (stored in `state.opts`) so phone changes reach the TV.
- Images (logos, banners) are stored as resized data-URLs (≤512 px) inside state; fine for Supabase jsonb.
- Skipped from PC Scoreboards on purpose: video queue, CSV data output, hardware relays, shot clock, screen size/position, log file.
- Fonts from Google Fonts (Barlow Condensed default; Share Tech Mono for 7-segment look).
- Shootout attempts are recorded (●/○ on display, banner, control) but the deciding goal is **not** added automatically: the operator taps + GOAL for the winner.
- Button groups inside Options/sheets use `<div>` rows, not `<label>` (label text would click the first button).

## Testing

```bash
npm run test:unit          # node:test — tests/unit/game.test.js (clock, penalties, strength, periods, option merge)
npm run test:e2e:install   # once: downloads Chromium for Playwright
npm run test:e2e           # Playwright — tests/e2e/*.spec.js, `build:test` (local store enabled) + `vite preview` on :4173
npm test                   # both
```

E2E tests open the control page and the board in the same browser context (test build's local store = localStorage + BroadcastChannel), each with a unique game code. `PW_CHROMIUM_PATH=/path/to/chrome` uses a system Chromium instead of the downloaded one. Helpers live in `tests/e2e/helpers.js`. Keep game-rule tests in the unit file; keep e2e tests to flows a user would do.

## Ideas / backlog (not started)
- Thai for the Options body (tabs/Save/Cancel are done; field labels still English)
- Penalty queue beyond 2 shown on display (stacking rule)
- Per-team name colors and "goal off" color (PC Scoreboards has them; we have one `teamName` color)
- More rebindable keys from PC Scoreboards: reset period time, start/stop all penalties, remove penalty
- Supabase env vars on Vercel still to be set by Pai (README has steps); Vercel deploy is done

## Conventions
- Plain JS + JSX, no TypeScript. Functional components, hooks, no state library.
- Keep hockey rules in game.js; keep UI dumb.
- Commit messages: short imperative summary line.
