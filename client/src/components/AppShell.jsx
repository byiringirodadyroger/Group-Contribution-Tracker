import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Activity, CircleUserRound, CreditCard, LayoutDashboard, LogOut, Menu, Moon, Settings, ShieldCheck, Sun, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const baseLinks = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/members", label: "Members", icon: Users },
  { to: "/payments", label: "Payment history", icon: CreditCard }
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => window.localStorage.getItem("group-fund-theme") === "dark" ? "dark" : "light");
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();
  const links = [...baseLinks, ...(user?.role === "admin" ? [{ to: "/admin", label: "Administration", icon: ShieldCheck }] : [])];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("group-fund-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    if (loggingOut) return;
    setLogoutError("");
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setLogoutError("Could not sign out. Check your connection and try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    {open && <button aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-6">
        <Link to="/" aria-label="Group Fund overview" title="Go to overview" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-600 text-white"><Activity size={21} /></span>
          <span><span className="block text-sm font-bold leading-tight">Group Fund</span><span className="text-xs text-slate-500">Contribution tracker</span></span>
        </Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Main navigation">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Workspace</p>
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-forest-50 text-forest-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
          <Icon size={18} />{label}
        </NavLink>)}
        {user?.role === "admin" && <NavLink to="/payments/new" onClick={() => setOpen(false)} className={({ isActive }) => `mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-forest-50 text-forest-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
          <CreditCard size={18} />Record contribution
        </NavLink>}
        <div className="!mt-7 border-t border-slate-100 pt-4">
          <NavLink to="/settings" onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-forest-50 text-forest-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
            <Settings size={18} />Account settings
          </NavLink>
        </div>
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-700"><CircleUserRound size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user?.name}</span><span className="text-xs capitalize text-slate-500">{user?.role || "member"}</span></span>
        </div>
        <button type="button" onClick={handleLogout} disabled={loggingOut} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60">
          <LogOut size={16} />{loggingOut ? "Signing out..." : "Sign out"}
        </button>
        {logoutError && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{logoutError}</p>}
      </div>
    </aside>
    <div className="lg:pl-[260px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur sm:px-8">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={21} /></button>
        <div className="hidden text-sm text-slate-500 sm:block">Shared group contributions <span className="mx-1.5 text-slate-300">/</span><span className="text-slate-800">RWF</span></div>
        <div className="ml-auto flex items-center gap-3 text-sm"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-forest-500" /><span className="text-slate-600">Group workspace</span></span><button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} aria-pressed={theme === "dark"} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button></div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-9">{children}</main>
    </div>
  </div>;
}
