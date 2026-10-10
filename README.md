# SUNGGEET Attendance System

Full-stack app for singer attendance, manager approvals, pay, reports, venues and the public website's content.

**Live:** https://sungeet-attendance.vercel.app  
**How to use it (step by step, with screenshots):** [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

## Stack

- React + Tailwind CSS frontend
- Node.js + Express backend
- JWT authentication
- `.xlsx` export with `write-excel-file`
- Seeded local data for fast demo/testing

## Run

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:4000

## Getting Started

1.  **Configure Environment:** Copy `.env.example` to `.env` and set your `DATABASE_URL` and `JWT_SECRET`.
2.  **Initialize Database:** Run `node scripts/init-db.js` to set up tables and initial accounts.
3.  **Start Development:** Run `npm run dev` to start both the frontend and backend.

For security, please change the default passwords for all administrative accounts immediately after initialization.

## Core Flows

- Employee views assigned shows grouped by date and marks attendance once per show.
- Manager views assigned shows and approves or rejects pending attendance.
- Admin can view all shows, add members, create shows, and export attendance data to `.xlsx`.
- Export includes attendance rows plus employee and manager summary sheets.

## Production Notes

- Replace `JWT_SECRET` in `.env` before deployment.
- Swap the seeded arrays in `server/index.js` with PostgreSQL-backed repositories.
- Store hashed passwords only; the local seed uses `bcryptjs` for demo users.

## Demo data

The live database holds sample data so Reports and comparisons have something to show
(Jan 2025 – Nov 2026: 237 shows, 8 singers, 2 managers, 7 venues). It is all tagged and can be removed at any time:

```bash
node scripts/demo-data.js remove
```

Run `node scripts/demo-data.js` to add it again. Demo people have usernames ending in `.demo@sunggeet.com` and random passwords (they can't sign in); demo show IDs start with `DEMO-`; each demo show is also published on the website, so upcoming ones appear on the public calendar (removing the demo data takes them down too).
