import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../api";
import { Alert, Card, PageHeader, Spinner } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.newPassword !== form.confirmPassword) return setError("New passwords do not match.");
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setMessage("Password changed. Please sign in again.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      await refreshUser();
      navigate("/login");
    } catch (e) {
      setError(getErrorMessage(e, "Unable to change your password."));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow="Your account" title="Account settings" description="Manage your sign-in details and account security." />
    <div className="grid max-w-4xl gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Card><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700"><KeyRound size={20} /></span><div><h2 className="font-bold">Profile</h2><p className="text-xs text-slate-500">Your group account</p></div></div><dl className="mt-6 space-y-4 text-sm"><div><dt className="text-slate-500">Name</dt><dd className="mt-1 font-semibold">{user?.name}</dd></div><div><dt className="text-slate-500">Username</dt><dd className="mt-1 font-semibold">{user?.username}</dd></div><div><dt className="text-slate-500">Role</dt><dd className="mt-1 font-semibold capitalize">{user?.role || "member"}</dd></div></dl></Card>
      <Card><h2 className="font-bold">Change password</h2><p className="mt-1 text-sm text-slate-500">Use a unique password with at least 10 characters.</p><div className="mt-5"><Alert>{error}</Alert><Alert kind="success">{message}</Alert></div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="field-label">Current password<PasswordInput className="field mt-2 pr-12" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></label>
          <label className="field-label">New password<PasswordInput className="field mt-2 pr-12" autoComplete="new-password" required minLength="10" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></label>
          <label className="field-label">Confirm new password<PasswordInput className="field mt-2 pr-12" autoComplete="new-password" required minLength="10" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></label>
          <button className="button-primary" disabled={busy}>{busy ? <Spinner /> : "Update password"}</button>
        </form>
      </Card>
    </div>
  </>;
}
