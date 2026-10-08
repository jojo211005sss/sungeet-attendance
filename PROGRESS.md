# PROGRESS — SUNGGEET Attendance

## Run locally
- `npm run dev` → web on 5173, API on 4000 (or the "sungeet" preview config in `.claude/launch.json`: web on 5175, since 5173/5174 are used by the `sunggeet main 1` site).

## 2026-10-07 — full QA pass as admin / singer / manager
Fixed (uncommitted):
- Add member failed with "users_pkey" error — DB id counter was behind the seeded ids. Ran `scripts/fix-sequences.js`; `init-db.js` now resyncs after seeding.
- Show dates were one day early when the API ran outside UTC (local Mac in IST). API now forces UTC, same as Vercel.
- Shows/Data opened on the oldest month (March); now open on the current month.
- Copy Month broke on days that don't exist in the target month (31st → November); now clamps to the month's last day.
- Edit/Delete buttons in Admin lists were invisible on phones (hover-only); now always visible on touch.

Round 2 (same day) — fixed the open issues (uncommitted):
- Floater photos in admin now load from the public site (`VITE_PUBLIC_SITE_URL`, default https://sungeet-main.vercel.app).
- Demo March shows now managed by Kabir, with Rhea as a singer (DB + `init-db.js`). API rejects non-singers in a show's singer list.
- API 500s return plain messages; details stay in server logs.
- Singers only receive their own pay and attendance (shows list, single show, profile).
- Marked shows no longer reopen "Confirm attendance"; attendance can't be marked before the show starts (IST).
- Admin/superior can flip an approved/rejected entry; review errors are shown instead of swallowed.
- Daily check-in uses the India date.
- Show ids: no more collisions after deletes or same DDMM next year.
- Copy Month switches to the new month; approve/mark refresh silently (no skeleton flash, panel stays open).
- Add-show date defaults to today.

Round 3 — image/audio uploads (Website tab), tested end to end incl. the live site serving /api/media:
- Upload limit 3MB (was 8MB, but Vercel rejects bodies over 4.5MB, and base64 adds a third). Checked in the browser before uploading.
- WAV labelled audio/x-wav (Firefox/Windows) and .m4a with no browser type are now accepted; file picker limited to supported types.
- Replaced/removed/deleted images and clips are now deleted from the website DB (`pruneMedia`), unless still referenced.

Test data in the DB: TEST Singer One, TEST Singer Two, TEST Manager (password in `.env` as TEST_ACCOUNTS_PASSWORD) and show SGT-0710-01 "TEST Venue Rooftop".
