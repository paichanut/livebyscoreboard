# Permanent desktop addresses

`desktop-machines.sql` is applied to the production project (2026-10-23; it had never been applied before, so pairing failed with “Permanent desktop links need setup on the server.”). It is safe to run again in the **SQL Editor**; plain `language sql` functions, like the rest of the project. Through the Supabase MCP, run it statement by statement (the whole file in one call times out).

In the desktop app, open **Online link** and **log in once** with the operator account. The app keeps that operator session (30 days on the server) in `share.json` until **Log out**; the password itself is never saved. A session that ended on the server (expired, new password) is noticed at start-up and asks for the login again.

Then type a **machine name** (Pai 2026-10-23: it works like a game code):
- a name this account doesn't have yet is created online, and the control page offers **a new game** for it (the usual New game question);
- a name the account already has moves to this computer (new private key, so the computer that had it stops publishing to it).

**Online game:** while logged in, the desktop copies every change of its game online as the game `game_id` of that machine name (the name itself when that game code is free, else the name + 4 hex; never changes). It shows on Live games and at `/b/<game_id>`; `/b|o/<username>/<machine>` open it too, with or without the Cloudflare link. The web controller for that game only shows that it runs on the desktop app. Timestamps stay in the desktop's clock; `state.desktop.skew` lets web pages show the same clock.

One row per account + machine name (`desktop_machines`, primary key `(owner_username, machine)`); `machine_id` is the installation UUID of the computer holding the name, kept in `share.json`. Keep the app's data folder when moving or reinstalling the app to keep that identity.

- Public display: `https://livebyscoreboard.vercel.app/b/<username>/<machine>`
- Controller: `https://livebyscoreboard.vercel.app/c/<username>/<machine>` — requires the same owner login.
- Banner and rink/shift options use the same account and machine.

The desktop still serves game `main` through Cloudflare. Permanent addresses resolve its current tunnel; they need the app running with Online link enabled. Telegram sends only the existing Cloudflare links. Controller links contain a private controller key and should only be shared with trusted operators.

The new table denies direct anonymous/authenticated access. RPCs enforce ownership in PostgreSQL, independently of the website. Public lookup cannot return the pairing key. Passwords are not saved; the desktop keeps only the operator session token, and older desktop builds that still send a password get a one-request session that is logged out right after.

Regression checks: `npm run test:unit`; run `tests/sql/desktop-machines.sql` using `psql -v ON_ERROR_STOP=1` against a **disposable** database with both schemas installed. That test creates fixtures inside a rolled-back transaction. Browser routing smoke checks use `scripts/check-desktop-routing.mjs` against a cloud-configured build with mocked registry/tunnel responses; they do not register production machines.

## Two-operator Stats mode

Run `stats-mode.sql` in the same SQL Editor after `supabase.sql`. It adds an authenticated, atomic compare-and-save RPC. Existing games and passwords are unchanged. All participating controller devices should reload to the current app version before using Stats mode.

Until this migration is applied, cloud Scoreboard mode continues working and the Stats mode button explains the required setup. Local desktop Stats mode works without Supabase. The desktop's remote controllers use the same three-way conflict checks through its existing Cloudflare connection.

Different fields/events can merge; conflicting edits are rejected with a visible warning. Corrections update the original event, retain the live game clock and penalty time served, and record an undoable history. Summary is a read-only preview with explicit copy/download/print actions. Mode selection is saved per game on each device.

The shared toolbar also has **Undo** for the last 30 game entries/edits made on that device during the current visit, in either mode. It preserves other operators' independent changes and never rewinds the live clock, audio, or settings. Restoring a removed penalty is blocked if its clock has advanced; use the penalty correction controls in that case. New game invalidates the previous game's Undo actions. Persistent per-correction Undo remains available in Stats mode history. This toolbar addition needs no extra SQL migration.

## Demo login

`demo-account.sql` (applied 2026-10-24) adds `operators.is_demo` and `operator_can(token, game)`. The public `demo` / `demo` login may only create, run and delete games whose code starts with `demo-`; it cannot touch real games, the shared team library or desktop machine names. Checks: `tests/sql/demo-account.sql` against a disposable database.
