import "dotenv/config";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

// Adds members from a CSV (name,username,password,role). Skips usernames that already exist.
// Usage: node scripts/add-members.js private/logins.csv
// Live DB: TARGET_DATABASE_URL=... node scripts/add-members.js private/logins.csv
const sql = neon(process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL);
const file = process.argv[2];
if (!file) {
  console.log("Usage: node scripts/add-members.js <file.csv>");
  process.exit(1);
}

const rows = fs.readFileSync(file, "utf8").trim().split("\n").slice(1).map((line) => line.split(",").map((s) => s.trim()));
for (const [name, rawUsername, password, role] of rows) {
  const username = rawUsername.toLowerCase();
  const [user] = await sql`
    INSERT INTO users (name, username, password, role)
    VALUES (${name}, ${username}, ${bcrypt.hashSync(password, 10)}, ${role})
    ON CONFLICT (username) DO NOTHING
    RETURNING id
  `;
  console.log(user ? `added   ${username} (${role})` : `exists  ${username}`);
}
