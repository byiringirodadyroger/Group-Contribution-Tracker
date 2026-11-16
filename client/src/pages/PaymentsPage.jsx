import { useEffect, useState } from "react";
import { Pencil, Search, Trash2, X } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { money } from "../components/MemberProgressCard";
import { Alert, EmptyState, PageHeader, Spinner } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { PAYMENT_METHODS, paymentMethodLabel } from "../utils/payment";

export default function PaymentsPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [filters, setFilters] = useState({ memberId: "", from: "", to: "", method: "", sort: "newest" });
  const [result, setResult] = useState({ payments: [], page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => { api.get("/api/members").then(({ data }) => setMembers(data.members || data)).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    const params = {
      ...filters,
      sort: filters.sort === "oldest" ? "paidAt:asc" : "paidAt:desc",
      page,
      pageSize: 10
    };
    api.get("/api/payments", { params })
      .then(({ data }) => setResult({
        payments: data.payments || [],
        page: data.pagination?.page || data.page || 1,
        totalPages: data.pagination?.pages || data.totalPages || 1,
        total: data.pagination?.total ?? data.total ?? 0
      }))
      .catch((e) => setError(getErrorMessage(e, "Could not load payment history.")))
      .finally(() => setLoading(false));
  }, [filters, page]);

  function update(key, value) { setPage(1); setFilters((current) => ({ ...current, [key]: value })); }

  function startEditing(payment) {
    setError("");
    setNotice("");
    setEditing({
      id: payment._id || payment.id,
      memberId: payment.memberId?._id || payment.memberId || payment.member?._id || payment.member?.id || "",
      amount: payment.amount,
      paymentDate: new Date(payment.paymentDate || payment.paidAt).toISOString().slice(0, 10),
      paymentMethod: payment.paymentMethod || payment.method,
      transactionReference: payment.transactionReference || "",
      description: payment.description || payment.note || ""
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const { id, paymentDate, paymentMethod, description, ...fields } = editing;
      await api.patch(`/api/payments/${id}`, {
        ...fields,
        amount: Number(fields.amount),
        paidAt: paymentDate,
        method: paymentMethod,
        note: description
      });
      setEditing(null);
      setNotice("Payment updated.");
      const { data } = await api.get("/api/payments", { params: { ...filters, sort: filters.sort === "oldest" ? "paidAt:asc" : "paidAt:desc", page, pageSize: 10 } });
      setResult({ payments: data.payments || [], page: data.pagination?.page || 1, totalPages: data.pagination?.pages || 1, total: data.pagination?.total ?? 0 });
    } catch (e) {
      setError(getErrorMessage(e, "Could not update this payment."));
    } finally {
      setWorking(false);
    }
  }

  async function deletePayment(payment) {
    if (!window.confirm(`Delete the ${money(payment.amount)} RWF payment from ${payment.member?.name || payment.memberName || "this member"}? This action cannot be undone.`)) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await api.delete(`/api/payments/${payment._id || payment.id}`);
      setNotice("Payment deleted.");
      const { data } = await api.get("/api/payments", { params: { ...filters, sort: filters.sort === "oldest" ? "paidAt:asc" : "paidAt:desc", page, pageSize: 10 } });
      setResult({ payments: data.payments || [], page: data.pagination?.page || 1, totalPages: data.pagination?.pages || 1, total: data.pagination?.total ?? 0 });
    } catch (e) {
      setError(getErrorMessage(e, "Could not delete this payment."));
    } finally {
      setWorking(false);
    }
  }

  return <>
    <PageHeader eyebrow="Transactions" title="Payment history" description="Search and review all recorded group contributions." />
    {error && <div role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {notice && <Alert kind="success" onClose={() => setNotice("")}>{notice}</Alert>}
    {editing && <form onSubmit={saveEdit} className="mb-5 grid gap-3 rounded-2xl border border-forest-200 bg-forest-50/50 p-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="field-label">Member<select className="field mt-2" required value={editing.memberId} onChange={(e) => setEditing({ ...editing, memberId: e.target.value })}>{members.map((m) => <option value={m._id || m.id} key={m._id || m.id}>{m.name}</option>)}</select></label>
      <label className="field-label">Amount (RWF)<input className="field mt-2" type="number" min="1" step="1" required value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /></label>
      <label className="field-label">Payment date<input className="field mt-2" type="date" required value={editing.paymentDate} onChange={(e) => setEditing({ ...editing, paymentDate: e.target.value })} /></label>
      <label className="field-label">Method<select className="field mt-2" required value={editing.paymentMethod} onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
      <label className="field-label">Reference<input className="field mt-2" maxLength="120" value={editing.transactionReference} onChange={(e) => setEditing({ ...editing, transactionReference: e.target.value })} /></label>
      <label className="field-label">Notes<input className="field mt-2" maxLength="500" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
      <div className="flex gap-2 sm:col-span-2 xl:col-span-3"><button className="button-primary" disabled={working}>Save changes</button><button type="button" className="button-secondary" disabled={working} onClick={() => setEditing(null)}><X size={15} /> Cancel</button></div>
    </form>}
    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-2 xl:grid-cols-5">
      <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Filter by member</span><Search className="absolute left-3 top-3 text-slate-400" size={16} /><select className="field pl-9" value={filters.memberId} onChange={(e) => update("memberId", e.target.value)}><option value="">All members</option>{members.map((m) => <option value={m._id || m.id} key={m._id || m.id}>{m.name}</option>)}</select></label>
      <label><span className="sr-only">From date</span><input aria-label="From date" className="field" type="date" value={filters.from} onChange={(e) => update("from", e.target.value)} /></label>
      <label><span className="sr-only">To date</span><input aria-label="To date" className="field" type="date" value={filters.to} onChange={(e) => update("to", e.target.value)} /></label>
      <label><span className="sr-only">Payment method</span><select className="field" value={filters.method} onChange={(e) => update("method", e.target.value)}><option value="">All methods</option>{PAYMENT_METHODS.map((method) => <option value={method.value} key={method.value}>{method.label}</option>)}</select></label>
      <label><span className="sr-only">Sort order</span><select className="field" value={filters.sort} onChange={(e) => update("sort", e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    {loading ? <div className="grid min-h-64 place-items-center text-forest-600"><Spinner /></div> : result.payments.length ? <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Member</th><th className="px-5 py-3">Payment date</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Recorded by</th><th className="px-5 py-3">Date recorded</th><th className="px-5 py-3 text-right">Amount</th>{user?.role === "admin" && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-slate-100">{result.payments.map((payment) => <tr key={payment._id || payment.id} className="hover:bg-slate-50/60"><td className="px-5 py-4 font-semibold text-slate-800">{payment.member?.name || payment.memberName || "—"}</td><td className="px-5 py-4 text-slate-600">{new Date(payment.paymentDate || payment.paidAt).toLocaleDateString()}</td><td className="px-5 py-4 text-slate-600">{paymentMethodLabel(payment.paymentMethod || payment.method)}</td><td className="px-5 py-4 text-slate-500">{payment.transactionReference || "—"}</td><td className="px-5 py-4 text-slate-600">{payment.recordedBy?.name || payment.recordedByName || "—"}</td><td className="px-5 py-4 text-slate-600">{payment.createdAt ? new Date(payment.createdAt).toLocaleString() : "—"}</td><td className="px-5 py-4 text-right font-bold text-slate-900">{money(payment.amount)} RWF</td>{user?.role === "admin" && <td className="px-5 py-3"><div className="flex justify-end gap-1"><button disabled={working} aria-label="Edit payment" onClick={() => startEditing(payment)} className="rounded-lg p-2 text-slate-500 hover:bg-forest-50 hover:text-forest-700"><Pencil size={16} /></button><button disabled={working} aria-label="Delete payment" onClick={() => deletePayment(payment)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></button></div></td>}</tr>)}</tbody>
      </table></div></div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>{result.total} payments · Page {page} of {result.totalPages}</span><div className="flex gap-2"><button className="button-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button className="button-secondary" disabled={page >= result.totalPages} onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}>Next</button></div></div>
    </> : <EmptyState title="No payments found" message="Try adjusting the filters or check back when contributions are recorded." />}
  </>;
}
