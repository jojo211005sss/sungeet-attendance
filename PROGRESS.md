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

- 2026-10-10: manager pay per show (`shows.manager_pay`, added by `ensureSchema()`), set next to the manager in New/Edit show, admin-only (stripped in `forViewer` + profile), counts as due once the show has started, in Excel (Manager Totals + Show Summary) and Reports (Venues/Teams = singers + manager, Singers = own, Managers = own). New show no longer pre-selects a manager.
- 2026-10-10: IMPORTANT: production uses a DIFFERENT DATABASE_URL from local `.env` (prod has show "italy" / manager "jojo"; local has neither). The venues migration and demo data went to the LOCAL DB only. The public site shares the website DB, so demo gigs DID go public. Fix: the API now runs `ensureSchema()` once per server start (venues table, venue_id, backfill), so prod migrates itself. Prod DATABASE_URL is a Vercel Sensitive var (can't be pulled) on a different Neon server, so demo data on prod is loaded from the app: Reports > Sample data (GET/POST /api/demo-data, admin + superior; logic in lib/demo-data.js, batched, ~2s). Local DB is attendance_dev.
- 2026-10-10: sample data added to the LOCAL DB (thought to be live) with `scripts/demo-data.js` (237 shows Jan 2025–Nov 2026, 595 attendance rows, 8 singers + 2 managers ending `.demo@sunggeet.com`, 7 venues, published website rows, so upcoming demo gigs show on the PUBLIC site calendar at the user's request). Remove with `node scripts/demo-data.js remove` before real payroll use, since demo pay shows in Reports totals. Guide screenshots retaken with it. Fixed: long names pushed the approve buttons off phone screens (`.card`/`.row-main` min-width/overflow). Local dev-login also accepts `username`.
- 2026-10-10: prod showed "Couldn't load your workspace" (could not reproduce; DB answered in 0.2s). Likely a cold start beating the 8s timeout. Workspace loads now use a 20s timeout + one retry, users/venues failures no longer block the app, the error screen shows the real reason ("Details: …"), and `/api/health` runs `SELECT 1` and is called from the sign-in screen to wake the DB.
- 2026-10-08: user guide written: `docs/USER_GUIDE.md` (singer / manager / admin tutorial, 34 screenshots in `docs/images`, linked from README). Screenshots were taken with a throwaway puppeteer-core script against the local dev server using the dev quick sign-in; re-shoot after big UI changes.
- 2026-10-08: saved venues. `venues` table (unique on lower(name)) + `shows.venue_id`; migration `scripts/add-venues.js` already run on the live DB (6 venues, all 7 shows linked). `shows.location` still holds the name (website + Excel read it) and is rewritten on rename/merge. New show: type-to-search venue picker (new names auto-saved). Shows → Venues: add, rename, merge duplicates, delete unused. API: `/api/venues` GET/POST/PATCH(name|merge_into)/DELETE, admin + superior only.
- 2026-10-08: Reports rebuilt. Period Month / Year / All time, compare with previous month or last year, views Overview / Venues / Teams / Singers / Managers, tap any one for its own numbers + 12-month trend + compare with another of the same kind. Teams come from website publishing (`GET /api/reports/teams`); unpublished shows count as "No team". Venues are grouped by name (case/space-insensitive).
- 2026-10-08: speed. Vercel functions moved to `sin1` (Singapore, same region as both Neon DBs; they were in `iad1` USA). `/assets/*` cached for a year (hashed names). Client keeps a per-user snapshot in localStorage (`sunggeet-cache:v1:*`, cleared on logout) and paints it instantly, then refreshes in the background; Website data is prefetched after the main load. A 401 now logs out cleanly.
- 2026-10-08: pay is admin-only. The API strips `employee_pay` / `pay` for managers and singers (`forViewer`, `canSeePay` in `api/index.js`); singer screens show no amounts.
- 2026-10-08 (later): full UI/UX redesign, mobile-first, styled after workforce apps (Homebase/Connecteam/Linear). Light warm theme, Geist font, CSS tokens in `src/styles.css`. Phones: bottom tab bar (admin: Home/Shows/Team/Website/More), bottom sheets; desktop: sidebar + right-hand drawers. New: Home approvals inbox (approve/reject inline), Team page (search, roles, today's availability), Reports with pay in ₹, singer "Ready to mark" + earnings, toasts and in-app confirm dialogs instead of alert()/confirm(). Old Admin tab split into Team (members) and Shows (New show / edit in the show drawer); Excel export moved to Reports.

## In progress / next steps
- 2026-10-23: MOVING PROD TO SUPABASE. Project "Sungeet attendace database" (ref `ykizrwmonmhwfryvilyd`, Singapore, free, always on). App now uses postgres.js via `lib/db.js` (works with Neon and Supabase; JSON sent as-is, undefined -> null). Show details are loaded in bulk (`decorateShows`), not per show. Supabase is set up: tables, ids from 1000, RLS ON for every table (blocks Supabase's public Data API; the app's postgres user bypasses it), 21 accounts. Tested locally against it: 21/21 logins, show/mark/approve, pay hidden from singer + manager, Excel, website pages. `.env` PROD_DATABASE_URL = Supabase transaction pooler (port 6543). The Neon sunggeet-prod address was overwritten in .env (still in Neon + Vercel); it only had the 21 accounts.
- NEXT: user pastes PROD_DATABASE_URL into Vercel DATABASE_URL, redeploy, test live. Then optionally delete the Neon sunggeet-prod project and the unused Supabase project "supabase" (Mumbai).
- Backups: `node scripts/backup.js` saves every table to ~/Documents/Sunggeet Backups/ (JSON). Not scheduled yet: needs user's OK for a daily Mac schedule. Website DB (neondb on Neon) still has the Neon hour limit.
- 2026-10-22: NEW PRODUCTION DATABASE. The old live DB (hand-typed hidden DATABASE_URL in Vercel, show "italy" / manager "jojo") was in a Neon account nobody could find, so prod moves to a Neon project the user owns: **sunggeet-prod** (endpoint `ep-falling-leaf-b3017vd3`, Singapore, database `neondb`). Its address is `PROD_DATABASE_URL` in `.env`. Set up with `node scripts/init-db.js --no-seed` (ids start at 1000), then `scripts/add-members.js private/logins.csv`: 17 singers + sample.admin / sample.superior / sample.manager / sample.singer @sunggeet.com. Tested locally (preview "sungeet-prod-db" in .claude/launch.json runs the app on it): all 21 password logins, show create, mark, approve, Excel. Logins for sending out: `private/Sunggeet_Logins.docx` (gitignored). No demo data on it.
- 2026-10-22: DONE. Vercel DATABASE_URL (Production + Preview) now = sunggeet-prod (note on the variable says so), redeployed, user signed in on the live site as sample.admin. Old live DB (italy/jojo) is abandoned. TEST accounts and the old shared seed password no longer matter (not in the new DB).
- Public website DB still has the demo gigs (they show on the public calendar) until removed.
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
