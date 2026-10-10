import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  ArrowsLeftRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChartBar,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  DotsThreeOutline,
  DownloadSimple,
  Eye,
  EyeSlash,
  Globe,
  House,
  Image,
  MagnifyingGlass,
  MapPin,
  MusicNotes,
  PencilSimple,
  Plus,
  SignOut,
  Trash,
  Tray,
  UserPlus,
  UsersThree,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import "@fontsource-variable/geist";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? `http://${window.location.hostname}:4000/api` : "/api");

const ROLE_LABEL = { employee: "Singer", manager: "Manager", admin: "Admin", superior: "Superior" };
const isAdmin = (user) => user?.role === "admin" || user?.role === "superior";
const isStaff = (user) => user?.role !== "employee";

/* ==========================================================================
   DATA
   ========================================================================== */

const DataContext = createContext();

function DataProvider({ children, token, user, onUnauthorized }) {
  // Paint the last snapshot straight away, then refresh it in the background.
  const [state, setState] = useState(() => {
    const cached = readCache(user, "workspace");
    return {
      shows: cached?.shows || [],
      profile: cached?.profile || null,
      users: cached?.users || [],
      venues: cached?.venues || [],
      activity: cached?.activity || { status: null, summary: null },
      loading: !cached,
      initialLoadDone: !!cached,
      error: ""
    };
  });
  const lastFetch = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const removeUser = useCallback((id) => {
    setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
  }, []);

  const removeShow = useCallback((id) => {
    setState((s) => ({ ...s, shows: s.shows.filter((sh) => sh.id !== id) }));
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      // The first request after a quiet spell wakes the server and the
      // database, which can take a while; give it room and one retry.
      const load = (path) => withRetry(() => api(path, { token, timeout: 20000 }));
      const admin = isAdmin(user);
      const [shows, profile, activity, users, venues] = await Promise.all([
        load("/shows"),
        load("/profile"),
        load("/activity/today"),
        // Admin-only extras: if one fails, keep what we had instead of failing the whole app.
        admin ? load("/users").catch(() => null) : null,
        admin ? load("/venues").catch(() => null) : null
      ]);
      lastFetch.current = Date.now();

      const data = {
        shows: shows.shows,
        profile,
        activity: { status: activity.status, summary: activity.summary },
        users: users?.users ?? stateRef.current.users,
        venues: venues?.venues ?? stateRef.current.venues
      };
      writeCache(user, "workspace", data);
      setState({ ...data, loading: false, initialLoadDone: true, error: "" });
    } catch (err) {
      if (err.status === 401) return onUnauthorized();
      console.error("Data refresh error:", err);
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load data" }));
    }
  }, [token, user, onUnauthorized]);

  useEffect(() => {
    if (token && user) refresh(true);
  }, [token, user, refresh]);

  // Coming back to the app after a while: quietly pull fresh data.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > 30000) refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Once the workspace is up, warm the Website tab in the background so it
  // opens instantly (and its database wakes up before anyone needs it).
  useEffect(() => {
    if (!state.initialLoadDone || !isAdmin(user)) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(() => {
      api("/website/data", { token, timeout: 25000 }).then((d) => writeCache(user, "website", d)).catch(() => {});
      api("/website/floaters", { token, timeout: 25000 }).then((d) => writeCache(user, "floaters", d.floaters || [])).catch(() => {});
      api("/reports/teams", { token, timeout: 25000 }).then((d) => writeCache(user, "reportTeams", d)).catch(() => {});
    });
  }, [state.initialLoadDone, token, user]);

  const value = useMemo(() => ({ ...state, refresh, removeUser, removeShow, token, user }), [state, refresh, removeUser, removeShow, token, user]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
}

/* ==========================================================================
   UI: toasts + confirm dialog (replaces alert() / window.confirm())
   ========================================================================== */

const UIContext = createContext(null);
const useUI = () => useContext(UIContext);

function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [ask, setAsk] = useState(null);

  const toast = useCallback((message, tone = "default") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => setAsk({ ...options, resolve })), []);

  const answer = (value) => {
    ask.resolve(value);
    setAsk(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UIContext.Provider value={value}>
      {children}
      {createPortal(
        <>
          <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.tone === "error" ? "toast-error" : ""}`}>
                {t.tone === "error" ? <WarningCircle size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" className="text-[#7fd6a2]" />}
                {t.message}
              </div>
            ))}
          </div>
          {ask && (
            <>
              <div className="scrim dialog-scrim" onClick={() => answer(false)} />
              <div className="dialog" role="alertdialog" aria-modal="true" aria-label={ask.title}>
                <h2 className="sheet-title">{ask.title}</h2>
                {ask.body && <p className="mt-1.5 muted">{ask.body}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button className="btn btn-secondary" onClick={() => answer(false)}>Cancel</button>
                  <button
                    className={`btn ${ask.danger ? "btn-danger-solid" : "btn-primary"}`}
                    onClick={() => answer(true)}
                    autoFocus
                  >
                    {ask.confirmLabel || "Confirm"}
                  </button>
                </div>
              </div>
            </>
          )}
        </>,
        document.body
      )}
    </UIContext.Provider>
  );
}

/* ==========================================================================
   APP
   ========================================================================== */

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("sunggeet-token") || "");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("sunggeet-user");
    return saved ? JSON.parse(saved) : null;
  });

  const logout = useCallback(() => {
    clearCache();
    localStorage.removeItem("sunggeet-token");
    localStorage.removeItem("sunggeet-user");
    setToken("");
    setUser(null);
  }, []);

  if (!token || !user) {
    return (
      <LoginScreen
        onLogin={({ nextToken, nextUser }) => {
          localStorage.setItem("sunggeet-token", nextToken);
          localStorage.setItem("sunggeet-user", JSON.stringify(nextUser));
          setToken(nextToken);
          setUser(nextUser);
        }}
      />
    );
  }

  return (
    <DataProvider token={token} user={user} onUnauthorized={logout}>
      <AuthenticatedApp user={user} onLogout={logout} />
    </DataProvider>
  );
}

function AuthenticatedApp({ user, onLogout }) {
  const [route, setRoute] = useState({ view: "home", filter: null });
  const { shows } = useData();

  const navigate = useCallback((view, filter = null) => {
    setRoute({ view, filter });
    window.scrollTo({ top: 0 });
  }, []);

  // The number on the Shows tab: what needs doing next.
  const showsBadge = useMemo(() => {
    if (isStaff(user)) return pendingEntries(shows).length;
    return shows.filter((s) => readyToMark(s)).length;
  }, [shows, user]);

  const { view, filter } = route;

  return (
    <Shell user={user} view={view} navigate={navigate} onLogout={onLogout} badges={{ shows: showsBadge }}>
      {view === "home" && <HomePage user={user} navigate={navigate} />}
      {view === "shows" && <ShowsPage key={filter || "all"} user={user} initialFilter={filter} />}
      {view === "checkin" && <CheckInPage user={user} />}
      {view === "activity" && <ActivityPage user={user} />}
      {view === "team" && isAdmin(user) && <TeamPage user={user} />}
      {view === "reports" && isAdmin(user) && <ReportsPage />}
      {view === "website" && isAdmin(user) && <WebsitePage />}
    </Shell>
  );
}

/* ==========================================================================
   LOGIN
   ========================================================================== */

function LoginScreen({ onLogin }) {
  // Wake the server and database while the person types their password.
  useEffect(() => {
    api("/health", { timeout: 20000 }).catch(() => {});
  }, []);
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reveal, setReveal] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await api("/auth/login", { method: "POST", body: form });
      onLogin({ nextToken: data.token, nextUser: data.user });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const devLogin = async (role) => {
    setError("");
    try {
      const data = await api("/auth/dev-login", { method: "POST", body: { role } });
      onLogin({ nextToken: data.token, nextUser: data.user });
    } catch (err) {
      setError(err.message === "Request failed" ? "Add DEV_LOGIN=1 to .env and restart the server" : err.message);
    }
  };

  return (
    <main className="login">
      <div className="login-card">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="brand-mark !h-11 !w-11 !rounded-xl"><Logo size={22} /></span>
          <h1 className="mt-4 text-[1.375rem] font-semibold tracking-tight">Sign in to SUNGGEET</h1>
          <p className="mt-1 muted">Shows and attendance for the team.</p>
        </div>

        <form onSubmit={submit} className="card card-pad space-y-4">
          <Field label="Username">
            <input
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="name@sunggeet.com" inputMode="email"
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                className="input pr-11"
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                className="icon-btn icon-btn-sm absolute right-1.5 top-1/2 -translate-y-1/2 muted"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "Hide password" : "Show password"}
              >
                {reveal ? <EyeSlash size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </Field>

          {error && <p className="alert tone-bad">{error}</p>}

          <button className="btn btn-primary btn-block !min-h-11" disabled={submitting || !form.username || !form.password}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line-strong)] p-3">
            <p className="text-xs muted">Dev only · quick sign-in (uses the live database)</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[["admin", "Admin"], ["manager", "Manager"], ["employee", "Singer"]].map(([role, label]) => (
                <button key={role} type="button" className="btn btn-secondary btn-sm" onClick={() => devLogin(role)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs subtle">Forgot your password? Ask an admin to reset it.</p>
      </div>
    </main>
  );
}

/* ==========================================================================
   SHELL: sidebar on desktop, top bar + bottom tabs on phones
   ========================================================================== */

function navFor(user) {
  const items = [
    { id: "home", label: "Home", icon: House },
    { id: "shows", label: "Shows", icon: CalendarBlank }
  ];
  if (isAdmin(user)) {
    items.push(
      { id: "team", label: "Team", icon: UsersThree },
      { id: "website", label: "Website", icon: Globe },
      { id: "reports", label: "Reports", icon: ChartBar },
      { id: "checkin", label: "Check-in", icon: CalendarCheck },
      { id: "activity", label: "Activity", icon: ClockCounterClockwise }
    );
  } else {
    items.push(
      { id: "checkin", label: "Check-in", icon: CalendarCheck },
      { id: "activity", label: user.role === "employee" ? "History" : "Activity", icon: ClockCounterClockwise }
    );
  }
  return items;
}

function Shell({ user, view, navigate, onLogout, badges, children }) {
  const items = navFor(user);
  const [sheet, setSheet] = useState(null); // "more" | "account"
  const scrolled = useScrolled();
  const primary = items.length > 5 ? items.slice(0, 4) : items;
  const overflow = items.length > 5 ? items.slice(4) : [];
  const current = items.find((item) => item.id === view);

  const go = (id) => {
    setSheet(null);
    navigate(id);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Logo /></span>
          <span className="brand-name">SUNGGEET</span>
        </div>
        <nav className="nav" aria-label="Main">
          {items.map((item) => (
            <button
              key={item.id}
              className="nav-item"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={18} weight={view === item.id ? "fill" : "regular"} />
              {item.label}
              {badges[item.id] > 0 && <span className="nav-badge">{badges[item.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="account">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="row-title text-[13px]">{user.name}</p>
            <p className="text-xs muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <button className="icon-btn icon-btn-sm" onClick={onLogout} title="Log out" aria-label="Log out">
            <SignOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className={`topbar ${scrolled ? "topbar-scrolled" : ""}`}>
          <span className="brand-mark"><Logo /></span>
          <span
            className="min-w-0 flex-1 truncate text-[15px] font-semibold transition-opacity duration-150"
            style={{ opacity: scrolled ? 1 : 0 }}
          >
            {current?.label}
          </span>
          <button className="icon-btn" onClick={() => setSheet("account")} aria-label="Account">
            <Avatar name={user.name} size="sm" />
          </button>
        </header>
        <div className="content">{children}</div>
      </main>

      <nav className="tabbar" aria-label="Main">
        {primary.map((item) => (
          <button
            key={item.id}
            className="tab"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            <item.icon size={22} weight={view === item.id ? "fill" : "regular"} />
            {item.label}
            {badges[item.id] > 0 && <span className="tab-dot">{badges[item.id]}</span>}
          </button>
        ))}
        {overflow.length > 0 && (
          <button
            className="tab"
            aria-current={overflow.some((item) => item.id === view) ? "page" : undefined}
            onClick={() => setSheet("more")}
          >
            <DotsThreeOutline size={22} weight={overflow.some((item) => item.id === view) ? "fill" : "regular"} />
            More
          </button>
        )}
      </nav>

      {sheet === "more" && (
        <Sheet title="More" onClose={() => setSheet(null)} flush>
          {overflow.map((item) => (
            <button key={item.id} className="row" onClick={() => go(item.id)}>
              <span className="thumb !border-0"><item.icon size={19} /></span>
              <span className="row-main row-title">{item.label}</span>
              <CaretRight size={16} className="subtle" />
            </button>
          ))}
          <button className="row text-bad" onClick={onLogout}>
            <span className="thumb !border-0 !text-bad"><SignOut size={19} /></span>
            <span className="row-main row-title">Log out</span>
          </button>
        </Sheet>
      )}

      {sheet === "account" && (
        <Sheet
          title="Account"
          onClose={() => setSheet(null)}
          footer={
            <button className="btn btn-danger" onClick={onLogout}>
              <SignOut size={17} /> Log out
            </button>
          }
        >
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">{user.name}</p>
              <p className="muted">{user.username}</p>
              <Pill tone="neutral" plain className="mt-2">{ROLE_LABEL[user.role]}</Pill>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ==========================================================================
   HOME
   ========================================================================== */

function HomePage({ user, navigate }) {
  const { initialLoadDone, error } = useData();
  if (!initialLoadDone) return error ? <LoadError /> : <PageSkeleton />;

  return (
    <>
      <PageHead
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        sub={fmtDate(todayIST(), { weekday: "long", day: "numeric", month: "long" })}
      />
      <div className="space-y-4 lg:space-y-6">
        {isStaff(user) ? <StaffHome user={user} navigate={navigate} /> : <SingerHome user={user} navigate={navigate} />}
      </div>
    </>
  );
}

function StaffHome({ user, navigate }) {
  const { shows, activity } = useData();
  const [openId, setOpenId] = useState(null);
  const month = todayIST().slice(0, 7);
  const monthShows = shows.filter((s) => s.date.startsWith(month));
  const pending = pendingEntries(shows);
  const upcoming = shows.filter((s) => !hasStarted(s)).slice(0, 5);
  const approvedThisMonth = monthShows.reduce((n, s) => n + s.attendance.filter((a) => a.approval_status === "approved").length, 0);
  const availableToday = (activity.summary || []).filter((a) => a.status === "active").length;
  const openShow = shows.find((s) => s.id === openId);

  return (
    <>
      <div className="kpis">
        <Kpi label="Shows this month" value={monthShows.length} foot={monthLabel(month)} />
        <Kpi label="To review" value={pending.length} foot={pending.length ? "Waiting on you" : "All caught up"} />
        <Kpi label="Approved this month" value={approvedThisMonth} foot="Attendance entries" />
        <Kpi label="Available today" value={availableToday} foot="From check-ins" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title flex items-center gap-2">
              Needs review
              {pending.length > 0 && <span className="pill pill-plain tone-brand">{pending.length}</span>}
            </h2>
            {pending.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("shows", "review")}>
                View all <ArrowRight size={14} />
              </button>
            )}
          </div>
          {pending.length === 0 ? (
            <Empty icon={Tray} title="You're all caught up" copy="New attendance shows up here as singers mark it." />
          ) : (
            pending.slice(0, 6).map(({ show, entry }) => (
              <ReviewRow key={entry.id} show={show} entry={entry} onOpen={() => setOpenId(show.id)} />
            ))
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Coming up</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("shows", "upcoming")}>
              All shows <ArrowRight size={14} />
            </button>
          </div>
          {upcoming.length === 0 ? (
            <Empty icon={CalendarBlank} title="Nothing scheduled" copy="Upcoming shows will be listed here." />
          ) : (
            upcoming.map((show) => <AgendaRow key={show.id} show={show} onClick={() => setOpenId(show.id)} />)
          )}
        </section>
      </div>

      <CheckInCard />

      {openShow && <ShowSheet show={openShow} user={user} onClose={() => setOpenId(null)} />}
    </>
  );
}

function SingerHome({ user, navigate }) {
  const { shows } = useData();
  const [openId, setOpenId] = useState(null);
  const month = todayIST().slice(0, 7);
  const monthShows = shows.filter((s) => s.date.startsWith(month));
  const ready = shows.filter((s) => readyToMark(s));
  const upcoming = shows.filter((s) => !hasStarted(s)).slice(0, 5);
  const awaiting = shows.filter((s) => s.attendance[0]?.approval_status === "pending").length;
  const approved = monthShows.filter((s) => s.attendance[0]?.approval_status === "approved");
  const openShow = shows.find((s) => s.id === openId);

  return (
    <>
      {ready.length > 0 && (
        <section className="card overflow-hidden !border-[#ecd2b7]">
          <div className="card-head !border-[#f1dfcc] bg-brand-soft">
            <h2 className="card-title flex items-center gap-2 text-[var(--brand-ink)]">
              <MusicNotes size={18} weight="fill" /> Ready to mark
            </h2>
            <span className="text-xs font-medium text-[var(--brand-ink)]">{ready.length} show{ready.length > 1 ? "s" : ""}</span>
          </div>
          {ready.map((show) => (
            <div key={show.id} className="row">
              <DateTile date={show.date} />
              <div className="row-main">
                <p className="row-title">{show.location}</p>
                <p className="row-sub">{dayLabel(show.date)} · {formatTime(show.time)}</p>
              </div>
              <button className="btn btn-brand btn-sm" onClick={() => setOpenId(show.id)}>Mark</button>
            </div>
          ))}
        </section>
      )}

      <div className="kpis">
        <Kpi label="Shows this month" value={monthShows.length} foot={monthLabel(month)} />
        <Kpi label="Approved this month" value={approved.length} foot="Confirmed by manager" />
        <Kpi label="Awaiting approval" value={awaiting} foot="Manager to confirm" />
        <Kpi label="Upcoming" value={upcoming.length} foot="Shows ahead" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Coming up</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("shows")}>
              All shows <ArrowRight size={14} />
            </button>
          </div>
          {upcoming.length === 0 ? (
            <Empty icon={CalendarBlank} title="No upcoming shows" copy="Shows you're assigned to will appear here." />
          ) : (
            upcoming.map((show) => <AgendaRow key={show.id} show={show} onClick={() => setOpenId(show.id)} />)
          )}
        </section>
        <CheckInCard />
      </div>

      {openShow && <ShowSheet show={openShow} user={user} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* One pending attendance entry with inline approve / reject. */
function ReviewRow({ show, entry, onOpen }) {
  const review = useReview();
  const [busy, setBusy] = useState(false);
  const name = entry.employee?.name || "Singer";

  const decide = async (status) => {
    setBusy(true);
    await review(entry, status, name);
    setBusy(false);
  };

  return (
    <div className="row">
      <Avatar name={name} />
      <button className="row-main text-left" onClick={onOpen}>
        <p className="row-title">{name}</p>
        <p className="row-sub">{show.location} · {dayLabel(show.date)}, {formatTime(show.time)}</p>
      </button>
      <div className="flex gap-1.5">
        <button className="decide decide-bad" disabled={busy} onClick={() => decide("rejected")} aria-label={`Reject ${name}`} title="Reject">
          <X size={18} weight="bold" />
        </button>
        <button className="decide decide-ok" disabled={busy} onClick={() => decide("approved")} aria-label={`Approve ${name}`} title="Approve">
          <Check size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function AgendaRow({ show, onClick }) {
  return (
    <button className="row" onClick={onClick}>
      <DateTile date={show.date} />
      <div className="row-main">
        <p className="row-title">{show.location}</p>
        <p className="row-sub">
          {dayLabel(show.date)} · {formatTime(show.time)} · {plural(show.employees.length, "singer")}
        </p>
      </div>
      <CaretRight size={16} className="subtle" />
    </button>
  );
}

/* ==========================================================================
   CHECK-IN
   ========================================================================== */

function CheckInCard() {
  const { activity } = useData();
  const setStatus = useCheckIn();
  const [busy, setBusy] = useState(false);
  const status = activity.status;

  const choose = async (next) => {
    setBusy(true);
    await setStatus(next);
    setBusy(false);
  };

  return (
    <section className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="card-title">Are you available today?</h2>
          <p className="mt-0.5 text-[13px] muted">
            {status === "active" ? "You're marked available." : status === "inactive" ? "You're marked off today." : "Let the team know before shows are planned."}
          </p>
        </div>
        <div className="seg" role="group" aria-label="Today's availability">
          <button aria-pressed={status === "active"} disabled={busy} onClick={() => choose("active")}>Available</button>
          <button aria-pressed={status === "inactive"} disabled={busy} onClick={() => choose("inactive")}>Off today</button>
        </div>
      </div>
    </section>
  );
}

function CheckInPage({ user }) {
  const { activity, users, initialLoadDone, error } = useData();
  const setStatus = useCheckIn();
  const [busy, setBusy] = useState(false);

  if (!initialLoadDone) return error ? <LoadError /> : <PageSkeleton />;

  const { status, summary } = activity;
  const choose = async (next) => {
    setBusy(true);
    await setStatus(next);
    setBusy(false);
  };

  const available = (summary || []).filter((a) => a.status === "active");
  const off = (summary || []).filter((a) => a.status === "inactive");
  const checkedIn = new Set((summary || []).map((a) => a.user.id));
  const missing = users.filter((u) => !checkedIn.has(u.id));

  return (
    <>
      <PageHead title="Check-in" sub={fmtDate(todayIST(), { weekday: "long", day: "numeric", month: "long" })} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.2fr] lg:gap-6">
        <section className="card card-pad">
          <h2 className="card-title">Your status today</h2>
          <p className="mt-0.5 text-[13px] muted">Managers use this when planning shows. You can change it any time today.</p>
          <div className="mt-4 grid gap-2.5">
            <button className="choice choice-ok" aria-pressed={status === "active"} disabled={busy} onClick={() => choose("active")}>
              <span className="choice-dot">{status === "active" && <Check size={12} weight="bold" />}</span>
              <span>
                <span className="block font-semibold">Available</span>
                <span className="block text-[13px] muted">I'm free to perform today</span>
              </span>
            </button>
            <button className="choice choice-bad" aria-pressed={status === "inactive"} disabled={busy} onClick={() => choose("inactive")}>
              <span className="choice-dot">{status === "inactive" && <Check size={12} weight="bold" />}</span>
              <span>
                <span className="block font-semibold">Off today</span>
                <span className="block text-[13px] muted">I'm not available</span>
              </span>
            </button>
          </div>
        </section>

        {summary && (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Team today</h2>
              <span className="text-[13px] muted">{available.length} available</span>
            </div>
            {summary.length === 0 && missing.length === 0 ? (
              <Empty icon={UsersThree} title="No check-ins yet" copy="People appear here as they check in." />
            ) : (
              <>
                <PeopleGroup title="Available" people={available.map((a) => a.user)} tone="ok" label="Available" />
                <PeopleGroup title="Off today" people={off.map((a) => a.user)} tone="bad" label="Off" />
                {isAdmin(user) && <PeopleGroup title="Not checked in" people={missing} tone="neutral" label="No reply" />}
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function PeopleGroup({ title, people, tone, label }) {
  if (!people.length) return null;
  return (
    <>
      <div className="group-head">
        <span>{title}</span>
        <span className="font-medium subtle">{people.length}</span>
      </div>
      {people.map((person) => (
        <div key={person.id} className="row !min-h-[3.25rem]">
          <Avatar name={person.name} size="sm" />
          <div className="row-main">
            <p className="row-title">{person.name}</p>
          </div>
          <span className="text-xs muted">{ROLE_LABEL[person.role]}</span>
          <Pill tone={tone}>{label}</Pill>
        </div>
      ))}
    </>
  );
}

function useCheckIn() {
  const { token, refresh } = useData();
  const { toast } = useUI();
  return useCallback(async (status) => {
    try {
      await api("/activity", { token, method: "POST", body: { status } });
      await refresh(true);
      toast(status === "active" ? "Marked available for today" : "Marked off for today");
    } catch (err) {
      toast(err.message, "error");
    }
  }, [token, refresh, toast]);
}

/* ==========================================================================
   SHOWS
   ========================================================================== */

function ShowsPage({ user, initialFilter }) {
  const { shows, users, initialLoadDone, error } = useData();
  const staff = isStaff(user);
  const admin = isAdmin(user);
  const [month, setMonth] = useState(() => defaultMonth(shows));
  const [filter, setFilter] = useState(initialFilter || "all");
  const [openId, setOpenId] = useState(null);
  const [sheet, setSheet] = useState(null); // "new" | "copy"

  const months = useMemo(() => {
    const set = new Set(shows.map((s) => s.date.slice(0, 7)));
    set.add(todayIST().slice(0, 7));
    return [...set].sort();
  }, [shows]);

  if (!initialLoadDone) return error ? <LoadError /> : <PageSkeleton />;

  const activeMonth = months.includes(month) ? month : months.at(-1);
  const monthShows = shows.filter((s) => s.date.startsWith(activeMonth));

  // "To review" / "To mark" look across every month: old work shouldn't hide.
  const filters = staff
    ? [
        { id: "all", label: "All", list: monthShows },
        { id: "review", label: "To review", list: shows.filter((s) => s.attendance.some((a) => a.approval_status === "pending")), global: true },
        { id: "upcoming", label: "Upcoming", list: monthShows.filter((s) => !hasStarted(s)) }
      ]
    : [
        { id: "all", label: "All", list: monthShows },
        { id: "mark", label: "To mark", list: shows.filter((s) => readyToMark(s)), global: true },
        { id: "upcoming", label: "Upcoming", list: monthShows.filter((s) => !hasStarted(s)) }
      ];
  const current = filters.find((f) => f.id === filter) || filters[0];
  const groups = groupByDate(current.list);
  const openShow = shows.find((s) => s.id === openId);
  const managers = users.filter((u) => u.role === "manager");
  const singers = users.filter((u) => u.role === "employee");

  return (
    <>
      <PageHead
        title="Shows"
        sub={staff ? "Schedule, line-ups and attendance approvals." : "Your schedule and attendance."}
        actions={admin && (
          <>
            <button className="btn btn-secondary" onClick={() => setSheet("venues")}>
              <MapPin size={16} /> Venues
            </button>
            {monthShows.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setSheet("copy")} title="Copy this month's shows to another month">
                <Copy size={16} /> Copy month
              </button>
            )}
            <button className="btn btn-primary desktop-only" onClick={() => setSheet("new")}>
              <Plus size={16} weight="bold" /> New show
            </button>
          </>
        )}
      />

      <div className="mb-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="chips">
          {filters.map((f) => (
            <button key={f.id} className={`chip ${current.id === f.id ? "chip-on" : ""}`} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id !== "all" && <span className="chip-count">{f.list.length}</span>}
            </button>
          ))}
        </div>
        {!current.global && (
          <MonthStepper months={months} value={activeMonth} onChange={setMonth} />
        )}
      </div>

      <section className="card overflow-hidden">
        {current.list.length === 0 ? (
          <Empty
            icon={current.id === "all" ? CalendarBlank : CheckCircle}
            title={current.id === "all" ? `No shows in ${monthLabel(activeMonth)}` : current.id === "upcoming" ? "No upcoming shows" : "Nothing left to do"}
            copy={current.id === "all" ? (admin ? "Add a show or pick another month." : "Pick another month to see more.") : "You're all caught up."}
            action={admin && current.id === "all" && (
              <button className="btn btn-secondary btn-sm mt-3" onClick={() => setSheet("new")}><Plus size={14} /> New show</button>
            )}
          />
        ) : (
          Object.entries(groups).map(([date, dayShows]) => (
            <React.Fragment key={date}>
              <div className="group-head">
                <span>{dayLabel(date)}{current.global ? ` · ${fmtDate(date, { year: "numeric" })}` : ""}</span>
                <span className="font-medium subtle">{plural(dayShows.length, "show")}</span>
              </div>
              {dayShows.map((show) => (
                <ShowRow key={show.id} show={show} user={user} onClick={() => setOpenId(show.id)} />
              ))}
            </React.Fragment>
          ))
        )}
      </section>

      {admin && (
        <button className="fab" onClick={() => setSheet("new")} aria-label="New show">
          <Plus size={24} weight="bold" />
        </button>
      )}

      {openShow && <ShowSheet show={openShow} user={user} onClose={() => setOpenId(null)} />}
      {sheet === "new" && (
        <ShowEditor
          managers={managers}
          singers={singers}
          onClose={() => setSheet(null)}
          onSaved={(saved) => {
            setSheet(null);
            if (saved?.date) setMonth(saved.date.slice(0, 7));
          }}
        />
      )}
      {sheet === "venues" && <VenuesSheet onClose={() => setSheet(null)} />}
      {sheet === "copy" && (
        <CopyMonthSheet
          shows={monthShows}
          sourceMonth={activeMonth}
          onClose={() => setSheet(null)}
          onDone={(target) => {
            setSheet(null);
            setMonth(target);
          }}
        />
      )}
    </>
  );
}

function ShowRow({ show, user, onClick }) {
  const state = isStaff(user) ? staffState(show) : singerState(show);
  return (
    <button className="row" onClick={onClick}>
      <span className="time-col">{formatTime(show.time)}</span>
      <div className="row-main">
        <p className="row-title">{show.location}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <Pill tone={state.tone}>{state.label}</Pill>
          <span className="row-sub !mt-0">
            {isStaff(user)
              ? `${show.manager?.name || "No manager"} · ${plural(show.employees.length, "singer")}`
              : show.manager?.name || "No manager"}
          </span>
        </div>
      </div>
      <CaretRight size={16} className="subtle" />
    </button>
  );
}

function ShowSheet({ show, user, onClose }) {
  const { token, users, refresh, removeShow } = useData();
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState(false);
  const admin = isAdmin(user);
  const staff = isStaff(user);

  if (editing) {
    return (
      <ShowEditor
        show={show}
        managers={users.filter((u) => u.role === "manager")}
        singers={users.filter((u) => u.role === "employee")}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  const deleteShow = async () => {
    const ok = await confirm({
      title: "Delete this show?",
      body: `${show.location} on ${longDate(show.date)} and all its attendance records will be removed. This can't be undone.`,
      confirmLabel: "Delete show",
      danger: true
    });
    if (!ok) return;
    onClose();
    removeShow(show.id);
    try {
      await api(`/shows/${show.id}`, { token, method: "DELETE" });
      toast("Show deleted");
    } catch (err) {
      toast(err.message, "error");
    }
    refresh(true);
  };

  const mark = async () => {
    setMarking(true);
    try {
      await api("/attendance", { token, method: "POST", body: { show_id: show.id } });
      await refresh(true);
      toast("Attendance marked. Your manager will review it.");
      onClose();
    } catch (err) {
      toast(err.message, "error");
      setMarking(false);
    }
  };

  const totalPay = Object.values(show.employee_pay || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const singerEntry = show.attendance[0];
  const sState = singerState(show);

  const footer = admin ? (
    <>
      <button className="btn btn-danger !flex-none" onClick={deleteShow} aria-label="Delete show">
        <Trash size={17} /> <span className="hidden sm:inline">Delete</span>
      </button>
      <button className="btn btn-primary" onClick={() => setEditing(true)}>
        <PencilSimple size={17} /> Edit show
      </button>
    </>
  ) : !staff && sState.canMark ? (
    <button className="btn btn-brand" onClick={mark} disabled={marking}>
      <Check size={17} weight="bold" /> {marking ? "Marking…" : "I performed at this show"}
    </button>
  ) : null;

  return (
    <Sheet title={show.location} subtitle={`${longDate(show.date)} · ${formatTime(show.time)}`} onClose={onClose} footer={footer}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Detail label="Manager" value={show.manager?.name || "—"} />
        <Detail label="Show ID" value={show.id} />
        {staff ? (
          <>
            <Detail label="Singers" value={show.employees.length} />
            {admin && <Detail label="Total pay" value={totalPay ? inr(totalPay) : "Not set"} />}
          </>
        ) : (
          <>
            <Detail label="Status" value={<Pill tone={sState.tone}>{sState.label}</Pill>} />
          </>
        )}
      </dl>

      {staff ? (
        <>
          <div className="mb-2 mt-6 flex items-center justify-between">
            <h3 className="section-label">Line-up & attendance</h3>
            <span className="text-xs subtle">{show.attendance.length} of {show.employees.length} marked</span>
          </div>
          <div className="card overflow-hidden">
            {show.employees.length === 0 ? (
              <Empty title="No singers assigned" copy={admin ? "Edit the show to add singers." : ""} />
            ) : (
              show.employees.map((employee) => (
                <LineupRow
                  key={employee.id}
                  show={show}
                  employee={employee}
                  entry={show.attendance.find((a) => a.user_id === employee.id)}
                  user={user}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <div className="mt-6">
          {singerEntry ? (
            <p className="alert tone-neutral">
              You marked this show on {fmtStamp(singerEntry.marked_at)}.{" "}
              {singerEntry.approval_status === "pending" ? "Your manager hasn't reviewed it yet." : `It was ${singerEntry.approval_status}.`}
            </p>
          ) : sState.canMark ? (
            <p className="alert tone-brand">Did you perform? Mark it so your manager can approve it.</p>
          ) : (
            <p className="alert tone-info">You can mark attendance once the show starts at {formatTime(show.time)}.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function LineupRow({ show, employee, entry, user }) {
  const review = useReview();
  const [busy, setBusy] = useState(false);
  const admin = isAdmin(user);
  const pay = show.employee_pay?.[String(employee.id)];

  const decide = async (status) => {
    setBusy(true);
    await review(entry, status, employee.name);
    setBusy(false);
  };

  let sub;
  if (entry) sub = `Marked ${fmtStamp(entry.marked_at)}`;
  else sub = hasStarted(show) ? "Hasn't marked yet" : "Show hasn't started";
  if (admin && pay != null) sub += ` · ${inr(pay)}`;

  return (
    <div className="row">
      <Avatar name={employee.name} />
      <div className="row-main">
        <p className="row-title">{employee.name}</p>
        <p className="row-sub !whitespace-normal">{sub}</p>
      </div>
      {entry?.approval_status === "pending" ? (
        <div className="flex gap-1.5">
          <button className="decide decide-bad" disabled={busy} onClick={() => decide("rejected")} aria-label={`Reject ${employee.name}`} title="Reject">
            <X size={18} weight="bold" />
          </button>
          <button className="decide decide-ok" disabled={busy} onClick={() => decide("approved")} aria-label={`Approve ${employee.name}`} title="Approve">
            <Check size={18} weight="bold" />
          </button>
        </div>
      ) : entry ? (
        <div className="flex flex-col items-end gap-1">
          <Pill tone={entry.approval_status === "approved" ? "ok" : "bad"}>
            {entry.approval_status === "approved" ? "Approved" : "Rejected"}
          </Pill>
          {/* Only admins may flip a decision that's already been made. */}
          {admin && (
            <button
              className="text-xs font-medium muted underline-offset-2 hover:underline"
              disabled={busy}
              onClick={() => decide(entry.approval_status === "approved" ? "rejected" : "approved")}
            >
              Change to {entry.approval_status === "approved" ? "rejected" : "approved"}
            </button>
          )}
        </div>
      ) : (
        <Pill tone="neutral" plain>{hasStarted(show) ? "Not marked" : "Upcoming"}</Pill>
      )}
    </div>
  );
}

function useReview() {
  const { token, refresh } = useData();
  const { toast } = useUI();
  return useCallback(async (entry, approval_status, name) => {
    try {
      await api(`/attendance/${entry.id}/review`, { token, method: "PATCH", body: { approval_status } });
      await refresh(true);
      toast(`${name}: ${approval_status === "approved" ? "approved" : "rejected"}`);
    } catch (err) {
      toast(err.message, "error");
    }
  }, [token, refresh, toast]);
}

/* Create or edit a show. Pay sits next to each singer so it's set in one pass. */
function ShowEditor({ show, managers, singers, onClose, onSaved }) {
  const { token, refresh, venues } = useData();
  const { toast } = useUI();
  const [form, setForm] = useState(() => ({
    date: show?.date || todayIST(),
    time: show?.time || "19:30",
    venue_id: show?.venue_id ?? null,
    location: show?.location || "",
    manager_id: show?.manager_id ?? "",
    employee_ids: show?.employee_ids || show?.employees.map((e) => e.id) || [],
    employee_pay: { ...(show?.employee_pay || {}) }
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const toggle = (id) => {
    setForm((current) => {
      const has = current.employee_ids.includes(id);
      const pay = { ...current.employee_pay };
      if (has) delete pay[String(id)];
      return { ...current, employee_ids: has ? current.employee_ids.filter((x) => x !== id) : [...current.employee_ids, id], employee_pay: pay };
    });
  };

  const setPay = (id, value) =>
    setForm((current) => ({ ...current, employee_pay: { ...current.employee_pay, [String(id)]: value === "" ? null : Number(value) } }));

  const totalPay = form.employee_ids.reduce((sum, id) => sum + (Number(form.employee_pay[String(id)]) || 0), 0);
  const visibleSingers = singers.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  const save = async () => {
    if (!form.location.trim()) return setError("Pick or add a venue.");
    if (!form.manager_id) return setError(managers.length ? "Pick the manager for this show." : "Add a manager in Team first.");
    if (!form.employee_ids.length) return setError("Assign at least one singer.");
    setSaving(true);
    setError("");
    const body = {
      date: form.date,
      time: form.time,
      venue_id: form.venue_id,
      location: form.location.trim(),
      manager_id: Number(form.manager_id),
      employee_ids: form.employee_ids.map(Number),
      employee_pay: form.employee_pay
    };
    try {
      if (show) {
        await api(`/shows/${show.id}`, { token, method: "PATCH", body });
        toast("Show updated");
      } else {
        const data = await api("/shows", { token, method: "POST", body });
        toast(`${data.show.location} scheduled`);
      }
      await refresh(true);
      onSaved(body);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={show ? "Edit show" : "New show"}
      subtitle={show ? show.id : "Schedule a show and set the line-up."}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : show ? "Save changes" : "Create show"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <span className="field-label">Venue</span>
          <VenuePicker
            venues={venues}
            value={{ venue_id: form.venue_id, name: form.location }}
            onChange={({ venue_id, name }) => setForm((f) => ({ ...f, venue_id, location: name }))}
          />
        </div>
        <div className="form-grid form-grid-2 !grid-cols-2">
          <Field label="Date">
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Start time">
            <input className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
        </div>
        <Field label="Manager">
          <select className="input" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
            <option value="">{managers.length ? "Choose a manager" : "No managers yet"}</option>
            {[...managers].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="mb-2 mt-6 flex items-end justify-between gap-3">
        <div>
          <h3 className="section-label">Singers & pay</h3>
          <p className="text-xs subtle">{form.employee_ids.length} selected</p>
        </div>
        <span className="text-[13px] font-semibold">{inr(totalPay)}</span>
      </div>
      {singers.length > 6 && (
        <div className="relative mb-2">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 subtle" />
          <input className="input !pl-9" placeholder="Search singers" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      <div className="card overflow-hidden">
        {singers.length === 0 ? (
          <Empty title="No singers yet" copy="Add singers in Team first." />
        ) : (
          visibleSingers.map((singer) => {
            const on = form.employee_ids.includes(singer.id);
            return (
              <div key={singer.id} className="pick-row">
                <input id={`pick-${singer.id}`} className="checkbox" type="checkbox" checked={on} onChange={() => toggle(singer.id)} />
                <label htmlFor={`pick-${singer.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <Avatar name={singer.name} size="sm" />
                  <span className="row-title">{singer.name}</span>
                </label>
                {on && (
                  <div className="input-prefix w-[7.5rem] flex-none">
                    <span>₹</span>
                    <input
                      className="input !min-h-9 text-right"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="100"
                      placeholder="Pay"
                      aria-label={`Pay for ${singer.name}`}
                      value={form.employee_pay[String(singer.id)] ?? ""}
                      onChange={(e) => setPay(singer.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {error && <p className="alert tone-bad mt-4">{error}</p>}
    </Sheet>
  );
}

/* Type to find a saved venue, or add a new one. Most-used venues show first. */
function VenuePicker({ venues, value, onChange }) {
  const [open, setOpen] = useState(false);
  const query = value.name.trim().replace(/\s+/g, " ").toLowerCase();
  const exact = venues.find((v) => v.name.toLowerCase() === query);
  const matches = venues
    .filter((v) => !query || value.venue_id || v.name.toLowerCase().includes(query))
    .sort((a, b) => b.shows - a.shows || a.name.localeCompare(b.name))
    .slice(0, 8);

  const pick = (venue) => {
    onChange({ venue_id: venue.id, name: venue.name });
    setOpen(false);
  };

  return (
    <div>
      <div className="relative">
        <MapPin size={17} className="absolute left-3 top-1/2 -translate-y-1/2 subtle" />
        <input
          className="input !pl-9 pr-10"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder="Search or add a venue"
          value={value.name}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            const name = e.target.value;
            const same = venues.find((v) => v.name.toLowerCase() === name.trim().replace(/\s+/g, " ").toLowerCase());
            onChange({ venue_id: same?.id ?? null, name });
            setOpen(true);
          }}
        />
        {value.venue_id && <CheckCircle size={18} weight="fill" className="absolute right-3 top-1/2 -translate-y-1/2 text-ok" aria-label="Saved venue" />}
      </div>
      {open && (matches.length > 0 || (query && !exact)) && (
        <ul className="combo-list" role="listbox">
          {matches.map((v) => (
            <li key={v.id}>
              <button type="button" role="option" aria-selected={value.venue_id === v.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)}>
                <span className="truncate">{v.name}</span>
                <span className="text-xs subtle">{plural(v.shows, "show")}</span>
              </button>
            </li>
          ))}
          {query && !exact && (
            <li>
              <button type="button" className="font-medium" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
                <span className="truncate"><Plus size={14} weight="bold" className="mr-1.5 inline" />Add “{value.name.trim()}” as a new venue</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {!value.venue_id && query && <p className="field-hint mt-1.5">New venue. It's saved when you save the show.</p>}
    </div>
  );
}

/* Rename, merge duplicates, add or remove saved venues. */
function VenuesSheet({ onClose }) {
  const { token, venues, refresh } = useData();
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState(null); // venue being edited
  const [name, setName] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn, message) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh(true);
      toast(message);
      setEditing(null);
      setNewName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const open = (venue) => {
    setEditing(venue);
    setName(venue.name);
    setMergeInto("");
    setError("");
  };

  if (editing) {
    const target = venues.find((v) => String(v.id) === mergeInto);
    return (
      <Sheet title={editing.name} subtitle={`${plural(editing.shows, "show")}${editing.last_show ? ` · last on ${fmtDate(editing.last_show, { day: "numeric", month: "short", year: "numeric" })}` : ""}`} onClose={() => setEditing(null)}>
        <Field label="Name" hint="Renaming updates every show at this venue.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button
          className="btn btn-primary btn-block mt-3"
          disabled={busy || !name.trim() || name.trim() === editing.name}
          onClick={() => run(() => api(`/venues/${editing.id}`, { token, method: "PATCH", body: { name } }), "Venue renamed")}
        >
          Save name
        </button>

        <h3 className="section-label mb-2 mt-7">Duplicate of another venue?</h3>
        <Field label="Merge into" hint="Moves all its shows to the venue you pick, then removes this one.">
          <select className="input" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
            <option value="">Choose a venue</option>
            {venues.filter((v) => v.id !== editing.id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <button
          className="btn btn-secondary btn-block mt-3"
          disabled={busy || !target}
          onClick={async () => {
            const ok = await confirm({
              title: `Merge into ${target.name}?`,
              body: `${plural(editing.shows, "show")} move to ${target.name} and "${editing.name}" is removed.`,
              confirmLabel: "Merge"
            });
            if (ok) run(() => api(`/venues/${editing.id}`, { token, method: "PATCH", body: { merge_into: target.id } }), `Merged into ${target.name}`);
          }}
        >
          Merge
        </button>

        {editing.shows === 0 && (
          <button
            className="btn btn-danger btn-block mt-7"
            disabled={busy}
            onClick={() => run(() => api(`/venues/${editing.id}`, { token, method: "DELETE" }), "Venue removed")}
          >
            <Trash size={16} /> Remove venue
          </button>
        )}
        {error && <p className="alert tone-bad mt-4">{error}</p>}
      </Sheet>
    );
  }

  return (
    <Sheet title="Venues" subtitle={`${plural(venues.length, "saved venue")} · pick them when adding a show`} onClose={onClose}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) run(() => api("/venues", { token, method: "POST", body: { name: newName } }), "Venue added");
        }}
      >
        <input className="input" placeholder="Add a venue" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn btn-primary !min-h-11 flex-none" disabled={busy || !newName.trim()}><Plus size={16} weight="bold" /> Add</button>
      </form>
      {error && <p className="alert tone-bad mt-3">{error}</p>}
      <div className="card mt-4 overflow-hidden">
        {venues.length === 0 ? (
          <Empty icon={MapPin} title="No venues yet" copy="Add one above, or type one when creating a show." />
        ) : (
          venues.map((v) => (
            <button key={v.id} className="row" onClick={() => open(v)}>
              <span className="thumb"><MapPin size={18} /></span>
              <div className="row-main">
                <p className="row-title">{v.name}</p>
                <p className="row-sub">
                  {plural(v.shows, "show")}
                  {v.last_show ? ` · last ${fmtDate(v.last_show, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </p>
              </div>
              <PencilSimple size={16} className="subtle" />
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}

function CopyMonthSheet({ shows, sourceMonth, onClose, onDone }) {
  const { token, refresh } = useData();
  const { toast } = useUI();
  const [targetMonth, setTargetMonth] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  const nextMonths = useMemo(() => {
    const [year, month] = sourceMonth.split("-").map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(year, month - 1 + i + 1, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });
  }, [sourceMonth]);

  const copy = async () => {
    if (!targetMonth) return setError("Pick a month to copy into.");
    setError("");
    try {
      for (let i = 0; i < shows.length; i++) {
        const show = shows[i];
        setProgress(i + 1);
        // Same day of month, clamped so 31 Oct -> 30 Nov instead of an invalid date
        const [targetYear, targetMon] = targetMonth.split("-").map(Number);
        const lastDay = new Date(targetYear, targetMon, 0).getDate();
        const day = String(Math.min(Number(show.date.slice(8, 10)), lastDay)).padStart(2, "0");
        await api("/shows", {
          token,
          method: "POST",
          body: {
            date: `${targetMonth}-${day}`,
            time: show.time,
            venue_id: show.venue_id,
            location: show.location,
            manager_id: show.manager_id,
            employee_ids: show.employee_ids,
            employee_pay: show.employee_pay
          }
        });
      }
      await refresh(true);
      toast(`Copied ${plural(shows.length, "show")} to ${monthLabel(targetMonth)}`);
      onDone(targetMonth);
    } catch (err) {
      setError(`Stopped after ${progress ? progress - 1 : 0} shows: ${err.message}`);
      setProgress(null);
    }
  };

  return (
    <Sheet
      title="Copy month"
      subtitle={`${plural(shows.length, "show")} from ${monthLabel(sourceMonth)}`}
      onClose={progress ? () => {} : onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={!!progress}>Cancel</button>
          <button className="btn btn-primary" onClick={copy} disabled={!!progress}>
            {progress ? `Copying ${progress} of ${shows.length}…` : "Copy shows"}
          </button>
        </>
      }
    >
      <Field label="Copy into" hint="Each show keeps its day of the month, time, venue, line-up and pay.">
        <select className="input" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} disabled={!!progress}>
          <option value="">Choose a month</option>
          {nextMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </Field>
      {progress && (
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--hover)]">
          <div className="h-full bg-ink transition-all duration-300" style={{ width: `${(progress / shows.length) * 100}%` }} />
        </div>
      )}
      {error && <p className="alert tone-bad mt-4">{error}</p>}
    </Sheet>
  );
}

/* ==========================================================================
   TEAM (admin)
   ========================================================================== */

function TeamPage({ user }) {
  const { users, shows, activity, initialLoadDone, error } = useData();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);

  if (!initialLoadDone) return error ? <LoadError /> : <PageSkeleton />;

  const todayById = Object.fromEntries((activity.summary || []).map((a) => [a.user.id, a.status]));
  const roles = [
    { id: "all", label: "Everyone", match: () => true },
    { id: "employee", label: "Singers", match: (u) => u.role === "employee" },
    { id: "manager", label: "Managers", match: (u) => u.role === "manager" },
    { id: "admin", label: "Admins", match: (u) => isAdmin(u) }
  ];
  const q = query.trim().toLowerCase();
  const list = users
    .filter(roles.find((r) => r.id === role).match)
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const available = Object.values(todayById).filter((s) => s === "active").length;
  const openUser = users.find((u) => u.id === openId);

  return (
    <>
      <PageHead
        title="Team"
        sub={`${plural(users.length, "person", "people")} · ${available} available today`}
        actions={
          <button className="btn btn-primary desktop-only" onClick={() => setAdding(true)}>
            <UserPlus size={16} /> Add member
          </button>
        }
      />

      <div className="mb-3 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 subtle" />
          <input className="input !pl-9" placeholder="Search by name or username" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chips">
          {roles.map((r) => (
            <button key={r.id} className={`chip ${role === r.id ? "chip-on" : ""}`} onClick={() => setRole(r.id)}>
              {r.label}
              <span className="chip-count">{users.filter(r.match).length}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="card overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={UsersThree} title="No one matches" copy="Try another name or filter." />
        ) : (
          list.map((person) => (
            <button key={person.id} className="row" onClick={() => setOpenId(person.id)}>
              <Avatar name={person.name} />
              <div className="row-main">
                <p className="row-title">{person.name}{person.id === user.id && <span className="ml-1.5 text-xs font-normal subtle">(you)</span>}</p>
                <p className="row-sub">{person.username} · {ROLE_LABEL[person.role]}</p>
              </div>
              {todayById[person.id] === "active" && <Pill tone="ok">Available</Pill>}
              {todayById[person.id] === "inactive" && <Pill tone="bad">Off</Pill>}
              <CaretRight size={16} className="subtle hidden sm:block" />
            </button>
          ))
        )}
      </section>

      <button className="fab" onClick={() => setAdding(true)} aria-label="Add member">
        <UserPlus size={24} />
      </button>

      {openUser && <MemberSheet person={openUser} shows={shows} today={todayById[openUser.id]} user={user} onClose={() => setOpenId(null)} />}
      {adding && <AddMemberSheet user={user} onClose={() => setAdding(false)} />}
    </>
  );
}

function MemberSheet({ person, shows, today, user, onClose }) {
  const { token, refresh, removeUser } = useData();
  const { toast, confirm } = useUI();
  const month = todayIST().slice(0, 7);
  const monthShows = shows.filter((s) => s.date.startsWith(month));

  const singer = person.role === "employee";
  const assigned = singer ? monthShows.filter((s) => s.employee_ids?.includes(person.id) || s.employees.some((e) => e.id === person.id)) : monthShows.filter((s) => s.manager_id === person.id);
  const approved = singer ? assigned.filter((s) => s.attendance.some((a) => a.user_id === person.id && a.approval_status === "approved")) : [];
  const earned = approved.reduce((sum, s) => sum + (Number(s.employee_pay?.[String(person.id)]) || 0), 0);
  const canDelete = user.role === "admin" && person.id !== user.id;

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${person.name}?`,
      body: "Their account and all their attendance records will be deleted. This can't be undone.",
      confirmLabel: "Remove member",
      danger: true
    });
    if (!ok) return;
    onClose();
    removeUser(person.id);
    try {
      await api(`/users/${person.id}`, { token, method: "DELETE" });
      toast(`${person.name} removed`);
    } catch (err) {
      toast(err.message, "error");
    }
    refresh(true);
  };

  return (
    <Sheet
      title={person.name}
      subtitle={person.username}
      onClose={onClose}
      footer={canDelete && (
        <button className="btn btn-danger" onClick={remove}>
          <Trash size={17} /> Remove member
        </button>
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar name={person.name} size="lg" />
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="neutral" plain>{ROLE_LABEL[person.role]}</Pill>
          {today === "active" && <Pill tone="ok">Available today</Pill>}
          {today === "inactive" && <Pill tone="bad">Off today</Pill>}
          {!today && <Pill tone="neutral">No check-in today</Pill>}
        </div>
      </div>

      <h3 className="section-label mb-2 mt-6">{monthLabel(month)}</h3>
      <div className="kpis !grid-cols-2">
        <Kpi label={singer ? "Shows assigned" : person.role === "manager" ? "Shows managed" : "Shows"} value={singer || person.role === "manager" ? assigned.length : monthShows.length} />
        {singer ? <Kpi label="Earned (approved)" value={inr(earned)} /> : <Kpi label="To review" value={pendingEntries(assigned).length} />}
      </div>

      {(singer || person.role === "manager") && assigned.length > 0 && (
        <>
          <h3 className="section-label mb-2 mt-6">Shows this month</h3>
          <div className="card overflow-hidden">
            {assigned.map((show) => {
              const entry = show.attendance.find((a) => a.user_id === person.id);
              return (
                <div key={show.id} className="row">
                  <DateTile date={show.date} />
                  <div className="row-main">
                    <p className="row-title">{show.location}</p>
                    <p className="row-sub">{formatTime(show.time)}{singer && show.employee_pay?.[String(person.id)] != null ? ` · ${inr(show.employee_pay[String(person.id)])}` : ""}</p>
                  </div>
                  {singer && (entry ? (
                    <Pill tone={{ approved: "ok", rejected: "bad", pending: "warn" }[entry.approval_status]}>
                      {{ approved: "Approved", rejected: "Rejected", pending: "Pending" }[entry.approval_status]}
                    </Pill>
                  ) : (
                    <Pill tone="neutral" plain>{hasStarted(show) ? "Not marked" : "Upcoming"}</Pill>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}

function AddMemberSheet({ user, onClose }) {
  const { token, refresh } = useData();
  const { toast } = useUI();
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "employee" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.password) return setError("Fill in name, username and a temporary password.");
    setSaving(true);
    setError("");
    try {
      const data = await api("/users", { token, method: "POST", body: form });
      await refresh(true);
      toast(`${data.user.name} added as ${ROLE_LABEL[data.user.role].toLowerCase()}`);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Add member"
      subtitle="They sign in with this username and password."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Adding…" : "Add member"}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ishaan Arora" />
        </Field>
        <Field label="Username">
          <input
            className="input"
            autoCapitalize="none"
            autoCorrect="off"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="ishaan@sunggeet.com" inputMode="email"
          />
        </Field>
        <Field label="Temporary password" hint="Share it with them privately.">
          <input className="input" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="Role">
          <div className="seg w-full" role="group" aria-label="Role">
            {[
              ["employee", "Singer"],
              ["manager", "Manager"],
              ["admin", "Admin"],
              ...(user.role === "admin" ? [["superior", "Superior"]] : [])
            ].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={form.role === value} onClick={() => setForm({ ...form, role: value })}>
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      {error && <p className="alert tone-bad mt-4">{error}</p>}
    </Sheet>
  );
}

/* ==========================================================================
   ACTIVITY / HISTORY
   ========================================================================== */

function ActivityPage({ user }) {
  const { profile, initialLoadDone, error } = useData();
  const [filter, setFilter] = useState("all");

  if (!initialLoadDone) return error ? <LoadError /> : <PageSkeleton />;

  const singer = user.role === "employee";
  const entries = [...(profile?.activity || [])]
    .filter((e) => e.show)
    .sort((a, b) => String(b.marked_at || b.show.date).localeCompare(String(a.marked_at || a.show.date)));
  const filters = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" }
  ];
  const list = filter === "all" ? entries : entries.filter((e) => e.approval_status === filter);

  return (
    <>
      <PageHead
        title={singer ? "History" : "Activity"}
        sub={singer ? "Every show you've marked and what happened to it." : "Attendance marked by the team and the decisions on it."}
      />
      <div className="chips mb-3">
        {filters.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? "chip-on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
            {f.id !== "all" && <span className="chip-count">{entries.filter((e) => e.approval_status === f.id).length}</span>}
          </button>
        ))}
      </div>
      <section className="card overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={ClockCounterClockwise} title="Nothing here yet" copy={singer ? "Shows you mark will be listed here." : "Marked attendance will be listed here."} />
        ) : (
          list.map((entry) => (
            <div key={entry.id} className="row">
              {singer ? <DateTile date={entry.show.date} /> : <Avatar name={entry.employee?.name || "?"} />}
              <div className="row-main">
                <p className="row-title">{singer ? entry.show.location : entry.employee?.name}</p>
                <p className="row-sub">
                  {singer ? "" : `${entry.show.location} · `}
                  {fmtDate(entry.show.date, { day: "numeric", month: "short", year: "numeric" })}
                  {entry.marked_at ? ` · marked ${fmtStamp(entry.marked_at)}` : ""}
                </p>
              </div>
              <Pill tone={{ approved: "ok", rejected: "bad", pending: "warn" }[entry.approval_status] || "neutral"}>
                {{ approved: "Approved", rejected: "Rejected", pending: "Pending" }[entry.approval_status] || entry.approval_status}
              </Pill>
            </div>
          ))
        )}
      </section>
    </>
  );
}

/* ==========================================================================
   REPORTS (admin): shows, attendance and pay by venue, team, singer or
   manager, for a month, a year or all time, with comparisons
   ========================================================================== */

function ReportsPage() {
  const { initialLoadDone, error } = useData();
  const model = useReportModel();
  const [period, setPeriod] = useState(() => ({ kind: "month", value: todayIST().slice(0, 7) }));
  const [compare, setCompare] = useState("none"); // none | prev | lastyear
  const [view, setView] = useState("overview");
  const [open, setOpen] = useState(null); // { dim, key }
  const [demo, setDemo] = useState(null);
  const { token } = useData();

  useEffect(() => {
    api("/demo-data", { token }).then(setDemo).catch(() => setDemo({ present: false, shows: 0, people: 0 }));
  }, [token]);

  if (!initialLoadDone) return error ? <LoadError /> : <PageSkeleton />;

  const cmpPeriod = comparisonPeriod(period, compare);
  const setKind = (kind) => {
    if (kind === "month") setPeriod({ kind, value: model.months.at(-1) });
    if (kind === "year") setPeriod({ kind, value: (period.value || todayIST()).slice(0, 4) });
    if (kind === "all") {
      setPeriod({ kind, value: "" });
      setCompare("none");
    }
  };
  const compareOptions = period.kind === "month"
    ? [["none", "Off"], ["prev", shortMonth(shiftMonth(period.value, -1))], ["lastyear", shortMonth(shiftMonth(period.value, -12))]]
    : period.kind === "year"
      ? [["none", "Off"], ["lastyear", String(Number(period.value) - 1)]]
      : [];

  return (
    <>
      <PageHead title="Reports" sub="Shows, attendance and pay by venue, team, singer or manager." actions={<ExportButton />} />

      {demo && !demo.present && <SampleDataCard status={demo} onChange={setDemo} />}

      <section className="card card-pad mb-4 space-y-3 lg:mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="seg" role="group" aria-label="Period">
            {[["month", "Month"], ["year", "Year"], ["all", "All time"]].map(([kind, label]) => (
              <button key={kind} aria-pressed={period.kind === kind} onClick={() => setKind(kind)}>{label}</button>
            ))}
          </div>
          {period.kind === "month" && (
            <MonthStepper months={model.months} value={period.value} onChange={(value) => setPeriod({ kind: "month", value })} />
          )}
          {period.kind === "year" && (
            <MonthStepper months={model.years} value={period.value} format={(y) => y} onChange={(value) => setPeriod({ kind: "year", value })} />
          )}
        </div>
        {compareOptions.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="flex items-center gap-1.5 text-[13px] font-medium muted"><ArrowsLeftRight size={15} /> Compare</span>
            <div className="seg w-full sm:w-auto" role="group" aria-label="Compare with">
              {compareOptions.map(([id, label]) => (
                <button key={id} aria-pressed={compare === id} onClick={() => setCompare(id)}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="chips mb-4">
        {REPORT_VIEWS.map((v) => (
          <button key={v.id} className={`chip ${view === v.id ? "chip-on" : ""}`} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      {view === "overview" ? (
        <ReportOverview model={model} period={period} cmpPeriod={cmpPeriod} onSeeAll={setView} onOpen={setOpen} />
      ) : (
        <ReportBreakdown model={model} dimId={view} period={period} cmpPeriod={cmpPeriod} onOpen={(key) => setOpen({ dim: view, key })} />
      )}

      {demo?.present && <SampleDataCard status={demo} onChange={setDemo} />}

      {open && (
        <ReportEntitySheet model={model} dimId={open.dim} entityKey={open.key} period={period} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/* Load or clear the demo dataset (lib/demo-data.js) so Reports has something to show. */
function SampleDataCard({ status, onChange: setStatus }) {
  const { token, refresh } = useData();
  const { toast, confirm } = useUI();
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    const ok = await confirm(
      action === "add"
        ? {
            title: "Load sample data?",
            body: "Adds about 230 sample shows (Jan 2025 to Nov 2026), 10 sample people and 7 venues, and publishes the upcoming sample gigs on the public website. Your real data isn't touched, and you can remove it all here.",
            confirmLabel: "Load sample data"
          }
        : {
            title: "Remove sample data?",
            body: "Deletes every sample show, person, venue and website listing. Your real data stays.",
            confirmLabel: "Remove",
            danger: true
          }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const result = await api("/demo-data", { token, method: "POST", body: { action }, timeout: 60000 });
      setStatus(result);
      await refresh(true);
      toast(result.message);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`card card-pad ${status.present ? "mt-6" : "mb-4 !border-[#ecd2b7] bg-brand-soft lg:mb-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="card-title">Sample data</h2>
          <p className="mt-0.5 text-[13px] muted">
            {status.present
              ? `${plural(status.shows, "sample show")} and ${plural(status.people, "sample person", "sample people")} are loaded. They're included in every number above.`
              : "Load about two years of realistic sample shows, people and pay to try Reports and the comparisons. Remove it any time."}
          </p>
        </div>
        {status.present ? (
          <button className="btn btn-danger" onClick={() => run("remove")} disabled={busy}>
            <Trash size={16} /> {busy ? "Removing…" : "Remove sample data"}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => run("add")} disabled={busy}>
            <Plus size={16} /> {busy ? "Loading…" : "Load sample data"}
          </button>
        )}
      </div>
    </section>
  );
}

function ReportOverview({ model, period, cmpPeriod, onSeeAll, onOpen }) {
  const [metric, setMetric] = useState("pay");
  const cur = summarize(slotsIn(model.slots, period));
  const cmp = cmpPeriod ? summarize(slotsIn(model.slots, cmpPeriod)) : null;
  const vs = cmpPeriod ? `vs ${periodShort(cmpPeriod)}` : periodLabel(period);
  const months = chartMonths(period, model.months);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="kpis">
        <Kpi label="Shows" value={cur.shows} foot={cmp ? <Delta cur={cur.shows} cmp={cmp.shows} suffix={vs} /> : vs} />
        <Kpi label="Spots approved" value={`${cur.approved}/${cur.due}`} foot={cmp ? <Delta cur={cur.approved} cmp={cmp.approved} suffix={vs} /> : "Approved of spots played"} />
        <Kpi label="Attendance rate" value={pct(cur.rate)} foot={cmp ? <Delta cur={cur.rate} cmp={cmp.rate} kind="rate" suffix={vs} /> : "Approved ÷ spots played"} />
        <Kpi label="Pay due" value={inr(cur.pay)} foot={cmp ? <Delta cur={cur.pay} cmp={cmp.pay} kind="money" suffix={vs} /> : "Approved shows only"} />
      </div>

      <section className="card">
        <div className="card-head flex-wrap">
          <h2 className="card-title">Monthly trend</h2>
          <div className="seg" role="group" aria-label="Chart measure">
            {CHART_METRICS.map((m) => (
              <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>
            ))}
          </div>
        </div>
        <div className="card-pad">
          <TrendChart
            months={months}
            metric={metric}
            series={[
              { label: periodLabel(period) === "All time" ? "Last 12 months" : "This period", slots: model.slots },
              ...(cmpPeriod ? [{ label: "A year earlier", slots: model.slots, shift: -12 }] : [])
            ]}
          />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
        {["venue", "team", "singer"].map((dimId) => (
          <TopList key={dimId} model={model} dimId={dimId} period={period} onSeeAll={() => onSeeAll(dimId)} onOpen={(key) => onOpen({ dim: dimId, key })} />
        ))}
      </div>
    </div>
  );
}

function TopList({ model, dimId, period, onSeeAll, onOpen }) {
  const dim = model.dims[dimId];
  const rows = entityRows(model, dimId, period, null)
    .filter((r) => r.cur.spots > 0)
    .sort((a, b) => b.cur.pay - a.cur.pay || b.cur.approved - a.cur.approved)
    .slice(0, 5);

  return (
    <section className="card overflow-hidden">
      <div className="card-head">
        <h2 className="card-title">Top {dim.label.toLowerCase()}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onSeeAll}>See all <ArrowRight size={14} /></button>
      </div>
      {dimId === "team" && !model.teamsLoaded ? (
        <ListSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <Empty title={`No ${dim.label.toLowerCase()} yet`} copy={dimId === "team" ? "Teams count once a show is published with a team." : "Nothing in this period."} />
      ) : (
        rows.map((r) => (
          <button key={r.key} className="row" onClick={() => onOpen(r.key)}>
            <EntityIcon dimId={dimId} name={r.name} />
            <div className="row-main">
              <p className="row-title">{r.name}</p>
              <p className="row-sub">{plural(r.cur.shows, "show")} · {pct(r.cur.rate)} attended</p>
            </div>
            <span className="text-[13px] font-semibold">{inr(r.cur.pay)}</span>
          </button>
        ))
      )}
    </section>
  );
}

const SORTS = [
  ["pay", "Pay due"],
  ["shows", "Shows"],
  ["approved", "Approved"],
  ["rate", "Attendance rate"],
  ["name", "Name"]
];

function ReportBreakdown({ model, dimId, period, cmpPeriod, onOpen }) {
  const [sort, setSort] = useState("pay");
  const [query, setQuery] = useState("");
  const dim = model.dims[dimId];
  const q = query.trim().toLowerCase();
  const rows = entityRows(model, dimId, period, cmpPeriod)
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : (b.cur[sort] ?? -1) - (a.cur[sort] ?? -1) || a.name.localeCompare(b.name)));
  const total = summarize(slotsIn(model.slots, period));
  const totalCmp = cmpPeriod ? summarize(slotsIn(model.slots, cmpPeriod)) : null;

  return (
    <>
      <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 subtle" />
          <input className="input !pl-9" placeholder={`Search ${dim.label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[13px] muted">
          Sort by
          <select className="input !min-h-9 !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>

      {dimId === "team" && (
        <p className="alert tone-neutral mb-3">Teams come from the website: a show counts for a team once it's published with "Team playing" set. Everything else is under "No team".</p>
      )}

      <section className="card overflow-hidden">
        {dimId === "team" && !model.teamsLoaded ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={ChartBar} title={`No ${dim.label.toLowerCase()} found`} copy="Try another period or search." />
        ) : (
          <>
            <div className="lg:hidden">
              {rows.map((r) => (
                <button key={r.key} className="row" onClick={() => onOpen(r.key)}>
                  <EntityIcon dimId={dimId} name={r.name} />
                  <div className="row-main">
                    <p className="row-title">{r.name}</p>
                    <p className="row-sub">{plural(r.cur.shows, "show")} · {r.cur.approved}/{r.cur.due} approved · {pct(r.cur.rate)}</p>
                  </div>
                  <div className="flex flex-none flex-col items-end">
                    <span className="text-[13px] font-semibold">{inr(r.cur.pay)}</span>
                    {r.cmp && <Delta cur={r.cur.pay} cmp={r.cmp.pay} kind="money" compact />}
                  </div>
                </button>
              ))}
              <div className="row bg-surface-2 font-semibold">
                <span className="row-main">Total · {plural(total.shows, "show")}</span>
                <span>{inr(total.pay)}</span>
              </div>
            </div>
            <table className="table hidden lg:table">
              <thead>
                <tr>
                  <th>{dim.one[0].toUpperCase() + dim.one.slice(1)}</th>
                  <th className="num">Shows</th>
                  <th className="num">Spots</th>
                  <th className="num">Approved</th>
                  <th className="num">Rate</th>
                  <th className="num">Pay due</th>
                  {cmpPeriod && <th className="num">vs {periodShort(cmpPeriod)}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="cursor-pointer hover:bg-[var(--surface-2)]" onClick={() => onOpen(r.key)}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <EntityIcon dimId={dimId} name={r.name} size="sm" />
                        <span className="font-medium">{r.name}</span>
                      </div>
                    </td>
                    <td className="num">{r.cur.shows}</td>
                    <td className="num">{r.cur.spots}</td>
                    <td className="num">{r.cur.approved}</td>
                    <td className="num">{pct(r.cur.rate)}</td>
                    <td className="num font-semibold">{inr(r.cur.pay)}</td>
                    {cmpPeriod && <td className="num"><Delta cur={r.cur.pay} cmp={r.cmp.pay} kind="money" compact /></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{total.shows}</td>
                  <td className="num">{total.spots}</td>
                  <td className="num">{total.approved}</td>
                  <td className="num">{pct(total.rate)}</td>
                  <td className="num">{inr(total.pay)}</td>
                  {cmpPeriod && <td className="num"><Delta cur={total.pay} cmp={totalCmp.pay} kind="money" compact /></td>}
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </section>
    </>
  );
}

/* One venue / team / singer / manager: its numbers, trend, and a comparison
   against an earlier period or another of the same kind. */
function ReportEntitySheet({ model, dimId, entityKey, period, onClose }) {
  const dim = model.dims[dimId];
  const name = dim.nameOf(entityKey);
  const [mode, setMode] = useState(period.kind === "all" ? "other" : "lastyear"); // prev | lastyear | other
  const [otherKey, setOtherKey] = useState("");
  const [metric, setMetric] = useState("pay");

  const mine = model.slots.filter((s) => dim.keyOf(s) === entityKey);
  const others = entityRows(model, dimId, period, null).filter((r) => r.key !== entityKey).sort((a, b) => a.name.localeCompare(b.name));
  const otherSlots = otherKey ? model.slots.filter((s) => dim.keyOf(s) === otherKey) : [];

  const cur = summarize(slotsIn(mine, period));
  let cmp = null;
  let cmpLabel = "";
  if (mode === "other" && otherKey) {
    cmp = summarize(slotsIn(otherSlots, period));
    cmpLabel = dim.nameOf(otherKey);
  } else if (mode !== "other" && period.kind !== "all") {
    const p = comparisonPeriod(period, mode);
    cmp = summarize(slotsIn(mine, p));
    cmpLabel = periodLabel(p);
  }

  const months = chartMonths(period, model.months);
  const series = [{ label: name, slots: mine }];
  if (mode === "other" && otherKey) series.push({ label: cmpLabel, slots: otherSlots });
  else if (mode !== "other" && period.kind !== "all") series.push({ label: "A year earlier", slots: mine, shift: -12 });

  // Who / where inside this entity.
  const innerDimId = dimId === "singer" ? "venue" : "singer";
  const inner = model.dims[innerDimId];
  const periodSlots = slotsIn(mine, period);
  const innerRows = Object.entries(groupBy(periodSlots, inner.keyOf))
    .map(([key, list]) => ({ key, name: inner.nameOf(key), s: summarize(list) }))
    .sort((a, b) => b.s.pay - a.s.pay || b.s.approved - a.s.approved);
  const showsInPeriod = [...new Map(periodSlots.map((s) => [s.show.id, s.show])).values()].sort((a, b) => showStart(b) - showStart(a));

  const metrics = [
    ["Shows", cur.shows, cmp?.shows, "count"],
    ["Spots", cur.spots, cmp?.spots, "count"],
    ["Approved", cur.approved, cmp?.approved, "count"],
    ["Rejected", cur.rejected, cmp?.rejected, "count"],
    ["Attendance rate", cur.rate, cmp?.rate, "rate"],
    ["Pay due", cur.pay, cmp?.pay, "money"],
    ["Pay planned", cur.payPlanned, cmp?.payPlanned, "money"]
  ];
  const fmt = (v, kind) => (kind === "money" ? inr(v) : kind === "rate" ? pct(v) : v ?? 0);

  return (
    <Sheet title={name} subtitle={`${dim.one[0].toUpperCase() + dim.one.slice(1)} · ${periodLabel(period)}`} onClose={onClose}>
      <h3 className="section-label mb-2">Compare with</h3>
      <div className="seg mb-2 w-full" role="group" aria-label="Compare with">
        {period.kind === "month" && <button aria-pressed={mode === "prev"} onClick={() => setMode("prev")}>Previous month</button>}
        {period.kind !== "all" && <button aria-pressed={mode === "lastyear"} onClick={() => setMode("lastyear")}>Last year</button>}
        <button aria-pressed={mode === "other"} onClick={() => setMode("other")}>Another {dim.one}</button>
      </div>
      {mode === "other" && (
        <select className="input mb-2" value={otherKey} onChange={(e) => setOtherKey(e.target.value)}>
          <option value="">Choose a {dim.one}</option>
          {others.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
        </select>
      )}

      <div className="card mt-3 overflow-hidden">
        <table className="table table-compact">
          <thead>
            <tr>
              <th></th>
              <th className="num"><Swatch color={SERIES_COLORS[0]} />{cmp ? "This" : periodLabel(period)}</th>
              {cmp && <th className="num"><Swatch color={SERIES_COLORS[1]} /><span className="inline-block max-w-[calc(100%-1rem)] truncate align-bottom">{cmpLabel}</span></th>}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, a, b, kind]) => (
              <tr key={label}>
                <td className="muted">{label}</td>
                <td className="num font-semibold">{fmt(a, kind)}</td>
                {cmp && (
                  <td className="num">
                    {fmt(b, kind)}
                    {/* How "this" differs from the comparison. */}
                    <span className="block"><Delta cur={a} cmp={b} kind={kind} compact /></span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-label">Monthly trend</h3>
        <div className="seg" role="group" aria-label="Chart measure">
          {CHART_METRICS.map((m) => (
            <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>
      <div className="card card-pad">
        <TrendChart months={months} metric={metric} series={series} />
      </div>

      {innerRows.length > 0 && (
        <>
          <h3 className="section-label mb-2 mt-6">{inner.label} · {periodLabel(period)}</h3>
          <div className="card overflow-hidden">
            {innerRows.map((r) => (
              <div key={r.key} className="row">
                <EntityIcon dimId={innerDimId} name={r.name} size="sm" />
                <div className="row-main">
                  <p className="row-title">{r.name}</p>
                  <p className="row-sub">{r.s.approved}/{r.s.due} approved · {plural(r.s.shows, "show")}</p>
                </div>
                <span className="text-[13px] font-semibold">{inr(r.s.pay)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showsInPeriod.length > 0 && (
        <>
          <h3 className="section-label mb-2 mt-6">Shows · {periodLabel(period)}</h3>
          <div className="card overflow-hidden">
            {showsInPeriod.slice(0, 50).map((show) => {
              const s = summarize(periodSlots.filter((x) => x.show.id === show.id));
              return (
                <div key={show.id} className="row">
                  <DateTile date={show.date} />
                  <div className="row-main">
                    <p className="row-title">{show.location}</p>
                    <p className="row-sub">{formatTime(show.time)} · {s.approved}/{s.spots} approved</p>
                  </div>
                  <span className="text-[13px] font-medium">{inr(s.pay)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* Column chart, one or two series. Tap or hover a month to read it. */
function TrendChart({ months, metric, series }) {
  const [active, setActive] = useState(months.length - 1);
  const def = CHART_METRICS.find((m) => m.id === metric);
  const values = series.map((s) => {
    const byMonth = groupBy(s.slots, (slot) => slot.show.date.slice(0, 7));
    return months.map((m) => def.value(summarize(byMonth[s.shift ? shiftMonth(m, s.shift) : m] || [])));
  });
  const max = niceMax(Math.max(1, ...values.flat()));
  const ticks = [max, max / 2, 0];
  const i = Math.min(active, months.length - 1);

  return (
    <div>
      <div className="mb-3 flex min-h-[2.5rem] flex-wrap items-end gap-x-5 gap-y-1">
        <span className="w-full text-xs muted">{monthLabel(months[i])}</span>
        {series.map((s, k) => (
          <span key={k} className="flex items-center gap-1.5 text-[13px]">
            <Swatch color={SERIES_COLORS[k]} />
            <span className="muted">{s.label}{s.shift ? ` (${monthLabel(shiftMonth(months[i], s.shift))})` : ""}</span>
            <span className="font-semibold">{def.format(values[k][i])}</span>
          </span>
        ))}
      </div>
      <div className="trend">
        <div className="trend-axis" aria-hidden="true">
          {ticks.map((t) => <span key={t}>{def.short(t)}</span>)}
        </div>
        <div className="trend-plot" onMouseLeave={() => setActive(months.length - 1)}>
          {ticks.map((t) => <div key={t} className="trend-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
          {months.map((m, idx) => (
            <button
              key={m}
              className={`trend-col ${idx === i ? "trend-col-on" : ""}`}
              onMouseEnter={() => setActive(idx)}
              onFocus={() => setActive(idx)}
              onClick={() => setActive(idx)}
              aria-label={`${monthLabel(m)}: ${series.map((s, k) => `${s.label} ${def.format(values[k][idx])}`).join(", ")}`}
            >
              <span className="trend-bars">
                {series.map((s, k) => (
                  <span key={k} className="trend-bar" style={{ height: `${(values[k][idx] / max) * 100}%`, minHeight: values[k][idx] > 0 ? 2 : 0, background: SERIES_COLORS[k] }} />
                ))}
              </span>
              <span className="trend-label">{fmtDate(`${m}-01`, { month: "short" })}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Delta({ cur, cmp, kind = "count", suffix, compact = false }) {
  if (kind === "rate" && (cur == null || cmp == null)) return <span className="delta">—{suffix ? ` ${suffix}` : ""}</span>;
  const a = Number(cur) || 0;
  const b = Number(cmp) || 0;
  const diff = a - b;
  const Icon = diff > 0 ? CaretUp : CaretDown;
  let text;
  if (diff === 0) text = "No change";
  else if (kind === "rate") text = `${Math.abs(Math.round(diff * 100))} pts`;
  else if (kind === "money") text = inr(Math.abs(diff));
  else text = String(Math.abs(diff));
  const share = kind !== "rate" && b > 0 && diff !== 0 && !compact ? ` (${Math.round((diff / b) * 100)}%)` : "";
  return (
    <span className="delta">
      {diff !== 0 && <Icon size={11} weight="fill" />}
      {text}{share}{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

function Swatch({ color }) {
  return <span className="mr-1.5 inline-block h-2.5 w-2.5 flex-none rounded-[3px] align-baseline" style={{ background: color }} aria-hidden="true" />;
}

function EntityIcon({ dimId, name, size }) {
  if (dimId === "singer" || dimId === "manager") return <Avatar name={name} size={size} />;
  const Icon = dimId === "venue" ? MapPin : UsersThree;
  return <span className={`thumb ${size === "sm" ? "!h-7 !w-7" : ""}`}><Icon size={size === "sm" ? 15 : 18} /></span>;
}

/* ---------- report model ---------- */

const REPORT_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "venue", label: "Venues" },
  { id: "team", label: "Teams" },
  { id: "singer", label: "Singers" },
  { id: "manager", label: "Managers" }
];

// Validated pair (dataviz palette check, light surface): this period, comparison.
const SERIES_COLORS = ["#b0652a", "#2f55a4"];

const CHART_METRICS = [
  { id: "pay", label: "Pay due", value: (s) => s.pay, format: (v) => inr(v), short: (v) => compactInr(v) },
  { id: "shows", label: "Shows", value: (s) => s.shows, format: (v) => String(v), short: (v) => String(Math.round(v)) },
  { id: "approved", label: "Approved", value: (s) => s.approved, format: (v) => String(v), short: (v) => String(Math.round(v)) }
];

function useReportModel() {
  const { shows, users, token, user } = useData();
  const [teamData, setTeamData] = useState(() => readCache(user, "reportTeams"));

  useEffect(() => {
    api("/reports/teams", { token, timeout: 25000 })
      .then((d) => {
        writeCache(user, "reportTeams", d);
        setTeamData(d);
      })
      .catch(() => setTeamData((d) => d || { teams: [], links: [] }));
  }, [token, user]);

  return useMemo(() => {
    const userNames = Object.fromEntries(users.map((u) => [String(u.id), u.name]));
    const teamNames = Object.fromEntries((teamData?.teams || []).map((t) => [String(t.id), t.name]));
    const teamByShow = Object.fromEntries((teamData?.links || []).map((l) => [String(l.show_id), String(l.team_id)]));
    const venueNames = {};
    for (const show of shows) venueNames[showVenueKey(show)] ??= show.location.trim();

    // One row per singer per show: everything is summed from these.
    const slots = shows.flatMap((show) =>
      (show.employee_ids || show.employees.map((e) => e.id)).map((id) => ({
        show,
        singerId: id,
        status: show.attendance.find((a) => a.user_id === id)?.approval_status || null,
        pay: Number(show.employee_pay?.[String(id)]) || 0
      }))
    );

    const dims = {
      venue: { label: "Venues", one: "venue", keyOf: (s) => showVenueKey(s.show), nameOf: (k) => venueNames[k] || k, always: [] },
      team: {
        label: "Teams",
        one: "team",
        keyOf: (s) => teamByShow[String(s.show.id)] || "none",
        nameOf: (k) => (k === "none" ? "No team" : teamNames[k] || "Removed team"),
        always: Object.keys(teamNames)
      },
      singer: {
        label: "Singers",
        one: "singer",
        keyOf: (s) => String(s.singerId),
        nameOf: (k) => userNames[k] || "Former member",
        always: users.filter((u) => u.role === "employee").map((u) => String(u.id))
      },
      manager: {
        label: "Managers",
        one: "manager",
        keyOf: (s) => String(s.show.manager_id),
        nameOf: (k) => userNames[k] || "Former manager",
        always: users.filter((u) => u.role === "manager").map((u) => String(u.id))
      }
    };

    const monthSet = new Set(shows.map((s) => s.date.slice(0, 7)));
    monthSet.add(todayIST().slice(0, 7));
    const months = [...monthSet].sort();
    const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort();

    return { slots, dims, months, years, teamsLoaded: !!teamData };
  }, [shows, users, teamData]);
}

function entityRows(model, dimId, period, cmpPeriod) {
  const dim = model.dims[dimId];
  const cur = groupBy(slotsIn(model.slots, period), dim.keyOf);
  const cmp = cmpPeriod ? groupBy(slotsIn(model.slots, cmpPeriod), dim.keyOf) : {};
  const keys = new Set([...Object.keys(cur), ...Object.keys(cmp), ...dim.always]);
  return [...keys].map((key) => ({
    key,
    name: dim.nameOf(key),
    cur: summarize(cur[key] || []),
    cmp: cmpPeriod ? summarize(cmp[key] || []) : null
  }));
}

function summarize(slots) {
  const shows = new Set();
  const out = { shows: 0, spots: 0, due: 0, marked: 0, approved: 0, rejected: 0, pay: 0, payPlanned: 0, rate: null };
  for (const s of slots) {
    shows.add(s.show.id);
    out.spots += 1;
    out.payPlanned += s.pay;
    if (hasStarted(s.show)) out.due += 1;
    if (s.status) out.marked += 1;
    if (s.status === "rejected") out.rejected += 1;
    if (s.status === "approved") {
      out.approved += 1;
      out.pay += s.pay;
    }
  }
  out.shows = shows.size;
  out.rate = out.due ? out.approved / out.due : null;
  return out;
}

const slotsIn = (slots, period) => (period.kind === "all" ? slots : slots.filter((s) => s.show.date.startsWith(period.value)));
// Saved venues group by id; any show without one falls back to its typed name.
const showVenueKey = (show) => (show.venue_id ? `v${show.venue_id}` : venueKey(show.location));
const venueKey = (location) => String(location || "").trim().toLowerCase().replace(/\s+/g, " ");

function groupBy(list, keyOf) {
  const out = {};
  for (const item of list) (out[keyOf(item)] ||= []).push(item);
  return out;
}

function shiftMonth(month, by) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period, by) {
  if (period.kind === "month") return { kind: "month", value: shiftMonth(period.value, by) };
  if (period.kind === "year") return { kind: "year", value: String(Number(period.value) + by) };
  return period;
}

function comparisonPeriod(period, mode) {
  if (mode === "none" || period.kind === "all") return null;
  if (mode === "prev") return shiftPeriod(period, -1);
  return period.kind === "month" ? shiftPeriod(period, -12) : shiftPeriod(period, -1);
}

const shortMonth = (month) => fmtDate(`${month}-01`, { month: "short", year: "numeric" });
const periodShort = (period) => (period.kind === "month" ? shortMonth(period.value) : periodLabel(period));
const periodLabel = (period) => (period.kind === "month" ? monthLabel(period.value) : period.kind === "year" ? period.value : "All time");

/* The 12 months a chart shows: the chosen year, or the year up to the chosen month. */
function chartMonths(period, dataMonths) {
  // All time: the 12 months up to now (a mistyped far-future show shouldn't stretch it).
  const current = todayIST().slice(0, 7);
  const end = period.kind === "month" ? period.value : period.kind === "year" ? `${period.value}-12` : dataMonths.filter((m) => m <= current).at(-1) || current;
  return Array.from({ length: 12 }, (_, i) => shiftMonth(end, i - 11));
}

function niceMax(value) {
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return step * exp;
}

const pct = (rate) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);
const compactInr = (v) => `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v)}`;

function ExportButton() {
  const { token } = useData();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/export/attendance.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Export failed. Try again.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "sunggeet-attendance.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn btn-secondary" onClick={download} disabled={busy}>
      <DownloadSimple size={16} /> {busy ? "Preparing…" : "Export Excel"}
    </button>
  );
}

/* ==========================================================================
   WEBSITE
   Controls what the public landing page shows: the calendar of gigs, the
   teams, and the floating artists.

   Deliberately does NOT create shows. A manager enters a gig once, in Shows;
   here you add the public-facing fields it doesn't capture and publish it.
   Two places to type a date is how the two versions drift apart.
   ========================================================================== */

const EVENT_TYPES = [
  { value: "cafe", label: "Café" },
  { value: "private", label: "Private event" },
  { value: "community", label: "Community / religious" }
];

function WebsitePage() {
  const { token, user } = useData();
  const [tab, setTab] = useState("calendar");
  const cached = useMemo(() => readCache(user, "website"), [user]);
  const [shows, setShows] = useState(cached?.shows || []);
  const [teams, setTeams] = useState(cached?.teams || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api("/website/data", { token, timeout: 25000 });
      writeCache(user, "website", data);
      setShows(data.shows);
      setTeams(data.teams);
    } catch (err) {
      setError(err.message || "Could not load website data");
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHead title="Website" sub="What the public site shows. Changes go live straight away." />
      <div className="seg mb-4 w-full sm:w-auto" role="group" aria-label="Website section">
        {[
          ["calendar", "Calendar"],
          ["teams", "Teams"],
          ["floaters", "Floating artists"]
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {error && <p className="alert tone-bad mb-4">{error}</p>}

      {tab === "floaters" ? (
        <WebsiteFloaters />
      ) : loading ? (
        <ListSkeleton />
      ) : tab === "calendar" ? (
        <WebsiteCalendar shows={shows} teams={teams} onChanged={load} />
      ) : (
        <WebsiteTeams teams={teams} onChanged={load} />
      )}
    </>
  );
}

function WebsiteCalendar({ shows, teams, onChanged }) {
  const [editing, setEditing] = useState(null);

  return (
    <>
      <section className="card overflow-hidden">
        {shows.length === 0 ? (
          <Empty icon={CalendarBlank} title="No upcoming shows" copy="Create a show in Shows first. This section publishes gigs, it doesn't create them." />
        ) : (
          shows.map((show) => {
            const live = show.website;
            return (
              <button key={show.id} className="row" onClick={() => setEditing(show)}>
                <DateTile date={show.date} />
                <div className="row-main">
                  <p className="row-title">{live?.venue || show.location}</p>
                  <p className="row-sub">
                    {formatTime(show.time)}
                    {live?.city ? ` · ${live.city}` : ""}
                    {show.performers.length > 0 ? ` · ${show.performers.join(", ")}` : ""}
                  </p>
                </div>
                {live?.is_published ? (
                  <Pill tone="ok">Live</Pill>
                ) : live ? (
                  <Pill tone="neutral">Hidden</Pill>
                ) : (
                  <span className="btn btn-secondary btn-sm">Publish</span>
                )}
              </button>
            );
          })
        )}
      </section>

      {editing && (
        <PublishSheet
          show={editing}
          teams={teams}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

function PublishSheet({ show, teams, onClose, onSaved }) {
  const { token } = useData();
  const { toast, confirm } = useUI();
  const live = show.website || {};
  const [form, setForm] = useState({
    venue: live.venue || show.location || "",
    city: live.city || "",
    event_type: live.event_type || "cafe",
    set_name: live.set_name || "",
    note: live.note || "",
    ticket_url: live.ticket_url || "",
    poster_url: live.poster_url || "",
    team_id: live.team_id || "",
    is_published: live.is_published !== false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.city.trim()) return setError("Add the city.");
    setSaving(true);
    setError("");
    try {
      await api(`/website/shows/${show.id}`, { token, method: "PUT", body: form });
      toast(form.is_published ? "Published to the website" : "Saved (hidden from the website)");
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save");
      setSaving(false);
    }
  };

  const unpublish = async () => {
    const ok = await confirm({ title: "Remove from the website?", body: `"${show.location}" disappears from the public calendar. The show itself stays.`, confirmLabel: "Remove", danger: true });
    if (!ok) return;
    try {
      await api(`/website/shows/${show.id}`, { token, method: "DELETE" });
      toast("Removed from the website");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <Sheet
      title={show.website ? "Edit listing" : "Publish show"}
      subtitle={`${longDate(show.date)} · ${formatTime(show.time)}`}
      onClose={onClose}
      footer={
        <>
          {show.website && (
            <button className="btn btn-danger !flex-none" onClick={unpublish} aria-label="Remove from website">
              <Trash size={17} /> <span className="hidden sm:inline">Remove</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <p className="alert tone-neutral mb-4">Date, time and performers come from the show. Change those in Shows.</p>
      <div className="form-grid">
        <Field label="Venue name shown publicly">
          <input className="input" value={form.venue} onChange={set("venue")} placeholder={show.location} />
        </Field>
        <div className="form-grid form-grid-2">
          <Field label="City">
            <input className="input" value={form.city} onChange={set("city")} placeholder="New Delhi" />
          </Field>
          <Field label="Event type">
            <select className="input" value={form.event_type} onChange={set("event_type")}>
              {EVENT_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="Team playing">
            <select className="input" value={form.team_id} onChange={set("team_id")}>
              <option value="">None</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Set name">
            <input className="input" value={form.set_name} onChange={set("set_name")} placeholder="Jazz standards" />
          </Field>
        </div>
        <Field label="Note">
          <input className="input" value={form.note} onChange={set("note")} placeholder="Two sets, no cover." />
        </Field>
        <Field label="Ticket link">
          <input className="input" type="url" inputMode="url" value={form.ticket_url} onChange={set("ticket_url")} placeholder="https://…" />
        </Field>
        <MediaUpload
          kind="image"
          label="Poster"
          hint="Portrait artwork, roughly 3:4. Without one the card uses a typographic design."
          value={null}
          url={form.poster_url}
          onChange={({ url }) => setForm((prev) => ({ ...prev, poster_url: url || "" }))}
        />
        <Toggle
          label="Visible on the website"
          hint="Turn off to keep the details but hide the listing."
          checked={form.is_published}
          onChange={(v) => setForm((f) => ({ ...f, is_published: v }))}
        />
      </div>
      {error && <p className="alert tone-bad mt-4">{error}</p>}
    </Sheet>
  );
}

function WebsiteTeams({ teams, onChanged }) {
  const [editing, setEditing] = useState(null); // team | "new"

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button className="btn btn-secondary" onClick={() => setEditing("new")}><Plus size={16} /> Add team</button>
      </div>
      <section className="card overflow-hidden">
        {teams.length === 0 ? (
          <Empty icon={UsersThree} title="No teams yet" copy="Teams appear as cards on the public site." />
        ) : (
          teams.map((team) => (
            <button key={team.id} className="row" onClick={() => setEditing(team)}>
              <span className="thumb">
                {team.photo_url ? <img src={resolveMedia(null, team.photo_url)} alt="" /> : <Image size={18} />}
              </span>
              <div className="row-main">
                <p className="row-title">{team.name}</p>
                <p className="row-sub">
                  {team.tagline || (team.members.length ? team.members.map((m) => m.name).join(", ") : "No members listed")}
                </p>
              </div>
              {team.is_active ? <Pill tone="ok">Live</Pill> : <Pill tone="neutral">Hidden</Pill>}
            </button>
          ))
        )}
      </section>

      {editing && (
        <TeamSheet
          team={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

function TeamSheet({ team, onClose, onSaved }) {
  const { token } = useData();
  const { toast } = useUI();
  const [form, setForm] = useState({
    name: team?.name || "",
    tagline: team?.tagline || "",
    blurb: team?.blurb || "",
    photo_url: team?.photo_url || "",
    video_url: team?.video_url || "",
    is_active: team?.is_active !== false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return setError("Give the team a name.");
    setSaving(true);
    setError("");
    try {
      if (team) await api(`/website/teams/${team.id}`, { token, method: "PUT", body: form });
      else await api("/website/teams", { token, method: "POST", body: form });
      toast(team ? "Team saved" : "Team added");
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save");
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={team ? team.name : "Add team"}
      subtitle={team?.members?.length ? team.members.map((m) => `${m.name} (${m.role})`).join(", ") : undefined}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={form.name} onChange={set("name")} placeholder="The Tuesday Trio" />
        </Field>
        <Field label="Tagline">
          <input className="input" value={form.tagline} onChange={set("tagline")} placeholder="The open-jam house band" />
        </Field>
        <Field label="Blurb">
          <textarea className="input" rows={3} value={form.blurb} onChange={set("blurb")} />
        </Field>
        <MediaUpload
          kind="image"
          label="Team photo"
          hint="Shown on the team card."
          value={null}
          url={form.photo_url}
          onChange={({ url }) => setForm((prev) => ({ ...prev, photo_url: url || "" }))}
        />
        <Field label="Showreel link">
          <input className="input" inputMode="url" value={form.video_url} onChange={set("video_url")} placeholder="https://…" />
        </Field>
        {team && (
          <Toggle label="Show this team on the website" checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
        )}
      </div>
      {error && <p className="alert tone-bad mt-4">{error}</p>}
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
   WEBSITE → FLOATING ARTISTS
   The cut-outs that drift around the public landing page and sing when
   tapped. Everything here is swappable without a deploy.
   -------------------------------------------------------------------------- */

function WebsiteFloaters() {
  const { token, user } = useData();
  const cached = useMemo(() => readCache(user, "floaters"), [user]);
  const [floaters, setFloaters] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [editing, setEditing] = useState(null); // floater | "new"
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/website/floaters", { token, timeout: 25000 });
      writeCache(user, "floaters", data.floaters || []);
      setFloaters(data.floaters || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load floating artists");
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] muted">These drift around the top of the landing page. Tapping one plays their clip.</p>
        <button className="btn btn-secondary" onClick={() => setEditing("new")}><Plus size={16} /> Add artist</button>
      </div>

      {error && <p className="alert tone-bad mb-3">{error}</p>}

      {loading ? (
        <ListSkeleton />
      ) : floaters.length === 0 ? (
        <section className="card">
          <Empty icon={MusicNotes} title="No artists yet" copy="Add one and they'll appear on the landing page." />
        </section>
      ) : (
        <div className="floater-grid">
          {floaters.map((f) => (
            <button key={f.id} type="button" className="card floater-card" onClick={() => setEditing(f)}>
              <div className="upload-thumb">
                {f.image_id || f.image_url ? <img src={resolveMedia(f.image_id, f.image_url)} alt={f.name} /> : <span>No image</span>}
              </div>
              <div className="flex items-start justify-between gap-2 p-2.5">
                <div className="min-w-0">
                  <p className="row-title text-[13px]">{f.name}</p>
                  <p className="row-sub !text-xs">{f.role || "—"}</p>
                </div>
                {f.is_active ? <Pill tone="ok">Live</Pill> : <Pill tone="neutral">Off</Pill>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <FloaterSheet
          floater={editing === "new" ? null : editing}
          nextSort={floaters.length}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function FloaterSheet({ floater, nextSort, onClose, onSaved }) {
  const { token } = useData();
  const { toast, confirm } = useUI();
  const [form, setForm] = useState({
    name: floater?.name || "",
    role: floater?.role || "",
    image_id: floater?.image_id || null,
    image_url: floater?.image_url || null,
    audio_id: floater?.audio_id || null,
    audio_url: floater?.audio_url || null,
    sort_order: floater?.sort_order ?? nextSort,
    is_active: floater?.is_active ?? true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const save = async () => {
    if (!form.name.trim()) return setError("Give them a name.");
    setSaving(true);
    setError("");
    try {
      if (floater) await api(`/website/floaters/${floater.id}`, { token, method: "PUT", body: form, timeout: 25000 });
      else await api("/website/floaters", { token, method: "POST", body: form, timeout: 25000 });
      toast(floater ? "Artist saved" : "Artist added");
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save");
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: `Remove ${form.name}?`, body: "They'll disappear from the landing page.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/website/floaters/${floater.id}`, { token, method: "DELETE", timeout: 25000 });
      toast(`${form.name} removed`);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not remove");
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={floater ? floater.name : "Add artist"}
      onClose={onClose}
      footer={
        <>
          {floater && (
            <button className="btn btn-danger !flex-none" onClick={remove} disabled={saving} aria-label="Remove artist">
              <Trash size={17} /> <span className="hidden sm:inline">Remove</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Name">
            <input className="input" value={form.name} onChange={set("name")} placeholder="Aditya" />
          </Field>
          <Field label="Plays">
            <input className="input" value={form.role} onChange={set("role")} placeholder="vocals, guitar" />
          </Field>
        </div>
        <MediaUpload
          kind="image"
          label="Cut-out"
          hint="Best as the artist alone on a transparent background. Any photo works."
          value={form.image_id}
          url={form.image_url}
          onChange={({ id, url }) => setForm((p) => ({ ...p, image_id: id, image_url: url }))}
        />
        <MediaUpload
          kind="audio"
          label="Clip"
          hint="10-15 seconds is ideal (MP3 or M4A, up to 3MB). Plays when someone taps them."
          value={form.audio_id}
          url={form.audio_url}
          onChange={({ id, url }) => setForm((p) => ({ ...p, audio_id: id, audio_url: url }))}
        />
        <Field label="Order" hint="Lower numbers appear first.">
          <input className="input" type="number" inputMode="numeric" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))} />
        </Field>
        <Toggle label="Show on the landing page" checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
      </div>
      {error && <p className="alert tone-bad mt-4">{error}</p>}
    </Sheet>
  );
}

/* ==========================================================================
   MEDIA UPLOAD

   Picks a file off the device, shrinks it in the browser, and stores it in the
   website database, so a phone photo becomes a live image in two taps.
   ========================================================================== */

const MEDIA_BASE = API_URL.replace(/\/api$/, "");
const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || "https://sungeet-main.vercel.app";

/**
 * Where to load a stored asset from while editing.
 *
 * Uploads are saved against the PUBLIC site's URL shape ("/api/media?id=…"),
 * because that is what the landing page will request. The admin is a different
 * origin, so rewrite that to this app's own media route for the preview.
 * Anything else (a pasted external URL, a file in /public) is used as-is.
 */
function resolveMedia(id, url) {
  if (id) return `${MEDIA_BASE}/api/media/${id}`;
  if (!url) return "";
  const match = /^\/api\/media\?id=([0-9a-f-]{36})$/i.exec(url);
  if (match) return `${MEDIA_BASE}/api/media/${match[1]}`;
  // A root path like "/singers/aditya.webp" is a file in the public site's
  // /public folder, which this app doesn't have.
  return url.startsWith("/") ? `${PUBLIC_SITE_URL}${url}` : url;
}

/** The canonical path the public site will fetch an upload from. */
const publicMediaUrl = (id) => `/api/media?id=${id}`;

/** Downscale and re-encode in the browser so we upload ~100KB, not ~5MB. */
async function compressImage(file, maxEdge = 1000) {
  // SVG has no raster size to scale, and re-encoding would rasterise it.
  if (file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // WebP keeps the alpha channel, which matters: artist cut-outs are
  // transparent PNGs and JPEG would fill the background with black.
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
}

// Must match MEDIA_MAX_BYTES on the server (Vercel's 4.5MB body cap, after base64).
const MEDIA_MAX_MB = 3;
const MEDIA_ACCEPT = {
  image: "image/png,image/jpeg,image/webp,image/gif",
  audio: "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg"
};
// Some browsers leave file.type empty for .m4a/.aac; the server needs a type.
const EXT_MIME = { mp3: "audio/mpeg", m4a: "audio/x-m4a", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg" };
const mimeOf = (file) => file.type || EXT_MIME[file.name.split(".").pop().toLowerCase()] || "";

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });

/**
 * One upload control. `value` is a media id (or null); `url` is the legacy
 * URL fallback so existing rows keep working.
 */
function MediaUpload({ kind, value, url, onChange, label, hint }) {
  const { token } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const preview = resolveMedia(value, url);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const prepared = kind === "image" ? await compressImage(file) : file;
      if (prepared.size > MEDIA_MAX_MB * 1024 * 1024) {
        throw new Error(
          `That file is ${(prepared.size / 1024 / 1024).toFixed(1)}MB; the limit is ${MEDIA_MAX_MB}MB.` +
            (kind === "audio" ? " Trim the clip or export it as MP3." : "")
        );
      }
      const data = await fileToBase64(prepared);
      const result = await api("/website/media", {
        token,
        method: "POST",
        timeout: 45000,
        body: { kind, mime: mimeOf(prepared), filename: prepared.name, data }
      });
      onChange({ id: result.id, url: publicMediaUrl(result.id) });
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload">
      <div className="upload-head">
        <span className="upload-label">{label}</span>
        {preview && (
          <button type="button" className="upload-clear" onClick={() => onChange({ id: null, url: null })}>
            Remove
          </button>
        )}
      </div>
      <div className="upload-body">
        {kind === "image" ? (
          <div className="upload-thumb">{preview ? <img src={preview} alt="" /> : <span>No image</span>}</div>
        ) : (
          <div className="upload-audio">
            {preview ? <audio controls src={preview} preload="none" /> : <span className="text-xs subtle">No clip yet</span>}
          </div>
        )}
        <div className="upload-actions">
          <input ref={inputRef} type="file" accept={MEDIA_ACCEPT[kind]} onChange={handleFile} hidden />
          <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : preview ? "Replace" : `Choose ${kind === "image" ? "image" : "clip"}`}
          </button>
          {hint && <p className="upload-hint">{hint}</p>}
        </div>
      </div>
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}

/* ==========================================================================
   SHARED UI PIECES
   ========================================================================== */

function Sheet({ title, subtitle, onClose, footer, children, flush = false }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <>
      <div className="scrim" onClick={() => closeRef.current()} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 className="sheet-title truncate">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] muted">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={() => closeRef.current()} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className={flush ? "sheet-body !p-0" : "sheet-body"}>{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </>,
    document.body
  );
}

function PageHead({ title, sub, actions }) {
  return (
    <div className="page-head">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs muted">{hint}</span>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Pill({ tone = "neutral", plain = false, className = "", children }) {
  return <span className={`pill tone-${tone} ${plain ? "pill-plain" : ""} ${className}`}>{children}</span>;
}

const AVATAR_TONES = [
  ["#f8ecdf", "#8a4c1d"],
  ["#e6eefb", "#2f55a4"],
  ["#e5f4ea", "#13703f"],
  ["#f2e9f8", "#74378a"],
  ["#fdebe1", "#a4471b"],
  ["#e3f2f1", "#1d6766"],
  ["#eeede8", "#3b3934"],
  ["#fbebf1", "#9b2c55"]
];

function Avatar({ name = "", size }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [bg, fg] = AVATAR_TONES[hash % AVATAR_TONES.length];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ""}`} style={{ background: bg, color: fg }} aria-hidden="true">
      {initials}
    </span>
  );
}

function Kpi({ label, value, foot }) {
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {foot && <p className="kpi-foot">{foot}</p>}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs muted">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}

function DateTile({ date }) {
  return (
    <span className="date-tile">
      <b>{fmtDate(date, { day: "numeric" })}</b>
      <span>{fmtDate(date, { month: "short" })}</span>
    </span>
  );
}

function MonthStepper({ months, value, onChange, format = monthLabel }) {
  const index = months.indexOf(value);
  return (
    <div className="stepper">
      <button onClick={() => onChange(months[index - 1])} disabled={index <= 0} aria-label="Previous month">
        <CaretLeft size={16} weight="bold" />
      </button>
      <span>{format(value)}</span>
      <button onClick={() => onChange(months[index + 1])} disabled={index >= months.length - 1} aria-label="Next month">
        <CaretRight size={16} weight="bold" />
      </button>
    </div>
  );
}

function Empty({ icon: Icon, title, copy, action }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <p className="font-semibold">{title}</p>
      {copy && <p className="max-w-xs text-[13px] muted">{copy}</p>}
      {action}
    </div>
  );
}

function LoadError() {
  const { refresh, error, loading } = useData();
  return (
    <section className="card">
      <Empty
        icon={WarningCircle}
        title="Couldn't load your workspace"
        copy={
          <>
            Check your connection and try again.
            {error && <span className="mt-2 block text-xs subtle">Details: {error}</span>}
          </>
        }
        action={
          <button className="btn btn-secondary btn-sm mt-3" onClick={() => refresh()} disabled={loading}>
            {loading ? "Trying…" : "Try again"}
          </button>
        }
      />
    </section>
  );
}

function ListSkeleton({ rows = 4 }) {
  return (
    <div className="card overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row">
          <div className="skeleton h-9 w-9" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-5 space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-40" />
      </div>
      <div className="kpis mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="kpi space-y-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-12" />
          </div>
        ))}
      </div>
      <ListSkeleton />
    </div>
  );
}

function Logo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1.5" y="6" width="2" height="4" rx="1" />
      <rect x="5" y="3" width="2" height="10" rx="1" />
      <rect x="8.5" y="4.5" width="2" height="7" rx="1" />
      <rect x="12" y="6.5" width="2" height="3" rx="1" />
    </svg>
  );
}

function useScrolled(threshold = 28) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/* ==========================================================================
   DOMAIN HELPERS
   ========================================================================== */

const IST = "Asia/Kolkata";
const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date());

// Shows are in India time, whatever the device's timezone.
const showStart = (show) => new Date(`${show.date}T${show.time}:00+05:30`);
const hasStarted = (show) => showStart(show) <= new Date();

/* For a singer the API only returns their own attendance entry. */
const readyToMark = (show) => hasStarted(show) && show.attendance.length === 0;


/** Every attendance entry still waiting on a decision, newest show first. */
function pendingEntries(shows) {
  return shows
    .flatMap((show) => show.attendance.filter((a) => a.approval_status === "pending").map((entry) => ({ show, entry })))
    .sort((a, b) => showStart(b.show) - showStart(a.show));
}

function staffState(show) {
  if (!hasStarted(show)) return { tone: "info", label: "Upcoming" };
  const pending = show.attendance.filter((a) => a.approval_status === "pending").length;
  if (pending) return { tone: "warn", label: `${pending} to review` };
  const total = show.employees.length;
  const approved = show.attendance.filter((a) => a.approval_status === "approved").length;
  if (total && approved === total) return { tone: "ok", label: "Complete" };
  return { tone: "neutral", label: `${show.attendance.length}/${total} marked` };
}

function singerState(show) {
  const entry = show.attendance[0];
  if (entry) {
    return {
      approved: { tone: "ok", label: "Approved" },
      rejected: { tone: "bad", label: "Rejected" },
      pending: { tone: "warn", label: "Awaiting approval" }
    }[entry.approval_status] || { tone: "neutral", label: entry.approval_status };
  }
  if (!hasStarted(show)) return { tone: "info", label: "Upcoming" };
  return { tone: "brand", label: "Ready to mark", canMark: true };
}

// This month if it has shows, otherwise the latest month (shows arrive oldest-first).
function defaultMonth(shows) {
  const current = todayIST().slice(0, 7);
  if (shows.some((s) => s.date.startsWith(current))) return current;
  return shows.at(-1)?.date.slice(0, 7) || current;
}

function groupByDate(shows) {
  return shows.reduce((groups, show) => {
    groups[show.date] = groups[show.date] || [];
    groups[show.date].push(show);
    return groups;
  }, {});
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: IST }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// Dates are calendar days; format them in UTC so the device timezone can't shift them.
const fmtDate = (date, options) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...options }).format(new Date(`${date}T00:00:00Z`));
const longDate = (date) => fmtDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const monthLabel = (month) => fmtDate(`${month}-01`, { month: "long", year: "numeric" });

function dayLabel(date) {
  const diff = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${todayIST()}T00:00:00Z`)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtDate(date, { weekday: "short", day: "numeric", month: "short" });
}

function fmtStamp(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatTime(time) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(`2026-03-19T${time}:00`));
}

// ₹1,23,456.00 — Indian digit grouping.
const inr = (amount) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);

/** Retry once after a timeout or dropped connection (not after a real error reply). */
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status) throw err;
    await new Promise((r) => setTimeout(r, 800));
    return fn();
  }
}

/* Last-seen data, per user, so screens paint instantly on the next visit.
   Bump the version when the shape of cached data changes. Cleared on logout. */
const CACHE_PREFIX = "sunggeet-cache:v1:";
const cacheKey = (user, name) => `${CACHE_PREFIX}${user.id}:${name}`;

function readCache(user, name) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(user, name)));
  } catch {
    return null;
  }
}

function writeCache(user, name, value) {
  try {
    localStorage.setItem(cacheKey(user, name), JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the app still works, just uncached.
  }
}

function clearCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // Nothing to clear.
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  // 8s suits the warm endpoints. Anything touching the website database needs
  // longer, because that Neon project auto-suspends and a cold start alone can
  // take several seconds.
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: "Request failed" }));
      throw Object.assign(new Error(body.message || "Request failed"), { status: response.status });
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. The server is taking too long to respond.");
    }
    throw err;
  }
}

createRoot(document.getElementById("root")).render(
  <UIProvider>
    <App />
  </UIProvider>
);
