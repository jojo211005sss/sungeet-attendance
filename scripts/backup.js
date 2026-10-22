import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { connect } from "../lib/db.js";

// Saves every table of the live database (pay included) to a dated JSON file.
// Usage: node scripts/backup.js            -> ~/Documents/Sunggeet Backups/
//        node scripts/backup.js <folder>
// ponytail: no restore script yet; the JSON holds every row, add one if a restore is ever needed.
const url = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
const dir = process.argv[2] || path.join(os.homedir(), "Documents", "Sunggeet Backups");
const sql = connect(url);

try {
  const data = {};
  for (const table of ["users", "venues", "shows", "attendance", "daily_activity"]) {
    data[table] = await sql.unsafe(`SELECT * FROM ${table} ORDER BY id`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const file = path.join(dir, `sunggeet-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ taken_at: new Date().toISOString(), ...data }, null, 2));
  const counts = Object.entries(data).map(([t, rows]) => `${t} ${rows.length}`).join(", ");
  console.log(`Saved ${file} (${counts})`);
} finally {
  await sql.end();
}
