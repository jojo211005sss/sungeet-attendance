import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import writeXlsxFile from "write-excel-file/node";
import { Buffer } from "node:buffer";
import { neon } from "@neondatabase/serverless";
import { addDemoData, demoDataStatus, removeDemoData } from "../lib/demo-data.js";

// Postgres DATE columns are parsed as local midnight and then serialized with
// toISOString(); outside UTC (e.g. a dev machine in IST) every show date shifts
// back a day. Vercel already runs in UTC, so this makes local match production.
process.env.TZ = "UTC";

if (!process.env.DATABASE_URL) {
  throw new Error("CRITICAL: DATABASE_URL is not set. Please add it to your Vercel Environment Variables.");
}
const sql = neon(process.env.DATABASE_URL);

/**
 * Second connection, to the PUBLIC WEBSITE's database.
 *
 * The two apps deliberately use separate databases: staff records and
 * employee_pay live here, website content lives there. Nothing in this file
 * copies pay data across, and the website has no route that could read it.
 *
 * Unset simply disables the Website section — the rest of the app is
 * unaffected.
 */
const websiteSql = process.env.WEBSITE_DATABASE_URL
  ? neon(process.env.WEBSITE_DATABASE_URL)
  : null;

const requireWebsiteDb = (_req, res, next) => {
  if (!websiteSql) {
    return res.status(503).json({
      message: "WEBSITE_DATABASE_URL is not configured on the server."
    });
  }
  return next();
};


const app = express();
const PORT = process.env.PORT || 4000;

// The live database can be older than the code (it is a different database
// from the local one). Bring its schema up to date once per server start so a
// deploy never depends on someone running a migration by hand. Every statement
// only adds and is safe to repeat; same steps as scripts/add-venues.js.
let schemaReady;
const ensureSchema = () =>
  (schemaReady ??= (async () => {
    await sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS employee_pay JSONB DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS manager_pay NUMERIC`;
    await sql`
      CREATE TABLE IF NOT EXISTS venues (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS venues_name_key ON venues (lower(name))`;
    await sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES venues(id)`;
    // Link any show still without a venue (older rows, or shows from before this).
    await sql`
      INSERT INTO venues (name)
      SELECT DISTINCT ON (lower(clean)) clean
      FROM (
        SELECT regexp_replace(trim(location), '\\s+', ' ', 'g') AS clean, COUNT(*) AS uses
        FROM shows WHERE venue_id IS NULL AND trim(coalesce(location, '')) <> ''
        GROUP BY 1
      ) names
      ORDER BY lower(clean), uses DESC
      ON CONFLICT ((lower(name))) DO NOTHING
    `;
    await sql`
      UPDATE shows s SET venue_id = v.id, location = v.name
      FROM venues v
      WHERE s.venue_id IS NULL
        AND lower(regexp_replace(trim(s.location), '\\s+', ' ', 'g')) = lower(v.name)
    `;
  })().catch((error) => {
    schemaReady = undefined; // try again on the next request
    throw error;
  }));

app.use(async (_req, _res, next) => {
  try {
    await ensureSchema();
  } catch (error) {
    console.error("Schema check failed:", error);
  }
  next();
});

// No fallback. A default secret that ships in a public repo lets anyone forge
// an admin token, so refuse to boot without a real one.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "CRITICAL: JWT_SECRET is not set, or is shorter than 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
  );
}

// Only the front ends we actually ship may call this API from a browser.
// ALLOWED_ORIGINS is a comma-separated list, e.g.
//   https://sungeet-attendance.vercel.app,https://staff.sungsungeet.com
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:4000");
}

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser callers (curl, server-to-server) send no
      // Origin header; those are not what CORS is protecting against.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"));
    },
    credentials: true
  })
);

// 1mb suits every ordinary request. Media uploads are base64 and need much
// more, so they get their own parser rather than raising the limit globally.
const jsonSmall = express.json({ limit: "1mb" });
const jsonUpload = express.json({ limit: "12mb" });
app.use((req, res, next) =>
  req.path === "/api/website/media" ? jsonUpload(req, res, next) : jsonSmall(req, res, next)
);

/**
 * Throttle repeated failed logins per username+IP.
 *
 * In-memory, so each serverless instance keeps its own counter — this raises
 * the cost of a brute-force attempt but does not eliminate it. For a hard
 * guarantee move the counter into Postgres or Upstash Redis, or put the route
 * behind Vercel BotID / WAF rate limiting.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

const loginKey = (req, username) =>
  `${req.headers["x-forwarded-for"] || req.ip || "unknown"}:${username}`;

function loginThrottled(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

// Keep the map from growing without bound on a long-lived instance.
globalThis.setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}, LOGIN_WINDOW_MS).unref?.();

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role
});

const byId = async (id) => {
  const users = await sql`SELECT * FROM users WHERE id = ${Number(id)}`;
  return users[0] || null;
};

const normalizeUsername =  (username)  => String(username || "").trim().toLowerCase();

const isValidRole = (role) => ["employee", "manager", "admin", "superior"].includes(role);

// Every assigned id must be an existing singer (role "employee").
const allSingers = async (ids) => {
  if (!ids.length) return false;
  const [{ count }] = await sql`SELECT COUNT(*) FROM users WHERE id = ANY(${ids}) AND role = 'employee'`;
  return Number(count) === ids.length;
};

const decorateShow = async (show) => {
  try {
    const manager = await byId(show.manager_id);
    const employeeResults = await sql`SELECT * FROM users WHERE id = ANY(${show.employee_ids})`;
    const attendanceResults = await sql`
      SELECT a.*, u.name as employee_name, u.username as employee_username, u.role as employee_role,
             r.name as reviewer_name, r.username as reviewer_username, r.role as reviewer_role
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN users r ON a.reviewed_by = r.id
      WHERE a.show_id = ${show.id}
    `;

    const payMap = show.employee_pay || {};

    return {
      ...show,
      date: show.date instanceof Date ? show.date.toISOString().split("T")[0] : show.date,
      employee_pay: payMap,
      manager: manager ? publicUser(manager) : { name: "Unknown", role: "manager" },
      employees: employeeResults.map((emp) => ({ ...publicUser(emp), pay: payMap[String(emp.id)] ?? null })),
      attendance: attendanceResults.map((entry) => ({
        ...entry,
        employee: { id: entry.user_id, name: entry.employee_name, username: entry.employee_username, role: entry.employee_role },
        reviewer: entry.reviewed_by ? { id: entry.reviewed_by, name: entry.reviewer_name, username: entry.reviewer_username, role: entry.reviewer_role } : null
      }))
    };
  } catch (error) {
    console.error(`Error decorating show ${show.id}:`, error);
    // Return a bare-minimum show object instead of crashing
    return {
      ...show,
      date: show.date instanceof Date ? show.date.toISOString().split("T")[0] : show.date,
      manager: { name: "Error Loading", role: "manager" },
      employees: [],
      attendance: []
    };
  }
};


const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "12h" });

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await byId(payload.id);

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "You do not have access to this action" });
  }

  return next();
};

const canAccessShow = (user, show) => {
  if (user.role === "admin" || user.role === "superior") return true;
  if (user.role === "manager") return show.manager_id === user.id;
  return show.employee_ids.includes(user.id);
};

const getStats = async (user) => {
  const allShows = await sql`SELECT * FROM shows`;
  const visibleShows = allShows.filter((show) => canAccessShow(user, show));
  const visibleShowIds = visibleShows.map((show) => show.id);

  let visibleAttendance;
  if (user.role === "employee") {
    visibleAttendance = await sql`SELECT * FROM attendance WHERE user_id = ${user.id}`;
  } else if (visibleShowIds.length > 0) {
    visibleAttendance = await sql`SELECT * FROM attendance WHERE show_id = ANY(${visibleShowIds})`;
  } else {
    visibleAttendance = [];
  }

  const approvalsDone = user.role === "employee" ? 0 : (await sql`SELECT COUNT(*) FROM attendance WHERE reviewed_by = ${user.id}`)[0].count;

  return {
    totalShows: visibleShows.length,
    approvedShows: visibleAttendance.filter((entry) => entry.approval_status === "approved").length,
    pendingShows: visibleAttendance.filter((entry) => entry.approval_status === "pending").length,
    rejectedShows: visibleAttendance.filter((entry) => entry.approval_status === "rejected").length,
    approvalsDone: Number(approvalsDone)
  };
};

const attendanceLedgerRows = async () => {
  const allShows = await sql`SELECT * FROM shows ORDER BY date ASC`;
  const allUsers = await sql`SELECT * FROM users`;
  const allAttendance = await sql`SELECT * FROM attendance`;

  return allShows.flatMap((show) => {
    const manager = allUsers.find((u) => u.id === show.manager_id);
    const payMap = show.employee_pay || {};

    return show.employee_ids.map((employeeId) => {
      const employee = allUsers.find((u) => u.id === employeeId);
      const entry = allAttendance.find(
        (candidate) => candidate.show_id === show.id && candidate.user_id === employeeId
      );
      const pay = payMap[String(employeeId)];

      return {
        "Artist Name": employee.name,
        "Artist Username": employee.username,
        "Show Date": show.date.toISOString().split("T")[0],
        "Show Time": show.time,
        Venue: show.location,
        "Show ID": show.id,
        Manager: manager.name,
        "Pay (₹)": pay != null ? Number(pay) : "",
        "Attendance Status": entry ? "Marked" : "Not Marked",
        "Approval Status": entry ? titleCase(entry.approval_status) : "Waiting",
        "Marked At": entry?.marked_at ? formatTimestamp(entry.marked_at) : "",
        "Reviewed At": entry?.reviewed_at ? formatTimestamp(entry.reviewed_at) : ""
      };
    });
  });
};

const titleCase = (value) =>
  String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatTimestamp = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));

/* ==========================================================================
   WEBSITE
   Publishes shows from this app onto the public landing page, and manages the
   teams shown there. Admin and superior only.

   A manager still creates a gig once, in Shows. This section decorates it
   with the public-facing fields the scheduling form does not capture (city,
   event type, poster, team) and marks it published. Nothing here creates a
   second copy of a date.
   ========================================================================== */

const websiteGuard = [authenticate, requireRole("admin", "superior"), requireWebsiteDb];

// Everything the Website section needs, in one request.
//
// Deliberately one endpoint and two round trips — one per database — rather
// than separate /shows and /teams calls. Those made five sequential queries
// across two Neon projects, and the website's project auto-suspends, so a
// cold start blew past the client's 8s timeout and the tab just said
// "Request timed out".
app.get("/api/website/data", ...websiteGuard, async (_req, res) => {
  try {
    // Performer names come back with the shows instead of in a second query.
    const shows = await sql`
      SELECT s.id,
             to_char(s.date, 'YYYY-MM-DD') AS date,
             s.time,
             s.location,
             COALESCE((
               SELECT json_agg(u.name ORDER BY u.name)
               FROM users u WHERE u.id = ANY(s.employee_ids)
             ), '[]'::json) AS performers
      FROM shows s
      WHERE s.date >= CURRENT_DATE - INTERVAL '1 day'
      ORDER BY s.date ASC, s.time ASC
    `;

    // Published rows and teams in a single hit on the website database.
    const [site] = await websiteSql`
      SELECT
        COALESCE((
          SELECT json_agg(json_build_object(
            'source_show_id', p.source_show_id, 'id', p.id, 'venue', p.venue,
            'city', p.city, 'event_type', p.event_type, 'set_name', p.set_name,
            'note', p.note, 'ticket_url', p.ticket_url, 'poster_url', p.poster_url,
            'team_id', p.team_id, 'is_published', p.is_published))
          FROM shows p WHERE p.source_show_id IS NOT NULL
        ), '[]'::json) AS published,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline,
            'blurb', t.blurb, 'photo_url', t.photo_url, 'video_url', t.video_url,
            'is_active', t.is_active, 'sort_order', t.sort_order,
            'members', COALESCE((
              SELECT json_agg(json_build_object('id', m.id, 'name', m.name, 'role', m.role)
                              ORDER BY m.sort_order)
              FROM team_members m WHERE m.team_id = t.id
            ), '[]'::json))
            ORDER BY t.sort_order, t.name)
          FROM teams t
        ), '[]'::json) AS teams
    `;

    const bySource = new Map(
      (site.published || []).map((p) => [String(p.source_show_id), p])
    );

    return res.json({
      shows: shows.map((show) => ({
        id: String(show.id),
        date: show.date,
        time: show.time,
        location: show.location,
        performers: show.performers || [],
        website: bySource.get(String(show.id)) ?? null
      })),
      teams: site.teams || []
    });
  } catch (error) {
    console.error("website/data error:", error);
    return res.status(500).json({ message: "Could not load website data" });
  }
});

// Publish or update one show on the website.
app.put("/api/website/shows/:id", ...websiteGuard, async (req, res) => {
  try {
    const sourceId = String(req.params.id);
    const [source] = await sql`
      SELECT id, to_char(date, 'YYYY-MM-DD') AS date, time, location
      FROM shows WHERE id = ${sourceId}
    `;
    if (!source) return res.status(404).json({ message: "Show not found" });

    const city = String(req.body.city || "").trim();
    const eventType = String(req.body.event_type || "").trim();
    if (!city) return res.status(400).json({ message: "City is required" });
    if (!["cafe", "private", "community"].includes(eventType)) {
      return res.status(400).json({ message: "Event type must be cafe, private or community" });
    }

    const venue = String(req.body.venue || source.location || "").trim();
    const setName = req.body.set_name ? String(req.body.set_name).slice(0, 200) : null;
    const note = req.body.note ? String(req.body.note).slice(0, 500) : null;
    const ticketUrl = req.body.ticket_url ? String(req.body.ticket_url).slice(0, 500) : null;
    const posterUrl = req.body.poster_url ? String(req.body.poster_url).slice(0, 500) : null;
    const teamId = req.body.team_id ? Number(req.body.team_id) : null;
    const isPublished = req.body.is_published !== false;

    // The attendance table stores date and time separately; the website wants
    // one instant. These are Delhi gigs, so Delhi local time is the truth.
    const startsAt = `${source.date} ${source.time}:00+05:30`;

    const [before] = await websiteSql`SELECT poster_url FROM shows WHERE source_show_id = ${sourceId}`;
    const [row] = await websiteSql`
      INSERT INTO shows (starts_at, venue, city, event_type, team_id, set_name,
                         note, ticket_url, poster_url, is_published, source_show_id)
      VALUES (${startsAt}::timestamptz, ${venue}, ${city}, ${eventType}, ${teamId},
              ${setName}, ${note}, ${ticketUrl}, ${posterUrl}, ${isPublished}, ${sourceId})
      ON CONFLICT (source_show_id) DO UPDATE SET
        starts_at = EXCLUDED.starts_at,
        venue = EXCLUDED.venue,
        city = EXCLUDED.city,
        event_type = EXCLUDED.event_type,
        team_id = EXCLUDED.team_id,
        set_name = EXCLUDED.set_name,
        note = EXCLUDED.note,
        ticket_url = EXCLUDED.ticket_url,
        poster_url = EXCLUDED.poster_url,
        is_published = EXCLUDED.is_published,
        updated_at = now()
      RETURNING *
    `;

    if (before) await pruneMedia(mediaIdsIn(before.poster_url));
    return res.json({ website: row });
  } catch (error) {
    console.error("website/shows update error:", error);
    return res.status(500).json({ message: "Could not publish show" });
  }
});

// Which team played each published show, for Reports → Teams. Teams live in
// the website database; a show only has a team once it's published with one.
app.get("/api/reports/teams", ...websiteGuard, async (_req, res) => {
  try {
    const [teams, links] = await Promise.all([
      websiteSql`SELECT id, name FROM teams ORDER BY sort_order, name`,
      websiteSql`SELECT source_show_id, team_id FROM shows WHERE source_show_id IS NOT NULL AND team_id IS NOT NULL`
    ]);
    return res.json({
      teams: teams.map((t) => ({ id: String(t.id), name: t.name })),
      links: links.map((l) => ({ show_id: String(l.source_show_id), team_id: String(l.team_id) }))
    });
  } catch (error) {
    console.error("reports/teams error:", error);
    return res.status(500).json({ message: "Could not load teams" });
  }
});

// Remove a show from the website. The gig itself is untouched.
app.delete("/api/website/shows/:id", ...websiteGuard, async (req, res) => {
  try {
    const gone = await websiteSql`
      DELETE FROM shows WHERE source_show_id = ${String(req.params.id)} RETURNING poster_url
    `;
    await pruneMedia(gone.flatMap((row) => mediaIdsIn(row.poster_url)));
    return res.json({ ok: true });
  } catch (error) {
    console.error("website/shows delete error:", error);
    return res.status(500).json({ message: "Could not unpublish show" });
  }
});

app.put("/api/website/teams/:id", ...websiteGuard, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Team name is required" });

    const [before] = await websiteSql`SELECT photo_url, video_url FROM teams WHERE id = ${Number(req.params.id)}`;
    const [team] = await websiteSql`
      UPDATE teams SET
        name = ${name},
        tagline = ${req.body.tagline ? String(req.body.tagline).slice(0, 200) : null},
        blurb = ${req.body.blurb ? String(req.body.blurb).slice(0, 600) : null},
        photo_url = ${req.body.photo_url ? String(req.body.photo_url).slice(0, 500) : null},
        video_url = ${req.body.video_url ? String(req.body.video_url).slice(0, 500) : null},
        is_active = ${req.body.is_active !== false}
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `;
    if (!team) return res.status(404).json({ message: "Team not found" });
    if (before) await pruneMedia(mediaIdsIn(before.photo_url, before.video_url));
    return res.json({ team });
  } catch (error) {
    console.error("website/teams update error:", error);
    return res.status(500).json({ message: "Could not save team" });
  }
});

app.post("/api/website/teams", ...websiteGuard, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Team name is required" });

    const slug = String(req.body.slug || name)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

    const [team] = await websiteSql`
      INSERT INTO teams (slug, name, tagline, blurb, sort_order)
      VALUES (${slug}, ${name},
              ${req.body.tagline ? String(req.body.tagline).slice(0, 200) : null},
              ${req.body.blurb ? String(req.body.blurb).slice(0, 600) : null},
              ${Number(req.body.sort_order) || 0})
      RETURNING *
    `;
    return res.status(201).json({ team });
  } catch (error) {
    console.error("website/teams create error:", error);
    const conflict = String(error.message || "").includes("duplicate");
    return res.status(conflict ? 409 : 500).json({
      message: conflict ? "A team with that name already exists" : "Could not create team"
    });
  }
});

/* --------------------------------------------------------------------------
   FLOATERS + MEDIA

   Floaters are the artist cut-outs that drift around the public landing page
   and sing when tapped. Before this, images anywhere in the Website section
   could only be set by pasting a URL, which is unusable for anyone without
   somewhere to host a file — so uploads land in the website database itself
   (base64 in `media`) and are served back by id. Assets are small: cut-outs
   are compressed in the browser before upload and clips run 10-15s.
   -------------------------------------------------------------------------- */

const MEDIA_MIME = {
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac"]
};
// Decoded ceiling. The 12mb body limit above leaves room for base64's 33%.
// Vercel caps request bodies at 4.5MB and base64 adds a third, so 3MB of file
// is the most that actually reaches this function in production.
const MEDIA_MAX_BYTES = 3 * 1024 * 1024;

// Browsers disagree on names for the same format (Firefox/Windows say x-wav).
const MEDIA_MIME_ALIASES = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-aac": "audio/aac",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg"
};

const MEDIA_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const mediaIdsIn = (...values) =>
  values.flatMap((value) => {
    const match = MEDIA_ID_RE.exec(String(value || ""));
    return match ? [match[0].toLowerCase()] : [];
  });

// Uploads are stored in the website database, so a replaced or removed file
// would otherwise sit there forever. Delete the given ids unless something
// still points at them. Never fails the request that triggered it.
const pruneMedia = async (ids) => {
  const candidates = [...new Set(ids)];
  if (!candidates.length) return;
  try {
    await websiteSql`
      DELETE FROM media m
      WHERE m.id::text = ANY(${candidates})
        AND NOT EXISTS (
          SELECT 1 FROM floaters f
          WHERE f.image_id::text = m.id::text OR f.audio_id::text = m.id::text
             OR f.image_url LIKE '%' || m.id::text || '%' OR f.audio_url LIKE '%' || m.id::text || '%'
        )
        AND NOT EXISTS (
          SELECT 1 FROM teams t
          WHERE t.photo_url LIKE '%' || m.id::text || '%' OR t.video_url LIKE '%' || m.id::text || '%'
        )
        AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.photo_url LIKE '%' || m.id::text || '%')
        AND NOT EXISTS (SELECT 1 FROM shows s WHERE s.poster_url LIKE '%' || m.id::text || '%')
    `;
  } catch (error) {
    console.error("media prune error:", error);
  }
};

app.post("/api/website/media", ...websiteGuard, async (req, res) => {
  try {
    const kind = String(req.body?.kind || "");
    const rawMime = String(req.body?.mime || "").toLowerCase();
    const mime = MEDIA_MIME_ALIASES[rawMime] || rawMime;
    const data = String(req.body?.data || "");
    const filename = req.body?.filename ? String(req.body.filename).slice(0, 200) : null;

    if (!MEDIA_MIME[kind]) return res.status(400).json({ message: "kind must be image or audio" });
    if (!MEDIA_MIME[kind].includes(mime)) {
      return res.status(400).json({ message: `That is not a supported ${kind} format` });
    }
    if (!data) return res.status(400).json({ message: "No file data" });

    const byteSize = Buffer.byteLength(data, "base64");
    if (byteSize > MEDIA_MAX_BYTES) {
      return res.status(413).json({ message: "That file is too large (3MB max)" });
    }

    const rows = await websiteSql`
      INSERT INTO media (kind, mime, data, byte_size, filename)
      VALUES (${kind}, ${mime}, ${data}, ${byteSize}, ${filename})
      RETURNING id
    `;
    res.status(201).json({ id: rows[0].id, byteSize });
  } catch (error) {
    console.error("website/media upload error:", error);
    res.status(500).json({ message: "Could not upload that file" });
  }
});

// Serving is deliberately open and uncached-by-auth: these are the same bytes
// the public site shows. Rows are immutable, so this caches forever.
app.get("/api/media/:id", requireWebsiteDb, async (req, res) => {
  try {
    const rows = await websiteSql`SELECT mime, data FROM media WHERE id = ${String(req.params.id)}`;
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const buf = Buffer.from(rows[0].data, "base64");
    res.setHeader("Content-Type", rows[0].mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);
  } catch (error) {
    console.error("media fetch error:", error);
    res.status(500).json({ message: "Could not load that file" });
  }
});

app.get("/api/website/floaters", ...websiteGuard, async (_req, res) => {
  try {
    const rows = await websiteSql`
      SELECT id, name, role, image_id, audio_id, image_url, audio_url, sort_order, is_active
      FROM floaters ORDER BY sort_order ASC, id ASC
    `;
    res.json({ floaters: rows });
  } catch (error) {
    console.error("website/floaters list error:", error);
    res.status(500).json({ message: "Could not load floaters" });
  }
});

const floaterFields = (body) => ({
  name: String(body?.name || "").trim(),
  role: body?.role ? String(body.role).trim() : null,
  image_id: body?.image_id || null,
  audio_id: body?.audio_id || null,
  image_url: body?.image_url ? String(body.image_url).trim() : null,
  audio_url: body?.audio_url ? String(body.audio_url).trim() : null,
  sort_order: Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0,
  is_active: body?.is_active !== false
});

app.post("/api/website/floaters", ...websiteGuard, async (req, res) => {
  const f = floaterFields(req.body);
  if (!f.name) return res.status(400).json({ message: "A name is required" });
  try {
    const rows = await websiteSql`
      INSERT INTO floaters (name, role, image_id, audio_id, image_url, audio_url, sort_order, is_active)
      VALUES (${f.name}, ${f.role}, ${f.image_id}, ${f.audio_id}, ${f.image_url},
              ${f.audio_url}, ${f.sort_order}, ${f.is_active})
      RETURNING id
    `;
    res.status(201).json({ id: rows[0].id });
  } catch (error) {
    console.error("website/floaters create error:", error);
    res.status(500).json({ message: "Could not add that artist" });
  }
});

app.put("/api/website/floaters/:id", ...websiteGuard, async (req, res) => {
  const f = floaterFields(req.body);
  if (!f.name) return res.status(400).json({ message: "A name is required" });
  try {
    const [before] = await websiteSql`
      SELECT image_id, audio_id, image_url, audio_url FROM floaters WHERE id = ${Number(req.params.id)}
    `;
    await websiteSql`
      UPDATE floaters SET
        name = ${f.name}, role = ${f.role},
        image_id = ${f.image_id}, audio_id = ${f.audio_id},
        image_url = ${f.image_url}, audio_url = ${f.audio_url},
        sort_order = ${f.sort_order}, is_active = ${f.is_active}
      WHERE id = ${Number(req.params.id)}
    `;
    if (before) await pruneMedia(mediaIdsIn(before.image_id, before.audio_id, before.image_url, before.audio_url));
    res.json({ ok: true });
  } catch (error) {
    console.error("website/floaters update error:", error);
    res.status(500).json({ message: "Could not save that artist" });
  }
});

app.delete("/api/website/floaters/:id", ...websiteGuard, async (req, res) => {
  try {
    const [gone] = await websiteSql`
      DELETE FROM floaters WHERE id = ${Number(req.params.id)}
      RETURNING image_id, audio_id, image_url, audio_url
    `;
    if (gone) await pruneMedia(mediaIdsIn(gone.image_id, gone.audio_id, gone.image_url, gone.audio_url));
    res.json({ ok: true });
  } catch (error) {
    console.error("website/floaters delete error:", error);
    res.status(500).json({ message: "Could not remove that artist" });
  }
});

// Also wakes the database (the sign-in screen calls this), so the first real
// request after a quiet spell doesn't pay for the cold start.
app.get("/api/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ ok: true, now: new Date().toISOString(), db: "connected" });
  } catch (error) {
    console.error("health db error:", error);
    res.status(503).json({ ok: false, db: "unreachable" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password, role } = req.body;
  const normalizedUsername = normalizeUsername(username);
  const throttleKey = loginKey(req, normalizedUsername);

  if (loginThrottled(throttleKey)) {
    return res
      .status(429)
      .json({ message: "Too many failed attempts. Try again in 15 minutes." });
  }

  const userResults = await sql`SELECT * FROM users WHERE username = ${normalizedUsername}`;
  const user = userResults[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    recordLoginFailure(throttleKey);
    // Same message either way, so the response can't be used to enumerate
    // which usernames exist.
    return res.status(401).json({ message: "Invalid username or password" });
  }

  if (role && user.role !== role) {
    return res.status(403).json({ message: `This account is registered as ${user.role}` });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

// Local UI testing only: one-click login as the first user with a role.
// Needs DEV_LOGIN=1 in .env, never registers on Vercel or in production,
// and only answers requests from this machine.
if (process.env.DEV_LOGIN === "1" && !process.env.VERCEL && process.env.NODE_ENV !== "production") {
  app.post("/api/auth/dev-login", async (req, res) => {
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) {
      return res.status(403).json({ message: "Dev login is local only" });
    }
    const role = isValidRole(req.body?.role) ? req.body.role : "admin";
    // Optional exact account (used to screenshot the demo singers/managers).
    const [user] = req.body?.username
      ? await sql`SELECT * FROM users WHERE username = ${normalizeUsername(req.body.username)}`
      : await sql`SELECT * FROM users WHERE role = ${role} ORDER BY id LIMIT 1`;
    if (!user) return res.status(404).json({ message: `No ${role} account exists` });
    return res.json({ token: signToken(user), user: publicUser(user) });
  });
}

app.get("/api/auth/me", authenticate, async (req, res) => {
  res.json({ user: publicUser(req.user), stats: await getStats(req.user) });
});

app.get("/api/users", authenticate, requireRole("admin", "superior"), async (_req, res) => {
  const allUsers = await sql`SELECT * FROM users ORDER BY id ASC`;
  res.json({ users: allUsers.map(publicUser) });
});

app.post("/api/users", authenticate, requireRole("admin", "superior"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "").trim();
    const role = String(req.body.role || "").trim();

    if (!name || !username || !password || !isValidRole(role)) {
      return res.status(400).json({ message: "Name, username, password, and valid role are required" });
    }

    if (req.user.role === "superior" && role === "superior") {
      return res.status(403).json({ message: "Superiors cannot create other superiors" });
    }

    const existingUser = (await sql`SELECT id FROM users WHERE username = ${username}`)[0];
    if (existingUser) {
      return res.status(409).json({ message: "A member with this username already exists" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const [newUser] = await sql`
      INSERT INTO users (name, username, password, role)
      VALUES (${name}, ${username}, ${hashedPassword}, ${role})
      RETURNING *
    `;

    const allUsers = await sql`SELECT * FROM users ORDER BY id ASC`;
    return res.status(201).json({ user: publicUser(newUser), users: allUsers.map(publicUser) });
  } catch (error) {
    console.error("User creation error:", error);
    return res.status(500).json({ message: "Failed to create user" });
  }
});

app.delete("/api/users/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    // Delete attendance records first
    await sql`DELETE FROM attendance WHERE user_id = ${id} OR reviewed_by = ${id}`;
    // Delete daily activity
    await sql`DELETE FROM daily_activity WHERE user_id = ${id}`;
    // Remove from shows employee_ids
    await sql`
      UPDATE shows 
      SET employee_ids = array_remove(employee_ids, ${id})
      WHERE ${id} = ANY(employee_ids)
    `;
    // If they were a manager, nullify manager_id
    await sql`UPDATE shows SET manager_id = NULL WHERE manager_id = ${id}`;
    
    await sql`DELETE FROM users WHERE id = ${id}`;
    
    const allUsers = await sql`SELECT * FROM users ORDER BY id ASC`;
    res.json({ users: allUsers.map(publicUser) });
  } catch (error) {
    console.error("User deletion error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

app.get("/api/shows", authenticate, async (req, res) => {
  try {
    const allShowsRaw = await sql`SELECT * FROM shows ORDER BY date ASC`;
    const visibleShowsRaw = allShowsRaw.filter((show) => canAccessShow(req.user, show));

    if (visibleShowsRaw.length === 0) {
      return res.json({ shows: [] });
    }

    // Bulk fetch all required data
    const allManagerIds = [...new Set(visibleShowsRaw.map(s => s.manager_id).filter(Boolean))];
    const allEmployeeIds = [...new Set(visibleShowsRaw.flatMap(s => s.employee_ids))];
    const allShowIds = visibleShowsRaw.map(s => s.id);

    const [managers, employees, attendance] = await Promise.all([
      allManagerIds.length ? sql`SELECT * FROM users WHERE id = ANY(${allManagerIds})` : [],
      allEmployeeIds.length ? sql`SELECT * FROM users WHERE id = ANY(${allEmployeeIds})` : [],
      sql`
        SELECT a.*, u.name as employee_name, u.username as employee_username, u.role as employee_role,
               r.name as reviewer_name, r.username as reviewer_username, r.role as reviewer_role
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN users r ON a.reviewed_by = r.id
        WHERE a.show_id = ANY(${allShowIds})
      `
    ]);

    const userMap = Object.fromEntries([...managers, ...employees].map(u => [u.id, publicUser(u)]));

    const visibleShows = visibleShowsRaw.map(show => {
      const payMap = show.employee_pay || {};
      const showAttendance = attendance.filter(a => a.show_id === show.id);
      
      return {
        ...show,
        date: show.date instanceof Date ? show.date.toISOString().split("T")[0] : show.date,
        employee_pay: payMap,
        manager: userMap[show.manager_id] || { name: "Unknown", role: "manager" },
        employees: show.employee_ids.map(id => ({ 
          ...(userMap[id] || { name: "Unknown", role: "employee" }), 
          pay: payMap[String(id)] ?? null 
        })),
        attendance: showAttendance.map(entry => ({
          ...entry,
          employee: { id: entry.user_id, name: entry.employee_name, username: entry.employee_username, role: entry.employee_role },
          reviewer: entry.reviewed_by ? { id: entry.reviewed_by, name: entry.reviewer_name, username: entry.reviewer_username, role: entry.reviewer_role } : null
        }))
      };
    });

    res.json({ shows: visibleShows.map((show) => forViewer(req.user, show)) });
  } catch (error) {
    console.error("Error fetching shows:", error);
    res.status(500).json({ message: "Failed to load shows" });
  }
});


/* ----------------------------------------------------------------------------
   VENUES
   Saved once, picked from a list. shows.location keeps a copy of the name
   because the website publisher, the Excel export and old rows read it; it is
   rewritten whenever the venue is renamed or merged.
   ---------------------------------------------------------------------------- */

// Manager pay for a show: a non-negative amount in ₹, or null when not set.
const parseManagerPay = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const cleanVenueName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, 120);

/** A venue from `venue_id`, or found / created from a typed `location` name. */
async function resolveVenue({ venue_id, location }) {
  if (venue_id) {
    const [venue] = await sql`SELECT id, name FROM venues WHERE id = ${Number(venue_id)}`;
    return venue || null;
  }
  const name = cleanVenueName(location);
  if (!name) return null;
  const [venue] = await sql`
    INSERT INTO venues (name) VALUES (${name})
    ON CONFLICT ((lower(name))) DO UPDATE SET name = venues.name
    RETURNING id, name
  `;
  return venue;
}

app.get("/api/venues", authenticate, requireRole("admin", "superior"), async (_req, res) => {
  try {
    const venues = await sql`
      SELECT v.id, v.name, COUNT(s.id)::int AS shows, MAX(s.date) AS last_show
      FROM venues v LEFT JOIN shows s ON s.venue_id = v.id
      GROUP BY v.id ORDER BY lower(v.name)
    `;
    return res.json({
      venues: venues.map((v) => ({
        ...v,
        last_show: v.last_show instanceof Date ? v.last_show.toISOString().split("T")[0] : v.last_show
      }))
    });
  } catch (error) {
    console.error("venues list error:", error);
    return res.status(500).json({ message: "Could not load venues" });
  }
});

app.post("/api/venues", authenticate, requireRole("admin", "superior"), async (req, res) => {
  const venue = await resolveVenue({ location: req.body.name });
  if (!venue) return res.status(400).json({ message: "Give the venue a name" });
  return res.status(201).json({ venue });
});

// Rename a venue, or merge it into another (fixes duplicates like
// "Chords & Coffee" / "Chords and Coffee"). Shows follow either way.
app.patch("/api/venues/:id", authenticate, requireRole("admin", "superior"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [venue] = await sql`SELECT id, name FROM venues WHERE id = ${id}`;
    if (!venue) return res.status(404).json({ message: "Venue not found" });

    if (req.body.merge_into !== undefined) {
      const [target] = await sql`SELECT id, name FROM venues WHERE id = ${Number(req.body.merge_into)}`;
      if (!target || target.id === id) return res.status(400).json({ message: "Pick a different venue to merge into" });
      await sql`UPDATE shows SET venue_id = ${target.id}, location = ${target.name} WHERE venue_id = ${id}`;
      await sql`DELETE FROM venues WHERE id = ${id}`;
      return res.json({ venue: target });
    }

    const name = cleanVenueName(req.body.name);
    if (!name) return res.status(400).json({ message: "Give the venue a name" });
    const [clash] = await sql`SELECT id FROM venues WHERE lower(name) = lower(${name}) AND id <> ${id}`;
    if (clash) return res.status(409).json({ message: "Another venue already has that name. Merge them instead." });
    const [renamed] = await sql`UPDATE venues SET name = ${name} WHERE id = ${id} RETURNING id, name`;
    await sql`UPDATE shows SET location = ${name} WHERE venue_id = ${id}`;
    return res.json({ venue: renamed });
  } catch (error) {
    console.error("venue update error:", error);
    return res.status(500).json({ message: "Could not update venue" });
  }
});

app.delete("/api/venues/:id", authenticate, requireRole("admin", "superior"), async (req, res) => {
  const id = Number(req.params.id);
  const [{ count }] = await sql`SELECT COUNT(*)::int FROM shows WHERE venue_id = ${id}`;
  if (count) return res.status(409).json({ message: "This venue has shows. Merge it into another venue instead." });
  await sql`DELETE FROM venues WHERE id = ${id}`;
  return res.json({ ok: true });
});

// Sample data for demos (lib/demo-data.js). Lets an admin load or clear it on
// whichever database this server uses, with no database credentials needed.
app.get("/api/demo-data", authenticate, requireRole("admin", "superior"), async (_req, res) => {
  try {
    return res.json(await demoDataStatus(sql));
  } catch (error) {
    console.error("demo-data status error:", error);
    return res.status(500).json({ message: "Could not check sample data" });
  }
});

app.post("/api/demo-data", authenticate, requireRole("admin", "superior"), async (req, res) => {
  try {
    if (req.body?.action === "remove") {
      await removeDemoData(sql, websiteSql);
      return res.json({ ...(await demoDataStatus(sql)), message: "Sample data removed" });
    }
    if (req.body?.action === "add") {
      const added = await addDemoData(sql, websiteSql);
      return res.json({ ...(await demoDataStatus(sql)), added, message: `Added ${added.shows} sample shows` });
    }
    return res.status(400).json({ message: "Action must be add or remove" });
  } catch (error) {
    console.error("demo-data error:", error);
    return res.status(500).json({ message: "Could not update sample data" });
  }
});

app.post("/api/shows", authenticate, requireRole("admin", "superior"), async (req, res) => {
  try {
    const date = String(req.body.date || "").trim();
    const time = String(req.body.time || "").trim();
    const venue = await resolveVenue(req.body);
    const managerId = req.body.manager_id ? Number(req.body.manager_id) : null;
    const employeeIds = [...new Set((req.body.employee_ids || []).map(Number))];
    const employeePay = req.body.employee_pay || {};
    const managerPay = parseManagerPay(req.body.manager_pay);
    const manager = managerId ? await byId(managerId) : null;

    if (!date || !time || !venue || !manager || manager.role !== "manager") {
      return res.status(400).json({ message: "Date, time, venue, and a valid manager are required" });
    }

    if (!(await allSingers(employeeIds))) {
      return res.status(400).json({ message: "Assign at least one singer, and only singers" });
    }

    const dateCode = date.slice(8, 10) + date.slice(5, 7);
    // Ids carry no year and shows can be deleted, so counting a day's shows can
    // reuse a taken id. Take the highest existing suffix for this DDMM instead.
    const prefix = `SGT-${dateCode}-`;
    const [{ max }] = await sql`
      SELECT COALESCE(MAX(substring(id from ${prefix.length + 1}::int)::int), 0) AS max
      FROM shows WHERE id LIKE ${prefix + "%"} AND substring(id from ${prefix.length + 1}::int) ~ '^[0-9]+$'
    `;
    const id = `${prefix}${String(Number(max) + 1).padStart(2, "0")}`;

    const [newShow] = await sql`
      INSERT INTO shows (id, date, time, location, venue_id, manager_id, employee_ids, employee_pay, manager_pay)
      VALUES (${id}, ${date}, ${time}, ${venue.name}, ${venue.id}, ${managerId}, ${employeeIds}, ${JSON.stringify(employeePay)}, ${managerPay})
      RETURNING *
    `;

    const allShows = await sql`SELECT * FROM shows ORDER BY date ASC`;
    const visibleShows = await Promise.all(
      allShows.filter((show) => canAccessShow(req.user, show)).map(decorateShow)
    );

    return res.status(201).json({ show: await decorateShow(newShow), shows: visibleShows });
  } catch (error) {
    console.error("Show creation error:", error);
    return res.status(500).json({ message: "Failed to create show" });
  }
});
const canSeePay = (user) => user.role === "admin" || user.role === "superior";

// Pay is admin-only: managers and singers never receive it. Singers also only
// see their own attendance, not their colleagues'.
const forViewer = (user, show) => {
  if (canSeePay(user)) return show;
  return {
    ...show,
    employee_pay: {},
    manager_pay: null,
    employees: show.employees.map((e) => ({ ...e, pay: null })),
    attendance: user.role === "employee"
      ? show.attendance.filter((entry) => entry.user_id === user.id)
      : show.attendance
  };
};

app.get("/api/shows/:id", authenticate, async (req, res) => {
  const showResult = await sql`SELECT * FROM shows WHERE id = ${req.params.id}`;
  const show = showResult[0];

  if (!show) {
    return res.status(404).json({ message: "Show not found" });
  }

  if (!canAccessShow(req.user, show)) {
    return res.status(403).json({ message: "You do not have access to this show" });
  }

  return res.json({ show: forViewer(req.user, await decorateShow(show)) });
});

app.patch("/api/shows/:id", authenticate, requireRole("admin", "superior"), async (req, res) => {
  try {
    const showResult = await sql`SELECT * FROM shows WHERE id = ${req.params.id}`;
    const show = showResult[0];

    if (!show) {
      return res.status(404).json({ message: "Show not found" });
    }

    const date = req.body.date !== undefined ? String(req.body.date).trim() : (show.date instanceof Date ? show.date.toISOString().split("T")[0] : show.date);
    const time = req.body.time !== undefined ? String(req.body.time).trim() : show.time;
    const venueChanged = req.body.venue_id !== undefined || req.body.location !== undefined;
    const venue = venueChanged ? await resolveVenue(req.body) : { id: show.venue_id, name: show.location };
    if (!venue) return res.status(400).json({ message: "Pick a venue" });
    const managerId = req.body.manager_id !== undefined ? Number(req.body.manager_id) : show.manager_id;
    const employeeIds = req.body.employee_ids !== undefined
      ? [...new Set((req.body.employee_ids || []).map(Number))]
      : show.employee_ids;
    const employeePay = req.body.employee_pay !== undefined
      ? req.body.employee_pay
      : (show.employee_pay || {});
    const managerPay = req.body.manager_pay !== undefined ? parseManagerPay(req.body.manager_pay) : show.manager_pay;

    if (req.body.manager_id !== undefined) {
      const manager = await byId(managerId);
      if (!manager || manager.role !== "manager") {
        return res.status(400).json({ message: "A valid manager is required" });
      }
    }

    if (req.body.employee_ids !== undefined && !(await allSingers(employeeIds))) {
      return res.status(400).json({ message: "Assign at least one singer, and only singers" });
    }

    const [updatedShow] = await sql`
      UPDATE shows
      SET date = ${date},
          time = ${time},
          location = ${venue.name},
          venue_id = ${venue.id},
          manager_id = ${managerId},
          employee_ids = ${employeeIds},
          employee_pay = ${JSON.stringify(employeePay)},
          manager_pay = ${managerPay}
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    return res.json({ show: await decorateShow(updatedShow) });
  } catch (error) {
    console.error("Show update error:", error);
    return res.status(500).json({ message: "Failed to update show" });
  }
});

app.delete("/api/shows/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id;
    // Delete attendance records first
    await sql`DELETE FROM attendance WHERE show_id = ${id}`;
    // Delete the show
    await sql`DELETE FROM shows WHERE id = ${id}`;
    
    const allShows = await sql`SELECT * FROM shows ORDER BY date ASC`;
    const visibleShows = await Promise.all(
      allShows.filter((show) => canAccessShow(req.user, show)).map(decorateShow)
    );
    res.json({ shows: visibleShows });
  } catch (error) {
    console.error("Show deletion error:", error);
    res.status(500).json({ message: "Failed to delete show" });
  }
});

app.post("/api/attendance", authenticate, requireRole("employee"), async (req, res) => {
  const { show_id } = req.body;
  const showResult = await sql`SELECT * FROM shows WHERE id = ${show_id}`;
  const show = showResult[0];

  if (!show || !show.employee_ids.includes(req.user.id)) {
    return res.status(404).json({ message: "Assigned show not found" });
  }

  // Shows are in India time; you can't have attended one that hasn't started.
  const showDate = show.date instanceof Date ? show.date.toISOString().split("T")[0] : show.date;
  if (new Date(`${showDate}T${show.time}:00+05:30`) > new Date()) {
    return res.status(400).json({ message: "You can mark attendance once the show has started" });
  }

  const existingResult = await sql`
    SELECT id FROM attendance WHERE show_id = ${show_id} AND user_id = ${req.user.id}
  `;

  if (existingResult.length > 0) {
    return res.status(409).json({ message: "Attendance has already been marked for this show" });
  }

  const [entry] = await sql`
    INSERT INTO attendance (show_id, user_id, status, approval_status, marked_at)
    VALUES (${show_id}, ${req.user.id}, 'marked', 'pending', ${new Date().toISOString()})
    RETURNING *
  `;

  return res.status(201).json({ attendance: entry, show: forViewer(req.user, await decorateShow(show)) });
});

app.patch("/api/attendance/:id/review", authenticate, requireRole("manager", "admin", "superior"), async (req, res) => {
  const { approval_status } = req.body;
  const entryResult = await sql`SELECT * FROM attendance WHERE id = ${Number(req.params.id)}`;
  const entry = entryResult[0];

  if (!["approved", "rejected"].includes(approval_status)) {
    return res.status(400).json({ message: "Approval status must be approved or rejected" });
  }

  if (!entry) {
    return res.status(404).json({ message: "Attendance entry not found" });
  }

  const showResult = await sql`SELECT * FROM shows WHERE id = ${entry.show_id}`;
  const show = showResult[0];

  if (req.user.role === "manager" && show.manager_id !== req.user.id) {
    return res.status(403).json({ message: "Managers can only review their own shows" });
  }

  if (entry.approval_status !== "pending" && req.user.role !== "admin" && req.user.role !== "superior") {
    return res.status(409).json({ message: "Only an admin or superior can edit a finalized approval" });
  }

  const [updatedEntry] = await sql`
    UPDATE attendance
    SET approval_status = ${approval_status},
        reviewed_at = ${new Date().toISOString()},
        reviewed_by = ${req.user.id}
    WHERE id = ${entry.id}
    RETURNING *
  `;

  return res.json({ attendance: updatedEntry, show: forViewer(req.user, await decorateShow(show)) });
});

app.get("/api/profile", authenticate, async (req, res) => {
  try {
    const attendanceQuery = req.user.role === "employee" 
      ? sql`SELECT a.*, s.id as show_id FROM attendance a JOIN shows s ON a.show_id = s.id WHERE a.user_id = ${req.user.id}`
      : sql`SELECT a.*, s.id as show_id FROM attendance a JOIN shows s ON a.show_id = s.id`;
    
    const [allAttendance, allShowsRaw, stats] = await Promise.all([
      attendanceQuery,
      sql`SELECT * FROM shows`,
      getStats(req.user)
    ]);

    const allShows = allShowsRaw.map(s => ({
      ...s,
      date: s.date instanceof Date ? s.date.toISOString().split("T")[0] : s.date,
      // Pay is admin-only.
      ...(!canSeePay(req.user) && { employee_pay: {}, manager_pay: null })
    }));

    const filteredAttendance = allAttendance.filter((entry) => {
      const show = allShows.find((candidate) => candidate.id === entry.show_id);
      return canAccessShow(req.user, show);
    });

    const allUserIds = [...new Set(filteredAttendance.map(a => a.user_id))];
    const users = allUserIds.length ? await sql`SELECT * FROM users WHERE id = ANY(${allUserIds})` : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, publicUser(u)]));

    const userActivity = filteredAttendance.map((entry) => ({
      ...entry,
      show: allShows.find((show) => show.id === entry.show_id),
      employee: userMap[entry.user_id] || { name: "Unknown", role: "employee" }
    }));

    res.json({ stats, activity: userActivity });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Failed to load profile data" });
  }
});


app.get("/api/export/attendance.xlsx", authenticate, requireRole("admin", "superior"), async (_req, res) => {
  const rows = await attendanceLedgerRows();
  const allUsers = await sql`SELECT * FROM users`;
  const allShows = await sql`SELECT * FROM shows`;
  const allAttendance = await sql`SELECT * FROM attendance`;

  const summaryByEmployee = allUsers
    .filter((user) => user.role === "employee")
    .map((user) => {
      const totalPay = allShows.reduce((sum, show) => {
        if (!show.employee_ids.includes(user.id)) return sum;
        const payMap = show.employee_pay || {};
        const pay = payMap[String(user.id)];
        return sum + (pay != null ? Number(pay) : 0);
      }, 0);

      return {
        "Artist Name": user.name,
        Username: user.username,
        "Assigned Shows": allShows.filter((show) => show.employee_ids.includes(user.id)).length,
        "Total Pay (₹)": totalPay || "",
        "Attendance Marked": allAttendance.filter((entry) => entry.user_id === user.id).length,
        "Approved Shows": allAttendance.filter(
          (entry) => entry.user_id === user.id && entry.approval_status === "approved"
        ).length,
        "Pending Approval": allAttendance.filter(
          (entry) => entry.user_id === user.id && entry.approval_status === "pending"
        ).length,
        Rejected: allAttendance.filter(
          (entry) => entry.user_id === user.id && entry.approval_status === "rejected"
        ).length
      };
    });

  const summaryByManager = allUsers
    .filter((user) => user.role === "manager")
    .map((user) => ({
      Manager: user.name,
      Username: user.username,
      "Shows Managed": allShows.filter((show) => show.manager_id === user.id).length,
      "Manager Pay (₹)": allShows.filter((show) => show.manager_id === user.id).reduce((sum, show) => sum + (Number(show.manager_pay) || 0), 0) || "",
      "Approvals Done": allAttendance.filter((entry) => entry.reviewed_by === user.id).length,
      "Pending Reviews": allAttendance.filter((entry) => {
        const show = allShows.find((candidate) => candidate.id === entry.show_id);
        return show && show.manager_id === user.id && entry.approval_status === "pending";
      }).length
    }));

  const showSummary = allShows.map((show) => ({
    "Show ID": show.id,
    Date: show.date.toISOString().split("T")[0],
    Time: show.time,
    Venue: show.location,
    Manager: allUsers.find((u) => u.id === show.manager_id)?.name || "Unknown",
    "Manager Pay (₹)": show.manager_pay != null ? Number(show.manager_pay) : "",
    "Assigned Artists": show.employee_ids.length,
    "Marked Attendance": allAttendance.filter((entry) => entry.show_id === show.id).length,
    Approved: allAttendance.filter(
      (entry) => entry.show_id === show.id && entry.approval_status === "approved"
    ).length,
    Pending: allAttendance.filter(
      (entry) => entry.show_id === show.id && entry.approval_status === "pending"
    ).length,
    Rejected: allAttendance.filter(
      (entry) => entry.show_id === show.id && entry.approval_status === "rejected"
    ).length
  }));

  const buffer = await writeXlsxFile([
    toWorkbookSheet("Attendance Ledger", rows, [
      24, 28, 14, 12, 30, 16, 22, 14, 18, 18, 24, 24
    ]),
    toWorkbookSheet("Artist Totals", summaryByEmployee, [24, 28, 16, 16, 18, 16, 18, 12]),
    toWorkbookSheet("Manager Totals", summaryByManager, [24, 28, 16, 18, 16, 16]),
    toWorkbookSheet("Show Summary", showSummary, [16, 14, 12, 30, 22, 18, 16, 18, 12, 12, 12])
  ], {
    fontFamily: "Arial",
    fontSize: 11
  }).toBuffer();

  res.setHeader("Content-Disposition", "attachment; filename=sunggeet-attendance-ledger.xlsx");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  return res.send(Buffer.from(buffer));
});

// The team works in India; a UTC date would roll over at 5:30 am IST.
const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

app.get("/api/activity/today", authenticate, async (req, res) => {
  const todayStr = indiaToday();
  const userStatusResult = await sql`
    SELECT status FROM daily_activity WHERE user_id = ${req.user.id} AND date = ${todayStr}
  `;

  let summary = null;
  if (req.user.role !== "employee") {
    const dailyActivities = await sql`
      SELECT da.*, u.name, u.username, u.role
      FROM daily_activity da
      JOIN users u ON da.user_id = u.id
      WHERE da.date = ${todayStr}
    `;
    summary = dailyActivities.map((a) => ({
      ...a,
      user: { id: a.user_id, name: a.name, username: a.username, role: a.role }
    }));
  }

  res.json({ status: userStatusResult[0]?.status || null, summary });
});

app.post("/api/activity", authenticate, async (req, res) => {
  const { status } = req.body;
  if (!["active", "inactive"].includes(status)) {
    return res.status(400).json({ message: "Status must be active or inactive" });
  }

  const todayStr = indiaToday();
  
  await sql`
    INSERT INTO daily_activity (user_id, date, status, updated_at)
    VALUES (${req.user.id}, ${todayStr}, ${status}, ${new Date().toISOString()})
    ON CONFLICT (user_id, date) DO UPDATE
    SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
  `;

  res.json({ message: "Status updated", status });
});

function toWorkbookSheet(sheet, rows, widths) {
  return {
    data: toSheet(rows),
    sheet,
    columns: widths.map((width) => ({ width })),
    showGridLines: false,
    orientation: "landscape"
  };
}

function toSheet(rows) {
  const columns = Object.keys(rows[0] || { Empty: "" });

  return [
    columns.map((column) => ({
      value: column,
      fontWeight: "bold",
      textColor: "#ffffff",
      backgroundColor: "#334155",
      align: "center",
      alignVertical: "center",
      height: 24,
      wrap: true,
      borderColor: "#cbd5e1",
      borderStyle: "thin"
    })),
    ...rows.map((row, index) =>
      columns.map((column) => ({
        value: row[column] ?? "",
        backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8fafc",
        textColor: textColorForCell(column, row[column]),
        fontWeight: shouldBoldCell(column, row[column]) ? "bold" : undefined,
        align: numericCell(row[column]) ? "right" : "left",
        alignVertical: "center",
        height: 22,
        wrap: true,
        borderColor: "#e2e8f0",
        borderStyle: "thin"
      }))
    )
  ];
}

function numericCell(value) {
  return typeof value === "number";
}

function shouldBoldCell(column, value) {
  return column.includes("Artist") || ["Approved", "Approved Shows"].includes(column) || value === "Approved";
}

function textColorForCell(column, value) {
  if (!column.toLowerCase().includes("status") && !["Approved", "Pending", "Rejected"].includes(column)) {
    return "#0f172a";
  }

  if (value === "Approved" || value === "Marked") return "#047857";
  if (value === "Rejected" || value === "Not Marked") return "#be123c";
  if (value === "Pending" || value === "Waiting") return "#b45309";
  return "#0f172a";
}

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`SUNGGEET API listening on http://localhost:${PORT}`);
  });
}

export default app;
