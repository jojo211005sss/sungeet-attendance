import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("🚀 Starting Database Migration...");

  try {
    // Drop the old constraint
    await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`;

    // Add the new constraint
    await sql`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN ('employee', 'manager', 'admin', 'superior'))
    `;

    console.log("✅ Database migration complete. Added 'superior' role to CHECK constraint.");
  } catch (error) {
    console.error("❌ Error migrating database:", error);
  }
}

migrate();
