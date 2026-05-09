import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("🚀 Adding employee_pay column to shows table...");

  try {
    await sql`
      ALTER TABLE shows 
      ADD COLUMN IF NOT EXISTS employee_pay JSONB DEFAULT '{}'::jsonb
    `;
    console.log("✅ Column employee_pay added successfully.");
    console.log("🎊 Migration Complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();
