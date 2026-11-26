import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleDollarSign } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Card, EmptyState, PageHeader, Spinner } from "../components/UI";
import ProgressBar from "../components/ProgressBar";
import { money } from "../components/MemberProgressCard";
import { paymentMethodLabel } from "../utils/payment";

export default function MemberDetailsPage() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get(`/api/members/${id}`), api.get("/api/payments", { params: { memberId: id, page: 1, pageSize: 10, sort: "paidAt:desc" } })])
      .then(([memberResult, paymentResult]) => {
        setMember(memberResult.data.member || memberResult.data);
        setPayments(paymentResult.data.payments || paymentResult.data);
      })
      .catch((e) => setError(getErrorMessage(e, "Could not load this member.")))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="grid min-h-64 place-items-center text-forest-600"><Spinner /></div>;
  if (error) return <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!member) return <EmptyState title="Member not found" message="This member profile may no longer be available." />;

  const target = Number(member.targetAmount ?? member.target ?? 20000);
  const paid = Number(member.totalPaid ?? member.contributed ?? 0);
  const progress = target ? Math.min(100, paid / target * 100) : 0;
  return <>
    <PageHeader eyebrow="Member details" title={member.name} description="Contribution summary and recent payment history." action={<Link className="button-secondary" to="/members"><ArrowLeft size={16} /> All members</Link>} />
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-medium text-slate-500">Total contributed</p><p className="mt-2 text-3xl font-bold">{money(paid)} <span className="text-base font-medium text-slate-400">/ {money(target)} RWF</span></p></div><div className="text-right"><p className="text-sm font-bold text-forest-700">{Math.round(progress)}%</p><p className="text-xs text-slate-500">complete</p></div></div>
      <ProgressBar value={progress} className="mt-5" /><p className="mt-2 text-sm text-slate-500">{money(Math.max(0, target - paid))} RWF remaining</p>
    </Card>
    <div className="mb-4 mt-8 flex items-center gap-2"><CircleDollarSign size={19} className="text-forest-600" /><h2 className="text-lg font-bold">Recent payments</h2></div>
    {payments?.length ? <>
      <div className="space-y-3 md:hidden">{payments.map((payment) => <article key={payment._id || payment.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{new Date(payment.paymentDate || payment.paidAt).toLocaleDateString()}</p><p className="shrink-0 text-right font-bold">{money(payment.amount)} RWF</p></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
          <div className="min-w-0"><dt className="text-slate-400">Method</dt><dd className="mt-0.5 break-words text-slate-700">{paymentMethodLabel(payment.paymentMethod || payment.method)}</dd></div>
          <div className="min-w-0"><dt className="text-slate-400">Reference</dt><dd className="mt-0.5 break-all text-slate-700">{payment.transactionReference || "—"}</dd></div>
        </dl>
      </article>)}</div>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card md:block">
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment._id || payment.id}><td className="px-5 py-4">{new Date(payment.paymentDate || payment.paidAt).toLocaleDateString()}</td><td className="px-5 py-4">{paymentMethodLabel(payment.paymentMethod || payment.method)}</td><td className="px-5 py-4 text-slate-500">{payment.transactionReference || "—"}</td><td className="px-5 py-4 text-right font-semibold">{money(payment.amount)} RWF</td></tr>)}</tbody></table></div>
      </div>
    </> : <EmptyState title="No payments yet" message="Payments for this member will show up here." />}
  </>;
}
