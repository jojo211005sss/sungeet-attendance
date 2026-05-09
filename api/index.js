import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import writeXlsxFile from "write-excel-file/node";
import { Buffer } from "node:buffer";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("CRITICAL: DATABASE_URL is not set. Please add it to your Vercel Environment Variables.");
}
const sql = neon(process.env.DATABASE_URL);


const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "local-sunggeet-secret";

app.use(cors());
app.use(express.json());

const today = new Date("2026-03-19T10:30:00.000Z");

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString(), db: "connected" });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password, role } = req.body;
  const normalizedUsername = normalizeUsername (username) ;
  const userResults = await sql`SELECT * FROM users WHERE username = ${normalizedUsername}`;
  const user = userResults[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  if (role && user.role !== role) {
    return res.status(403).json({ message: `This account is registered as ${user.role}` });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

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
    return res.status(500).json({ message: error.message || "Failed to create user" });
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
    res.status(500).json({ message: error.message || "Failed to delete user" });
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

    res.json({ shows: visibleShows });
  } catch (error) {
    console.error("Error fetching shows:", error);
    res.status(500).json({ message: "Failed to load shows" });
  }
});


app.post("/api/shows", authenticate, requireRole("admin", "superior"), async (req, res) => {
  try {
    const date = String(req.body.date || "").trim();
    const time = String(req.body.time || "").trim();
    const location = String(req.body.location || "").trim();
    const managerId = Number(req.body.manager_id);
    const employeeIds = [...new Set((req.body.employee_ids || []).map(Number))];
    const employeePay = req.body.employee_pay || {};
    const manager = await byId(managerId);

    if (!date || !time || !location || !manager || manager.role !== "manager") {
      return res.status(400).json({ message: "Date, time, location, and a valid manager are required" });
    }

    if (!employeeIds.length) {
      return res.status(400).json({ message: "Assign at least one employee singer" });
    }

    const dateCode = date.slice(8, 10) + date.slice(5, 7);
    const showCountResult = await sql`SELECT COUNT(*) FROM shows WHERE date = ${date}`;
    const showCountForDay = Number(showCountResult[0].count) + 1;
    const id = `SGT-${dateCode}-${String(showCountForDay).padStart(2, "0")}`;

    const [newShow] = await sql`
      INSERT INTO shows (id, date, time, location, manager_id, employee_ids, employee_pay)
      VALUES (${id}, ${date}, ${time}, ${location}, ${managerId}, ${employeeIds}, ${JSON.stringify(employeePay)})
      RETURNING *
    `;

    const allShows = await sql`SELECT * FROM shows ORDER BY date ASC`;
    const visibleShows = await Promise.all(
      allShows.filter((show) => canAccessShow(req.user, show)).map(decorateShow)
    );

    return res.status(201).json({ show: await decorateShow(newShow), shows: visibleShows });
  } catch (error) {
    console.error("Show creation error:", error);
    return res.status(500).json({ message: error.message || "Failed to create show" });
  }
});

app.get("/api/shows/:id", authenticate, async (req, res) => {
  const showResult = await sql`SELECT * FROM shows WHERE id = ${req.params.id}`;
  const show = showResult[0];

  if (!show) {
    return res.status(404).json({ message: "Show not found" });
  }

  if (!canAccessShow(req.user, show)) {
    return res.status(403).json({ message: "You do not have access to this show" });
  }

  return res.json({ show: await decorateShow(show) });
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
    const location = req.body.location !== undefined ? String(req.body.location).trim() : show.location;
    const managerId = req.body.manager_id !== undefined ? Number(req.body.manager_id) : show.manager_id;
    const employeeIds = req.body.employee_ids !== undefined
      ? [...new Set((req.body.employee_ids || []).map(Number))]
      : show.employee_ids;
    const employeePay = req.body.employee_pay !== undefined
      ? req.body.employee_pay
      : (show.employee_pay || {});

    if (req.body.manager_id !== undefined) {
      const manager = await byId(managerId);
      if (!manager || manager.role !== "manager") {
        return res.status(400).json({ message: "A valid manager is required" });
      }
    }

    const [updatedShow] = await sql`
      UPDATE shows
      SET date = ${date},
          time = ${time},
          location = ${location},
          manager_id = ${managerId},
          employee_ids = ${employeeIds},
          employee_pay = ${JSON.stringify(employeePay)}
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    return res.json({ show: await decorateShow(updatedShow) });
  } catch (error) {
    console.error("Show update error:", error);
    return res.status(500).json({ message: error.message || "Failed to update show" });
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
    res.status(500).json({ message: error.message || "Failed to delete show" });
  }
});

app.post("/api/attendance", authenticate, requireRole("employee"), async (req, res) => {
  const { show_id } = req.body;
  const showResult = await sql`SELECT * FROM shows WHERE id = ${show_id}`;
  const show = showResult[0];

  if (!show || !show.employee_ids.includes(req.user.id)) {
    return res.status(404).json({ message: "Assigned show not found" });
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

  return res.status(201).json({ attendance: entry, show: await decorateShow(show) });
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

  return res.json({ attendance: updatedEntry, show: await decorateShow(show) });
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
      date: s.date instanceof Date ? s.date.toISOString().split("T")[0] : s.date
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
    toWorkbookSheet("Manager Totals", summaryByManager, [24, 28, 16, 16, 16]),
    toWorkbookSheet("Show Summary", showSummary, [16, 14, 12, 30, 22, 16, 18, 12, 12, 12])
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

app.get("/api/activity/today", authenticate, async (req, res) => {
  const todayStr = new Date().toISOString().split("T")[0];
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

  const todayStr = new Date().toISOString().split("T")[0];
  
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
