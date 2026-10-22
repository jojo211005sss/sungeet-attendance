import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// End-to-end check of the API against whatever database the local server uses.
// Start the app first (npm run dev, or the "sungeet-prod-db" preview), then:
//   node scripts/full-test.js
// Creates TEST data (names start with "TEST "), checks every role, rule and
// pay total, then deletes everything it made. Needs DEV_LOGIN=1 for the
// sample accounts.
const API = process.env.API || "http://localhost:4000/api";
let failed = 0;
let passed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
};

async function call(method, url, token, body) {
  const res = await fetch(API + url, {
    method,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined
  });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data };
}
const devLogin = async (username) => (await call("POST", "/auth/dev-login", null, { username })).data.token;

// Minimal .xlsx reader: sheet name -> array of row objects (first row = headers).
function readXlsx(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
  const file = path.join(dir, "f.xlsx");
  fs.writeFileSync(file, buffer);
  const unzip = (p) => { try { return execFileSync("unzip", ["-p", file, p]).toString(); } catch { return ""; } };
  const decode = (x) => x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))
  );
  const names = [...unzip("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => decode(m[1]));
  const out = {};
  names.forEach((name, i) => {
    const xml = unzip(`xl/worksheets/sheet${i + 1}.xml`);
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
      [...r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].reduce((acc, c) => {
        const attrs = c[2];
        const inner = c[3] || "";
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const inline = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        acc[c[1]] = /t="s"/.test(attrs) ? shared[Number(v)] : inline != null ? decode(inline) : v != null ? (isNaN(v) ? decode(v) : Number(v)) : "";
        return acc;
      }, {})
    );
    const head = rows[0] || {};
    out[name] = rows.slice(1).map((r) => Object.fromEntries(Object.entries(head).map(([col, h]) => [h, r[col] ?? ""])));
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

const istDate = (offsetDays) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offsetDays * 864e5));

const made = { users: [], shows: [], venues: [] };
let admin;

try {
  // ---------- sign-in ----------
  admin = await devLogin("sample.admin@sunggeet.com");
  const superior = await devLogin("sample.superior@sunggeet.com");
  const sampleManager = await devLogin("sample.manager@sunggeet.com");
  check("sample admin / superior / manager sign in", admin && superior && sampleManager);
  check("health", (await call("GET", "/health")).data.ok === true);
  check("wrong password is refused", (await call("POST", "/auth/login", null, { username: "sample.admin@sunggeet.com", password: "wrong-password" })).status === 401);

  // ---------- members ----------
  const stamp = Date.now().toString(36);
  const mk = async (token, name, role) => {
    const username = `test.${name.toLowerCase().replace(/\W+/g, "")}.${stamp}@sunggeet.com`;
    const r = await call("POST", "/users", token, { name: `TEST ${name}`, username, password: "Test@12345", role });
    if (r.status === 201) made.users.push(r.data.user.id);
    return { ...r, username };
  };
  const s1 = await mk(admin, "Singer One", "employee");
  const s2 = await mk(admin, "Singer Two", "employee");
  const s3 = await mk(superior, "Singer Three", "employee");
  const m1 = await mk(admin, "Manager", "manager");
  check("admin creates singers and a manager", [s1, s2, m1].every((r) => r.status === 201));
  check("superior creates a singer", s3.status === 201);
  check("superior can't create a superior", (await mk(superior, "Sup", "superior")).status === 403);
  check("duplicate username refused", (await call("POST", "/users", admin, { name: "x", username: s1.username, password: "Test@12345", role: "employee" })).status === 409);
  check("missing fields refused", (await call("POST", "/users", admin, { name: "x" })).status === 400);
  const S1 = s1.data.user.id, S2 = s2.data.user.id, S3 = s3.data.user.id, M1 = m1.data.user.id;

  const login = async (username) => (await call("POST", "/auth/login", null, { username, password: "Test@12345" })).data.token;
  const t1 = await login(s1.username), t2 = await login(s2.username), t3 = await login(s3.username), tm = await login(m1.username);
  check("new members sign in with their password", t1 && t2 && t3 && tm);
  check("role check on sign-in", (await call("POST", "/auth/login", null, { username: s1.username, password: "Test@12345", role: "admin" })).status === 403);

  // ---------- who can do what ----------
  check("singer can't list members", (await call("GET", "/users", t1)).status === 403);
  check("manager can't create shows", (await call("POST", "/shows", tm, {})).status === 403);
  check("superior can't delete shows", (await call("DELETE", "/shows/x", superior)).status === 403);
  check("superior can't delete members", (await call("DELETE", `/users/${S3}`, superior)).status === 403);
  check("singer can't export Excel", (await call("GET", "/export/attendance.xlsx", t1)).status === 403);
  check("no token = 401", (await call("GET", "/shows")).status === 401);

  // ---------- shows ----------
  const venue = `TEST Venue ${stamp}`;
  const past = istDate(-1), future = istDate(7);
  const showA = await call("POST", "/shows", admin, {
    date: past, time: "20:00", location: venue, manager_id: M1,
    employee_ids: [S1, S2, S3], employee_pay: { [S1]: 1000, [S2]: 1500, [S3]: 2000 }, manager_pay: 500
  });
  const showB = await call("POST", "/shows", superior, {
    date: future, time: "21:00", location: venue, manager_id: M1, employee_ids: [S1], employee_pay: { [S1]: 800 }, manager_pay: 300
  });
  check("admin and superior create shows", showA.status === 201 && showB.status === 201, JSON.stringify(showA.data).slice(0, 200));
  const A = showA.data.show.id, B = showB.data.show.id;
  made.shows.push(A, B);
  made.venues.push(showA.data.show.venue_id);
  check("same venue name reuses one venue", showA.data.show.venue_id === showB.data.show.venue_id);
  check("pay saved as numbers per singer", showA.data.show.employee_pay[String(S1)] === 1000 && showA.data.show.employee_pay[String(S3)] === 2000);
  check("show needs a manager", (await call("POST", "/shows", admin, { date: past, time: "20:00", location: venue, employee_ids: [S1] })).status === 400);
  check("only singers can be assigned", (await call("POST", "/shows", admin, { date: past, time: "20:00", location: venue, manager_id: M1, employee_ids: [M1] })).status === 400);
  check("show ids are unique per day", A !== (await (async () => {
    const r = await call("POST", "/shows", admin, { date: past, time: "22:00", location: venue, manager_id: M1, employee_ids: [S1], employee_pay: {} });
    made.shows.push(r.data.show.id);
    return r.data.show.id;
  })()));

  // ---------- attendance ----------
  const mark = (t, id) => call("POST", "/attendance", t, { show_id: id });
  const e1 = await mark(t1, A), e2 = await mark(t2, A), e3 = await mark(t3, A);
  check("singers mark a show that has started", [e1, e2, e3].every((r) => r.status === 201));
  check("can't mark twice", (await mark(t1, A)).status === 409);
  check("can't mark before the show starts", (await mark(t1, B)).status === 400);
  check("can't mark a show you're not on", (await mark(t2, B)).status === 404);
  const review = (t, e, approval_status) => call("PATCH", `/attendance/${e.data.attendance.id}/review`, t, { approval_status });
  check("manager approves", (await review(tm, e1, "approved")).status === 200);
  check("manager rejects", (await review(tm, e2, "rejected")).status === 200);
  check("other manager can't review this show", (await review(sampleManager, e3, "approved")).status === 403);
  check("manager can't change a final decision", (await review(tm, e1, "rejected")).status === 409);
  check("admin can flip a decision", (await review(admin, e2, "approved")).status === 200 && (await review(superior, e2, "rejected")).status === 200);
  check("bad decision value refused", (await review(admin, e3, "maybe")).status === 400);
  // Final state: S1 approved (1000), S2 rejected (1500), S3 pending (2000).
  // The manager made 1 of these decisions; the superior made the last one on S2.

  // ---------- what each role sees ----------
  const showsFor = async (t) => (await call("GET", "/shows", t)).data.shows;
  const singerShows = await showsFor(t1);
  check("singer sees only their shows", singerShows.every((s) => s.employee_ids.includes(S1)) && singerShows.some((s) => s.id === A));
  const sA = singerShows.find((s) => s.id === A);
  check("singer sees no pay", JSON.stringify(sA.employee_pay) === "{}" && sA.manager_pay === null && sA.employees.every((e) => e.pay === null));
  check("singer sees only their own attendance", sA.attendance.length === 1 && sA.attendance[0].user_id === S1);
  const mA = (await showsFor(tm)).find((s) => s.id === A);
  check("manager sees all attendance on their show, no pay", mA.attendance.length === 3 && JSON.stringify(mA.employee_pay) === "{}" && mA.manager_pay === null);
  const aA = (await showsFor(admin)).find((s) => s.id === A);
  check("admin sees pay", aA.employee_pay[String(S2)] === 1500 && Number(aA.manager_pay) === 500);

  // ---------- edit ----------
  const edited = await call("PATCH", `/shows/${A}`, admin, { employee_pay: { [S1]: 1200, [S2]: 1500, [S3]: 2000 } });
  check("admin edits pay", edited.status === 200 && edited.data.show.employee_pay[String(S1)] === 1200);
  check("editing keeps attendance", edited.data.show.attendance.length === 3);

  // ---------- profile numbers ----------
  const p1 = (await call("GET", "/profile", t1)).data.stats;
  check("singer profile counts", p1.totalShows === 3 && p1.approvedShows === 1 && p1.pendingShows === 0, JSON.stringify(p1));
  const pm = (await call("GET", "/profile", tm)).data.stats;
  check("manager profile counts", pm.approvedShows === 1 && pm.rejectedShows === 1 && pm.pendingShows === 1 && pm.approvalsDone === 1, JSON.stringify(pm));

  // ---------- Excel ----------
  const x = await call("GET", "/export/attendance.xlsx", admin);
  check("Excel downloads", x.status === 200 && x.data.length > 1000);
  const book = readXlsx(x.data);
  check("Excel has 4 sheets", ["Attendance Ledger", "Artist Totals", "Manager Totals", "Show Summary"].every((n) => book[n]));
  const art = (n) => book["Artist Totals"].find((r) => r["Artist Name"] === `TEST ${n}`) || {};
  check("Excel pay due = approved only (S1 1200 + 0 future)", art("Singer One")["Pay Due (₹)"] === 1200, JSON.stringify(art("Singer One")));
  check("Excel pay planned (S1 1200 + 800 + 0)", art("Singer One")["Pay Planned (₹)"] === 2000, JSON.stringify(art("Singer One")));
  check("Excel rejected singer is due 0", art("Singer Two")["Pay Due (₹)"] === 0 && art("Singer Two").Rejected === 1);
  check("Excel pending singer is due 0", art("Singer Three")["Pay Due (₹)"] === 0 && art("Singer Three")["Pending Approval"] === 1);
  const man = book["Manager Totals"].find((r) => r.Manager === "TEST Manager") || {};
  check("Excel manager pay due = started shows (500)", man["Manager Pay Due (₹)"] === 500, JSON.stringify(man));
  check("Excel manager pay planned (500 + 300)", man["Manager Pay Planned (₹)"] === 800);
  check("Excel manager counts", man["Shows Managed"] === 3 && man["Approvals Done"] === 1 && man["Pending Reviews"] === 1, JSON.stringify(man));
  const ledgerA = book["Attendance Ledger"].filter((r) => r["Show ID"] === A);
  check("Excel ledger rows per singer", ledgerA.length === 3 && ledgerA.find((r) => r["Artist Name"] === "TEST Singer One")["Pay (₹)"] === 1200);
  const sum = book["Show Summary"].find((r) => r["Show ID"] === A) || {};
  check("Excel show summary", sum.Approved === 1 && sum.Rejected === 1 && sum.Pending === 1 && sum["Manager Pay (₹)"] === 500, JSON.stringify(sum));

  // ---------- check-in ----------
  check("singer checks in", (await call("POST", "/activity", t1, { status: "active" })).status < 300);
  const act = (await call("GET", "/activity/today", admin)).data;
  check("admin sees today's check-in", act.summary.some((a) => a.user_id === S1 && a.status === "active"));
  check("bad check-in value refused", (await call("POST", "/activity", t1, { status: "maybe" })).status === 400);

  // ---------- venues ----------
  const vid = showA.data.show.venue_id;
  const ren = await call("PATCH", `/venues/${vid}`, admin, { name: `${venue} Renamed` });
  check("rename venue", ren.status === 200);
  const afterRename = (await showsFor(admin)).find((s) => s.id === A);
  check("rename updates the show", afterRename.location === `${venue} Renamed`);
  check("can't delete a venue in use", (await call("DELETE", `/venues/${vid}`, admin)).status >= 400);

  // ---------- website (unpublished so the public site never shows it) ----------
  const web = (await call("GET", "/website/data", admin)).data;
  check("website tab lists the upcoming show", web.shows.some((s) => s.id === B));
  const pub = await call("PUT", `/website/shows/${B}`, admin, { city: "TEST City", event_type: "cafe", is_published: false });
  check("save a show to the website (hidden)", pub.status === 200, JSON.stringify(pub.data).slice(0, 150));
  const web2 = (await call("GET", "/website/data", admin)).data;
  check("website shows it as saved, not published", web2.shows.find((s) => s.id === B)?.website?.is_published === false);
  check("remove it from the website", (await call("DELETE", `/website/shows/${B}`, admin)).status === 200);
  check("singer can't use the website tab", (await call("GET", "/website/data", t1)).status === 403);

  // ---------- deleting a manager keeps Excel working ----------
  check("admin deletes a member", (await call("DELETE", `/users/${M1}`, admin)).status === 200);
  made.users = made.users.filter((id) => id !== M1);
  check("Excel still works after a manager is deleted", (await call("GET", "/export/attendance.xlsx", admin)).status === 200);
  check("can't delete yourself", (await call("DELETE", "/users/0", admin)).status !== 500);
} catch (error) {
  failed++;
  console.log("FAIL  test crashed:", error);
} finally {
  // ---------- clean up ----------
  if (admin) {
    for (const id of made.shows) await call("DELETE", `/shows/${id}`, admin);
    for (const id of made.users) await call("DELETE", `/users/${id}`, admin);
    for (const id of made.venues) await call("DELETE", `/venues/${id}`, admin);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
