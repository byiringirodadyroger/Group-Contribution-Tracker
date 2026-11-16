import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2 } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Alert, Spinner } from "../components/UI";
import PasswordInput from "../components/PasswordInput";

export default function RegisterPage() {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ name: "", username: "", password: "", memberId: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/auth/registration-options")
      .then(({ data }) => setMembers(data.members || data))
      .catch(() => setError("Unable to load available member profiles. Please try again later."));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/register", form);
      setDone(true);
    } catch (e) {
      setError(getErrorMessage(e, "Unable to submit your access request."));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="grid min-h-screen place-items-center px-5"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-forest-50 text-forest-600"><CheckCircle2 size={28} /></span><h1 className="mt-5 text-2xl font-bold">Account created</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your new account, then send an access request to Roger. Your group data remains locked until approval.</p><Link className="button-primary mt-7 w-full" to="/login">Continue to sign in</Link>
  </div></div>;

  return <div className="grid min-h-screen bg-white lg:grid-cols-[.9fr_1.1fr]">
    <section className="flex flex-col justify-between bg-forest-900 p-8 text-white sm:p-12"><Link to="/login" className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Activity size={23} /></span><span className="font-bold">Group Fund</span></Link><div className="my-12 max-w-lg"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Join your group</p><h1 className="mt-4 text-4xl font-bold leading-tight">Request access to the shared tracker.</h1><p className="mt-4 leading-7 text-emerald-50/75">Choose your member profile and create an account. The administrator will review and approve your request.</p></div><p className="text-xs text-emerald-50/50">Your account remains locked until approved.</p></section>
    <section className="flex items-center justify-center px-5 py-10"><div className="w-full max-w-[440px]">
      <p className="text-sm font-semibold text-forest-600">Member account</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Create your account</h2><p className="mt-2 text-sm text-slate-500">After signing in, send an access request to Roger. Your details are shared only with the group administrator.</p>
      <Alert>{error}</Alert>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-slate-700">Your name<input className="field mt-2" autoComplete="name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block text-sm font-semibold text-slate-700">Group member profile<select className="field mt-2" required value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}><option value="">Select your name</option>{members.map((m) => <option key={m._id || m.id} value={m._id || m.id}>{m.name}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-700">Username<input className="field mt-2" autoComplete="username" required minLength={3} maxLength={32} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label className="block text-sm font-semibold text-slate-700">Password<PasswordInput className="field mt-2 pr-12" autoComplete="new-password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><span className="mt-1 block text-xs font-normal text-slate-400">Use at least 10 characters.</span></label>
        <button className="button-primary mt-2 w-full" disabled={busy}>{busy ? <Spinner /> : "Submit approval request"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">Already have access? <Link to="/login" className="font-semibold text-forest-700 hover:underline">Sign in</Link></p>
    </div></section>
  </div>;
}
