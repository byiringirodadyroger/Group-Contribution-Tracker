import { Card } from "./UI";

export default function StatCard({ label, value, hint, icon: Icon, tone = "green" }) {
  const tones = {
    green: "bg-forest-50 text-forest-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700"
  };
  return <Card className="flex items-start justify-between gap-4">
    <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone] || tones.green}`}><Icon size={20} /></span>
  </Card>;
}
