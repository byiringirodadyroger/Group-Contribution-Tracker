import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Bell, CheckCheck } from "lucide-react";
import api, { getErrorMessage } from "../api";

export default function NotificationsBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seenIds = useRef(new Set());
  const unreadIds = useRef(new Set());
  const liveIds = useRef(new Set());
  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(socketUrl, { withCredentials: true, transports: ["websocket", "polling"] });

    socket.on("notification:new", (notification) => {
      if (!active || !notification?.id || seenIds.current.has(notification.id)) return;
      seenIds.current.add(notification.id);
      unreadIds.current.add(notification.id);
      liveIds.current.add(notification.id);
      setNotifications((current) => [notification, ...current].slice(0, 50));
      setUnreadCount((current) => current + 1);
    });
    socket.on("notification:read", ({ id }) => markReadLocally(id));
    socket.on("notifications:read-all", markAllReadLocally);

    api.get("/api/notifications").then(({ data }) => {
      if (!active) return;
      const currentIds = new Set(seenIds.current);
      const newNotifications = data.notifications.filter((item) => !currentIds.has(item.id));
      for (const notification of data.notifications) {
        seenIds.current.add(notification.id);
        if (!notification.isRead) unreadIds.current.add(notification.id);
      }
      const serverIds = new Set(data.notifications.map((notification) => notification.id));
      const unreadLiveNotifications = [...liveIds.current]
        .filter((id) => !serverIds.has(id) && unreadIds.current.has(id)).length;
      setNotifications((current) => [...current, ...newNotifications]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50));
      setUnreadCount(data.unreadCount + unreadLiveNotifications);
    }).catch((requestError) => {
      if (active) setError(getErrorMessage(requestError, "Unable to load notifications."));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function markReadLocally(id) {
    if (!id) return;
    setNotifications((current) => current.map((notification) =>
      notification.id === id ? { ...notification, isRead: true } : notification));
    if (unreadIds.current.delete(id)) {
      setUnreadCount((current) => Math.max(0, current - 1));
    }
  }

  function markAllReadLocally() {
    unreadIds.current.clear();
    setUnreadCount(0);
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  }

  async function markRead(id) {
    setError("");
    try {
      await api.patch(`/api/notifications/${id}/read`);
      markReadLocally(id);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to mark the notification as read."));
    }
  }

  async function markAllRead() {
    setError("");
    try {
      await api.patch("/api/notifications/read-all");
      markAllReadLocally();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to mark notifications as read."));
    }
  }

  return <div ref={containerRef} className="relative">
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
      aria-expanded={open}
      className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <Bell size={19} />
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section aria-label="Notifications" className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div><h2 className="text-sm font-bold text-slate-900">Notifications</h2><p className="text-xs text-slate-500">{unreadCount} unread</p></div>
        <button type="button" onClick={markAllRead} disabled={!unreadCount} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-forest-700 hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-50"><CheckCheck size={15} />Mark all read</button>
      </header>
      {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
      <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
        {loading && <p className="px-4 py-8 text-center text-sm text-slate-500">Loading notifications...</p>}
        {!loading && notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>}
        {notifications.map((notification) => <button
          type="button"
          key={notification.id}
          onClick={() => markRead(notification.id)}
          className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${notification.isRead ? "bg-white" : "bg-forest-50/60"}`}
        >
          <span className="flex items-start gap-2">
            {!notification.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forest-600" aria-label="Unread" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">{notification.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-600">{notification.message}</span>
              <time className="mt-1 block text-[11px] text-slate-400" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString()}</time>
            </span>
          </span>
        </button>)}
      </div>
    </section>}
  </div>;
}
