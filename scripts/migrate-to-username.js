import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("🚀 Starting Email to Username Migration...");

  try {
    // 1. Rename email column to username
    await sql`ALTER TABLE users RENAME COLUMN email TO username`;
    console.log("✅ Column renamed: email -> username");

    // 2. Drop unique constraint if it was specifically named, 
    // but Postgres usually renames it automatically. 
    // We just want to make sure it's still UNIQUE.

    console.log("🎊 Migration Complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  }
}

migrate();
