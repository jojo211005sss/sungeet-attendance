import postgres from "postgres";

// One driver for any Postgres host (Neon now, Supabase next). prepare: false
// so it works through connection poolers (Neon "-pooler", Supabase port 6543).
// undefined is sent as null and JSON text is sent as-is (not encoded twice),
// which is what the old Neon driver did.
//
// fetch_types is off: looking types up on a fresh connection through a pooler
// could leave parallel queries stuck. The array types the app uses are below.
const quote = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const splitArray = (x) => (x === "{}" ? [] : x.slice(1, -1).split(","));

export function connect(url) {
  const clean = new URL(url.replace(/^"|"$/g, ""));
  clean.searchParams.delete("channel_binding"); // Neon adds it; postgres.js would pass it on as a setting
  // Supabase: use the pooler's session mode (5432). Its transaction mode (6543)
  // leaves parallel parameterised queries stuck when the app starts cold.
  if (clean.hostname.endsWith(".pooler.supabase.com")) clean.port = "5432";
  return postgres(clean.toString(), {
    prepare: false,
    fetch_types: false,
    max: 3, // Supabase's free session pooler allows ~15 connections in total
    idle_timeout: 20,
    onnotice: () => {},
    transform: { undefined: null },
    types: {
      json: { to: 3802, from: [114, 3802], serialize: (x) => (typeof x === "string" ? x : JSON.stringify(x)), parse: JSON.parse },
      intArray: { to: 1007, from: [1007], serialize: (x) => `{${x.map(Number).join(",")}}`, parse: (x) => splitArray(x).map(Number) },
      // Text lists are only ever sent (show ids, venue names), never read back.
      textArray: { to: 1009, from: [1009], serialize: (x) => `{${x.map(quote).join(",")}}`, parse: splitArray }
    }
  });
}
