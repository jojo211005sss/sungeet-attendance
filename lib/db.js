import pg from "pg";

// One way to talk to Postgres (Supabase in production, Neon for local dev):
//   const sql = connect(url)
//   const rows = await sql`SELECT * FROM users WHERE id = ${id}`   (values are sent as parameters)
//   await sql.unsafe("fixed SQL text")   and   await sql.end()
//
// Uses node-postgres through Supabase's transaction pooler (port 6543), the
// mode meant for serverless: a connection is only borrowed for one query, so
// many Vercel instances can't use up the free plan's ~15 database connections.
// (postgres.js got stuck in this mode, and session mode ran out of connections.)
export function connect(url) {
  const clean = new URL(url.replace(/^"|"$/g, ""));
  if (clean.hostname.endsWith(".pooler.supabase.com")) clean.port = "6543";
  // TLS is set below; these URL options would override it.
  for (const key of ["sslmode", "channel_binding"]) clean.searchParams.delete(key);
  const local = ["localhost", "127.0.0.1"].includes(clean.hostname);

  const pool = new pg.Pool({
    connectionString: clean.toString(),
    // Encrypted. Supabase's pooler certificate isn't from a public authority, so it isn't verified.
    ssl: local ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });
  pool.on("error", (error) => console.error("Idle database connection error:", error.message));

  const sql = (strings, ...values) =>
    pool
      .query({ text: strings.reduce((text, part, i) => `${text}$${i}${part}`), values: values.map((v) => (v === undefined ? null : v)) })
      .then((result) => result.rows);
  sql.unsafe = (text) => pool.query(text).then((result) => result.rows);
  sql.end = () => pool.end();
  return sql;
}
