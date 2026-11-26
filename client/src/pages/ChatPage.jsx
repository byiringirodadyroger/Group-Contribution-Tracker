import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { ArrowDownToLine, ArrowLeft, Check, CheckCheck, FileText, MoreVertical, Paperclip, Pencil, Search, Send, Users, X } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Alert, EmptyState, PageHeader, Spinner } from "../components/UI";
import { useAuth } from "../context/AuthContext";

const maxAttachmentSize = 50 * 1024 * 1024;
const deleteForEveryoneWindowMs = 15 * 60 * 1000;

function directConversationId(currentUserId, contactId) {
  return `direct:${[currentUserId, contactId].sort().join(":")}`;
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState({ type: "group", id: null });
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileConversation, setMobileConversation] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [openMessageMenu, setOpenMessageMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get("/api/chat/contacts")
      .then(({ data }) => setContacts(data.contacts || []))
      .catch((requestError) => setError(getErrorMessage(requestError, "Unable to load chat contacts.")));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const path = active.type === "group" ? "/api/chat/group" : `/api/chat/direct/${active.id}`;
    const readPath = `${path}/read`;
    async function loadConversation() {
      try {
        const { data } = await api.get(path);
        if (cancelled) return;
        setMessages(data.messages || []);
        const readResponse = await api.post(readPath);
        if (!cancelled) {
          const readIds = new Set(readResponse.data.messageIds || []);
          if (readIds.size) {
            setMessages((current) => current.map((message) => readIds.has(message.id)
              ? { ...message, readBy: [...new Set([...(message.readBy || []), user.id])] }
              : message));
          }
        }
      } catch (requestError) {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load chat messages."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadConversation();
    return () => { cancelled = true; };
  }, [active, user.id]);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(socketUrl, { withCredentials: true, transports: ["websocket", "polling"] });
    socket.on("chat:message", (message) => {
      const conversationId = active.type === "group"
        ? "group"
        : directConversationId(user.id, active.id);
      if (message.conversationId !== conversationId) return;
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message].slice(-50));
      if (String(message.sender.id) !== String(user.id)) {
        const readPath = active.type === "group" ? "/api/chat/group/read" : `/api/chat/direct/${active.id}/read`;
        api.post(readPath)
          .then(({ data }) => {
            const readIds = new Set(data.messageIds || []);
            if (readIds.size) {
              setMessages((current) => current.map((item) => readIds.has(item.id)
                ? { ...item, readBy: [...new Set([...(item.readBy || []), user.id])] }
                : item));
            }
          })
          .catch((requestError) => setError(getErrorMessage(requestError, "Unable to update message read status.")));
      }
    });
    socket.on("chat:read", ({ conversationId, messageIds, readerId }) => {
      const activeConversationId = active.type === "group"
        ? "group"
        : directConversationId(user.id, active.id);
      if (conversationId !== activeConversationId) return;
      const readIds = new Set(messageIds || []);
      setMessages((current) => current.map((message) => readIds.has(message.id)
        ? { ...message, readBy: [...new Set([...(message.readBy || []), readerId])] }
        : message));
    });
    socket.on("chat:edited", (message) => {
      const conversationId = active.type === "group"
        ? "group"
        : directConversationId(user.id, active.id);
      if (message.conversationId === conversationId) {
        setMessages((current) => current.map((item) => item.id === message.id ? message : item));
      }
    });
    socket.on("chat:deleted", ({ id, conversationId, deletedAt }) => {
      const activeConversationId = active.type === "group"
        ? "group"
        : directConversationId(user.id, active.id);
      if (conversationId === activeConversationId) {
        setMessages((current) => current.map((message) => message.id === id
          ? { ...message, text: "", attachment: null, deletedAt: deletedAt || new Date().toISOString() }
          : message));
      }
    });
    socket.on("chat:hidden", ({ id }) => {
      setMessages((current) => current.filter((message) => message.id !== id));
    });
    return () => socket.disconnect();
  }, [active, user.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!openMessageMenu) return undefined;
    function closeMessageMenu(event) {
      if (!event.target.closest("[data-message-menu]")) setOpenMessageMenu(null);
    }
    document.addEventListener("pointerdown", closeMessageMenu);
    return () => document.removeEventListener("pointerdown", closeMessageMenu);
  }, [openMessageMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if ((!cleanText && !attachment) || sending) return;
    setSending(true);
    setError("");
    try {
      const path = active.type === "group" ? "/api/chat/group" : `/api/chat/direct/${active.id}`;
      let response;
      if (attachment) {
        const formData = new FormData();
        formData.append("file", attachment);
        formData.append("text", cleanText);
        response = await api.post(`${path}/files`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      } else {
        response = await api.post(path, { text: cleanText });
      }
      const { data } = response;
      setMessages((current) => current.some((item) => item.id === data.message.id)
        ? current
        : [...current, data.message].slice(-50));
      setText("");
      setAttachment(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to send your message."));
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId, scope) {
    const prompt = scope === "everyone"
      ? "Delete this message for everyone? This cannot be undone."
      : "Remove this message from your account?";
    if (!window.confirm(prompt)) return;
    setError("");
    try {
      await api.delete(`/api/chat/messages/${messageId}`, { data: { scope } });
      if (scope === "everyone") {
        setMessages((current) => current.map((message) => message.id === messageId
          ? { ...message, text: "", attachment: null, deletedAt: new Date().toISOString() }
          : message));
      } else {
        setMessages((current) => current.filter((message) => message.id !== messageId));
      }
      setOpenMessageMenu(null);
      setEditingMessage(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to delete your message."));
    }
  }

  function startEditing(message) {
    setEditingMessage({ id: message.id, text: message.text || "" });
    setOpenMessageMenu(null);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingMessage) return;
    const cleanText = editingMessage.text.trim();
    if (!cleanText) return;
    setError("");
    try {
      const { data } = await api.patch(`/api/chat/messages/${editingMessage.id}`, { text: cleanText });
      setMessages((current) => current.map((message) => message.id === editingMessage.id ? data.message : message));
      setEditingMessage(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to edit your message."));
    }
  }

  function renderMessageActions(message, own) {
    const withinEditWindow = own &&
      !message.deletedAt &&
      currentTime - new Date(message.createdAt).getTime() < deleteForEveryoneWindowMs;
    const canDeleteForEveryone = withinEditWindow;
    return <div className="relative mb-1 shrink-0" data-message-menu>
      <button type="button" onClick={() => setOpenMessageMenu((current) => current === message.id ? null : message.id)} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-800" aria-label="Message options" aria-expanded={openMessageMenu === message.id} title="Message options"><MoreVertical size={17} /></button>
      {openMessageMenu === message.id && <div className={`absolute top-0 z-30 min-w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ${own ? "right-9" : "left-9"}`}>
        {withinEditWindow && <button type="button" onClick={() => startEditing(message)} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-2"><Pencil size={15} /> Edit message</span></button>}
        <button type="button" onClick={() => deleteMessage(message.id, "me")} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">Delete for me</button>
        {canDeleteForEveryone
          ? <button type="button" onClick={() => deleteMessage(message.id, "everyone")} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50">Delete for everyone</button>
          : own && <p className="px-3 py-2 text-xs leading-5 text-slate-500">Delete for everyone is available for 15 minutes after sending.</p>}
      </div>}
    </div>;
  }

  function selectConversation(conversation) {
    setActive(conversation);
    setMobileConversation(true);
  }

  function handleTextKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function initials(name) {
    return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function dateLabel(value) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  }

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      contact.name.toLowerCase().includes(query) ||
      (contact.role || "").toLowerCase().includes(query)
    );
  }, [contacts, search]);

  const activeName = active.type === "group"
    ? "Group"
    : contacts.find((contact) => contact.id === active.id)?.name || "Direct message";

  return <>
    <PageHeader eyebrow="Communication" title="Messages" description="Chat with the group or send an approved member a direct message." />
    {error && <Alert onClose={() => setError("")}>{error}</Alert>}
    <div className="h-[calc(100vh-220px)] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card md:grid md:grid-cols-[320px_1fr]">
      <aside className={`flex min-h-0 flex-col border-slate-200 bg-white ${mobileConversation ? "hidden md:flex" : "flex"} md:border-r`}>
        <div className="border-b border-slate-100 px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Chats</h2>
            <span className="text-xs font-semibold text-slate-400">{contacts.length + 1}</span>
          </div>
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" aria-label="Search chats" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <button type="button" onClick={() => selectConversation({ type: "group", id: null })} className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${active.type === "group" ? "bg-forest-50" : "hover:bg-slate-50"}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest-600 text-white"><Users size={20} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-800">Group</span><span className="mt-0.5 block truncate text-xs text-slate-500">Group conversation</span></span>
          </button>
          {filteredContacts.map((contact) => <button key={contact.id} type="button" onClick={() => selectConversation({ type: "direct", id: contact.id })} className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${active.type === "direct" && active.id === contact.id ? "bg-forest-50" : "hover:bg-slate-50"}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">{initials(contact.name)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-800">{contact.name}</span><span className="mt-0.5 block truncate text-xs capitalize text-slate-500">{contact.role === "admin" ? "Administrator" : "Member"}</span></span>
          </button>)}
          {!filteredContacts.length && <p className="px-4 py-8 text-center text-sm text-slate-400">{search ? "No chats found." : "No other active members."}</p>}
        </div>
      </aside>
      <section className={`${mobileConversation ? "flex" : "hidden"} min-h-0 flex-col bg-[#efeae2] md:flex`}>
        <header className="flex h-[68px] items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
          <button type="button" onClick={() => setMobileConversation(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Back to chats"><ArrowLeft size={20} /></button>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${active.type === "group" ? "bg-forest-600 text-white" : "bg-slate-200 text-sm font-bold text-slate-700"}`}>
            {active.type === "group" ? <Users size={18} /> : initials(activeName)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-bold text-slate-800">{activeName}</h2>
            <p className="text-xs text-slate-500">{active.type === "group" ? "All approved members" : "Direct conversation"}</p>
          </div>
        </header>
        <div className="chat-wallpaper min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-5 sm:px-8">
          {loading ? <div className="grid min-h-64 place-items-center text-forest-600"><Spinner /></div> : messages.length ? messages.map((message, index) => {
            const own = String(message.sender.id) === String(user.id);
            const showDate = index === 0 || dateLabel(messages[index - 1].createdAt) !== dateLabel(message.createdAt);
            return <div key={message.id}>
              {showDate && <div className="mb-4 flex justify-center"><span className="rounded-md bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">{dateLabel(message.createdAt)}</span></div>}
              <div className={`flex items-end gap-1 ${own ? "justify-end" : "justify-start"}`}>
              {own && renderMessageActions(message, own)}
              <div className={`relative max-w-[82%] rounded-lg px-3 pb-1.5 pt-2 shadow-sm sm:max-w-[68%] ${own ? "chat-own-message bg-[#d9fdd3] text-slate-800" : "bg-white text-slate-800"}`}>
                {!own && active.type === "group" && <p className="mb-1 text-xs font-bold text-forest-700">{message.sender.name}</p>}
                {message.deletedAt ? <p className="chat-message-text whitespace-pre-wrap break-words text-sm italic leading-6 text-slate-500">This message was deleted</p> :
                  editingMessage?.id === message.id ? <form onSubmit={saveEdit} className="min-w-56">
                    <p className="mb-1 text-xs font-semibold text-slate-600">Editing message</p>
                    <textarea
                      className="field chat-edit-input min-h-20 resize-none"
                      maxLength={2000}
                      value={editingMessage.text}
                      onChange={(event) => setEditingMessage({ ...editingMessage, text: event.target.value })}
                      autoFocus
                      aria-label="Edit message"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" className="button-secondary !px-3 !py-1.5" onClick={() => setEditingMessage(null)}>Cancel</button>
                      <button type="submit" className="button-primary !px-3 !py-1.5" disabled={!editingMessage.text.trim()}>Save</button>
                    </div>
                  </form> : message.text && <p className="chat-message-text whitespace-pre-wrap break-words text-sm font-medium leading-6">{message.text}</p>}
                {!message.deletedAt && message.attachment && <a href={api.getUri({ url: `/api/chat/attachments/${message.id}` })} download={message.attachment.filename} className="my-1 flex min-w-48 max-w-72 items-center gap-2 rounded-lg border border-slate-200/80 bg-white/70 p-2 text-slate-700 hover:bg-white">
                  <FileText size={20} className="shrink-0 text-forest-700" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{message.attachment.filename}</span><span className="text-[10px] text-slate-500">{formatFileSize(message.attachment.size)}</span></span>
                  <ArrowDownToLine size={16} className="shrink-0 text-slate-500" />
                </a>}
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                  {message.editedAt && !message.deletedAt && <span className="mr-1">edited</span>}
                  <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {own && (() => {
                    const isRead = (message.readBy || []).some((readerId) => String(readerId) !== String(message.sender.id));
                    const Receipt = isRead ? CheckCheck : Check;
                    return <Receipt size={15} className={isRead ? "text-sky-600" : "text-slate-500"} aria-label={isRead ? "Read" : "Sent"} title={isRead ? "Read" : "Sent"} />;
                  })()}
                </span>
              </div>
              {!own && renderMessageActions(message, own)}
              </div>
            </div>;
          }) : <EmptyState title="No messages yet" message="Start the conversation." />}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="relative flex flex-col gap-2 border-t border-slate-200 bg-slate-100 p-3">
          {attachment && <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
            <FileText size={16} className="shrink-0 text-forest-700" />
            <span className="min-w-0 flex-1 truncate">{attachment.name} <span className="text-xs text-slate-500">({formatFileSize(attachment.size)})</span></span>
            <button type="button" onClick={() => setAttachment(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Remove attachment"><X size={15} /></button>
          </div>}
          <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0] || null;
            event.target.value = "";
            if (file && file.size > maxAttachmentSize) {
              setError("Attachments must be 50 MB or smaller.");
              return;
            }
            setError("");
            setAttachment(file);
          }} />
          <div className="flex w-full min-w-0 items-end gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white" aria-label="Attach a file" title="Attach a file"><Paperclip size={20} /></button>
            <textarea className="field min-h-10 min-w-0 max-h-28 flex-1 resize-none py-2.5" aria-label="Message" rows={1} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={handleTextKeyDown} placeholder="Type a message" />
            <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-600 text-white transition hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={sending || (!text.trim() && !attachment)} aria-label="Send message">{sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={18} />}</button>
          </div>
        </form>
      </section>
    </div>
  </>;
}
