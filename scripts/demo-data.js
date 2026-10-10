import "dotenv/config";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

// Sample data for demos: ~18 months of shows, attendance, pay and check-ins so
// Reports, comparisons and every screen have something real to show.
//
//   node scripts/demo-data.js          add (replaces any earlier demo data)
//   node scripts/demo-data.js remove   delete all demo data
//
// Everything is tagged so removal never touches real data:
//   shows      id starts with "DEMO-"
//   people     username ends with ".demo@sunggeet.com" (random passwords, can't sign in)
//   venues     the names in DEMO_VENUES (only deleted once they have no shows)
//   website    hidden rows whose source_show_id starts with "DEMO-" (never on the public site)

const sql = neon(process.env.DATABASE_URL);
const web = process.env.WEBSITE_DATABASE_URL ? neon(process.env.WEBSITE_DATABASE_URL) : null;

const DEMO_DOMAIN = ".demo@sunggeet.com";
const SINGERS = ["Zoya Siddiqui", "Arjun Malhotra", "Tanvi Rao", "Devansh Gupta", "Sana Qureshi", "Rohan Bhatia", "Ira Chawla", "Vihaan Sood"];
const MANAGERS = ["Priya Menon", "Farhan Ali"];
// [name, how often it books us, base pay per singer in ₹]
const DEMO_VENUES = [
  ["Juniper Courtyard Cafe", 5, 3000],
  ["The Lantern Room", 4, 3500],
  ["Saffron & Strings", 3, 2500],
  ["Mehfil House", 3, 4000],
  ["Roastery Seven", 2, 2000],
  ["Hauz Khas Social Deck", 2, 3000],
  ["Banyan Tree Bistro", 1, 4500]
];
const TIMES = ["19:00", "19:30", "20:00", "20:30", "21:00"];
const FIRST_MONTH = "2025-01";
const LAST_MONTH = "2026-11";

// Seeded so every run builds the same data.
let seed = 20261010;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];
const weighted = (list) => {
  const total = list.reduce((sum, item) => sum + item[1], 0);
  let r = rand() * total;
  return list.find((item) => (r -= item[1]) < 0) || list[0];
};
const shuffle = (list) => [...list].sort(() => rand() - 0.5);
const usernameFor = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${DEMO_DOMAIN}`;

async function remove() {
  if (web) await web`DELETE FROM shows WHERE source_show_id LIKE 'DEMO-%'`;
  await sql`DELETE FROM attendance WHERE show_id LIKE 'DEMO-%'`;
  await sql`DELETE FROM shows WHERE id LIKE 'DEMO-%'`;
  const demoUsers = await sql`SELECT id FROM users WHERE username LIKE ${"%" + DEMO_DOMAIN}`;
  const ids = demoUsers.map((u) => u.id);
  if (ids.length) {
    await sql`DELETE FROM attendance WHERE user_id = ANY(${ids}) OR reviewed_by = ANY(${ids})`;
    await sql`DELETE FROM daily_activity WHERE user_id = ANY(${ids})`;
    await sql`DELETE FROM users WHERE id = ANY(${ids})`;
  }
  const names = DEMO_VENUES.map(([name]) => name.toLowerCase());
  await sql`
    DELETE FROM venues v WHERE lower(v.name) = ANY(${names})
      AND NOT EXISTS (SELECT 1 FROM shows s WHERE s.venue_id = v.id)
  `;
  console.log(`🧹 Demo data removed (${ids.length} demo people).`);
}

async function add() {
  await remove();

  // People. Random passwords: these accounts exist to be looked at, not used.
  const addPerson = async (name, role) => {
    const password = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 10);
    const [user] = await sql`
      INSERT INTO users (name, username, password, role)
      VALUES (${name}, ${usernameFor(name)}, ${password}, ${role}) RETURNING id, name
    `;
    return user;
  };
  const singers = [];
  for (const name of SINGERS) singers.push(await addPerson(name, "employee"));
  const managers = [];
  for (const name of MANAGERS) managers.push(await addPerson(name, "manager"));

  const venues = [];
  for (const [name, weight, pay] of DEMO_VENUES) {
    const [venue] = await sql`
      INSERT INTO venues (name) VALUES (${name})
      ON CONFLICT ((lower(name))) DO UPDATE SET name = venues.name RETURNING id, name
    `;
    venues.push({ ...venue, weight, pay });
  }

  const teams = web ? await web`SELECT id FROM teams ORDER BY sort_order, id` : [];

  // Build the calendar: busier in 2026 than 2025, so "vs last year" shows growth.
  const shows = [];
  const attendance = [];
  const now = new Date();
  for (let month = FIRST_MONTH; month <= LAST_MONTH; month = nextMonth(month)) {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const count = (y === 2025 ? 7 : 10) + Math.floor(rand() * 4) + (m === 12 || m === 3 ? 2 : 0);
    const days = shuffle([...Array(daysInMonth).keys()].map((d) => d + 1)).slice(0, count).sort((a, b) => a - b);

    days.forEach((day, i) => {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const time = pick(TIMES);
      const venue = weighted(venues.map((v) => [v, v.weight]))[0];
      const manager = managers[i % managers.length];
      const lineup = shuffle(singers).slice(0, 2 + Math.floor(rand() * 3));
      const pay = Object.fromEntries(lineup.map((s) => [String(s.id), venue.pay + Math.round(rand() * 3) * 500]));
      const id = `DEMO-${date.replaceAll("-", "")}-${String(i + 1).padStart(2, "0")}`;
      const start = new Date(`${date}T${time}:00+05:30`);
      shows.push({ id, date, time, venue, manager, lineup, pay, start, team: teams.length ? pick(teams).id : null });

      if (start > now) return; // hasn't happened yet
      const ageDays = (now - start) / 86400000;
      for (const singer of lineup) {
        if (rand() < 0.1) continue; // forgot to mark
        const markedAt = new Date(start.getTime() + (1 + rand() * 3) * 3600000);
        let decision = rand() < 0.93 ? "approved" : "rejected";
        if (ageDays < 6 && rand() < 0.6) decision = "pending";
        attendance.push({
          show_id: id,
          user_id: singer.id,
          approval_status: decision,
          marked_at: markedAt.toISOString(),
          reviewed_at: decision === "pending" ? null : new Date(markedAt.getTime() + 20 * 3600000).toISOString(),
          reviewed_by: decision === "pending" ? null : manager.id
        });
      }
    });
  }

  for (const s of shows) {
    await sql`
      INSERT INTO shows (id, date, time, location, venue_id, manager_id, employee_ids, employee_pay)
      VALUES (${s.id}, ${s.date}, ${s.time}, ${s.venue.name}, ${s.venue.id}, ${s.manager.id},
              ${s.lineup.map((x) => x.id)}, ${JSON.stringify(s.pay)})
    `;
  }
  for (const a of attendance) {
    await sql`
      INSERT INTO attendance (show_id, user_id, status, approval_status, marked_at, reviewed_at, reviewed_by)
      VALUES (${a.show_id}, ${a.user_id}, 'marked', ${a.approval_status}, ${a.marked_at}, ${a.reviewed_at}, ${a.reviewed_by})
    `;
  }

  // Which team played: a hidden website row per show (feeds Reports → Teams).
  if (web && teams.length) {
    for (const s of shows) {
      await web`
        INSERT INTO shows (starts_at, venue, city, event_type, team_id, is_published, source_show_id)
        VALUES (${s.start.toISOString()}, ${s.venue.name}, 'New Delhi', 'cafe', ${s.team}, false, ${s.id})
      `;
    }
  }

  // Today's check-ins, so Team and Check-in have something to show.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  for (const person of [...singers, ...managers].slice(0, 8)) {
    await sql`
      INSERT INTO daily_activity (user_id, date, status, updated_at)
      VALUES (${person.id}, ${today}, ${rand() < 0.75 ? "active" : "inactive"}, ${new Date().toISOString()})
      ON CONFLICT (user_id, date) DO NOTHING
    `;
  }

  console.log(`✅ Demo data added: ${shows.length} shows, ${attendance.length} attendance entries, ${singers.length} singers, ${managers.length} managers, ${venues.length} venues.`);
}

function nextMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

const run = process.argv[2] === "remove" ? remove : add;
run().catch((error) => {
  console.error("❌ Demo data failed:", error);
  process.exit(1);
});
