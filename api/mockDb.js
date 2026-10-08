import bcrypt from "bcryptjs";

// Generates dynamic dates relative to current date so mock data is always fresh
function getOffsetDate(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

export function createMockSql() {
  const defaultPassword = bcrypt.hashSync("dipfYh-pyfqeb-gyhzu1", 10);

  let users = [
    { id: 1, name: "SUNGGEET Admin", username: "admin@sunggeet.com", password: defaultPassword, role: "admin" },
    { id: 2, name: "Vikram Malhotra", username: "vikram@sunggeet.com", password: defaultPassword, role: "superior" },
    { id: 3, name: "Kabir Sethi", username: "kabir@sunggeet.com", password: defaultPassword, role: "manager" },
    { id: 4, name: "Mira Rao", username: "mira@sunggeet.com", password: defaultPassword, role: "manager" },
    { id: 5, name: "Aarav Mehta", username: "aarav@sunggeet.com", password: defaultPassword, role: "employee" },
    { id: 6, name: "Naina Kapoor", username: "naina@sunggeet.com", password: defaultPassword, role: "employee" },
    { id: 7, name: "Rhea Fernandes", username: "rhea@sunggeet.com", password: defaultPassword, role: "employee" },
    { id: 8, name: "Rohan Varma", username: "rohan@sunggeet.com", password: defaultPassword, role: "employee" },
    { id: 9, name: "Ananya Iyer", username: "ananya@sunggeet.com", password: defaultPassword, role: "employee" }
  ];

  let nextUserId = 10;
  let nextAttendanceId = 15;
  let nextActivityId = 10;

  const dMinus3 = getOffsetDate(-3);
  const dMinus2 = getOffsetDate(-2);
  const dMinus1 = getOffsetDate(-1);
  const dToday = getOffsetDate(0);
  const dPlus1 = getOffsetDate(1);
  const dPlus3 = getOffsetDate(3);
  const dPlus5 = getOffsetDate(5);
  const dPlus8 = getOffsetDate(8);

  let shows = [
    {
      id: `SGT-${dMinus3.replace(/-/g, "").slice(2)}-A`,
      date: dMinus3,
      time: "19:30",
      location: "The Piano Man Jazz Club",
      manager_id: 3,
      employee_ids: [5, 6],
      employee_pay: { "5": 7500, "6": 7500 }
    },
    {
      id: `SGT-${dMinus2.replace(/-/g, "").slice(2)}-A`,
      date: dMinus2,
      time: "18:00",
      location: "Blue Tokai Garden Cafe",
      manager_id: 4,
      employee_ids: [6, 7, 8],
      employee_pay: { "6": 6000, "7": 6500, "8": 6000 }
    },
    {
      id: `SGT-${dMinus1.replace(/-/g, "").slice(2)}-A`,
      date: dMinus1,
      time: "20:00",
      location: "Olive Bistro Courtyard",
      manager_id: 3,
      employee_ids: [5, 7, 9],
      employee_pay: { "5": 8000, "7": 8000, "9": 7500 }
    },
    {
      id: `SGT-${dToday.replace(/-/g, "").slice(2)}-A`,
      date: dToday,
      time: "18:30",
      location: "Cyber Hub Social, Main Stage",
      manager_id: 3,
      employee_ids: [5, 6, 8],
      employee_pay: { "5": 9000, "6": 8500, "8": 8500 }
    },
    {
      id: `SGT-${dToday.replace(/-/g, "").slice(2)}-B`,
      date: dToday,
      time: "21:00",
      location: "Hard Rock Cafe",
      manager_id: 4,
      employee_ids: [7, 9],
      employee_pay: { "7": 10000, "9": 10000 }
    },
    {
      id: `SGT-${dPlus1.replace(/-/g, "").slice(2)}-A`,
      date: dPlus1,
      time: "20:30",
      location: "Soro Village Pub",
      manager_id: 4,
      employee_ids: [5, 6, 7, 8],
      employee_pay: { "5": 7000, "6": 7000, "7": 7000, "8": 7000 }
    },
    {
      id: `SGT-${dPlus3.replace(/-/g, "").slice(2)}-A`,
      date: dPlus3,
      time: "19:00",
      location: "Summer House Cafe Acoustic Lounge",
      manager_id: 3,
      employee_ids: [8, 9],
      employee_pay: { "8": 8000, "9": 8000 }
    },
    {
      id: `SGT-${dPlus5.replace(/-/g, "").slice(2)}-A`,
      date: dPlus5,
      time: "21:30",
      location: "Molecule Air Bar & Kitchen",
      manager_id: 4,
      employee_ids: [5, 7, 9],
      employee_pay: { "5": 9500, "7": 9500, "9": 9500 }
    },
    {
      id: `SGT-${dPlus8.replace(/-/g, "").slice(2)}-A`,
      date: dPlus8,
      time: "20:00",
      location: "Depot48 Live Music Room",
      manager_id: 3,
      employee_ids: [6, 8],
      employee_pay: { "6": 8500, "8": 8500 }
    }
  ];

  let attendance = [
    // Past show 3 days ago - approved
    {
      id: 1,
      show_id: shows[0].id,
      user_id: 5,
      status: "marked",
      approval_status: "approved",
      marked_at: `${dMinus3}T19:35:00.000Z`,
      reviewed_at: `${dMinus3}T21:40:00.000Z`,
      reviewed_by: 3
    },
    {
      id: 2,
      show_id: shows[0].id,
      user_id: 6,
      status: "marked",
      approval_status: "approved",
      marked_at: `${dMinus3}T19:32:00.000Z`,
      reviewed_at: `${dMinus3}T21:40:00.000Z`,
      reviewed_by: 3
    },
    // Past show 2 days ago - 2 approved, 1 rejected
    {
      id: 3,
      show_id: shows[1].id,
      user_id: 6,
      status: "marked",
      approval_status: "approved",
      marked_at: `${dMinus2}T18:05:00.000Z`,
      reviewed_at: `${dMinus2}T20:15:00.000Z`,
      reviewed_by: 4
    },
    {
      id: 4,
      show_id: shows[1].id,
      user_id: 7,
      status: "marked",
      approval_status: "approved",
      marked_at: `${dMinus2}T18:10:00.000Z`,
      reviewed_at: `${dMinus2}T20:15:00.000Z`,
      reviewed_by: 4
    },
    {
      id: 5,
      show_id: shows[1].id,
      user_id: 8,
      status: "marked",
      approval_status: "rejected",
      marked_at: `${dMinus2}T19:45:00.000Z`,
      reviewed_at: `${dMinus2}T20:16:00.000Z`,
      reviewed_by: 4
    },
    // Yesterday's show - pending reviews for Kabir to test approvals!
    {
      id: 6,
      show_id: shows[2].id,
      user_id: 5,
      status: "marked",
      approval_status: "pending",
      marked_at: `${dMinus1}T20:05:00.000Z`,
      reviewed_at: null,
      reviewed_by: null
    },
    {
      id: 7,
      show_id: shows[2].id,
      user_id: 7,
      status: "marked",
      approval_status: "pending",
      marked_at: `${dMinus1}T20:10:00.000Z`,
      reviewed_at: null,
      reviewed_by: null
    },
    // Today's show 1 - Aarav marked early, pending review
    {
      id: 8,
      show_id: shows[3].id,
      user_id: 5,
      status: "marked",
      approval_status: "pending",
      marked_at: `${dToday}T18:35:00.000Z`,
      reviewed_at: null,
      reviewed_by: null
    }
  ];

  let dailyActivity = [
    { id: 1, user_id: 5, date: dToday, status: "active", updated_at: `${dToday}T09:00:00.000Z` },
    { id: 2, user_id: 6, date: dToday, status: "active", updated_at: `${dToday}T09:15:00.000Z` },
    { id: 3, user_id: 7, date: dToday, status: "active", updated_at: `${dToday}T10:00:00.000Z` },
    { id: 4, user_id: 8, date: dToday, status: "inactive", updated_at: `${dToday}T08:45:00.000Z` },
    { id: 5, user_id: 9, date: dToday, status: "active", updated_at: `${dToday}T09:30:00.000Z` }
  ];

  // Helper function to clone objects
  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  // The tagged template function
  return async function mockSql(strings, ...values) {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i + 1}` : ""), "");
    const normalized = rawSql.replace(/\s+/g, " ").trim();

    // 1. SELECT * FROM users WHERE id = $1
    if (normalized.startsWith("SELECT * FROM users WHERE id = $1")) {
      const id = Number(values[0]);
      const user = users.find((u) => u.id === id);
      return user ? [clone(user)] : [];
    }

    // 2. SELECT * FROM users WHERE id = ANY($1)
    if (normalized.includes("FROM users WHERE id = ANY($1)")) {
      const ids = Array.isArray(values[0]) ? values[0].map(Number) : [];
      return users.filter((u) => ids.includes(u.id)).map(clone);
    }

    // 3. SELECT * FROM users WHERE username = $1
    if (normalized.startsWith("SELECT * FROM users WHERE username = $1") || normalized.startsWith("SELECT id FROM users WHERE username = $1")) {
      const username = String(values[0] || "").toLowerCase().trim();
      let user = users.find((u) => u.username.toLowerCase().trim() === username);
      if (!user && username === "admin") {
        user = users.find((u) => u.username === "admin@sunggeet.com");
      } else if (!user && username === "admin@sunggeet.com") {
        user = users.find((u) => u.username === "admin");
      }
      return user ? [clone(user)] : [];
    }

    // 4. SELECT * FROM users ORDER BY id ASC (or without ORDER BY)
    if (normalized.startsWith("SELECT * FROM users")) {
      return [...users].sort((a, b) => a.id - b.id).map(clone);
    }

    // 5. INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4) RETURNING *
    if (normalized.startsWith("INSERT INTO users")) {
      const name = values[0];
      const username = values[1];
      const password = values[2];
      const role = values[3];
      const newUser = { id: nextUserId++, name, username, password, role };
      users.push(newUser);
      return [clone(newUser)];
    }

    // 6a. UPDATE users SET name = $1, username = $2, password = $3, role = $4 WHERE id = $5 RETURNING *
    if (normalized.startsWith("UPDATE users SET name = $1")) {
      const user = users.find((u) => u.id === Number(values[4]));
      if (!user) return [];
      [user.name, user.username, user.password, user.role] = values;
      return [clone(user)];
    }

    // 6. UPDATE users SET password = ... / SET password = $1, role = $2, name = $3 WHERE username = $4
    if (normalized.startsWith("UPDATE users")) {
      const username = String(values[values.length - 1] || "").toLowerCase().trim();
      const user = users.find((u) => u.username.toLowerCase().trim() === username);
      if (user) {
        if (values.length >= 4) {
          user.password = values[0];
          user.role = values[1];
          user.name = values[2];
        } else {
          user.password = values[0];
        }
        return [clone(user)];
      }
      return [];
    }

    // 7. DELETE FROM users WHERE id = $1
    if (normalized.startsWith("DELETE FROM users WHERE id = $1")) {
      const id = Number(values[0]);
      users = users.filter((u) => u.id !== id);
      return [];
    }

    // 8. SELECT * FROM shows WHERE id = $1
    if (normalized.startsWith("SELECT * FROM shows WHERE id = $1")) {
      const id = String(values[0]);
      const show = shows.find((s) => s.id === id);
      return show ? [clone(show)] : [];
    }

    // 9. SELECT COUNT(*) FROM shows WHERE date = $1
    if (normalized.startsWith("SELECT COUNT(*) FROM shows WHERE date = $1")) {
      const date = String(values[0]);
      const count = shows.filter((s) => s.date === date).length;
      return [{ count: String(count) }];
    }

    // 10. SELECT * FROM shows (with or without ORDER BY date ASC)
    if (normalized.startsWith("SELECT * FROM shows")) {
      return [...shows].sort((a, b) => a.date.localeCompare(b.date)).map(clone);
    }

    // 11. INSERT INTO shows (...) VALUES (...) RETURNING *
    if (normalized.startsWith("INSERT INTO shows")) {
      const [id, date, time, location, manager_id, employee_ids, employee_pay_val] = values;
      const employee_pay = typeof employee_pay_val === "string" ? JSON.parse(employee_pay_val) : (employee_pay_val || {});
      const newShow = { id, date, time, location, manager_id, employee_ids, employee_pay };
      shows.push(newShow);
      return [clone(newShow)];
    }

    // 12. UPDATE shows SET date = $1, time = $2, location = $3, manager_id = $4, employee_ids = $5, employee_pay = $6 WHERE id = $7 RETURNING *
    if (normalized.startsWith("UPDATE shows SET date = $1")) {
      const [date, time, location, manager_id, employee_ids, employee_pay_val, id] = values;
      const show = shows.find((s) => s.id === id);
      if (show) {
        show.date = date;
        show.time = time;
        show.location = location;
        show.manager_id = manager_id;
        show.employee_ids = employee_ids;
        show.employee_pay = typeof employee_pay_val === "string" ? JSON.parse(employee_pay_val) : (employee_pay_val || {});
        return [clone(show)];
      }
      return [];
    }

    // 13. UPDATE shows SET employee_ids = array_remove...
    if (normalized.includes("UPDATE shows SET employee_ids")) {
      const id = Number(values[0]);
      shows.forEach((s) => {
        s.employee_ids = (s.employee_ids || []).filter((eid) => eid !== id);
      });
      return [];
    }

    // 14. UPDATE shows SET manager_id = NULL WHERE manager_id = $1
    if (normalized.includes("UPDATE shows SET manager_id = NULL")) {
      const id = Number(values[0]);
      shows.forEach((s) => {
        if (s.manager_id === id) s.manager_id = null;
      });
      return [];
    }

    // 15. DELETE FROM shows WHERE id = $1
    if (normalized.startsWith("DELETE FROM shows WHERE id = $1")) {
      const id = String(values[0]);
      shows = shows.filter((s) => s.id !== id);
      return [];
    }

    // 15b. SELECT a.*, s.id as show_id FROM attendance a JOIN shows s ...
    if (normalized.includes("FROM attendance a JOIN shows s")) {
      if (normalized.includes("WHERE a.user_id = $1")) {
        const userId = Number(values[0]);
        return attendance.filter((a) => a.user_id === userId).map(clone);
      }
      return attendance.map(clone);
    }

    // 16. Join query for show attendance:
    // SELECT a.*, u.name as employee_name ... WHERE a.show_id = $1 OR ANY($1)
    if (normalized.includes("FROM attendance a") && (normalized.includes("WHERE a.show_id = $1") || normalized.includes("WHERE a.show_id = ANY($1)"))) {
      const showIds = Array.isArray(values[0]) ? values[0] : [String(values[0])];
      const matched = attendance.filter((a) => showIds.includes(a.show_id));
      return matched.map((a) => {
        const u = users.find((usr) => usr.id === a.user_id) || {};
        const r = a.reviewed_by ? users.find((usr) => usr.id === a.reviewed_by) : null;
        return {
          ...clone(a),
          employee_name: u.name || "Unknown",
          employee_username: u.username || "",
          employee_role: u.role || "employee",
          reviewer_name: r?.name || null,
          reviewer_username: r?.username || null,
          reviewer_role: r?.role || null
        };
      });
    }

    // 17. SELECT * FROM attendance WHERE user_id = $1
    if (normalized.startsWith("SELECT * FROM attendance WHERE user_id = $1")) {
      const userId = Number(values[0]);
      return attendance.filter((a) => a.user_id === userId).map(clone);
    }

    // 18. SELECT * FROM attendance WHERE show_id = ANY($1)
    if (normalized.includes("FROM attendance WHERE show_id = ANY($1)")) {
      const showIds = Array.isArray(values[0]) ? values[0] : [];
      return attendance.filter((a) => showIds.includes(a.show_id)).map(clone);
    }

    // 19. SELECT COUNT(*) FROM attendance WHERE reviewed_by = $1
    if (normalized.startsWith("SELECT COUNT(*) FROM attendance WHERE reviewed_by = $1")) {
      const reviewerId = Number(values[0]);
      const count = attendance.filter((a) => a.reviewed_by === reviewerId).length;
      return [{ count: String(count) }];
    }

    // 20. SELECT * FROM attendance WHERE show_id = $1 AND user_id = $2
    if (normalized.includes("FROM attendance WHERE show_id = $1 AND user_id = $2")) {
      const [showId, userId] = values;
      const entry = attendance.find((a) => a.show_id === showId && a.user_id === Number(userId));
      return entry ? [clone(entry)] : [];
    }

    // 21. SELECT * FROM attendance WHERE id = $1
    if (normalized.startsWith("SELECT * FROM attendance WHERE id = $1")) {
      const id = Number(values[0]);
      const entry = attendance.find((a) => a.id === id);
      return entry ? [clone(entry)] : [];
    }

    // 22. SELECT * FROM attendance
    if (normalized.startsWith("SELECT * FROM attendance")) {
      return attendance.map(clone);
    }

    // 23. INSERT INTO attendance (...) VALUES (...) RETURNING *
    if (normalized.startsWith("INSERT INTO attendance")) {
      const [show_id, user_id, status, approval_status, marked_at] = values;
      const newEntry = {
        id: nextAttendanceId++,
        show_id,
        user_id: Number(user_id),
        status: status || "marked",
        approval_status: approval_status || "pending",
        marked_at: marked_at || new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null
      };
      attendance.push(newEntry);
      return [clone(newEntry)];
    }

    // 24. UPDATE attendance SET approval_status = $1, reviewed_at = $2, reviewed_by = $3 WHERE id = $4 RETURNING *
    if (normalized.startsWith("UPDATE attendance SET approval_status = $1")) {
      const [approval_status, reviewed_at, reviewed_by, id] = values;
      const entry = attendance.find((a) => a.id === Number(id));
      if (entry) {
        entry.approval_status = approval_status;
        entry.reviewed_at = reviewed_at;
        entry.reviewed_by = Number(reviewed_by);
        return [clone(entry)];
      }
      return [];
    }

    // 25. DELETE FROM attendance WHERE user_id = $1 OR reviewed_by = $1
    if (normalized.startsWith("DELETE FROM attendance WHERE user_id = $1 OR reviewed_by = $1")) {
      const id = Number(values[0]);
      attendance = attendance.filter((a) => a.user_id !== id && a.reviewed_by !== id);
      return [];
    }

    // 26. DELETE FROM attendance WHERE show_id = $1
    if (normalized.startsWith("DELETE FROM attendance WHERE show_id = $1")) {
      const showId = String(values[0]);
      attendance = attendance.filter((a) => a.show_id !== showId);
      return [];
    }

    // 27. SELECT status/all FROM daily_activity WHERE user_id = $1 AND date = $2
    if (normalized.includes("FROM daily_activity") && normalized.includes("WHERE user_id = $1 AND date = $2")) {
      const [userId, date] = values;
      const entry = dailyActivity.find((a) => a.user_id === Number(userId) && a.date === String(date));
      return entry ? [clone(entry)] : [];
    }

    // 28. SELECT da.*, u.name, u.username, u.role FROM daily_activity da JOIN users u ON da.user_id = u.id WHERE da.date = $1
    if (normalized.includes("FROM daily_activity da JOIN users u") && normalized.includes("WHERE da.date = $1")) {
      const date = String(values[0]);
      const matched = dailyActivity.filter((a) => a.date === date);
      return matched.map((a) => {
        const u = users.find((usr) => usr.id === a.user_id) || {};
        return {
          ...clone(a),
          name: u.name || "Unknown",
          username: u.username || "",
          role: u.role || "employee"
        };
      });
    }

    // 29. INSERT INTO daily_activity ... ON CONFLICT (user_id, date) DO UPDATE ... RETURNING *
    if (normalized.startsWith("INSERT INTO daily_activity")) {
      const [userId, date, status, updatedAt] = values;
      let existing = dailyActivity.find((a) => a.user_id === Number(userId) && a.date === String(date));
      if (existing) {
        existing.status = status;
        existing.updated_at = updatedAt || new Date().toISOString();
        return [clone(existing)];
      } else {
        const newEntry = {
          id: nextActivityId++,
          user_id: Number(userId),
          date: String(date),
          status,
          updated_at: updatedAt || new Date().toISOString()
        };
        dailyActivity.push(newEntry);
        return [clone(newEntry)];
      }
    }

    // 30. DELETE FROM daily_activity WHERE user_id = $1
    if (normalized.startsWith("DELETE FROM daily_activity WHERE user_id = $1")) {
      const id = Number(values[0]);
      dailyActivity = dailyActivity.filter((a) => a.user_id !== id);
      return [];
    }

    // Fallback or generic query (e.g. setval)
    if (normalized.includes("setval")) {
      return [{ setval: 1 }];
    }

    console.warn("⚠️ Unmatched mock query:", normalized);
    return [];
  };
}
