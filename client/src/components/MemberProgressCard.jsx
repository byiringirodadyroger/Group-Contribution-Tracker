import { Link } from "react-router-dom";
import { ArrowUpRight, CircleUserRound } from "lucide-react";
import ProgressBar from "./ProgressBar";

export function money(value) {
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default function MemberProgressCard({ member }) {
  const target = Number(member.targetAmount ?? member.target ?? 20000);
  const paid = Number(member.totalPaid ?? member.contributed ?? member.amountPaid ?? 0);
  const progress = Math.min(100, target ? paid / target * 100 : 0);
  const remaining = Math.max(0, target - paid);
  return <Link to={`/members/${member._id || member.id}`} className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-forest-200 hover:shadow-md">
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500"><CircleUserRound size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900">{member.name}</span><span className="mt-0.5 block text-xs text-slate-500">{paid >= target ? "Target reached" : paid > 0 ? "Contributing" : "No contributions yet"}</span></span>
      <ArrowUpRight size={17} className="text-slate-300 transition group-hover:text-forest-600" />
    </div>
    <div className="mt-5 flex items-end justify-between gap-2">
      <div><p className="text-lg font-bold text-slate-900">{money(paid)} <span className="text-xs font-medium text-slate-400">/ {money(target)} RWF</span></p><p className="mt-1 text-xs text-slate-500">{money(remaining)} RWF remaining</p></div>
      <span className={`text-sm font-bold ${progress >= 100 ? "text-forest-700" : "text-slate-600"}`}>{Math.round(progress)}%</span>
    </div>
    <ProgressBar value={progress} className="mt-3" />
  </Link>;
}
