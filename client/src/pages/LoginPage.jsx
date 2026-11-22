import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowRight, LockKeyhole } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Spinner } from "../components/UI";
import PasswordInput from "../components/PasswordInput";
import { getErrorMessage } from "../api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState(params.get("status") === "pending"
    ? "Your account is awaiting administrator approval. You can sign in once it has been approved."
    : params.get("status") === "password-reset" ? "Your password was reset. Sign in with your new password." : "");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const signedInUser = await login(form);
      navigate(signedInUser.status && signedInUser.status !== "active" ? "/access" : "/");
    } catch (e) {
      setError(getErrorMessage(e, "We couldn't sign you in."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-forest-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-32 -top-32 h-[440px] w-[440px] rounded-full border border-white/10" />
      <div className="absolute -right-20 -top-20 h-[320px] w-[320px] rounded-full border border-white/10" />
      <Link to="/login" className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Activity size={23} /></span><span className="font-bold">Group Fund</span></Link>
      <div className="relative max-w-lg pb-12"><p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Together, on track</p><h1 className="text-5xl font-bold leading-[1.1] tracking-tight">Every contribution moves us forward.</h1><p className="mt-5 max-w-md text-base leading-7 text-emerald-50/75">A shared, transparent space to follow your group's progress toward its goal.</p></div>
      <p className="relative text-xs text-emerald-50/50">Secure group workspace · RWF</p>
    </section>
    <section className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-600 text-white"><Activity size={23} /></span></div>
        <p className="text-sm font-semibold text-forest-600">Welcome back</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Sign in to your account</h2>        <p className="mt-2 text-sm text-slate-500">Sign in to your group account. New members can request access after creating an account.</p>
        <Alert className="mt-6" kind={params.get("status") === "password-reset" ? "success" : "error"}>{error}</Alert>
        <form className="mt-7 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-700">Username or email address<input className="field mt-2" autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label className="block text-sm font-semibold text-slate-700"><span className="flex items-center justify-between">Password<Link to="/forgot-password" className="text-xs font-semibold text-forest-700 hover:underline">Forgot password?</Link></span><div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3 text-slate-400" size={17} /><PasswordInput className="field pl-10 pr-12" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div></label>
          <button className="button-primary w-full" disabled={busy}>{busy ? <Spinner /> : <>Sign in <ArrowRight size={17} /></>}</button>
        </form>
        <p className="mt-7 text-center text-sm text-slate-500">New to this group? <Link to="/register" className="font-semibold text-forest-700 hover:underline">Create a member account</Link></p>
        <p className="mt-12 text-center text-xs text-slate-400">Group features unlock after administrator approval.</p>
      </div>
    </section>
  </div>;
}
