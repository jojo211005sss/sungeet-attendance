import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// Sample data for demos: ~2 years of shows, attendance, pay and check-ins so
// Reports, comparisons and every screen have something real to show. Used by
// `node scripts/demo-data.js` and by the admin "Sample data" card in Reports.
//
// Everything is tagged so removal never touches real data:
//   shows      id starts with "DEMO-"
//   people     username ends with ".demo@sunggeet.com" (random passwords, can't sign in)
//   venues     the names in DEMO_VENUES (only deleted once they have no shows)
//   website    published rows whose source_show_id starts with "DEMO-" (upcoming ones show on the public site)

export const DEMO_DOMAIN = ".demo@sunggeet.com";
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
const SET_NAMES = ["Bollywood unplugged", "Sufi night", "Retro evening", "Ghazals & chai", "Acoustic covers", "Qawwali under the stars", "Old Hindi classics"];
const NOTES = ["Two sets, no cover.", "Table reservations recommended.", "Free entry.", "Requests welcome.", null];
const EVENT_TYPES = [["cafe", 7], ["private", 2], ["community", 1]];
const FIRST_MONTH = "2025-01";
const LAST_MONTH = "2026-11";

const usernameFor = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${DEMO_DOMAIN}`;

/** How much demo data is in the database right now. */
export async function demoDataStatus(sql) {
  const [row] = await sql`
    SELECT (SELECT count(*)::int FROM shows WHERE id LIKE 'DEMO-%') AS shows,
           (SELECT count(*)::int FROM users WHERE username LIKE ${"%" + DEMO_DOMAIN}) AS people
  `;
  return { ...row, present: row.shows > 0 || row.people > 0 };
}

export async function removeDemoData(sql, web) {
  if (web) await web`DELETE FROM shows WHERE source_show_id LIKE 'DEMO-%'`;
  await sql`DELETE FROM attendance WHERE show_id LIKE 'DEMO-%'`;
  await sql`DELETE FROM shows WHERE id LIKE 'DEMO-%'`;
  const ids = (await sql`SELECT id FROM users WHERE username LIKE ${"%" + DEMO_DOMAIN}`).map((u) => u.id);
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
  return { removedPeople: ids.length };
}

/** Replaces any earlier demo data with a fresh set. */
export async function addDemoData(sql, web) {
  await removeDemoData(sql, web);

  // Seeded so every run builds the same calendar.
  let seed = 20261010;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const weighted = (list) => {
    const total = list.reduce((sum, item) => sum + item[1], 0);
    let r = rand() * total;
    return list.find((item) => (r -= item[1]) < 0) || list[0];
  };
  const shuffle = (list) => [...list].sort(() => rand() - 0.5);

  // People. Random passwords: these accounts exist to be looked at, not used.
  const people = [...SINGERS.map((name) => [name, "employee"]), ...MANAGERS.map((name) => [name, "manager"])].map(([name, role]) => ({
    name,
    role,
    username: usernameFor(name),
    password: bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 8)
  }));
  const inserted = await sql`
    INSERT INTO users (name, username, password, role)
    SELECT name, username, password, role
    FROM jsonb_to_recordset(${JSON.stringify(people)}::jsonb) AS p(name text, username text, password text, role text)
    RETURNING id, name, role
  `;
  const byName = Object.fromEntries(inserted.map((u) => [u.name, u]));
  const singers = SINGERS.map((name) => byName[name]);
  const managers = MANAGERS.map((name) => byName[name]);

  const savedVenues = await sql`
    INSERT INTO venues (name)
    SELECT name FROM unnest(${DEMO_VENUES.map(([name]) => name)}::text[]) AS name
    ON CONFLICT ((lower(name))) DO UPDATE SET name = venues.name
    RETURNING id, name
  `;
  const venues = DEMO_VENUES.map(([name, weight, pay]) => ({ ...savedVenues.find((v) => v.name.toLowerCase() === name.toLowerCase()), weight, pay }));

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
      shows.push({
        id,
        date,
        time,
        location: venue.name,
        venue_id: venue.id,
        manager_id: manager.id,
        employee_ids: lineup.map((s) => s.id),
        employee_pay: pay,
        manager_pay: 1500 + Math.round(rand() * 2) * 500,
        // website listing
        starts_at: start.toISOString(),
        team_id: teams.length ? pick(teams).id : null,
        event_type: weighted(EVENT_TYPES)[0],
        set_name: pick(SET_NAMES),
        note: pick(NOTES)
      });

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

  // One statement per table instead of hundreds of round trips.
  await sql`
    INSERT INTO shows (id, date, time, location, venue_id, manager_id, employee_ids, employee_pay, manager_pay)
    SELECT id, date, time, location, venue_id, manager_id, employee_ids, employee_pay, manager_pay
    FROM jsonb_to_recordset(${JSON.stringify(shows)}::jsonb)
      AS s(id text, date date, time text, location text, venue_id int, manager_id int, employee_ids int[], employee_pay jsonb, manager_pay numeric)
  `;
  if (attendance.length) {
    await sql`
      INSERT INTO attendance (show_id, user_id, status, approval_status, marked_at, reviewed_at, reviewed_by)
      SELECT show_id, user_id, 'marked', approval_status, marked_at, reviewed_at, reviewed_by
      FROM jsonb_to_recordset(${JSON.stringify(attendance)}::jsonb)
        AS a(show_id text, user_id int, approval_status text, marked_at timestamptz, reviewed_at timestamptz, reviewed_by int)
    `;
  }

  // A published website listing per show: upcoming ones appear on the public
  // calendar, and the team link feeds Reports → Teams.
  if (web && teams.length) {
    await web`
      INSERT INTO shows (starts_at, venue, city, event_type, team_id, set_name, note, is_published, source_show_id)
      SELECT starts_at, location, 'New Delhi', event_type, team_id, set_name, note, true, id
      FROM jsonb_to_recordset(${JSON.stringify(shows)}::jsonb)
        AS s(id text, starts_at timestamptz, location text, event_type text, team_id bigint, set_name text, note text)
    `;
  }

  // Today's check-ins, so Team and Check-in have something to show.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const checkins = [...singers, ...managers].slice(0, 8).map((p) => ({ user_id: p.id, status: rand() < 0.75 ? "active" : "inactive" }));
  await sql`
    INSERT INTO daily_activity (user_id, date, status, updated_at)
    SELECT user_id, ${today}::date, status, now()
    FROM jsonb_to_recordset(${JSON.stringify(checkins)}::jsonb) AS c(user_id int, status text)
    ON CONFLICT (user_id, date) DO NOTHING
  `;

  return { shows: shows.length, attendance: attendance.length, singers: singers.length, managers: managers.length, venues: venues.length };
}

function nextMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
