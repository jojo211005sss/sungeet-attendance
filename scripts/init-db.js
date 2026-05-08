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
        employee_ids INTEGER[] NOT NULL
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
    const hashedPassword = bcrypt.hashSync("dipfYh-pyfqeb-gyhzu1", 10);
    const dummyUsers = [
      { id: 1, name: "Aarav Mehta", username: "aarav@sunggeet.com", password: hashedPassword, role: "employee" },
      { id: 2, name: "Naina Kapoor", username: "naina@sunggeet.com", password: hashedPassword, role: "employee" },
      { id: 3, name: "Kabir Sethi", username: "kabir@sunggeet.com", password: hashedPassword, role: "manager" },
      { id: 4, name: "SUNGGEET Admin", username: "admin@sunggeet.com", password: hashedPassword, role: "admin" },
      { id: 5, name: "Rhea Fernandes", username: "rhea@sunggeet.com", password: hashedPassword, role: "employee" }
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

    // 7. Seed Shows
    const shows = [
      { id: "SGT-1903-A", date: "2026-03-19", time: "18:00", location: "Blue Tokai Garden Cafe", manager_id: 4, employee_ids: [1, 2] },
      { id: "SGT-1903-B", date: "2026-03-19", time: "20:30", location: "The Piano Man Jazz Club", manager_id: 4, employee_ids: [1, 3] },
      { id: "SGT-2003-A", date: "2026-03-20", time: "19:00", location: "Olive Bistro Courtyard", manager_id: 5, employee_ids: [2, 3] },
      { id: "SGT-2103-A", date: "2026-03-21", time: "21:00", location: "Soro Village Pub", manager_id: 5, employee_ids: [1, 2, 3] }
    ];

    for (const s of shows) {
      await sql`
        INSERT INTO shows (id, date, time, location, manager_id, employee_ids)
        VALUES (${s.id}, ${s.date}, ${s.time}, ${s.location}, ${s.manager_id}, ${s.employee_ids})
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
