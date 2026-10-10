import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { addDemoData, removeDemoData } from "../lib/demo-data.js";

// Sample data for demos (see lib/demo-data.js for what it adds and how it's tagged).
//
//   node scripts/demo-data.js          add (replaces any earlier demo data)
//   node scripts/demo-data.js remove   delete all demo data
//
// This uses the database in your .env. Production has its own database: use the
// "Sample data" card in Reports on the live site instead.

const sql = neon(process.env.DATABASE_URL);
const web = process.env.WEBSITE_DATABASE_URL ? neon(process.env.WEBSITE_DATABASE_URL) : null;

try {
  if (process.argv[2] === "remove") {
    const { removedPeople } = await removeDemoData(sql, web);
    console.log(`🧹 Demo data removed (${removedPeople} demo people).`);
  } else {
    const r = await addDemoData(sql, web);
    console.log(`✅ Demo data added: ${r.shows} shows, ${r.attendance} attendance entries, ${r.singers} singers, ${r.managers} managers, ${r.venues} venues.`);
  }
} catch (error) {
  console.error("❌ Demo data failed:", error);
  process.exit(1);
}
