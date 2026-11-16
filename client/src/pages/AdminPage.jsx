import { useEffect, useState } from "react";
import { Check, ShieldCheck, UserPlus, X } from "lucide-react";
import api, { getErrorMessage } from "../api";
import { Card, EmptyState, PageHeader, Spinner } from "../components/UI";

export default function AdminPage() {
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberName, setMemberName] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [accountResult, memberResult] = await Promise.all([
      api.get("/api/admin/accounts"),
      api.get("/api/admin/members")
    ]);
    setAccounts(accountResult.data.accounts || accountResult.data);
    setMembers(memberResult.data.members || memberResult.data);
  }
  useEffect(() => { load().catch((e) => setError(getErrorMessage(e, "Could not load account requests."))).finally(() => setLoading(false)); }, []);

  async function addMember(event) {
    event.preventDefault();
    setAddingMember(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/api/admin/members", { name: memberName });
      setMemberName("");
      setMessage(`${data.member.name} can now register for the group.`);
      await load();
    } catch (e) {
      setError(getErrorMessage(e, "Unable to add this member profile."));
    } finally {
      setAddingMember(false);
    }
  }

  async function approve(account, approved) {
    setWorking(account._id || account.id);
    setError("");
    setMessage("");
    try {
      await api.patch(`/api/admin/accounts/${account._id || account.id}/approval`, { status: approved ? "active" : "inactive" });
      setMessage(`${account.name} has been ${approved ? "approved" : "rejected"}.`);
      await load();
    } catch (e) {
      setError(getErrorMessage(e, "Unable to update this account."));
    } finally {
      setWorking("");
    }
  }

  async function removeUnrequested(account) {
    if (!window.confirm(`Permanently remove ${account.name}'s unrequested account so the member can register again?`)) return;
    setWorking(account._id || account.id);
    setError("");
    setMessage("");
    try {
      await api.delete(`/api/admin/accounts/${account._id || account.id}`);
      setMessage(`${account.name}'s account was removed.`);
      await load();
    } catch (e) {
      setError(getErrorMessage(e, "Unable to remove this account."));
    } finally {
      setWorking("");
    }
  }

  return <>
    <PageHeader eyebrow="Administrator" title="Account management" description="Add group member profiles and manage registration and access requests." />
    {error && <div role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {message && <div role="status" className="mb-4 rounded-xl bg-forest-50 p-4 text-sm text-forest-700">{message}</div>}
    <Card className="mb-5">
      <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700"><UserPlus size={20} /></span><div><h2 className="font-bold">Add a member profile</h2><p className="text-sm text-slate-500">The new member can select this profile when creating their own account. Each profile has a 20,000 RWF target.</p></div></div>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={addMember}>
        <label className="sr-only" htmlFor="new-member-name">Member name</label>
        <input id="new-member-name" className="field flex-1" autoComplete="off" maxLength={100} minLength={2} placeholder="Enter the new member's name" required value={memberName} onChange={(event) => setMemberName(event.target.value)} />
        <button className="button-primary shrink-0" type="submit" disabled={addingMember}>{addingMember ? <Spinner /> : <><UserPlus size={17} /> Add member</>}</button>
      </form>
    </Card>
    <Card className="mb-5">
      <div className="mb-3"><h2 className="font-bold">Group member profiles</h2><p className="text-sm text-slate-500">Profiles without an account are available to select during registration.</p></div>
      {loading ? <div className="grid min-h-24 place-items-center text-forest-600"><Spinner /></div> : <div className="divide-y divide-slate-100">
        {members.map((member) => {
          const account = accounts.find((item) => (item.member?.id || item.member?._id)?.toString() === (member.id || member._id)?.toString());
          const status = account
            ? account.status === "active" ? "Approved" : account.status === "pending" ? "Pending review" : account.status === "inactive" ? "Inactive" : "Access not requested"
            : "Available to join";
          return <div key={member._id || member.id} className="flex items-center justify-between gap-3 py-3">
            <div><p className="font-semibold">{member.name}</p><p className="text-xs text-slate-500">{Number(member.targetAmount).toLocaleString()} RWF target</p></div>
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${status === "Approved" ? "bg-forest-50 text-forest-700" : status === "Pending review" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{status}</span>
          </div>;
        })}
      </div>}
    </Card>
    <Card>
      <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700"><ShieldCheck size={20} /></span><div><h2 className="font-bold">Account requests</h2><p className="text-sm text-slate-500">Only approved members can sign in and view contributions.</p></div></div>
      {loading ? <div className="grid min-h-40 place-items-center text-forest-600"><Spinner /></div> : accounts.length ? <div className="divide-y divide-slate-100">
        {accounts.map((account) => <div key={account._id || account.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="font-semibold">{account.name}</p><p className="mt-0.5 text-sm text-slate-500">@{account.username} · {account.member?.name || account.memberName || "Unassigned"}</p></div>
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${account.status === "active" || account.isApproved || account.approved ? "bg-forest-50 text-forest-700" : account.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{account.status === "active" || account.isApproved || account.approved ? "Approved" : account.status === "pending" ? "Pending review" : account.status === "registered" ? "Access not requested" : "Inactive"}</span>
            {account.role !== "admin" && <div className="flex gap-2">
              {["pending", "inactive"].includes(account.status) && <button disabled={working === (account._id || account.id)} className="button-primary !px-3 !py-2" onClick={() => approve(account, true)}><Check size={15} /> {account.status === "inactive" ? "Reactivate" : "Approve"}</button>}
              {account.status === "pending" && <button disabled={working === (account._id || account.id)} className="button-secondary !px-3 !py-2 text-rose-700" onClick={() => approve(account, false)}><X size={15} /> Reject</button>}
              {account.status === "active" && <button disabled={working === (account._id || account.id)} className="button-secondary !px-3 !py-2 text-rose-700" onClick={() => window.confirm(`Deactivate ${account.name}'s account?`) && approve(account, false)}><X size={15} /> Deactivate</button>}
              {(account.status === "registered" || (account.status === "inactive" && !account.approvedAt)) && <button disabled={working === (account._id || account.id)} className="button-secondary !px-3 !py-2 text-rose-700" onClick={() => removeUnrequested(account)}><X size={15} /> Remove</button>}
            </div>}
            {working === (account._id || account.id) && <Spinner />}
        </div>)}
      </div> : <EmptyState title="No access requests" message="New member requests will appear here for review." />}
    </Card>
  </>;
}
