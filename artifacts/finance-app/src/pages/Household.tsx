import { useState } from "react";
import { t } from "@/lib/i18n";
import {
  useGetHousehold,
  useListHouseholdMembers,
  useListInvites,
  useCreateHousehold,
  useUpdateHousehold,
  useCreateInvite,
  useCancelInvite,
  useRemoveHouseholdMember,
  useLeaveHousehold,
  useGetMe,
  useUpdateMe,
  useGetMemberSpending,
  useListGoals,
  useGetGoalsSummary,
  getGetHouseholdQueryKey,
  getListHouseholdMembersQueryKey,
  getListInvitesQueryKey,
  getGetMeQueryKey,
  getListGoalsQueryKey,
  getGetGoalsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Mail, X, LogOut, Copy, Check,
  Lock, Eye, EyeOff, Pencil, Target, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrefs, fmtAmtRound, currencySymbol } from "@/lib/prefs";

function invalidateHousehold(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getGetHouseholdQueryKey() });
  qc.invalidateQueries({ queryKey: getListHouseholdMembersQueryKey() });
  qc.invalidateQueries({ queryKey: getListInvitesQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
}

function fmt(n: number) {
  return fmtAmtRound(n, loadPrefs().currency);
}

type MemberRow = {
  userId: number;
  name: string;
  email: string;
  role: string;
  memberColor: string;
  monthlySpent: number;
  dashboardBlocked: boolean;
  joinedAt: string;
};

function MemberSpendingSheet({
  member,
  onClose,
  isMe,
}: {
  member: MemberRow;
  onClose: () => void;
  isMe: boolean;
}) {
  const { data, isLoading, isError } = useGetMemberSpending(member.userId);

  const blocked = !isMe && member.dashboardBlocked;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] rounded-t-2xl max-h-[80vh] flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-black"
            style={{ backgroundColor: member.memberColor }}
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{member.name} {isMe && <span className="text-xs text-white/50">{t("hh.you_label")}</span>}</p>
            <p className="text-xs text-white/50">This month's breakdown</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {blocked ? (
            <div className="flex flex-col items-center py-10 gap-3 text-white/40">
              <EyeOff className="w-8 h-8" />
              <p className="text-sm">This member has made their dashboard private.</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center py-10 gap-3 text-white/40">
              <EyeOff className="w-8 h-8" />
              <p className="text-sm">Dashboard is private.</p>
            </div>
          ) : !data?.length ? (
            <div className="text-center py-10 text-white/40 text-sm">{t("hh.no_spending")}</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-white/40 uppercase tracking-wider">{t("hh.category_col")}</p>
                <p className="text-xs text-white/40 uppercase tracking-wider">{t("hh.amount_col")}</p>
              </div>
              {data.map(row => (
                <div key={row.categoryId ?? "uncategorized"} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.categoryColor ?? "#94a3b8" }} />
                    <span className="text-sm flex-1">{row.categoryName}</span>
                    <span className="text-sm font-semibold tabular-nums">{fmt(row.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden ml-4">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${row.percentage}%`, backgroundColor: row.categoryColor ?? "#94a3b8" }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-sm text-white/50">{t("hh.total_month_txt")}</span>
                <span className="font-bold tabular-nums">{fmt(data.reduce((s, r) => s + r.total, 0))}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function HouseholdPage() {
  const queryClient = useQueryClient();
  const prefs = loadPrefs();
  const sym = currencySymbol(prefs.currency);

  const { data: me } = useGetMe();
  const { data: household, isLoading: householdLoading } = useGetHousehold();
  const { data: members } = useListHouseholdMembers();
  const { data: invites } = useListInvites();
  const { data: goals } = useListGoals();
  const { data: goalSummary } = useGetGoalsSummary({});

  const [createOpen, setCreateOpen]   = useState(false);
  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const [inviteOpen, setInviteOpen]         = useState(false);
  const [deleteHouseholdOpen, setDeleteHouseholdOpen] = useState(false);
  const [deletingHousehold, setDeletingHousehold]     = useState(false);
  const [householdName, setHouseholdName]   = useState("");
  const [householdBudget, setHouseholdBudget] = useState("");
  const [editBudgetVal, setEditBudgetVal]   = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [copied, setCopied]           = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  const createHousehold = useCreateHousehold({
    mutation: {
      onSuccess: () => {
        invalidateHousehold(queryClient);
        setCreateOpen(false);
        setHouseholdName("");
        setHouseholdBudget("");
      },
    },
  });
  const updateHousehold = useUpdateHousehold({
    mutation: {
      onSuccess: () => {
        invalidateHousehold(queryClient);
        setEditBudgetOpen(false);
      },
    },
  });
  const createInvite = useCreateInvite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        setInviteOpen(false);
        setInviteEmail("");
      },
    },
  });
  const cancelInvite = useCancelInvite({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() }) },
  });
  const removeMember = useRemoveHouseholdMember({
    mutation: { onSuccess: () => invalidateHousehold(queryClient) },
  });
  const leaveHousehold = useLeaveHousehold({
    mutation: { onSuccess: () => invalidateHousehold(queryClient) },
  });
  const updateMe = useUpdateMe({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }) },
  });

  function copyInviteLink(token: string) {
    const base = window.location.origin + import.meta.env.BASE_URL;
    navigator.clipboard.writeText(`${base}invite/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleDeleteHousehold() {
    setDeletingHousehold(true);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/households`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.ok) {
        setDeleteHouseholdOpen(false);
        invalidateHousehold(queryClient);
      }
    } finally {
      setDeletingHousehold(false);
    }
  }

  // Shared goals = have householdId matching the household
  const sharedGoals = (goals ?? []).filter((g: any) => g.householdId && household && g.householdId === household.id);
  const summaryMap = new Map((goalSummary ?? []).map((s: any) => [s.goalId, s]));

  const totalSpent = members?.reduce((s, m) => s + m.monthlySpent, 0) ?? 0;
  const budget = household?.budget ?? null;
  const maxMemberSpent = members ? Math.max(...members.map(m => m.monthlySpent), 1) : 1;

  function barPercent(spent: number) {
    if (budget) return Math.min((spent / budget) * 100, 100);
    return Math.min((spent / maxMemberSpent) * 100, 100);
  }

  if (householdLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">{t("hh.title")}</h1>
        <p className="text-sm text-white/40 mt-0.5">{t("hh.subtitle")}</p>
      </div>

      {!household ? (
        <div className="px-4 mt-6">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              <Users className="w-8 h-8 text-white/40" />
            </div>
            <div>
              <p className="font-semibold text-lg">{t("hh.no_household")}</p>
              <p className="text-sm text-white/40 mt-1">{t("hh.create_share_msg")}</p>
            </div>
            <Button
              className="w-full max-w-xs gap-2 bg-white text-black hover:bg-white/90"
              onClick={() => setCreateOpen(true)}
              data-testid="button-create-household"
            >
              <Plus className="w-4 h-4" /> {t("hh.create")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 mt-2 space-y-3">

          {/* ── Household card ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-lg leading-tight" data-testid="text-household-name">{household.name}</p>
                <p className="text-xs text-white/40 mt-0.5">{t("hh.since")} {new Date(household.createdAt).toLocaleDateString(loadPrefs().language === "pl" ? "pl-PL" : "en-US", { month: "short", year: "numeric" })}</p>
              </div>
              {household.ownerId === me?.id ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 h-7 text-xs"
                  onClick={() => setDeleteHouseholdOpen(true)}
                  data-testid="button-delete-household"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 h-7 text-xs"
                  onClick={() => { if (confirm(t("hh.leave_confirm"))) leaveHousehold.mutate(); }}
                  data-testid="button-leave-household"
                >
                  <LogOut className="w-3.5 h-3.5" /> {t("hh.leave")}
                </Button>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-white/40">This month</span>
                <span className="text-xs text-white/40">
                  {budget ? `${fmt(totalSpent)} / ${fmt(budget)}` : fmt(totalSpent)}
                </span>
              </div>
              {budget && (
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/70 transition-all"
                    style={{ width: `${Math.min((totalSpent / budget) * 100, 100)}%` }}
                  />
                </div>
              )}
              {budget && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/30">
                    {totalSpent <= budget
                      ? `${fmt(budget - totalSpent)} remaining`
                      : `${fmt(totalSpent - budget)} over budget`}
                  </span>
                  <button
                    className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
                    onClick={() => { setEditBudgetVal(String(budget ?? "")); setEditBudgetOpen(true); }}
                  >
                    <Pencil className="w-3 h-3" /> Edit budget
                  </button>
                </div>
              )}
              {!budget && (
                <button
                  className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
                  onClick={() => { setEditBudgetVal(""); setEditBudgetOpen(true); }}
                >
                  <Plus className="w-3 h-3" /> Set monthly budget
                </button>
              )}
            </div>
          </div>

          {/* ── Members ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-semibold">{t("hh.members")} <span className="text-white/40 font-normal">({members?.length ?? 0})</span></p>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 h-7 text-xs text-white/60 hover:text-white"
                onClick={() => setInviteOpen(true)}
                data-testid="button-invite-member"
              >
                <Mail className="w-3.5 h-3.5" /> {t("hh.invite_btn")}
              </Button>
            </div>

            <div className="divide-y divide-white/5">
              {members?.map(m => {
                const isMe = m.userId === me?.id;
                const barPct = barPercent(m.monthlySpent);
                return (
                  <button
                    key={m.userId}
                    data-testid={`row-member-${m.userId}`}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors group"
                    onClick={() => setSelectedMember(m as MemberRow)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-black"
                        style={{ backgroundColor: m.memberColor }}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">
                            {m.name} {isMe && <span className="text-white/40 font-normal text-xs">{t("hh.you_label")}</span>}
                            {m.dashboardBlocked && !isMe && (
                              <span className="ml-1.5 text-white/30" title="Dashboard private">
                                <EyeOff className="w-3 h-3 inline" />
                              </span>
                            )}
                          </p>
                          <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                            {fmt(m.monthlySpent)}
                          </span>
                        </div>

                        <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${barPct}%`, backgroundColor: m.memberColor }}
                          />
                        </div>
                      </div>

                      {!isMe && household.ownerId === me?.id && (
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1 text-red-400/70 hover:text-red-400 transition-opacity flex-shrink-0"
                          onClick={e => {
                            e.stopPropagation();
                            if (confirm(t("hh.remove_member_confirm", { name: m.name }))) {
                              removeMember.mutate({ userId: m.userId });
                            }
                          }}
                          data-testid={`button-remove-member-${m.userId}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Shared Goals ── */}
          {sharedGoals.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Target className="w-4 h-4 text-white/40" />
                <p className="text-sm font-semibold">{t("hh.shared_goals")} <span className="text-white/40 font-normal">({sharedGoals.length})</span></p>
              </div>
              <div className="divide-y divide-white/5">
                {sharedGoals.map((g: any) => {
                  const s = summaryMap.get(g.id);
                  const contributed = s?.contributed ?? 0;
                  const goalBudget = parseFloat(g.budget);
                  const pct = goalBudget > 0 ? Math.min((contributed / goalBudget) * 100, 100) : 0;
                  return (
                    <div key={g.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: g.color + "33" }}
                        >
                          <Target className="w-3.5 h-3.5" style={{ color: g.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{g.name}</p>
                          <p className="text-xs text-white/40">{t("hh.due")} {g.deadline}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold tabular-nums">{sym}{contributed.toFixed(0)}</p>
                          <p className="text-xs text-white/40">{t("hh.of_goal")} {sym}{goalBudget.toFixed(0)}</p>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? "#34d399" : g.color,
                          }}
                        />
                      </div>
                      <p className="text-xs text-white/30">
                        {pct >= 100 ? t("hh.goal_reached") : `${pct.toFixed(0)}% ${t("hh.combined")}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Privacy toggle ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                {me?.dashboardBlocked ? <EyeOff className="w-4 h-4 text-white/60" /> : <Eye className="w-4 h-4 text-white/60" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t("hh.private_dash_lbl")}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {me?.dashboardBlocked
                    ? t("hh.others_cant")
                    : t("hh.visible")}
                </p>
              </div>
              <Switch
                checked={me?.dashboardBlocked ?? false}
                onCheckedChange={val => updateMe.mutate({ data: { dashboardBlocked: val } })}
                data-testid="switch-dashboard-blocked"
              />
            </div>
          </div>

          {/* ── Pending invites ── */}
          {invites && invites.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-sm font-semibold">{t("hh.pending_invites")} <span className="text-white/40 font-normal">({invites.length})</span></p>
              </div>
              <div className="divide-y divide-white/5">
                {invites.map(inv => (
                  <div key={inv.id} data-testid={`row-invite-${inv.id}`} className="flex items-center gap-3 px-4 py-3 group">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-white/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{inv.email}</p>
                      <p className="text-xs text-white/30">{t("hh.expires")} {new Date(inv.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      className="p-1.5 text-white/40 hover:text-white"
                      onClick={() => copyInviteLink(inv.token)}
                      data-testid={`button-copy-invite-${inv.id}`}
                      title="Copy invite link"
                    >
                      {copied === inv.token ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      className="p-1.5 text-white/30 hover:text-red-400 active:text-red-400"
                      onClick={() => cancelInvite.mutate({ token: inv.token })}
                      data-testid={`button-cancel-invite-${inv.id}`}
                      title="Revoke invite"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Member spending sheet ── */}
      {selectedMember && (
        <MemberSpendingSheet
          member={selectedMember}
          isMe={selectedMember.userId === me?.id}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {/* ── Create household dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("hh.create_title")}</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!householdName.trim()) return;
              const b = householdBudget ? parseFloat(householdBudget) : null;
              createHousehold.mutate({ data: { name: householdName.trim(), budget: b } });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>{t("hh.household_name_label")}</Label>
              <Input
                data-testid="input-household-name"
                placeholder={t("hh.name_placeholder")}
                value={householdName}
                onChange={e => setHouseholdName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hh.monthly_budget_lbl")} <span className="text-white/30 font-normal">{t("hh.optional_lbl")}</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                <Input
                  data-testid="input-household-budget"
                  placeholder={t("hh.budget_eg")}
                  type="number"
                  min="0"
                  step="1"
                  value={householdBudget}
                  onChange={e => setHouseholdBudget(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" className="flex-1" disabled={createHousehold.isPending} data-testid="button-save-household">
                {createHousehold.isPending ? t("common.saving") : t("hh.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit budget dialog ── */}
      <Dialog open={editBudgetOpen} onOpenChange={setEditBudgetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("home.monthly_budget")}</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              const b = editBudgetVal ? parseFloat(editBudgetVal) : null;
              updateHousehold.mutate({ data: { budget: b } });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>{t("hh.budget_amount_lbl")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                <Input
                  placeholder={t("hh.budget_eg")}
                  type="number"
                  min="0"
                  step="1"
                  value={editBudgetVal}
                  onChange={e => setEditBudgetVal(e.target.value)}
                  className="pl-7"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditBudgetOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" className="flex-1" disabled={updateHousehold.isPending}>
                {updateHousehold.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Invite dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={open => { setInviteOpen(open); if (!open) setInviteEmail(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("hh.invite_title")}</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!inviteEmail.trim()) return;
              createInvite.mutate({ data: { email: inviteEmail.trim() } });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>{t("hh.email_lbl")}</Label>
              <Input
                data-testid="input-invite-email"
                type="email"
                placeholder="friend@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setInviteOpen(false); setInviteEmail(""); }}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" className="flex-1" disabled={createInvite.isPending} data-testid="button-send-invite">
                {createInvite.isPending ? t("common.saving") : t("hh.send_invite")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete household confirmation dialog ── */}
      <Dialog open={deleteHouseholdOpen} onOpenChange={open => { if (!deletingHousehold) setDeleteHouseholdOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" /> {t("hh.delete_btn")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-red-400">{t("hh.delete_cannot_undo")}</p>
              <p className="text-xs text-white/60">
                {t("hh.deleting_tx")} <span className="font-semibold text-white/80">{household?.name}</span>{" "}
                {t("hh.delete_full_desc")}
              </p>
            </div>
            <p className="text-sm text-white/50">
              {t("hh.delete_are_you_sure")}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteHouseholdOpen(false)}
                disabled={deletingHousehold}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0"
                onClick={handleDeleteHousehold}
                disabled={deletingHousehold}
                data-testid="button-confirm-delete-household"
              >
                {deletingHousehold ? t("hh.deleting_btn") : t("hh.delete_btn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
