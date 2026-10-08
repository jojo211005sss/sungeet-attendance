import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL);

async function init() {
  console.log("🚀 Starting Database Initialization...");

  try {
    // 1. Drop existing tables (Optional, for clean slate)
    // await sql`DROP TABLE IF EXISTS daily_activity, attendance, shows, users CASCADE`;

    // 2. Create Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'admin', 'superior'))
      )
    `;

    // 3. Create Shows table
    await sql`
      CREATE TABLE IF NOT EXISTS shows (
        id TEXT PRIMARY KEY,
        date DATE NOT NULL,
        time TEXT NOT NULL,
        location TEXT NOT NULL,
        manager_id INTEGER REFERENCES users(id),
        employee_ids INTEGER[] NOT NULL,
        employee_pay JSONB DEFAULT '{}'::jsonb
      )
    `;

    // 4. Create Attendance table
    await sql`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        show_id TEXT REFERENCES shows(id),
        user_id INTEGER REFERENCES users(id),
        status TEXT NOT NULL,
        approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        reviewed_by INTEGER REFERENCES users(id)
      )
    `;

    // 5. Create Daily Activity table
    await sql`
      CREATE TABLE IF NOT EXISTS daily_activity (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        date DATE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `;

    console.log("✅ Tables created successfully.");

    // 6. Seed Users
    // No fallback: a password committed to a public repo is a leaked password.
    const seedPassword = process.env.SEED_PASSWORD;
    if (!seedPassword || seedPassword.length < 12) {
      throw new Error("Set SEED_PASSWORD (12+ characters) in .env before seeding.");
    }
    const hashedPassword = bcrypt.hashSync(seedPassword, 10);
    const dummyUsers = [
      { id: 1, name: "SUNGGEET Admin", username: "admin@sunggeet.com", password: hashedPassword, role: "admin" },
      { id: 2, name: "Vikram Malhotra", username: "vikram@sunggeet.com", password: hashedPassword, role: "superior" },
      { id: 3, name: "Kabir Sethi", username: "kabir@sunggeet.com", password: hashedPassword, role: "manager" },
      { id: 4, name: "Mira Rao", username: "mira@sunggeet.com", password: hashedPassword, role: "manager" },
      { id: 5, name: "Aarav Mehta", username: "aarav@sunggeet.com", password: hashedPassword, role: "employee" },
      { id: 6, name: "Naina Kapoor", username: "naina@sunggeet.com", password: hashedPassword, role: "employee" },
      { id: 7, name: "Rhea Fernandes", username: "rhea@sunggeet.com", password: hashedPassword, role: "employee" },
      { id: 8, name: "Rohan Varma", username: "rohan@sunggeet.com", password: hashedPassword, role: "employee" },
      { id: 9, name: "Ananya Iyer", username: "ananya@sunggeet.com", password: hashedPassword, role: "employee" }
    ];

    for (const user of dummyUsers) {
      const existingUser = await sql`SELECT id FROM users WHERE id = ${user.id}`;
      if (existingUser.length === 0) {
        await sql`
          INSERT INTO users (id, name, username, password, role)
          VALUES (${user.id}, ${user.name}, ${user.username}, ${user.password}, ${user.role})
        `;
      }
    }
    console.log("✅ Seed users added.");

    // Helper for relative dates
    const getOffsetDate = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().split("T")[0];
    };

    const dMinus3 = getOffsetDate(-3);
    const dMinus2 = getOffsetDate(-2);
    const dMinus1 = getOffsetDate(-1);
    const dToday = getOffsetDate(0);
    const dPlus1 = getOffsetDate(1);
    const dPlus3 = getOffsetDate(3);
    const dPlus5 = getOffsetDate(5);
    const dPlus8 = getOffsetDate(8);

    // 7. Seed Shows
    const shows = [
      { id: `SGT-${dMinus3.replace(/-/g, "").slice(2)}-A`, date: dMinus3, time: "19:30", location: "The Piano Man Jazz Club", manager_id: 3, employee_ids: [5, 6], employee_pay: { "5": 7500, "6": 7500 } },
      { id: `SGT-${dMinus2.replace(/-/g, "").slice(2)}-A`, date: dMinus2, time: "18:00", location: "Blue Tokai Garden Cafe", manager_id: 4, employee_ids: [6, 7, 8], employee_pay: { "6": 6000, "7": 6500, "8": 6000 } },
      { id: `SGT-${dMinus1.replace(/-/g, "").slice(2)}-A`, date: dMinus1, time: "20:00", location: "Olive Bistro Courtyard", manager_id: 3, employee_ids: [5, 7, 9], employee_pay: { "5": 8000, "7": 8000, "9": 7500 } },
      { id: `SGT-${dToday.replace(/-/g, "").slice(2)}-A`, date: dToday, time: "18:30", location: "Cyber Hub Social, Main Stage", manager_id: 3, employee_ids: [5, 6, 8], employee_pay: { "5": 9000, "6": 8500, "8": 8500 } },
      { id: `SGT-${dToday.replace(/-/g, "").slice(2)}-B`, date: dToday, time: "21:00", location: "Hard Rock Cafe", manager_id: 4, employee_ids: [7, 9], employee_pay: { "7": 10000, "9": 10000 } },
      { id: `SGT-${dPlus1.replace(/-/g, "").slice(2)}-A`, date: dPlus1, time: "20:30", location: "Soro Village Pub", manager_id: 4, employee_ids: [5, 6, 7, 8], employee_pay: { "5": 7000, "6": 7000, "7": 7000, "8": 7000 } },
      { id: `SGT-${dPlus3.replace(/-/g, "").slice(2)}-A`, date: dPlus3, time: "19:00", location: "Summer House Cafe Acoustic Lounge", manager_id: 3, employee_ids: [8, 9], employee_pay: { "8": 8000, "9": 8000 } },
      { id: `SGT-${dPlus5.replace(/-/g, "").slice(2)}-A`, date: dPlus5, time: "21:30", location: "Molecule Air Bar & Kitchen", manager_id: 4, employee_ids: [5, 7, 9], employee_pay: { "5": 9500, "7": 9500, "9": 9500 } },
      { id: `SGT-${dPlus8.replace(/-/g, "").slice(2)}-A`, date: dPlus8, time: "20:00", location: "Depot48 Live Music Room", manager_id: 3, employee_ids: [6, 8], employee_pay: { "6": 8500, "8": 8500 } }
    ];

    for (const s of shows) {
      await sql`
        INSERT INTO shows (id, date, time, location, manager_id, employee_ids, employee_pay)
        VALUES (${s.id}, ${s.date}, ${s.time}, ${s.location}, ${s.manager_id}, ${s.employee_ids}, ${JSON.stringify(s.employee_pay)})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log("✅ Seed shows added.");

    console.log("🎊 Database Initialization Complete!");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
}

init();
