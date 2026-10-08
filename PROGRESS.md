# SUNGGEET Attendance
_Last updated: 2026-10-08_

## What this is
Attendance and show management for SUNGGEET's live music team: singers mark shows they performed, managers approve, admins run shows, pay, Excel export, and the public website's content (Website tab).

## How to run it
- `npm install`, then `npm run dev` → web on http://localhost:5173, API on http://localhost:4000.
- Inside Claude Code, the "sungeet" preview in `.claude/launch.json` runs web on **5175** (5173/5174 are used by the `sunggeet main 1` public site) and pins the API to 4000.
- `.env` needs: `DATABASE_URL`, `WEBSITE_DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `SEED_PASSWORD` (see `.env.example`).
- Live: https://sungeet-attendance.vercel.app. Every push to `main` auto-deploys on Vercel.

## Done so far
- Full QA pass (2026-10-07) as admin, singer and manager; everything below works and is live.
- Members, shows, per-singer pay (₹), attendance marking, approvals, Copy Month, delete, Excel export (4 sheets), Daily Check-in, mobile layout.
- Fixes: Add member (DB id counter), dates one day early off-UTC, month filters open on the current month, Copy Month on 31st/Feb, touch-visible row buttons, Add-show defaults to today.
- Security: singers only see their own pay/attendance; attendance only after the show starts (IST); only singers can be assigned; plain error messages on 500s; collision-free show ids.
- Admins can flip an approved/rejected decision.
- Website tab: floater photos load from the public site (`VITE_PUBLIC_SITE_URL`, default https://sungeet-main.vercel.app); image/audio uploads tested end to end incl. the live site; 3MB limit (Vercel's 4.5MB body cap); wav/m4a type fixes; replaced/deleted media is cleaned up (`pruneMedia`).
- 2026-10-08: removed a hard-coded password GitGuardian flagged on the `mock-db-and-show-pay` branch (`fd8e69c`; demo mode now uses `demo1234`, `init-db.js` requires `SEED_PASSWORD`).

- 2026-10-08: UI refresh: Geist font, warm charcoal + single brass accent (Tailwind `slate`/`indigo` remapped in `tailwind.config.js`), solid dialogs (`.modal`, `.modal-backdrop`), fixed squashed Publish/Team forms, "Not Marked" badge now red, 2-column stats on phones.
- Dev quick login: with `DEV_LOGIN=1` in `.env`, `npm run dev` shows Admin / Manager / Singer buttons on the login screen. Local only (not in the production build, route never registers on Vercel). It logs in as real accounts on the live DB.

- 2026-10-08: saved venues. `venues` table (unique on lower(name)) + `shows.venue_id`; migration `scripts/add-venues.js` already run on the live DB (6 venues, all 7 shows linked). `shows.location` still holds the name (website + Excel read it) and is rewritten on rename/merge. New show: type-to-search venue picker (new names auto-saved). Shows → Venues: add, rename, merge duplicates, delete unused. API: `/api/venues` GET/POST/PATCH(name|merge_into)/DELETE, admin + superior only.
- 2026-10-08: Reports rebuilt. Period Month / Year / All time, compare with previous month or last year, views Overview / Venues / Teams / Singers / Managers, tap any one for its own numbers + 12-month trend + compare with another of the same kind. Teams come from website publishing (`GET /api/reports/teams`); unpublished shows count as "No team". Venues are grouped by name (case/space-insensitive).
- 2026-10-08: speed. Vercel functions moved to `sin1` (Singapore, same region as both Neon DBs; they were in `iad1` USA). `/assets/*` cached for a year (hashed names). Client keeps a per-user snapshot in localStorage (`sunggeet-cache:v1:*`, cleared on logout) and paints it instantly, then refreshes in the background; Website data is prefetched after the main load. A 401 now logs out cleanly.
- 2026-10-08: pay is admin-only. The API strips `employee_pay` / `pay` for managers and singers (`forViewer`, `canSeePay` in `api/index.js`); singer screens show no amounts.
- 2026-10-08 (later): full UI/UX redesign, mobile-first, styled after workforce apps (Homebase/Connecteam/Linear). Light warm theme, Geist font, CSS tokens in `src/styles.css`. Phones: bottom tab bar (admin: Home/Shows/Team/Website/More), bottom sheets; desktop: sidebar + right-hand drawers. New: Home approvals inbox (approve/reject inline), Team page (search, roles, today's availability), Reports with pay in ₹, singer "Ready to mark" + earnings, toasts and in-app confirm dialogs instead of alert()/confirm(). Old Admin tab split into Team (members) and Shows (New show / edit in the show drawer); Excel export moved to Reports.

## In progress / next steps
- Delete the QA test data from the live database: TEST Singer One, TEST Singer Two, TEST Manager, show SGT-0710-01 "TEST Venue Rooftop" (their password is `TEST_ACCOUNTS_PASSWORD` in `.env`).
- Change the shared seed password on the real accounts (admin, Kabir, Aarav, Naina, Rhea): `scripts/change-password.js`.
- User to check the Passwords app for any account using the leaked password and change it; mark the GitGuardian alert resolved.
- Optional: make the GitHub repo private (old history still contains the leaked password, though no account uses it).
- Optional: Mac-wide git guard in `~/.git-hooks` (blocks commits as the boss outside VMB) is written but switched OFF — needs the user's OK to test and enable (`git config --global core.hooksPath ~/.git-hooks`).

## Known issues
- `mock-db-and-show-pay` branch has 13 pre-existing lint errors (`clearTimeout` etc. not defined in eslint globals).
- Native "Are you sure?" delete prompts can't be clicked through in the Claude browser pane; tested via the API instead.

## Decisions & notes
- Same Neon database is used locally and on Vercel — local testing writes to live data. Name test data with a "TEST" prefix.
- Website tab writes to the public site's database (`WEBSITE_DATABASE_URL`); changes go live. Test floaters with "Show on the landing page" unticked.
- Git identity: global is sarnjot singh <282075679+jojo211005sss@users.noreply.github.com>; the boss's identity (Sukhman Narula) is set only inside the VMB repo. Never use `git config --global` for one project. (On 2026-09-26 an Antigravity AI did that, so commits and Vercel/GitGuardian emails went to the boss.)
- No Claude co-author lines on commits (turned off in `~/.claude/settings.json`).
- When work is done: commit and push to `main` directly.
