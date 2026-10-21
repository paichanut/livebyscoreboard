# Cloud session handoff — Live by Scoreboard

Updated 2026-10-21. Continue in the existing repository `paichanut/livebyscoreboard`, branch `main`. Do not create a replacement repository.

## Desktop team library follow-up

The desktop app now automatically persists the shared team library, including logo bytes, in `downloaded-teams.json` under its existing user data folder. It reads disk before checking the network, preserves downloaded teams offline, and refreshes the library on startup, reconnection, every five minutes online, or Team logos → Check for team updates. Unchanged external images are reused; changed images that fail to download retain their previous local copy and retry later. Personal teams and current game selections are independent. See `desktop/teams.cjs`, its IPC handlers/preload, and `desktop/README.md`. Run `npm run test:desktop` for the built desktop UI checks (real disk cache, mocked Electron IPC and remote/game endpoints). This requires installing the desktop release containing the cache; deploying Vercel alone does not update an installed desktop app.

## Scoreboard text colors

Corresponding text uses the same element color on both sides: scores, team names, penalty player numbers and event labels. Custom Colors settings apply to both sides, including all four small-ice scores. Team accent colors remain on borders and flashes.

## Current penalty display follow-up

The follow-up changes shorten the referee neck and clarify tripping (below knee), kneeing (front of knee), and clipping (behind knee). Every scoreboard layout clips the illustration to a lower region after its score. The publication details below describe the earlier baseline release; check GitHub Actions and the latest release for the follow-up version.

## Published state

- Production: https://livebyscoreboard.vercel.app/
- Application commit: `c11f7074e08525c1e4d8792a631bcd7cf3d8508a`.
- Application tree: `cfafd2d792fce950f1022ad56fff7e4702d96790`, verified identical to the tested local files.
- Vercel reports successful deployment of that application commit.
- Windows release **v1.0.37** is published: https://github.com/paichanut/livebyscoreboard/releases/tag/v1.0.37
- Windows build succeeded: https://github.com/paichanut/livebyscoreboard/actions/runs/39544206622
- PR #3 was merged earlier; v1.0.36 contained the always-on, zero-time buzzer fix. The current update preserves it.

The handoff note itself is a later documentation commit. It does not require another Windows release.

## User requirements implemented

1. Homepage button and public **/referee-signals** page with 34 original animated SVG illustrations, English/Thai text, search, categories, per-card/global pause, and reduced-motion support.
2. Adding a penalty displays the corresponding animated referee, player and call on the offending team's side for 15 seconds. The latest user correction requires the announcement to stay **only in the SOG/penalty area below the score; never cover any score**. Keep the center clock visible. Announcements use English-only text and a dark slate referee background. Options → Game → Show referee animation on scoreboard enables/disables them (on by default), preserving normal penalty text and timers when off. Rink A/B calls stay with their own rink.
3. Small ice has **Display A** (A only), **Display B** (B only), and **Display C** (CENTER, both games). Desktop A/B open independent windows; C retains existing automatic HDMI placement. A/B can be moved to monitors and toggled full screen with F11.
4. All four scores in the center view align horizontally, including different team-name lengths and missing logos. Reserved logo/name rows are deliberate. The tournament logo fills more available center space with padding.
5. Desktop Online link offers both fixed Vercel entry URLs and dynamic Cloudflare URLs. Telegram includes both complete sets, including A/B/C.
6. Regular **IIHF 3x3** playing penalties award a **penalty shot**, keeping three skaters per team. Do not apply the standard overtime 4v3 calculation to the default 3x3 game.

## Rules distinction

Official 3x3 overview: https://www.iihf.com/en/static/71162/3x3_ice_hockey
It specifies three skaters plus goalkeeper and penalties resulting in a penalty shot with full-team chase.

- Selecting 3v3 defaults to penalty-shot rules, including saved 3v3 games.
- `opts.threeOnThreeRules === 'overtime'` explicitly opts into the separate standard manpower procedure.
- A penalty shot is a pending penalty record, not a switch to the end-of-game shootout period.
- Playing penalties become `kind: 'shot'`, with no two-minute manpower clock. The operator completes a shot with the check button. Completion does not automatically add a goal.
- Existing penalty-shot goal controls still record goals manually.
- Misconduct/game-misconduct disciplinary handling is retained separately.
- Standard game manpower still never drops below three skaters.

Referee illustrations are original code-native drawings based on **IIHF Official Rule Book 2026/27, Appendix I, pp. 163–169**:
https://blob.iihf.com/iihf-media/iihfmvc/media/downloads/rule%20book/2026-27_iihf_rule_book.pdf

## Important code

- `src/RefereeSignals.jsx`, `RefereeFigure.jsx`, `refereeSignals.js`, `referee-signals.json`: animated guide and infraction mapping.
- `src/PenaltyAnnouncement.jsx`, `penalty-announcement.css`, `Board.jsx`: side-specific score overlay and center layout. Preserve selector specificity: global `styles.css` loads after component styles.
- `src/game.js`, `Control.jsx`, `Options.jsx`: 3x3 penalty decisions, completion, recording and settings.
- `desktop/main.cjs`: independent A/B windows; the old window handler discarded rink queries and is fixed.
- `desktop/share.cjs`, `preload.cjs`, `src/DesktopShare.jsx`: pairing, fixed/dynamic links, heartbeat and Telegram.
- `api/desktop-link.js`, `lib/desktop-links.js`, `src/DesktopLink.jsx`: registration, secure lookup and routing.
- `scripts/make-referee-animations.py`: regenerate pose JSON; `--samples <directory>` generates charging/slashing/wash-out GIF previews with Pillow.
- Printable HTML moved to `public/referee-signals-print.html` to avoid Vite clean-URL collision with the animated page. The existing `public/referee-signals.pdf` remains static and linked.

## Fixed-link architecture and setup

Pair once in desktop **Online link → Pair fixed link**, using a unique machine code and the existing operator username/password. The password is used for pairing and is not saved.

Example permanent entry URLs:
- `https://livebyscoreboard.vercel.app/b/MACHINENAME`
- `https://livebyscoreboard.vercel.app/c/MACHINENAME`
- `https://livebyscoreboard.vercel.app/o/MACHINENAME`

Codes normalize to lowercase, 3–40 letters/numbers/hyphens, starting with a letter/number. Small-ice side views append `?rink=a` or `?rink=b`; the unsuffixed display is C.

The fixed address resolves and redirects to the desktop's current verified Cloudflare tunnel. It is a stable entry address, **not an independent second transport**. Desktop must be running with Online link enabled. Local scoring remains offline-capable.

- Registry rows reuse the existing Supabase `games` and private `game_keys` RPCs. No SQL migration or new service-role secret is required.
- Registry state is `state.desktopRelay`; it has no scoreboard fields and is excluded from Live games.
- Pairing stores an owner hash, not the public username, and keeps the registration key in desktop `share.json`.
- Only HTTPS `*.trycloudflare.com` tunnel origins are accepted.
- The heartbeat is every minute, and stale registrations expire after three minutes.
- Public watch links reveal no controller/pairing secret. Fixed controllers require an operator session; tokens go in the POST body, not the URL.
- A controller key derives from the private registration key plus nonce. Key rotation invalidates old dynamic controller links and cookies.
- Existing operator accounts retain the application's existing trust model: operators can control any game.
- Desktop uses the Vercel API; Supabase keys are not embedded in the offline build.
- Vercel API uses existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` server environment variables.

## Verification completed

- **57 unit tests passed**, including fixed-link authentication/lease checks, safe tunnel destinations, secret exclusion, Telegram's two link sets, desktop window routing, 3x3 shots and minimum manpower.
- 59 browser cases were exercised. The full parallel run exposed one CSS alignment issue and a strict buzzer observer timing outlier under load. CSS was fixed; all **15 affected guide/small-ice/buzzer checks passed with one worker**. Final two strength checks also passed after the last UI-label correction.
- Isolated period-buzzer measurements were approximately **0–2 ms** between playback start and displayed zero, for browser and desktop autoplay policies. This measures Web Audio start vs DOM observation, not physical speaker latency.
- Web and desktop Vite builds passed.
- **Five cloud-route browser smoke scenarios passed** against a local cloud-configured build with mocked registry responses: watch, signed-out login gate, signed-in controller, offline, and unsafe destination rejection.
- Live Vercel deployment success was confirmed through GitHub deployment status. Direct live browser/HTTP verification was blocked by this desktop execution environment's networking (`ERR_ADDRESS_UNREACHABLE`).
- Actual account pairing and Telegram delivery on the user's installed desktop were **not manually exercised**. Do not claim they were.

Useful commands:
```sh
npm ci
npm run test:unit
npx playwright test --workers=1
npm run build
npm run build:desktop

# Against a cloud-configured deployment, read-only: registry/tunnel responses are mocked in the browser.
LBS_SITE=https://livebyscoreboard.vercel.app node scripts/check-desktop-routing.mjs
```

For Windows Chrome tests set `PW_CHROMIUM_PATH`; in a cloud Linux session install Playwright Chromium if needed. Keep time-sensitive buzzer tests on one worker when the host is busy.

## Next session / remaining operator verification

1. Start from latest `origin/main`; read this note and inspect repository status. Older context in `CLAUDE.md` can describe pre-update behavior; the current code/tests and this note describe the latest implementation.
2. User should update/install **v1.0.37**, pair their machine in Online link, and enable sharing.
3. Verify fixed and dynamic watch/controller URLs, both Telegram link sets, restart persistence, and the actual monitor arrangement.
4. If networking permits, rerun the read-only cloud-route smoke script against production and inspect the real animated page on desktop/mobile.
5. Never request passwords, bot tokens or operator sessions in chat, and do not commit them.

Direct Git networking in the original desktop execution environment failed, but the connected GitHub account successfully published the exact tested tree and updated main with an expected-head check. This was not a new repository, forced reset or replacement deployment. Normal authenticated Git may work in the cloud session.

The original Windows attachments and current desktop game/logo data are local to the user's computer. Do not assume a cloud clone has those files or the desktop's saved game. Generated illustrations and the printable PDF are in this repository.

