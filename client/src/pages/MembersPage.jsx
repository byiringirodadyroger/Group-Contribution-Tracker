import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import api from "../api";
import { EmptyState, PageHeader, Spinner } from "../components/UI";
import MemberProgressCard from "../components/MemberProgressCard";

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/members").then(({ data }) => setMembers(data.members || data))
      .catch((e) => setError(e.response?.data?.message || "Could not load members."))
      .finally(() => setLoading(false));
  }, []);

  return <>
    <PageHeader eyebrow="Your group" title="Members" description="Follow each member's progress toward their 20,000 RWF target." />
    {error && <div role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {loading ? <div className="grid min-h-64 place-items-center text-forest-600"><Spinner /></div> : members.length ?
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{members.map((member) => <MemberProgressCard key={member._id || member.id} member={member} />)}</div> :
      <EmptyState title="No members found" message="Group members will be listed here." />}
  </>;
}
