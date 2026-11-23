import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Spinner } from "../components/UI";
import PasswordInput from "../components/PasswordInput";
import { getErrorMessage } from "../api";
import groupPeople from "../assets/group-people.svg";

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

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-forest-900 via-[#0d3325] to-[#0b251d] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full border border-white/[0.08]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full border border-white/[0.08]" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 h-[480px] w-[480px] rounded-full bg-emerald-300/[0.04] blur-3xl" />

        <Link to="/login" className="relative flex w-fit items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.08]">
            <Activity size={22} />
          </span>
          <span className="text-lg font-bold tracking-tight">Group Fund</span>
        </Link>

        <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-16">
          <span className="mb-6 w-fit rounded-full border border-emerald-200/20 bg-emerald-200/[0.08] px-3 py-1.5 text-xs font-semibold tracking-wide text-emerald-100">
            GROUP CONTRIBUTION TRACKER
          </span>
          <h1 className="max-w-lg text-4xl font-bold leading-[1.08] tracking-tight xl:text-5xl">
            Stronger together.
            <span className="mt-2 block text-emerald-300">Progress you can see.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-emerald-50/75">
            A secure, transparent space to follow your group's contributions and stay on track toward your shared goal.
          </p>

          <div className="mt-10 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.08] text-emerald-200">
              <ShieldCheck size={21} />
            </span>
            <div>
              <p className="text-sm font-semibold">Your group, all in one place</p>
              <p className="mt-0.5 text-xs text-emerald-50/60">Private access for approved members</p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-emerald-50/50">Secure group workspace <span aria-hidden="true">·</span> RWF</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-[460px] rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-forest-900/[0.04] sm:p-9">
          <Link to="/login" className="mb-8 flex w-fit items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-600 text-white">
              <Activity size={21} />
            </span>
            <span className="font-bold tracking-tight text-slate-900">Group Fund</span>
          </Link>

          <div className="mb-7 flex items-center gap-4 rounded-2xl border border-forest-100 bg-forest-50 p-3">
            <img src={groupPeople} alt="A group of members standing together" className="h-20 w-32 shrink-0 rounded-xl object-cover" />
            <p className="text-sm font-semibold leading-6 text-forest-700">One group. Shared goals. Progress together.</p>
          </div>

          <p className="text-sm font-semibold text-forest-600">Welcome back</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Sign in to your account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter your member account details to continue.
          </p>

          <Alert className="mt-6" kind={params.get("status") === "password-reset" ? "success" : "error"}>{error}</Alert>

          <form className="mt-7 space-y-5" onSubmit={submit}>
            <label className="block text-sm font-semibold text-slate-700">
              Username or email address
              <span className="relative mt-2 block">
                <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden="true" />
                <input
                  className="field pl-10"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </span>
            </label>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <span className="relative mt-2 block">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden="true" />
                <PasswordInput
                  id="login-password"
                  className="field pl-10 pr-12"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </span>
              <div className="mt-2 flex justify-end">
                <Link to="/forgot-password" className="text-xs font-semibold text-forest-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button className="button-primary min-h-12 w-full rounded-xl shadow-sm transition hover:shadow-md" disabled={busy} type="submit">
              {busy ? <><Spinner /> Signing in...</> : <>Sign in <ArrowRight size={17} /></>}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            New to this group? <Link to="/register" className="font-semibold text-forest-700 hover:underline">Create a member account</Link>
          </p>
          <p className="mt-8 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">
            Group features unlock after administrator approval.
          </p>
        </div>
      </section>
    </main>
  );
}
