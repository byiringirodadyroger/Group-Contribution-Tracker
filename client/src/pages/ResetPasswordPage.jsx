import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Alert, Spinner } from "../components/UI";
import PasswordInput from "../components/PasswordInput";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/auth/reset-password", { token, newPassword: password });
      window.location.assign("/login?status=password-reset");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't reset your password."));
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-12">
    <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <div className="mb-6 grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700"><KeyRound size={21} /></div>
      <p className="text-sm font-semibold text-forest-600">Account recovery</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-slate-500">Your password must be 10-128 characters.</p>
      <Alert className="mt-6">{error}</Alert>
      {!token ? <div className="mt-7 text-sm text-slate-600">This reset link is invalid or incomplete.</div> : <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-semibold text-slate-700">New password
          <PasswordInput className="field mt-2" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Confirm new password
          <PasswordInput className="field mt-2" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
        <button className="button-primary w-full" disabled={busy}>{busy ? <Spinner /> : "Reset password"}</button>
      </form>}
      <Link to="/forgot-password" className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft size={16} /> Request another reset link</Link>
    </section>
  </main>;
}
