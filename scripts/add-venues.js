import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Venues become saved records so shows pick one from a list instead of
// retyping the name. Safe to run more than once; deletes nothing.
async function migrate() {
  console.log("🚀 Adding venues...");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS venues (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    // One venue per name, ignoring capitals.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS venues_name_key ON venues (lower(name))`;
    await sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES venues(id)`;

    // Backfill from the names already typed on shows. Names that differ only in
    // capitals or spacing become one venue, using the spelling seen most often.
    const inserted = await sql`
      INSERT INTO venues (name)
      SELECT DISTINCT ON (lower(clean)) clean
      FROM (
        SELECT regexp_replace(trim(location), '\\s+', ' ', 'g') AS clean, COUNT(*) AS uses
        FROM shows
        WHERE venue_id IS NULL AND trim(coalesce(location, '')) <> ''
        GROUP BY 1
      ) names
      ORDER BY lower(clean), uses DESC
      ON CONFLICT ((lower(name))) DO NOTHING
      RETURNING id
    `;
    console.log(`✅ ${inserted.length} venues created.`);

    const linked = await sql`
      UPDATE shows s
      SET venue_id = v.id, location = v.name
      FROM venues v
      WHERE s.venue_id IS NULL
        AND lower(regexp_replace(trim(s.location), '\\s+', ' ', 'g')) = lower(v.name)
      RETURNING s.id
    `;
    console.log(`✅ ${linked.length} shows linked to a venue.`);

    const [{ count }] = await sql`SELECT COUNT(*) FROM shows WHERE venue_id IS NULL`;
    console.log(Number(count) ? `⚠️  ${count} shows still have no venue (blank location).` : "🎊 Migration complete.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();
