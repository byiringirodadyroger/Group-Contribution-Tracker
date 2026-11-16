import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ className = "", ...props }) {
  const [visible, setVisible] = useState(false);

  return <div className="relative">
    <input {...props} className={className} type={visible ? "text" : "password"} />
    <button
      type="button"
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      onClick={() => setVisible((current) => !current)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
    >
      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  </div>;
}
