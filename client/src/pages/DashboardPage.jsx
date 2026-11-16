import { useDashboardData } from "../hooks/useDashboardData";
import { Card, EmptyState, PageHeader, Spinner } from "../components/UI";
import StatCard from "../components/StatCard";
import MemberProgressCard, { money } from "../components/MemberProgressCard";
import ProgressBar from "../components/ProgressBar";
import { CircleDollarSign, CircleUserRound, PiggyBank, Target, UsersRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";

function unwrap(result) {
  return result?.dashboard || result?.data || result || {};
}

export default function DashboardPage() {
  const { data, loading, error } = useDashboardData();
  const { user } = useAuth();
  const dashboard = unwrap(data);
  const stats = dashboard.stats || dashboard.totals || dashboard;
  const members = dashboard.members || [];
  const memberCount = members.length || 7;
  const totalTarget = stats.totalTarget ?? stats.targetAmount ?? memberCount * 20000;
  const collected = stats.totalCollected ?? stats.totalPaid ?? stats.contributed ?? 0;
  const groupProgress = stats.progressPercentage ?? stats.groupProgress ?? stats.progressPercent ?? (totalTarget ? collected / totalTarget * 100 : 0);
  const fullyPaid = stats.fullyPaidMembers ?? stats.fullyPaid ?? members.filter((member) => Number(member.contributed ?? 0) >= Number(member.targetAmount ?? 20000)).length;
  const contributedCount = stats.contributingMembers ?? members.filter((member) => Number(member.contributed ?? 0) > 0).length;
  const notContributedCount = stats.notContributedMembers ?? Math.max(0, members.length - contributedCount);

  return <>
    <PageHeader eyebrow="Group overview" title={`Good to see you, ${user?.name?.split(" ")[0] || "there"}`} description="Here's how your group is progressing toward its shared target." />
    {error && <div role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {loading ? <div className="grid min-h-64 place-items-center text-forest-600"><Spinner /></div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total collected" value={`${money(collected)} RWF`} hint={`of ${money(totalTarget)} RWF target`} icon={CircleDollarSign} />
        <StatCard label="Remaining balance" value={`${money(stats.remainingBalance ?? stats.remaining ?? Math.max(0, totalTarget - collected))} RWF`} hint="Across all members" icon={PiggyBank} tone="blue" />
        <StatCard label="Group progress" value={`${Math.round(groupProgress)}%`} hint="Overall completion" icon={Target} tone="amber" />
        <StatCard label="Fully paid members" value={`${fullyPaid} / ${memberCount}`} hint={`${contributedCount} members have contributed`} icon={UsersRound} tone="slate" />
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.6fr_.8fr]">
        <section>
          <div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-bold">Member progress</h2><p className="mt-1 text-sm text-slate-500">Contribution totals update as payments are recorded.</p></div><span className="text-xs font-medium text-slate-400">{memberCount} members</span></div>
          {members.length ? <div className="grid gap-4 sm:grid-cols-2">{members.map((member) => <MemberProgressCard key={member._id || member.id} member={member} />)}</div> : <EmptyState title="No member data yet" message="Member contributions will appear here once the group is set up." />}
        </section>
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-600">Group target</p><p className="mt-2 text-2xl font-bold">{money(totalTarget)} <span className="text-sm font-medium text-slate-400">RWF</span></p></div><span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700"><Target size={20} /></span></div>
            <ProgressBar value={groupProgress} className="mt-5" /><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{Math.round(groupProgress)}% complete</span><span>{money(Math.max(0, totalTarget - collected))} remaining</span></div>
          </Card>
          <Card>
            <h2 className="font-bold">Contribution snapshot</h2><div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><CircleUserRound size={16} />Contributed</span><span className="font-semibold">{contributedCount}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><UsersRound size={16} />Not started</span><span className="font-semibold">{stats.notContributedMembers ?? notContributedCount}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><PiggyBank size={16} />Collected</span><span className="font-semibold">{money(collected)} RWF</span></div>
            </div>
          </Card>
        </div>
      </div>
    </>}
  </>;
}
