import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function fixSequences() {
  console.log("🛠️ Fixing Database Sequences...");
  try {
    // This syncs the ID counter with the actual number of users/items you have
    await sql`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`;
    await sql`SELECT setval('attendance_id_seq', (SELECT MAX(id) FROM attendance))` ;
    await sql`SELECT setval('daily_activity_id_seq', (SELECT MAX(id) FROM daily_activity))`;
    
    console.log("✅ Sequences synchronized successfully!");
  } catch (error) {
    console.error("❌ Error fixing sequences:", error);
  }
}

fixSequences();
