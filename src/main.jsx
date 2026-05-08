import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarBlank,
  Check,
  Clock,
  CurrencyInr,
  DownloadSimple,
  FloppyDisk,
  GearSix,
  House,
  List,
  MapPin,
  PencilSimple,
  Plus,
  SignOut,
  UserCircle,
  UserPlus,
  Users,
  ChartBar,
  X,
  CheckCircle,
  XCircle,
  Trash
} from "@phosphor-icons/react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : `http://${window.location.hostname}:4000/api`);



function App() {
  const [token, setToken] = useState(() => localStorage.getItem("sunggeet-token"));
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api("/auth/me", { token })
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("sunggeet-token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleLogin = ({ nextToken, nextUser }) => {
    localStorage.setItem("sunggeet-token", nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setView("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("sunggeet-token");
    setToken(null);
    setUser(null);
    setView("dashboard");
  };

  if (loading) return <LoadingScreen />;

  if (!token || !user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <Shell
      user={user}
      view={view}
      setView={setView}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
      onLogout={handleLogout}
    >
      {view === "dashboard" && <Dashboard token={token} user={user} />}
      {view === "shows" && <ShowsView token={token} user={user} />}
      {view === "profile" && <ProfileView token={token} user={user} />}
      {view === "admin" && (user.role === "admin" || user.role === "superior") && <AdminView token={token} user={user} />}
      {view === "data" && (user.role === "admin" || user.role === "superior") && <DataView token={token} />}
      {view === "checkin" && <DailyCheckInView token={token} user={user} />}
    </Shell>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-ink text-slate-100">
      <div className="w-80 space-y-4">
        <div className="h-5 w-36 rounded bg-white/10 shimmer" />
        <div className="h-28 rounded-xl border border-white/10 bg-white/[0.04] shimmer" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 rounded-lg bg-white/[0.04] shimmer" />
          <div className="h-16 rounded-lg bg-white/[0.04] shimmer" />
          <div className="h-16 rounded-lg bg-white/[0.04] shimmer" />
        </div>
      </div>
    </main>
  );
}

function LoginScreen({ onLogin }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: form
      });
      onLogin({ nextToken: data.token, nextUser: data.user });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-ink text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(99,102,241,0.2),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(20,184,166,0.16),transparent_26%)]" />
      <section className="relative mx-auto grid min-h-[100dvh] max-w-7xl gap-10 px-5 py-8 md:grid-cols-[1.1fr_0.9fr] md:px-8">
        <div className="flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06] font-mono text-sm font-semibold">
              SG
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-slate-400">SUNGGEET</p>
              <p className="text-xs text-slate-500">Attendance and show operations</p>
            </div>
          </div>

          <div className="max-w-2xl py-16 md:py-0">
            <p className="mb-5 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-300">
              Payroll-ready attendance for live music teams
            </p>
            <h1 className="text-5xl font-semibold leading-none tracking-tight text-white md:text-7xl">
              Shows marked fast. Approvals kept clean.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
              Singers mark their assigned gigs once, managers approve from a focused table, and admins export the month into Excel for payroll.
            </p>
          </div>

          <div className="hidden grid-cols-3 gap-3 pb-4 md:grid">
            <Signal label="Marked today" value="2" />
            <Signal label="Pending review" value="1" />
            <Signal label="Venues live" value="4" />
          </div>
        </div>

        <form
          onSubmit={submit}
          className="self-center rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-5 shadow-lift backdrop-blur-xl md:p-7"
        >
          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight">Login</h2>
            <p className="mt-2 text-sm text-slate-400">Enter your credentials to access the dashboard.</p>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Username</span>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter your username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-slate-300">Password</span>
            <input
              className="field"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>
          </div>

          {error && <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

          <button className="primary-button mt-6 w-full" disabled={submitting}>
            {submitting ? "Checking account" : "Enter dashboard"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Signal({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="font-mono text-2xl text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
    </div>
  );
}

function Shell({ children, user, view, setView, mobileOpen, setMobileOpen, onLogout }) {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: House },
    { id: "shows", label: "Shows", icon: CalendarBlank },
    { id: "checkin", label: "Daily Check-in", icon: CheckCircle },
    { id: "profile", label: "Profile", icon: UserCircle },
    ...(user.role === "admin" || user.role === "superior" ? [
      { id: "admin", label: "Admin", icon: GearSix },
      { id: "data", label: "Data", icon: ChartBar }
    ] : [])
  ];

  return (
    <main className="min-h-[100dvh] bg-ink text-slate-100">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_90%_8%,rgba(99,102,241,0.14),transparent_30%)]" />
      <div className="relative grid min-h-[100dvh] lg:grid-cols-[280px_1fr]">
        {mobileOpen && (
          <button
            className="fixed inset-0 z-10 bg-slate-950/60 backdrop-blur-sm lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside className={`sidebar ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold tracking-tight">SUNGGEET</p>
              <p className="text-xs text-slate-500">Show management</p>
            </div>
            <button className="icon-button lg:hidden" onClick={() => setMobileOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <nav className="mt-10 space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`nav-item ${view === item.id ? "nav-item-active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setMobileOpen(false);
                  }}
                >
                  <Icon size={19} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button className="nav-item mt-auto text-slate-400" onClick={onLogout}>
            <SignOut size={19} />
            Logout
          </button>
        </aside>

        <section className="min-w-0 px-4 pb-28 pt-5 md:px-8 lg:pb-5">
          <header className="mb-7 grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4">
            <button className="icon-button lg:hidden" onClick={() => setMobileOpen(true)}>
              <List size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-sm capitalize text-slate-400">{user.role} workspace</p>
              <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
                Good evening, {user.name.split(" ")[0]}
              </h1>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-2 sm:px-3">
              <div className="grid size-8 place-items-center rounded-full bg-indigoSoft/20 text-sm text-indigo-100">
                {user.name.slice(0, 1)}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm text-white">{user.name}</p>
                <p className="text-xs capitalize text-slate-500">{user.role}</p>
              </div>
            </div>
          </header>
          {children}
        </section>
      </div>
      <MobileNav items={items} view={view} setView={setView} />
    </main>
  );
}

function MobileNav({ items, view, setView }) {
  return (
    <nav className="mobile-nav lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={`mobile-nav-item ${view === item.id ? "mobile-nav-item-active" : ""}`}
            key={item.id}
            onClick={() => setView(item.id)}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Dashboard({ token, user }) {
  const { shows, profile, loading, refresh } = useWorkspaceData(token);

  if (loading) return <DashboardSkeleton />;

  const stats = profile?.stats || {};

  return (
    <div className="space-y-7">
      <StatsGrid stats={stats} role={user.role} />
      {user.role === "employee" ? (
        <EmployeeShows shows={shows} token={token} onChanged={refresh} />
      ) : (
        <ManagerShows shows={shows} token={token} role={user.role} onChanged={refresh} />
      )}
    </div>
  );
}

function ShowsView({ token, user }) {
  const { shows, loading, refresh } = useWorkspaceData(token);

  if (loading) return <DashboardSkeleton />;

  return user.role === "employee" ? (
    <EmployeeShows shows={shows} token={token} onChanged={refresh} />
  ) : (
    <ManagerShows shows={shows} token={token} role={user.role} onChanged={refresh} expanded />
  );
}

function ProfileView({ token, user }) {
  const { profile, loading } = useWorkspaceData(token);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-7">
      <StatsGrid stats={profile.stats} role={user.role} />
      <section className="panel">
        <div className="mb-5 grid gap-4 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="section-title">Recent activity</h2>
            <p className="section-copy">Submitted attendance and manager decisions.</p>
          </div>
          {(user.role === "admin" || user.role === "superior") && <ExportButton token={token} />}
        </div>
        <div className="divide-y divide-white/10">
          {profile.activity.length === 0 ? (
            <EmptyState title="No attendance yet" copy="Marked shows will appear here after the first submission." />
          ) : (
            profile.activity.map((entry) => (
              <div className="grid gap-3 py-4 md:grid-cols-[1fr_160px_160px]" key={entry.id}>
                <div>
                  <p className="font-medium text-white">{entry.show.location}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatDate(entry.show.date)} at {formatTime(entry.show.time)}
                  </p>
                </div>
                <StatusBadge status={entry.status} />
                <StatusBadge status={entry.approval_status} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AdminView({ token, user }) {
  const { users, shows, loading, refresh } = useAdminData(token);
  const managers = useMemo(() => users.filter((u) => u.role === "manager"), [users]);
  const employees = useMemo(() => users.filter((u) => u.role === "employee"), [users]);
  const [selectedShow, setSelectedShow] = useState(null);

  const deleteUser = async (targetId, targetName) => {
    if (!window.confirm(`Are you sure you want to delete ${targetName}? All their attendance records will be removed.`)) return;
    try {
      await api(`/users/${targetId}`, { token, method: "DELETE" });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteShow = async (targetId, targetLocation) => {
    if (!window.confirm(`Are you sure you want to delete the show at ${targetLocation} (${targetId})?`)) return;
    try {
      await api(`/shows/${targetId}`, { token, method: "DELETE" });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-7">
      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <MemberForm token={token} onCreated={refresh} currentUser={user} />
        <ShowForm token={token} managers={managers} employees={employees} onCreated={refresh} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <AdminList
          title="Team members"
          copy={`${users.length} people in SUNGGEET`}
          empty="Add your first team member from the form above."
        >
          {users.map((u) => (
            <div className="admin-row group" key={u.id}>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white truncate">{u.name}</h1>
                <p className="text-sm text-slate-400 truncate">{u.username}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={u.role} />
                {user.role === "admin" && u.id !== user.id && (
                  <button
                    onClick={() => deleteUser(u.id, u.name)}
                    className="grid size-8 place-items-center rounded-lg bg-rose-500/10 text-rose-400 opacity-0 transition-opacity hover:bg-rose-500/20 group-hover:opacity-100"
                    title="Delete user"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </AdminList>

        <AdminList
          title="Show roster"
          copy={`${shows.length} shows scheduled — click to edit`}
          empty="Create a show and it will appear here."
        >
          {shows.map((show) => (
            <div className="admin-row group w-full" key={show.id}>
              <button
                className="flex-1 text-left min-w-0 transition-all cursor-pointer"
                onClick={() => setSelectedShow(show)}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{show.location}</p>
                  <p className="text-sm text-slate-400">
                    {formatDate(show.date)} at {formatTime(show.time)}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3">
                <div className="text-right text-sm text-slate-400 hidden sm:block">
                  <p>{show.manager.name}</p>
                  <p>{show.employees.length} singers</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedShow(show)}
                    className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-slate-400 opacity-0 transition-opacity hover:bg-white/[0.08] group-hover:opacity-100"
                    title="Edit show"
                  >
                    <PencilSimple size={16} />
                  </button>
                  {user.role === "admin" && (
                    <button
                      onClick={() => deleteShow(show.id, show.location)}
                      className="grid size-8 place-items-center rounded-lg bg-rose-500/10 text-rose-400 opacity-0 transition-opacity hover:bg-rose-500/20 group-hover:opacity-100"
                      title="Delete show"
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </AdminList>
      </section>

      {selectedShow && (
        <ShowDetailModal
          show={selectedShow}
          token={token}
          allEmployees={employees}
          managers={managers}
          onClose={() => setSelectedShow(null)}
          onSaved={() => {
            setSelectedShow(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShowDetailModal({ show, token, allEmployees, managers, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: show.date,
    time: show.time,
    location: show.location,
    manager_id: show.manager.id,
    employee_ids: show.employees.map((e) => e.id),
    employee_pay: show.employee_pay || {}
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const toggleEmployee = (id) => {
    setForm((current) => {
      const newIds = current.employee_ids.includes(id)
        ? current.employee_ids.filter((eid) => eid !== id)
        : [...current.employee_ids, id];
      const newPay = { ...current.employee_pay };
      if (!newIds.includes(id)) {
        delete newPay[String(id)];
      }
      return { ...current, employee_ids: newIds, employee_pay: newPay };
    });
  };

  const setPay = (id, value) => {
    setForm((current) => ({
      ...current,
      employee_pay: {
        ...current.employee_pay,
        [String(id)]: value === "" ? null : Number(value)
      }
    }));
  };

  const save = async () => {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await api(`/shows/${show.id}`, {
        token,
        method: "PATCH",
        body: {
          date: form.date,
          time: form.time,
          location: form.location,
          manager_id: Number(form.manager_id),
          employee_ids: form.employee_ids.map(Number),
          employee_pay: form.employee_pay
        }
      });
      setMessage("Show updated successfully");
      setTimeout(() => onSaved(), 600);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPay = Object.values(form.employee_pay).reduce((sum, v) => sum + (Number(v) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[1.25rem] border border-white/10 bg-[#111827] p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-300/20 bg-indigo-500/12 text-indigo-100">
              <PencilSimple size={20} />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">Edit show</h2>
              <p className="text-sm text-slate-400">{show.id} — Update members and assign pay</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Show details */}
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Date"
            type="date"
            value={form.date}
            onChange={(value) => setForm({ ...form, date: value })}
          />
          <TextField
            label="Time"
            type="time"
            value={form.time}
            onChange={(value) => setForm({ ...form, time: value })}
          />
          <div className="md:col-span-2">
            <TextField
              label="Location"
              value={form.location}
              onChange={(value) => setForm({ ...form, location: value })}
            />
          </div>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm text-slate-300">Manager</span>
            <select
              className="field"
              value={form.manager_id}
              onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
            >
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Members + Pay */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Assigned singers & pay</p>
            {totalPay > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <CurrencyInr size={12} weight="bold" />
                Total: ₹{totalPay.toLocaleString("en-IN")}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {allEmployees.map((employee) => {
              const isAssigned = form.employee_ids.includes(employee.id);
              const isExpanded = expandedId === employee.id && isAssigned;
              const payValue = form.employee_pay[String(employee.id)];

              return (
                <div
                  key={employee.id}
                  className={`rounded-xl border transition-all ${
                    isAssigned
                      ? "border-indigo-400/20 bg-indigo-500/[0.06]"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={() => toggleEmployee(employee.id)}
                      className="shrink-0"
                    />
                    <button
                      className="flex flex-1 items-center gap-3 min-w-0 text-left"
                      onClick={() => {
                        if (isAssigned) {
                          setExpandedId(isExpanded ? null : employee.id);
                        }
                      }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300 shrink-0">
                        {employee.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-200">{employee.name}</span>
                        <span className="block text-xs text-slate-500">{employee.username}</span>
                      </div>
                    </button>
                    {isAssigned && payValue != null && payValue !== "" && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200 shrink-0">
                        ₹{Number(payValue).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-white/5 px-3 py-3">
                      <label className="flex items-center gap-2">
                        <span className="text-sm text-slate-400 shrink-0">Pay (₹)</span>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            className="field pl-7 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0"
                            value={payValue ?? ""}
                            onChange={(e) => setPay(employee.id, e.target.value)}
                          />
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Feedback + Actions */}
        <FormFeedback error={error} message={message} />
        <div className="mt-6 flex justify-end gap-3">
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button inline-flex items-center gap-2"
            disabled={submitting || form.employee_ids.length === 0}
            onClick={save}
          >
            <FloppyDisk size={18} />
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataView({ token }) {
  const { users, shows, loading } = useAdminData(token);
  const [selectedMonth, setSelectedMonth] = useState("");

  const employees = useMemo(() => users.filter((u) => u.role === "employee"), [users]);

  const months = useMemo(() => {
    const unique = [...new Set(shows.map((s) => s.date.slice(0, 7)))];
    return unique.sort().reverse();
  }, [shows]);

  useEffect(() => {
    if (months.length > 0 && !selectedMonth) {
      setSelectedMonth(months[0]);
    }
  }, [months, selectedMonth]);

  const stats = useMemo(() => {
    if (!selectedMonth) return [];

    return employees.map((employee) => {
      const monthlyShows = shows.filter((s) => s.date.startsWith(selectedMonth));
      const attendedCount = monthlyShows.reduce((count, show) => {
        const entry = show.attendance.find((a) => a.user_id === employee.id);
        const hasAttended = entry && entry.approval_status === "approved";
        return count + (hasAttended ? 1 : 0);
      }, 0);

      return {
        id: employee.id,
        name: employee.name,
        username: employee.username,
        attended: attendedCount
      };
    });
  }, [employees, shows, selectedMonth]);

  const formatMonthLabel = (m) => {
    const [year, month] = m.split("-");
    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
    return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(d);
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-7">
      <section className="panel">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="section-title">Attendance data</h2>
            <p className="section-copy">Show counts for each singer by month.</p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {months.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-slate-500">No shows found</p>
            ) : (
              months.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selectedMonth === m ? "bg-indigoSoft text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {formatMonthLabel(m)}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr className="border-b border-white/10">
                <th className="py-3 pr-4 font-medium">Singer Name</th>
                <th className="py-3 pr-4 font-medium text-right">Shows Attended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan="2" className="py-10 text-center text-sm text-slate-500">
                    No employees found or no data for this month.
                  </td>
                </tr>
              ) : (
                stats.map((row) => (
                  <tr key={row.id}>
                    <td className="py-4 pr-4">
                      <p className="font-medium text-slate-200">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.username}</p>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <span className="text-xl font-mono font-semibold text-indigo-100">
                        {row.attended}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DailyCheckInView({ token, user }) {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await api("/activity/today", { token });
      setStatus(data.status);
      setSummary(data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (nextStatus) => {
    setSubmitting(true);
    try {
      await api("/activity", {
        token,
        method: "POST",
        body: { status: nextStatus }
      });
      setStatus(nextStatus);
      fetchData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-7">
      <section className="panel max-w-2xl">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">Today's Check-in</h2>
          <p className="mt-2 text-slate-400">
            Let the team know if you're active and available for shows today.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => updateStatus("active")}
            disabled={submitting}
            className={`group relative flex flex-col items-center rounded-2xl border-2 p-6 text-center transition-all ${
              status === "active"
                ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
            }`}
          >
            <div
              className={`mb-4 grid size-14 place-items-center rounded-xl transition-colors ${
                status === "active" ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-400"
              }`}
            >
              <CheckCircle size={32} weight={status === "active" ? "fill" : "regular"} />
            </div>
            <p className={`text-lg font-semibold ${status === "active" ? "text-white" : "text-slate-300"}`}>
              Active Today
            </p>
            <p className="mt-1 text-sm text-slate-500">I am available and working</p>
            {status === "active" && (
              <div className="absolute right-3 top-3 text-emerald-500">
                <Check size={20} weight="bold" />
              </div>
            )}
          </button>

          <button
            onClick={() => updateStatus("inactive")}
            disabled={submitting}
            className={`group relative flex flex-col items-center rounded-2xl border-2 p-6 text-center transition-all ${
              status === "inactive"
                ? "border-rose-500/50 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.1)]"
                : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
            }`}
          >
            <div
              className={`mb-4 grid size-14 place-items-center rounded-xl transition-colors ${
                status === "inactive" ? "bg-rose-500 text-white" : "bg-white/5 text-slate-400"
              }`}
            >
              <XCircle size={32} weight={status === "inactive" ? "fill" : "regular"} />
            </div>
            <p className={`text-lg font-semibold ${status === "inactive" ? "text-white" : "text-slate-300"}`}>
              Not Active
            </p>
            <p className="mt-1 text-sm text-slate-500">I am off or unavailable</p>
            {status === "inactive" && (
              <div className="absolute right-3 top-3 text-rose-500">
                <Check size={20} weight="bold" />
              </div>
            )}
          </button>
        </div>
      </section>

      {summary && (
        <section className="panel">
          <div className="mb-6">
            <h2 className="section-title">Team availability today</h2>
            <p className="section-copy">Who has checked in so far.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summary.length === 0 ? (
              <p className="col-span-full py-10 text-center text-sm text-slate-500">
                No one has checked in yet today.
              </p>
            ) : (
              summary.map((entry) => (
                <div key={entry.user.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className={`grid size-10 place-items-center rounded-lg ${
                    entry.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {entry.status === 'active' ? <CheckCircle size={24} weight="fill" /> : <XCircle size={24} weight="fill" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{entry.user.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{entry.user.role}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function MemberForm({ token, onSuccess, currentUser }) {
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "password123",
    role: "employee"
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/users", {
        token,
        method: "POST",
        body: form
      });
      setMessage(`${data.user.name} added as ${data.user.role}`);
      setForm({ name: "", username: "", password: "password123", role: "employee" });
      if (onSuccess) onSuccess();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <FormHeader icon={UserPlus} title="Add member" copy="Create singer, manager, or admin accounts." />
      <div className="mt-5 grid gap-4">
        <TextField
          label="Full name"
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
          placeholder="Ishaan Arora"
        />
        <TextField
          label="Username"
          type="text"
          value={form.username}
          onChange={(value) => setForm({ ...form, username: value })}
        />
        <TextField
          label="Temporary password"
          value={form.password}
          onChange={(value) => setForm({ ...form, password: value })}
          placeholder="password123"
        />
        <label>
          <span className="mb-2 block text-sm text-slate-300">Role</span>
          <select
            className="field"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          >
            <option value="employee">Employee singer</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
            {currentUser?.role === "admin" && (
              <option value="superior">Superior</option>
            )}
          </select>
        </label>
      </div>
      <FormFeedback error={error} message={message} />
      <button className="primary-button mt-5 inline-flex items-center gap-2" disabled={submitting}>
        <Plus size={18} />
        {submitting ? "Adding member" : "Add member"}
      </button>
    </form>
  );
}

function ShowForm({ token, managers, employees, onCreated }) {
  const [form, setForm] = useState({
    date: "2026-03-22",
    time: "19:30",
    location: "",
    manager_id: managers[0]?.id || "",
    employee_ids: employees.slice(0, 2).map((employee) => employee.id)
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      manager_id: current.manager_id || managers[0]?.id || "",
      employee_ids: current.employee_ids.length
        ? current.employee_ids
        : employees.slice(0, 2).map((employee) => employee.id)
    }));
  }, [employees, managers]);

  const toggleEmployee = (id) => {
    setForm((current) => ({
      ...current,
      employee_ids: current.employee_ids.includes(id)
        ? current.employee_ids.filter((employeeId) => employeeId !== id)
        : [...current.employee_ids, id]
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/shows", {
        token,
        method: "POST",
        body: {
          ...form,
          manager_id: Number(form.manager_id),
          employee_ids: form.employee_ids.map(Number)
        }
      });
      setMessage(`${data.show.location} scheduled as ${data.show.id}`);
      setForm((current) => ({ ...current, location: "" }));
      onCreated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <FormHeader icon={CalendarBlank} title="Add show" copy="Assign one manager and one or more singers." />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextField
          label="Date"
          type="date"
          value={form.date}
          onChange={(value) => setForm({ ...form, date: value })}
        />
        <TextField
          label="Time"
          type="time"
          value={form.time}
          onChange={(value) => setForm({ ...form, time: value })}
        />
        <div className="md:col-span-2">
          <TextField
            label="Location"
            value={form.location}
            onChange={(value) => setForm({ ...form, location: value })}
            placeholder="Bandra Social Rooftop"
          />
        </div>
        <label className="md:col-span-2">
          <span className="mb-2 block text-sm text-slate-300">Manager</span>
          <select
            className="field"
            value={form.manager_id}
            onChange={(event) => setForm({ ...form, manager_id: event.target.value })}
          >
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm text-slate-300">Assigned singers</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {employees.map((employee) => (
            <label className="check-row" key={employee.id}>
              <input
                type="checkbox"
                checked={form.employee_ids.includes(employee.id)}
                onChange={() => toggleEmployee(employee.id)}
              />
              <div className="flex items-center gap-3 truncate">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
                  {employee.name.charAt(0)}
                </div>
                <div className="truncate">
                  <span className="block truncate font-medium text-slate-200">{employee.name}</span>
                  <span className="block text-xs text-slate-500">{employee.username}</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <FormFeedback error={error} message={message} />
      <button className="primary-button mt-5 inline-flex items-center gap-2" disabled={submitting}>
        <Plus size={18} />
        {submitting ? "Creating show" : "Create show"}
      </button>
    </form>
  );
}

function AdminList({ title, copy, empty, children }) {
  return (
    <section className="panel">
      <div className="mb-4">
        <h2 className="section-title">{title}</h2>
        <p className="section-copy">{copy}</p>
      </div>
      <div className="divide-y divide-white/10">
        {React.Children.count(children) ? children : <p className="py-5 text-sm text-slate-400">{empty}</p>}
      </div>
    </section>
  );
}

function FormHeader({ icon, title, copy }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-300/20 bg-indigo-500/12 text-indigo-100">
        {React.createElement(icon, { size: 20 })}
      </div>
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="section-copy">{copy}</p>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <label>
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <input
        className="field"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FormFeedback({ error, message }) {
  if (error) {
    return (
      <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        {error}
      </p>
    );
  }

  if (message) {
    return (
      <p className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        {message}
      </p>
    );
  }

  return null;
}

function StatsGrid({ stats, role }) {
  const cards = [
    { label: role === "manager" ? "Shows managed" : "Total shows", value: stats.totalShows ?? 0 },
    { label: "Approved shows", value: stats.approvedShows ?? 0 },
    { label: "Pending shows", value: stats.pendingShows ?? 0 },
    { label: role === "employee" ? "Rejected shows" : "Approvals done", value: role === "employee" ? stats.rejectedShows ?? 0 : stats.approvalsDone ?? 0 }
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => (
        <div className="stat-card" style={{ animationDelay: `${index * 70}ms` }} key={card.label}>
          <p className="font-mono text-3xl text-white">{card.value}</p>
          <p className="mt-2 text-sm text-slate-400">{card.label}</p>
        </div>
      ))}
    </section>
  );
}

function EmployeeShows({ shows, token, onChanged }) {
  const [selectedShow, setSelectedShow] = useState(null);
  const grouped = useMemo(() => groupByDate(shows), [shows]);

  return (
    <>
      <section className="space-y-6">
        {Object.keys(grouped).length === 0 ? (
          <EmptyState title="No assigned shows" copy="Your show schedule will appear here when a manager assigns you." />
        ) : (
          Object.entries(grouped).map(([date, dateShows]) => (
            <div key={date}>
              <h2 className="section-title">{formatDate(date)}</h2>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {dateShows.map((show) => (
                  <ShowCard key={show.id} show={show} onClick={() => setSelectedShow(show)} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
      {selectedShow && (
        <ConfirmAttendanceModal
          show={selectedShow}
          token={token}
          onClose={() => setSelectedShow(null)}
          onDone={() => {
            setSelectedShow(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function ManagerShows({ shows, token, role, onChanged, expanded = false }) {
  const [activeShowId, setActiveShowId] = useState(expanded ? shows[0]?.id : null);
  const activeShow = shows.find((show) => show.id === activeShowId);

  return (
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        <h2 className="section-title">{(role === "admin" || role === "superior") ? "All shows" : "Assigned shows"}</h2>
        {shows.map((show) => (
          <ShowCard
            key={show.id}
            show={show}
            compact
            active={activeShowId === show.id}
            onClick={() => setActiveShowId(show.id)}
          />
        ))}
      </div>
      <ApprovalPanel show={activeShow} token={token} onChanged={onChanged} />
    </section>
  );
}

function ShowCard({ show, compact = false, active = false, onClick }) {
  const markedCount = show.attendance.length;
  const pendingCount = show.attendance.filter((entry) => entry.approval_status === "pending").length;

  return (
    <button className={`show-card ${active ? "show-card-active" : ""}`} onClick={onClick}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-left text-lg font-semibold text-white">{show.location}</p>
          <p className="mt-1 text-left text-sm text-slate-400">{show.id}</p>
        </div>
        <StatusBadge status={pendingCount ? "pending" : markedCount ? "marked" : "open"} />
      </div>
      <div className={`mt-5 grid gap-3 text-sm text-slate-300 ${compact ? "grid-cols-1" : "sm:grid-cols-3"}`}>
        <Meta icon={Clock} label={formatTime(show.time)} />
        <Meta icon={MapPin} label={show.location} />
        <Meta icon={Users} label={`${show.employees.length} singers`} />
      </div>
    </button>
  );
}

function Meta({ icon, label }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {React.createElement(icon, { className: "shrink-0 text-indigo-300", size: 17 })}
      <span className="truncate">{label}</span>
    </span>
  );
}

function ApprovalPanel({ show, token, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const rows = useMemo(() => {
    if (!show) return [];
    return show.employees.map((employee) => ({
      employee,
      attendance: show.attendance.find((entry) => entry.user_id === employee.id)
    }));
  }, [show]);

  const review = async (entry, approval_status) => {
    setBusyId(entry.id);
    try {
      await api(`/attendance/${entry.id}/review`, {
        token,
        method: "PATCH",
        body: { approval_status }
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  if (!show) {
    return <EmptyState title="Select a show" copy="Open a show to review marked attendance." />;
  }

  return (
    <section className="panel">
      <div className="mb-5">
        <h2 className="section-title">{show.location}</h2>
        <p className="section-copy">
          {formatDate(show.date)} at {formatTime(show.time)}
        </p>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div className="approval-card" key={row.employee.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{row.employee.name}</p>
                <p className="mt-1 text-sm text-slate-400">{row.employee.username}</p>
              </div>
              <StatusBadge status={row.attendance?.approval_status || "waiting"} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <p className="mobile-label">Attendance</p>
                <StatusBadge status={row.attendance ? "marked" : "not marked"} />
              </div>
              <div>
                <p className="mobile-label">Approval</p>
                <StatusBadge status={row.attendance?.approval_status || "waiting"} />
              </div>
            </div>
            {row.attendance?.approval_status === "pending" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  className="decision-button-mobile border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  disabled={busyId === row.attendance.id}
                  onClick={() => review(row.attendance, "approved")}
                >
                  <Check size={19} />
                  Approve
                </button>
                <button
                  className="decision-button-mobile border-rose-400/30 bg-rose-500/10 text-rose-200"
                  disabled={busyId === row.attendance.id}
                  onClick={() => review(row.attendance, "rejected")}
                >
                  <X size={19} />
                  Reject
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No action needed</p>
            )}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[620px] text-left">
          <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-3 pr-4 font-medium">Name</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Approval</th>
              <th className="py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.employee.id}>
                <td className="py-4 pr-4 text-white">{row.employee.name}</td>
                <td className="py-4 pr-4">
                  <StatusBadge status={row.attendance ? "marked" : "not marked"} />
                </td>
                <td className="py-4 pr-4">
                  <StatusBadge status={row.attendance?.approval_status || "waiting"} />
                </td>
                <td className="py-4">
                  {row.attendance?.approval_status === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        className="decision-button border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                        disabled={busyId === row.attendance.id}
                        onClick={() => review(row.attendance, "approved")}
                        title="Approve"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        className="decision-button border-rose-400/30 bg-rose-500/10 text-rose-200"
                        disabled={busyId === row.attendance.id}
                        onClick={() => review(row.attendance, "rejected")}
                        title="Reject"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500">No action</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConfirmAttendanceModal({ show, token, onClose, onDone }) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api("/attendance", {
        token,
        method: "POST",
        body: { show_id: show.id }
      });
      onDone();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.25rem] border border-white/10 bg-[#111827] p-6 shadow-lift">
        <h2 className="text-xl font-semibold text-white">Confirm attendance</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Confirm you attended {show.location} on {formatDate(show.date)} at {formatTime(show.time)}.
        </p>
        {error && <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={submitting} onClick={confirm}>
            {submitting ? "Marking" : "Yes, mark attendance"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportButton({ token }) {
  const download = async () => {
    const response = await fetch(`${API_URL}/export/attendance.xlsx`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sunggeet-attendance.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button className="primary-button inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={download}>
      <DownloadSimple size={18} />
      Export Excel
    </button>
  );
}

function StatusBadge({ status }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized.includes("approved") || normalized.includes("marked")
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
      : normalized.includes("rejected") || normalized.includes("not")
        ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
        : "border-amber-400/25 bg-amber-500/10 text-amber-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function EmptyState({ title, copy }) {
  return (
    <div className="panel grid min-h-56 place-items-center text-center">
      <div>
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="mt-2 max-w-sm text-sm text-slate-400">{copy}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div className="h-28 rounded-xl border border-white/10 bg-white/[0.04] shimmer" key={item} />
        ))}
      </div>
      <div className="h-96 rounded-xl border border-white/10 bg-white/[0.04] shimmer" />
    </div>
  );
}

function useWorkspaceData(token) {
  const [state, setState] = useState({ shows: [], profile: null, loading: true });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [showsData, profileData] = await Promise.all([
      api("/shows", { token }),
      api("/profile", { token })
    ]);
    setState({ shows: showsData.shows, profile: profileData, loading: false });
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

function useAdminData(token) {
  const [state, setState] = useState({ users: [], shows: [], loading: true });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [usersData, showsData] = await Promise.all([
      api("/users", { token }),
      api("/shows", { token })
    ]);
    setState({ users: usersData.users, shows: showsData.shows, loading: false });
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  return response.json();
}

function groupByDate(shows) {
  return shows.reduce((groups, show) => {
    groups[show.date] = groups[show.date] || [];
    groups[show.date].push(show);
    return groups;
  }, {});
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function formatTime(time) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(`2026-03-19T${time}:00`));
}

createRoot(document.getElementById("root")).render(<App />);
