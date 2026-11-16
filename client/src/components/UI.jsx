import { LoaderCircle } from "lucide-react";

export function FullPageLoader() {
  return <div className="grid min-h-screen place-items-center text-forest-600" aria-label="Loading">
    <LoaderCircle className="animate-spin" size={30} />
  </div>;
}

export function PageHeader({ eyebrow, title, description, action }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-forest-600">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
    </div>
    {action}
  </div>;
}

export function Card({ children, className = "" }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 ${className}`}>{children}</section>;
}

export function Alert({ kind = "error", children, onClose }) {
  if (!children) return null;
  return <div role="alert" className={`mb-5 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ${kind === "success" ? "bg-forest-50 text-forest-700" : "bg-rose-50 text-rose-700"}`}>
    <span>{children}</span>
    {onClose && <button onClick={onClose} aria-label="Dismiss" className="font-bold">×</button>}
  </div>;
}

export function EmptyState({ title, message }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
    <p className="font-semibold text-slate-800">{title}</p>
    <p className="mt-1 text-sm text-slate-500">{message}</p>
  </div>;
}

export function Spinner() {
  return <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />;
}
