export default function ProgressBar({ value = 0, className = "" }) {
  const percentage = Math.min(100, Math.max(0, Number(value) || 0));
  return <div className={`h-2.5 overflow-hidden rounded-full bg-slate-100 ${className}`} role="progressbar"
    aria-valuenow={Math.round(percentage)} aria-valuemin="0" aria-valuemax="100" aria-label={`${Math.round(percentage)}% complete`}>
    <div className={`h-full rounded-full transition-all duration-700 ${percentage >= 100 ? "bg-forest-600" : "bg-forest-500"}`} style={{ width: `${percentage}%` }} />
  </div>;
}
