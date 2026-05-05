import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import writeXlsxFile from "write-excel-file/node";
import { Buffer } from "node:buffer";

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "local-sunggeet-secret";

app.use(cors());
app.use(express.json());

const today = new Date("2026-03-19T10:30:00.000Z");

const users = [
  {
    id: 1,
    name: "Aarav Mehta",
    email: "aarav@sunggeet.com",
    password: bcrypt.hashSync("password123", 10),
    role: "employee"
  },
  {
    id: 2,
    name: "Naina Kapoor",
    email: "naina@sunggeet.com",
    password: bcrypt.hashSync("password123", 10),
    role: "employee"
  },
  {
    id: 3,
    name: "Rhea Fernandes",
    email: "rhea@sunggeet.com",
    password: bcrypt.hashSync("password123", 10),
    role: "employee"
  },
  {
    id: 4,
    name: "Kabir Sethi",
    email: "kabir@sunggeet.com",
    password: bcrypt.hashSync("password123", 10),
    role: "manager"
  },
  {
    id: 5,
    name: "Mira Rao",
    email: "mira@sunggeet.com",
    password: bcrypt.hashSync("password123", 10),
    role: "manager"
  },
  {
    id: 6,
    name: "SUNGGEET Admin",
    email: "admin@sunggeet.com",
    password: bcrypt.hashSync("password123", 10),
    role: "admin"
  }
];

const shows = [
  {
    id: "SGT-1903-A",
    date: "2026-03-19",
    time: "18:00",
    location: "Blue Tokai Garden Cafe",
    manager_id: 4,
    employee_ids: [1, 2]
  },
  {
    id: "SGT-1903-B",
    date: "2026-03-19",
    time: "20:30",
    location: "The Piano Man Jazz Club",
    manager_id: 4,
    employee_ids: [1, 3]
  },
  {
    id: "SGT-2003-A",
    date: "2026-03-20",
    time: "19:00",
    location: "Olive Bistro Courtyard",
    manager_id: 5,
    employee_ids: [2, 3]
  },
  {
    id: "SGT-2103-A",
    date: "2026-03-21",
    time: "21:00",
    location: "Soro Village Pub",
    manager_id: 5,
    employee_ids: [1, 2, 3]
  }
];

let attendance = [
  {
    id: 1,
    show_id: "SGT-1903-A",
    user_id: 2,
    status: "marked",
    approval_status: "approved",
    marked_at: "2026-03-19T18:06:00.000Z",
    reviewed_at: "2026-03-19T19:12:00.000Z",
    reviewed_by: 4
  },
  {
    id: 2,
    show_id: "SGT-1903-B",
    user_id: 3,
    status: "marked",
    approval_status: "pending",
    marked_at: "2026-03-19T20:39:00.000Z",
    reviewed_at: null,
    reviewed_by: null
  }
];

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

const byId = (id) => users.find((user) => user.id === Number(id));

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const isValidRole = (role) => ["employee", "manager", "admin"].includes(role);

const decorateShow = (show) => {
  const manager = byId(show.manager_id);
  return {
    ...show,
    manager: publicUser(manager),
    employees: show.employee_ids.map((id) => publicUser(byId(id))),
    attendance: attendance
      .filter((entry) => entry.show_id === show.id)
      .map((entry) => ({
        ...entry,
        employee: publicUser(byId(entry.user_id)),
        reviewer: entry.reviewed_by ? publicUser(byId(entry.reviewed_by)) : null
      }))
  };
};

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "12h" });

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = byId(payload.id);

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
  if (user.role === "admin") return true;
  if (user.role === "manager") return show.manager_id === user.id;
  return show.employee_ids.includes(user.id);
};

const getStats = (user) => {
  const visibleShows = shows.filter((show) => canAccessShow(user, show));
  const visibleShowIds = new Set(visibleShows.map((show) => show.id));
  const visibleAttendance =
    user.role === "employee"
      ? attendance.filter((entry) => entry.user_id === user.id)
      : attendance.filter((entry) => visibleShowIds.has(entry.show_id));

  return {
    totalShows: visibleShows.length,
    approvedShows: visibleAttendance.filter((entry) => entry.approval_status === "approved").length,
    pendingShows: visibleAttendance.filter((entry) => entry.approval_status === "pending").length,
    rejectedShows: visibleAttendance.filter((entry) => entry.approval_status === "rejected").length,
    approvalsDone:
      user.role === "employee"
        ? 0
        : attendance.filter((entry) => entry.reviewed_by === user.id).length
  };
};

const attendanceLedgerRows = () =>
  shows.flatMap((show) => {
    const manager = byId(show.manager_id);

    return show.employee_ids.map((employeeId) => {
      const employee = byId(employeeId);
      const entry = attendance.find(
        (candidate) => candidate.show_id === show.id && candidate.user_id === employeeId
      );

      return {
        "Artist Name": employee.name,
        "Artist Email": employee.email,
        "Show Date": show.date,
        "Show Time": show.time,
        Venue: show.location,
        "Show ID": show.id,
        Manager: manager.name,
        "Attendance Status": entry ? "Marked" : "Not Marked",
        "Approval Status": entry ? titleCase(entry.approval_status) : "Waiting",
        "Marked At": entry?.marked_at ? formatTimestamp(entry.marked_at) : "",
        "Reviewed At": entry?.reviewed_at ? formatTimestamp(entry.reviewed_at) : ""
      };
    });
  });

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
  res.json({ ok: true, now: today.toISOString() });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body;
  const user = users.find((candidate) => candidate.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  if (role && user.role !== role) {
    return res.status(403).json({ message: `This account is registered as ${user.role}` });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: publicUser(req.user), stats: getStats(req.user) });
});

app.get("/api/users", authenticate, requireRole("admin"), (_req, res) => {
  res.json({ users: users.map(publicUser) });
});

app.post("/api/users", authenticate, requireRole("admin"), (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "").trim();
  const role = String(req.body.role || "").trim();

  if (!name || !email || !password || !isValidRole(role)) {
    return res.status(400).json({ message: "Name, email, password, and valid role are required" });
  }

  if (users.some((user) => user.email === email)) {
    return res.status(409).json({ message: "A member with this email already exists" });
  }

  const user = {
    id: Math.max(...users.map((candidate) => candidate.id)) + 1,
    name,
    email,
    password: bcrypt.hashSync(password, 10),
    role
  };

  users.push(user);

  return res.status(201).json({ user: publicUser(user), users: users.map(publicUser) });
});

app.get("/api/shows", authenticate, (req, res) => {
  const visibleShows = shows.filter((show) => canAccessShow(req.user, show)).map(decorateShow);
  res.json({ shows: visibleShows });
});

app.post("/api/shows", authenticate, requireRole("admin"), (req, res) => {
  const date = String(req.body.date || "").trim();
  const time = String(req.body.time || "").trim();
  const location = String(req.body.location || "").trim();
  const managerId = Number(req.body.manager_id);
  const employeeIds = [...new Set((req.body.employee_ids || []).map(Number))];
  const manager = byId(managerId);
  const employees = employeeIds.map(byId);

  if (!date || !time || !location || !manager || manager.role !== "manager") {
    return res.status(400).json({ message: "Date, time, location, and a valid manager are required" });
  }

  if (!employeeIds.length || employees.some((employee) => !employee || employee.role !== "employee")) {
    return res.status(400).json({ message: "Assign at least one valid employee singer" });
  }

  const dateCode = date.slice(8, 10) + date.slice(5, 7);
  const showCountForDay = shows.filter((show) => show.date === date).length + 1;
  const id = `SGT-${dateCode}-${String(showCountForDay).padStart(2, "0")}`;
  const show = {
    id,
    date,
    time,
    location,
    manager_id: managerId,
    employee_ids: employeeIds
  };

  shows.push(show);

  return res.status(201).json({ show: decorateShow(show), shows: shows.map(decorateShow) });
});

app.get("/api/shows/:id", authenticate, (req, res) => {
  const show = shows.find((candidate) => candidate.id === req.params.id);

  if (!show) {
    return res.status(404).json({ message: "Show not found" });
  }

  if (!canAccessShow(req.user, show)) {
    return res.status(403).json({ message: "You do not have access to this show" });
  }

  return res.json({ show: decorateShow(show) });
});

app.post("/api/attendance", authenticate, requireRole("employee"), (req, res) => {
  const { show_id } = req.body;
  const show = shows.find((candidate) => candidate.id === show_id);

  if (!show || !show.employee_ids.includes(req.user.id)) {
    return res.status(404).json({ message: "Assigned show not found" });
  }

  const existing = attendance.find(
    (entry) => entry.show_id === show_id && entry.user_id === req.user.id
  );

  if (existing) {
    return res.status(409).json({ message: "Attendance has already been marked for this show" });
  }

  const entry = {
    id: attendance.length + 1,
    show_id,
    user_id: req.user.id,
    status: "marked",
    approval_status: "pending",
    marked_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null
  };

  attendance = [...attendance, entry];

  return res.status(201).json({ attendance: entry, show: decorateShow(show) });
});

app.patch("/api/attendance/:id/review", authenticate, requireRole("manager", "admin"), (req, res) => {
  const { approval_status } = req.body;
  const entry = attendance.find((candidate) => candidate.id === Number(req.params.id));

  if (!["approved", "rejected"].includes(approval_status)) {
    return res.status(400).json({ message: "Approval status must be approved or rejected" });
  }

  if (!entry) {
    return res.status(404).json({ message: "Attendance entry not found" });
  }

  const show = shows.find((candidate) => candidate.id === entry.show_id);

  if (req.user.role === "manager" && show.manager_id !== req.user.id) {
    return res.status(403).json({ message: "Managers can only review their own shows" });
  }

  if (entry.approval_status !== "pending" && req.user.role !== "admin") {
    return res.status(409).json({ message: "Only an admin can edit a finalized approval" });
  }

  entry.approval_status = approval_status;
  entry.reviewed_at = new Date().toISOString();
  entry.reviewed_by = req.user.id;

  return res.json({ attendance: entry, show: decorateShow(show) });
});

app.get("/api/profile", authenticate, (req, res) => {
  const userAttendance = attendance
    .filter((entry) => (req.user.role === "employee" ? entry.user_id === req.user.id : true))
    .filter((entry) => {
      const show = shows.find((candidate) => candidate.id === entry.show_id);
      return canAccessShow(req.user, show);
    })
    .map((entry) => ({
      ...entry,
      show: shows.find((show) => show.id === entry.show_id),
      employee: publicUser(byId(entry.user_id))
    }));

  res.json({ stats: getStats(req.user), activity: userAttendance });
});

app.get("/api/export/attendance.xlsx", authenticate, requireRole("admin"), async (_req, res) => {
  const rows = attendanceLedgerRows();
  const summaryByEmployee = users
    .filter((user) => user.role === "employee")
    .map((user) => ({
      "Artist Name": user.name,
      Email: user.email,
      "Assigned Shows": shows.filter((show) => show.employee_ids.includes(user.id)).length,
      "Attendance Marked": attendance.filter((entry) => entry.user_id === user.id).length,
      "Approved Shows": attendance.filter(
        (entry) => entry.user_id === user.id && entry.approval_status === "approved"
      ).length,
      "Pending Approval": attendance.filter(
        (entry) => entry.user_id === user.id && entry.approval_status === "pending"
      ).length,
      Rejected: attendance.filter(
        (entry) => entry.user_id === user.id && entry.approval_status === "rejected"
      ).length
    }));
  const summaryByManager = users
    .filter((user) => user.role === "manager")
    .map((user) => ({
      Manager: user.name,
      Email: user.email,
      "Shows Managed": shows.filter((show) => show.manager_id === user.id).length,
      "Approvals Done": attendance.filter((entry) => entry.reviewed_by === user.id).length,
      "Pending Reviews": attendance.filter((entry) => {
        const show = shows.find((candidate) => candidate.id === entry.show_id);
        return show.manager_id === user.id && entry.approval_status === "pending";
      }).length
    }));
  const showSummary = shows.map((show) => ({
    "Show ID": show.id,
    Date: show.date,
    Time: show.time,
    Venue: show.location,
    Manager: byId(show.manager_id).name,
    "Assigned Artists": show.employee_ids.length,
    "Marked Attendance": attendance.filter((entry) => entry.show_id === show.id).length,
    Approved: attendance.filter(
      (entry) => entry.show_id === show.id && entry.approval_status === "approved"
    ).length,
    Pending: attendance.filter(
      (entry) => entry.show_id === show.id && entry.approval_status === "pending"
    ).length,
    Rejected: attendance.filter(
      (entry) => entry.show_id === show.id && entry.approval_status === "rejected"
    ).length
  }));

  const buffer = await writeXlsxFile([
    toWorkbookSheet("Attendance Ledger", rows, [
      24, 28, 14, 12, 30, 16, 22, 18, 18, 24, 24
    ]),
    toWorkbookSheet("Artist Totals", summaryByEmployee, [24, 28, 16, 18, 16, 18, 12]),
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

app.listen(PORT, () => {
  console.log(`SUNGGEET API listening on http://localhost:${PORT}`);
});
