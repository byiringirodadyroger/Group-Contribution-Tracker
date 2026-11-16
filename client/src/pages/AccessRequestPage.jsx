import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, LogOut, ShieldCheck } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { useAuth } from "../context/AuthContext";
import { Alert, Spinner } from "../components/UI";

export default function AccessRequestPage() {
  const { user, loading, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (loading) return <div className="grid min-h-screen place-items-center text-forest-600"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.status || user.status === "active") return <Navigate to="/" replace />;

  async function requestAccess() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/api/auth/request-access");
      await refreshUser();
      setMessage(data.message || "Your request has been sent to the administrator.");
    } catch (e) {
      setError(getErrorMessage(e, "Could not submit your access request."));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      setError(getErrorMessage(e, "Could not sign out. Please try again."));
    }
  }

  const requested = user.status === "pending";
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${requested ? "bg-amber-50 text-amber-600" : "bg-forest-50 text-forest-700"}`}>
        {requested ? <Clock3 size={28} /> : <ShieldCheck size={28} />}
      </span>
      <h1 className="mt-5 text-center text-2xl font-bold">{requested ? "Your request is under review" : "Request group access"}</h1>
      <p className="mt-2 text-center text-sm leading-6 text-slate-500">
        {requested
          ? "Roger has been notified. Your dashboard and group information will be available after approval."
          : `Hi ${user.name}, your account is ready. Submit an access request to Roger to unlock the group dashboard.`}
      </p>
      <div className="mt-5"><Alert>{error}</Alert><Alert kind="success">{message}</Alert></div>
      {!requested && <button className="button-primary mt-2 w-full" onClick={requestAccess} disabled={busy}>
        {busy ? <Spinner /> : <><CheckCircle2 size={17} /> Send access request</>}
      </button>}
      {requested && <div role="status" className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800">Awaiting administrator approval</div>}
      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 text-sm">
        <span className="text-slate-500">Signed in as <span className="font-semibold text-slate-700">{user.username}</span></span>
        <button onClick={signOut} className="inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-slate-900"><LogOut size={16} /> Sign out</button>
      </div>
    </section>
  </main>;
}
