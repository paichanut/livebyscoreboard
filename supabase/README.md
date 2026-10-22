# Permanent desktop addresses

Apply `desktop-machines.sql` in the existing project's **Supabase Dashboard → SQL Editor → New query → Run**, after the original `supabase.sql` schema. It is safe to run again. No game data is renamed or removed, and no operator passwords are changed.

The API uses the existing Supabase URL and anon key. No new secret is required. Until the migration is applied, pairing fails with “Permanent desktop links need setup on the server.” Cloudflare sharing continues to work.

In the desktop app, open **Online link**, choose a machine name and pair using the owning operator account. An older flat permanent address can be upgraded there by signing in once. The installation UUID is generated and persisted in `share.json`; the visible name remains stable when pairing again. Keep the app's data folder when moving or reinstalling the app to preserve its identity.

- Public display: `https://livebyscoreboard.vercel.app/b/<username>/<machine>`
- Controller: `https://livebyscoreboard.vercel.app/c/<username>/<machine>` — requires the same owner login.
- Banner and rink/shift options use the same account and machine.

The desktop still serves game `main` through Cloudflare. Permanent addresses resolve its current tunnel; they need the app running with Online link enabled. Telegram sends only the existing Cloudflare links. Controller links contain a private controller key and should only be shared with trusted operators.

The new table denies direct anonymous/authenticated access. RPCs enforce ownership in PostgreSQL, independently of the website. Public lookup cannot return the pairing key. Pairing passwords are not saved, and temporary login sessions are logged out after registration.

Regression checks: `npm run test:unit`; run `tests/sql/desktop-machines.sql` using `psql -v ON_ERROR_STOP=1` against a **disposable** database with both schemas installed. That test creates fixtures inside a rolled-back transaction. Browser routing smoke checks use `scripts/check-desktop-routing.mjs` against a cloud-configured build with mocked registry/tunnel responses; they do not register production machines.

## Two-operator Stats mode

Run `stats-mode.sql` in the same SQL Editor after `supabase.sql`. It adds an authenticated, atomic compare-and-save RPC. Existing games and passwords are unchanged. All participating controller devices should reload to the current app version before using Stats mode.

Until this migration is applied, cloud Scoreboard mode continues working and the Stats mode button explains the required setup. Local desktop Stats mode works without Supabase. The desktop's remote controllers use the same three-way conflict checks through its existing Cloudflare connection.

Different fields/events can merge; conflicting edits are rejected with a visible warning. Corrections update the original event, retain the live game clock and penalty time served, and record an undoable history. Summary is a read-only preview with explicit copy/download/print actions. Mode selection is saved per game on each device.

The shared toolbar also has **Undo** for the last 30 game entries/edits made on that device during the current visit, in either mode. It preserves other operators' independent changes and never rewinds the live clock, audio, or settings. Restoring a removed penalty is blocked if its clock has advanced; use the penalty correction controls in that case. New game invalidates the previous game's Undo actions. Persistent per-correction Undo remains available in Stats mode history. This toolbar addition needs no extra SQL migration.
