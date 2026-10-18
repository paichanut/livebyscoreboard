# Live by Scoreboard — project context for Claude Code

**Name: Live by Scoreboard** (not "Rinkboard"; that old name survives only in localStorage keys `rinkboard:*` and the Supabase project name, kept so saved logins/keys still work). Web-based ice hockey scoreboard (React + Vite, hosted on Vercel, live sync via Supabase).
**Production: https://livebyscoreboard.vercel.app** (Vercel project `livebyscoreboard`, auto-deploys main). Supabase project `rinkboard` (ap-southeast-1). The old Vercel project `rinkboard` is deleted; use only livebyscoreboard.
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
| `/login` | Login.jsx | operator login (username + password) |
| `/teams` | Teams.jsx | team logo library (this browser) |

## Architecture

- `src/game.js` — **pure** state model + mutations. No React, no network. All hockey logic lives here (clock, periods, penalties, strength 5v4/4v3, timeouts, goal flash). Keep it pure.
- `src/options.js` — options schema + `defaultOptions()` + `withDefaults()` (deep-merges defaults into older saved games). Add new options here first.
- `src/sync.js` — store abstraction. Supabase realtime when env keys set; local store only when `VITE_ALLOW_LOCAL=1` (test build), otherwise `createStore` throws and App shows Setup. Reads are public; **writes go through `save_game(id, key, state)` RPC** which checks the operator key. Rapid taps are coalesced (~80 ms). `createGamesList()` feeds the `/live` page (table-wide realtime, or a localStorage scan).
- `src/i18n.js` — control-page UI strings (`en`, `th`), `translator(lang)`. Chosen by `opts.uiLang` (Options → Text). Display labels are separate free text in `opts.labels`. Options tab names + Save/Cancel are translated; the Options body is still English.
- `src/useGame.js` — React hook `useGame(gameId, {key, canWrite})` → `[state, update(fn), access]`. `update` takes a function `(state) => newState` (use game.js mutations). `useGameId()` parses `/b|c|o/CODE` or `?g=`.
- `src/useOptions.jsx` — `useAppearance(s)` applies theme/colors/font to `<html>`; `useGameSounds(s, enabled)` plays configured sounds on events (display side only).
- `src/horn.js` — Web Audio playback. Samples from `public/sounds/*.mp3`: `horn-nhl` (4.2 s, the default goal horn) and `horn-nhl-short` are an NHL-style three-chime air horn synthesized by `scripts/make-nhl-horn.py` (no recordings used); horn, horn-short, horn-loop, buzzer are converted from PC Scoreboards WAVs (mono 48 kbps) are decoded once after `unlockAudio()` (needs a user gesture); synth horn/buzzer/beep are the fallback. `playSound(kind)` takes a `SOUND_CHOICES` value from options.js.
- `src/Options.jsx` — tabbed options screen (Game, Teams, Keys, Colors, Sounds, Text, Banner, Other). Edits a draft copy, saves via `G.setOptions`.
- `src/styles.css` — one file. Themes are `[data-theme=...]` CSS-variable sets; per-element color overrides are `--c-*` vars set by `useAppearance`.
- `supabase.sql` — tables `games` (public select only), `game_keys`, `operators`, `operator_sessions` (no access); RPCs `create_game`, `save_game`, `check_key`, `server_now`, `operator_login/logout/check/whoami`, `get_game_key`, `delete_game`, `set_operator` (SQL editor only). Safe to re-run; the later definitions in the file win.

### Clock design (important)
The clock is NOT ticked over the network. State stores `{remainingMs, running, since}`; every device derives the current value locally with `clockRemaining(state, now)`. `now` comes from `src/clock.js` (`now()` = `Date.now()` + offset to the server), never from `Date.now()` directly: in live mode `sync.js` measures the offset via the `server_now()` RPC (fallback: HTTP Date header) on load, every 5 min and on tab focus, so a phone with a wrong system time still agrees with the TV. `TimeBadge` shows the offset when it exceeds 0.5 s. **Penalties (per the standalone-scoreboard brief, IIHF):** they count REAL elapsed time while `live = clock.running && playLive` (playLive = the whistle / "All penalties Start/Stop"), never the game clock, so a clock correction never moves them. Stored per penalty: `elapsedMs` as of `state.penFoldAt`; `penaltyView()` derives remaining/status for every screen. Max 2 running per side (Rule 26.1), later ones `waiting` (board shows `+N`). A goal by the side with more skaters ends the scored-against side's least-time running minor (double minor: only the current 2:00); never majors/misconducts, never on a penalty-shot goal (Rule 16.2). Misconduct (10:00) takes no slot and no strength. Call `foldPenalties()` before anything that changes `live` or the penalty list (the mutations in game.js already do). The **control page is the authority**: it stops the clock at 0, prunes expired penalties, ends timeouts (interval in Control.jsx).

### State shape (see `newGame()` in game.js)
`home/away {name, score, shots, color}`, `playLive`, `penFoldAt`, `showTimeOfDay`, `period` ('1'..'n','OT','SO'), `periodLengthMs`, `skaters` (3/4/5), `theme`, `clock`, `penalties[]`, `horn`/`buzzer` counters (bump = play), `timeout`, `goalFlash`, `events[]` (game log: goal/penalty/timeout/so with period + clock, capped at 400; −1 on a score undoes the last goal entry), `shootout {home[], away[]}` ('goal'|'miss'), `opts` (see options.js), `updatedAt` (used to drop stale echoes).

Penalty kinds (`kindOf`): `minor`/`double`/`major` take one of the two slots and reduce strength. `coincidental: true` (RB 19.1), `misconduct` and `game` (game misconduct, 20 min in the log, no clock) never take a slot, never change strength and are not on the display/banner (`onPenaltyClock`). A misconduct starts only when the same player's slot penalties are over. A penalty-shot goal (`addScore(..., {penaltyShot: true})`) releases nobody. OT length is `opts.otMinutes` (IIHF: 5 round robin, 10 playoffs).

`summaryText(s)` / `summaryCsv(s)` in game.js render the log for export (Control → 📋 Summary).

## Decisions already made
- **Operator login.** Operators log in at `/login` (username + password, table `operators`, bcrypt via pgcrypto). The session token (30 days, table `operator_sessions`) lives in localStorage `rinkboard:session` and is passed to `save_game`/`check_key`/`create_game` instead of a game key; it never goes in a URL. Only a logged-in operator can create a game. Add/change an operator in the Supabase SQL editor: `select public.set_operator('name','password');` (logs that user out). Wrong password costs 1 s; no lockout a stranger could trigger.
- **Watching is public:** `/b/`, `/o/`, `/live` need no login.
- Per-game helper links still work: each game gets a random key in `game_keys`; a logged-in operator gets it via `get_game_key` (Control → QR → Copy operator link) and `?k=KEY` lets a helper run that one game without logging in.
- Sound is ON by default on both the display and the control page (horn/buzzer play on both; unlocks itself where allowed, e.g. OBS; otherwise on the first tap anywhere). Mute choice is remembered per device (`rinkboard:sound:board`, `rinkboard:sound:ctl`).
- Supabase SQL functions are plain `language sql` on purpose: plpgsql bodies time out through the Supabase MCP connector.
- Options sync with the game (stored in `state.opts`) so phone changes reach the TV.
- Images (logos, banners) are stored as resized data-URLs (≤512 px) inside state; fine for Supabase jsonb.
- Skipped from PC Scoreboards on purpose: video queue, CSV data output, hardware relays, shot clock, screen size/position, log file.
- Fonts from Google Fonts (Barlow Condensed default; Share Tech Mono for 7-segment look).
- Shootout attempts are recorded (●/○ on display, banner, control) but the deciding goal is **not** added automatically: the operator taps + GOAL for the winner.
- Control page mirrors the PC Scoreboards control screen: All times / Period time / All penalties Start-Stop, Reset, Show time of day, Timeouts, Goal light ◁ None ▷, Correction (set clock), Help (keys sheet), New game, Show scoreboard; penalty list with + (add, infraction templates from `opts.penaltyTemplates`), ✎ edit, ✕ remove, ••• ±1/±5 s.
- Keyboard defaults copy PC Scoreboards Options → Keys (`DEFAULT_KEYS` / `KEY_GROUPS` in options.js), plus Space toggle and ↑/↓ ±1 s.
- Display layouts (`opts.layout`): **`arena` (default)**: team logo above the name, tournament logo above the clock, one penalty box per team under its card (no title: the team color stripe and position say whose) with 3 positions (IIHF off-ice handbook; running first, waiting dimmed, then +N), optional background photo `opts.bgImg` (JPEG ≤1280 px, darkened so the numbers stay readable). `compact`: one broadcast panel (the operator's earlier OBS design: navy gradient, clock in a green box, period number, tournament logo, scores in team colors, penalties under each team only when present, date + time of day along the bottom). `full`: team logo faded behind the score, 2 penalties + "+N" under the clock. `minimal`: big numbers only.
- Control page layout (≥900 px): clock card in the middle (status, ±1/±5 s beside the clock, START/STOP, All times / Period time / All penalties, ±1:00 / SET, period, horn/buzzer/time of day, timeouts, goal light), team cards left/right (tap the name to rename/recolor), and everything fits one screen (sizes use vh). Menu row and the status line (game code · who is logged in / log out, or "game key only · Log in" · live) sit at the bottom.
- Goal on the display: only the scoring team's card background flashes (numbers and shots never move); "GOAL! + team name" blinks in `.evslot`, a fixed-height slot under the strength chip that is always reserved (so nothing moves or overlaps; strength stays visible).
- Every display card has the same rounded frame in every theme (`--frame` per theme; team color stays on the top/left edge).
- Time of day (`state.showTimeOfDay`, Control → Show time of day, key M) is shown UNDER the game clock on the display and banner, never instead of it.
- Display background: `opts.bgOpacity` (default 50 %; 100 = solid for a TV). Below 100 the page is see-through for OBS / camera-app overlays: cards stay solid, the middle (period/clock) is a card too, the status line and brand are hidden and the sound button only shows on hover. A background photo (`opts.bgImg`, arena) overrides it.
- Tournament logo + background photo are in Options → Teams (top).
- Team logos page `/teams` (Teams.jsx): upload several logos at once; each becomes a saved team named from the file name (`nameFromFile`: "bangkok_bears.png" → "Bangkok Bears"); rename, recolor, replace logo (320 px), delete. Linked from Home, Options → Teams and the control team sheet.
- Saved teams (`src/teamLibrary.js`): name, color, logo kept in this browser's localStorage (`rinkboard:teams`), added when Options or the control team sheet is saved; picked with one tap in both places. Not shared between devices (a shared Supabase table was proposed but not applied).
- Deleting games: `/live` → "Manage games" (logged-in operators) → 🗑 Delete on a card. RPC `delete_game(id, token)`; the key row goes with it (cascade).
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

## Conventions
- Plain JS + JSX, no TypeScript. Functional components, hooks, no state library.
- Keep hockey rules in game.js; keep UI dumb.
- Commit messages: short imperative summary line.
