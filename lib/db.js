import postgres from "postgres";

// One driver for any Postgres host (Neon now, Supabase next). prepare: false
// so it works through connection poolers (Neon "-pooler", Supabase port 6543).
// undefined is sent as null and JSON text is sent as-is (not encoded twice),
// which is what the old Neon driver did.
export function connect(url) {
  const clean = new URL(url.replace(/^"|"$/g, ""));
  clean.searchParams.delete("channel_binding"); // Neon adds it; postgres.js would pass it on as a setting
  return postgres(clean.toString(), { prepare: false, max: 5, idle_timeout: 20, onnotice: () => {}, transform: { undefined: null },
    types: { json: { to: 3802, from: [114, 3802], serialize: (x) => (typeof x === "string" ? x : JSON.stringify(x)), parse: JSON.parse } }
  });
}
