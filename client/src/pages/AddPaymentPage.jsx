import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Alert, Card, PageHeader, Spinner } from "../components/UI";
import { PAYMENT_METHODS } from "../utils/payment";

export default function AddPaymentPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ memberId: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: PAYMENT_METHODS[0].value, transactionReference: "", description: "" });
  const idempotencyRef = useRef(null);

  useEffect(() => {
    api.get("/api/members").then(({ data }) => setMembers(data.members || data))
      .catch((e) => setError(getErrorMessage(e, "Unable to load the member list.")));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        memberId: form.memberId,
        amount: Number(form.amount),
        method: form.paymentMethod,
        paidAt: form.paymentDate,
        transactionReference: form.transactionReference,
        note: form.description
      };
      const fingerprint = JSON.stringify(payload);
      if (idempotencyRef.current?.fingerprint !== fingerprint) {
        idempotencyRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      await api.post("/api/payments", payload, { headers: { "Idempotency-Key": idempotencyRef.current.key } });
      idempotencyRef.current = null;
      setSuccess("Contribution recorded successfully.");
      setTimeout(() => navigate("/payments"), 700);
    } catch (e) {
      setError(getErrorMessage(e, "Unable to record the contribution."));
      setBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow="Administration" title="Record a contribution" description="Add a payment to a member's contribution history." action={<button onClick={() => navigate(-1)} className="button-secondary"><ArrowLeft size={16} /> Back</button>} />
    <div className="max-w-3xl">
      <Alert>{error}</Alert><Alert kind="success">{success}</Alert>
      <Card><form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Member<select className="field mt-2" required value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}><option value="">Select member</option>{members.map((member) => <option key={member._id || member.id} value={member._id || member.id}>{member.name}</option>)}</select></label>
        <label className="field-label">Amount (RWF)<input className="field mt-2" type="number" min="1" step="1" required placeholder="e.g. 5000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        <label className="field-label">Payment date<input className="field mt-2" type="date" required value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} /></label>
        <label className="field-label">Payment method<select className="field mt-2" required value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        <label className="field-label">Transaction reference <span className="font-normal text-slate-400">(optional)</span><input className="field mt-2" maxLength="120" value={form.transactionReference} onChange={(e) => setForm({ ...form, transactionReference: e.target.value })} /></label>
        <label className="field-label sm:col-span-2">Description or notes <span className="font-normal text-slate-400">(optional)</span><textarea className="field mt-2 min-h-24 resize-y" maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button className="button-primary" disabled={busy}>{busy ? <Spinner /> : <><Check size={17} /> Record contribution</>}</button><button type="button" className="button-secondary" onClick={() => navigate("/payments")}>Cancel</button></div>
      </form></Card>
    </div>
  </>;
}
