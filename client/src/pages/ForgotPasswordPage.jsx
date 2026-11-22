import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Alert, Spinner } from "../components/UI";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post("/api/auth/forgot-password", { email });
      setMessage(response.data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't request a password reset."));
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-12">
    <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <div className="mb-6 grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700"><Mail size={21} /></div>
      <p className="text-sm font-semibold text-forest-600">Account recovery</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-sm text-slate-500">Enter the email address you use to sign in. If it matches an account, we’ll send a reset link.</p>
      <Alert className="mt-6">{error}</Alert>
      <Alert className="mt-6" kind="success">{message}</Alert>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-semibold text-slate-700">Email address
          <input className="field mt-2" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="button-primary w-full" disabled={busy}>{busy ? <Spinner /> : "Send reset link"}</button>
      </form>
      <Link to="/login" className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft size={16} /> Back to sign in</Link>
    </section>
  </main>;
}
