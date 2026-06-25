import { useState } from "react";
import { t } from "@/lib/i18n";
import {
  useGetHousehold,
  useListHouseholdMembers,
  useListInvites,
  useListIncomingInvites,
  useCreateHousehold,
  useUpdateHousehold,
  useCreateInvite,
  useCancelInvite,
  useAcceptInvite,
  useDeclineInvite,
  useRemoveHouseholdMember,
  useLeaveHousehold,
  useGetMe,
  useUpdateMe,
  useGetMemberSpending,
  useListGoals,
  useGetGoalsSummary,
  useUpdateMemberRole,
  getGetHouseholdQueryKey,
  getListHouseholdMembersQueryKey,
  getListInvitesQueryKey,
  getListIncomingInvitesQueryKey,
  getGetMeQueryKey,
  getListGoalsQueryKey,
  getGetGoalsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Mail, X, LogOut, Copy, Check,
  Eye, EyeOff, Pencil, Target, Trash2, CheckCircle, XCircle, AlertCircle, Crown, ShieldCheck, Baby,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrefs, fmtAmtRound, fmtAmt, currencySymbol } from "@/lib/prefs";

function invalidateHousehold(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getGetHouseholdQueryKey() });
  qc.invalidateQueries({ queryKey: getListHouseholdMembersQueryKey() });
  qc.invalidateQueries({ queryKey: getListInvitesQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
}

function fmt(n: number) {
  return fmtAmtRound(n, loadPrefs().currency);
}

type HouseholdRole = "head" | "parent" | "child" | "owner" | "member";

function isHeadRole(role: string): boolean {
  return role === "head" || role === "owner";
}
function isChildRole(role: string): boolean {
  return role === "child" || role === "member";
}

function roleLabelShort(role: string): string {
  if (isHeadRole(role)) return t("hh.role_head");
  if (role === "parent") return t("hh.role_parent");
  return t("hh.role_child");
}

function RoleBadge({ role }: { role: string }) {
  if (isHeadRole(role)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-300 bg-amber-300/10 rounded px-1.5 py-0.5">
        <Crown className="w-2.5 h-2.5" /> {t("hh.role_head")}
      </span>
    );
  }
  if (role === "parent") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-300 bg-sky-300/10 rounded px-1.5 py-0.5">
        <ShieldCheck className="w-2.5 h-2.5" /> {t("hh.role_parent")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-white/40 bg-white/5 rounded px-1.5 py-0.5">
      <Baby className="w-2.5 h-2.5" /> {t("hh.role_child")}
    </span>
  );
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

function MemberSheet({
  member,
  onClose,
  isMe,
  viewerRole,
  onRoleChange,
  onRemove,
}: {
  member: MemberRow;
  onClose: () => void;
  isMe: boolean;
  viewerRole: string;
  onRoleChange?: (newRole: string) => void;
  onRemove?: () => void;
}) {
  const { data, isLoading, isError } = useGetMemberSpending(member.userId);
  const [savingRole, setSavingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(member.role);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isViewerHead = isHeadRole(viewerRole);
  const canEditRole = isViewerHead && !isMe;
  const canRemove = isViewerHead && !isMe && !isHeadRole(member.role);

  async function handleRoleSave() {
    if (selectedRole === member.role) { onClose(); return; }
    setSavingRole(true);
    try {
      await onRoleChange?.(selectedRole);
      onClose();
    } finally {
      setSavingRole(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] rounded-t-2xl max-h-[85vh] flex flex-col"
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
            <div className="flex items-center gap-2">
              <p className="font-semibold">{member.name} {isMe && <span className="text-xs text-white/50">{t("hh.you_label")}</span>}</p>
              <RoleBadge role={member.role} />
            </div>
            <p className="text-xs text-white/50">{t("hh.this_month_breakdown")}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Spending breakdown — shown first */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">{t("hh.this_month_spending")}</p>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center py-8 gap-3 text-white/40">
                <EyeOff className="w-8 h-8" />
                <p className="text-sm text-center">{t("hh.dashboard_private_msg")}</p>
              </div>
            ) : !data?.length ? (
              <div className="text-center py-8 text-white/40 text-sm">{t("hh.no_spending")}</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-white/40 uppercase tracking-wider">{t("hh.category_col")}</p>
                  <p className="text-xs text-white/40 uppercase tracking-wider">{t("hh.amount_col")}</p>
                </div>
                <div className="space-y-3">
                  {data.map(row => (
                    <div key={row.categoryId ?? "uncategorized"} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.categoryColor ?? "#94a3b8" }} />
                        <span className="text-sm flex-1">{(!row.categoryName || row.categoryName === "Uncategorized") ? t("common.uncategorized") : row.categoryName}</span>
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
                </div>
              </>
            )}
          </div>

          {/* Role editor — only for head viewing non-self members, shown below spending */}
          {canEditRole && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">{t("hh.role_label")}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["head", "parent", "child"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRole(r)}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 px-1 border transition-colors text-xs font-medium ${
                      selectedRole === r
                        ? r === "head" ? "border-amber-400 bg-amber-400/10 text-amber-300"
                          : r === "parent" ? "border-sky-400 bg-sky-400/10 text-sky-300"
                          : "border-white/30 bg-white/10 text-white"
                        : "border-white/10 bg-transparent text-white/40 hover:text-white/70"
                    }`}
                  >
                    {r === "head" ? <Crown className="w-3.5 h-3.5" /> : r === "parent" ? <ShieldCheck className="w-3.5 h-3.5" /> : <Baby className="w-3.5 h-3.5" />}
                    {r === "head" ? t("hh.role_head") : r === "parent" ? t("hh.role_parent") : t("hh.role_child")}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-white/30 leading-relaxed">
                {selectedRole === "head" && t("hh.role_head_desc_editor")}
                {selectedRole === "parent" && t("hh.role_parent_desc_editor")}
                {selectedRole === "child" && t("hh.role_child_desc_editor")}
              </div>
              {selectedRole !== member.role && (
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleRoleSave}
                  disabled={savingRole}
                >
                  {savingRole ? t("common.saving") : t("hh.set_as_role", { role: roleLabelShort(selectedRole) })}
                </Button>
              )}
            </div>
          )}

          {/* Remove from household — head only, for non-head members */}
          {canRemove && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              {!confirmRemove ? (
                <button
                  className="flex items-center gap-2 w-full text-red-400 text-sm font-medium"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  {t("hh.remove_from_hh", { name: member.name })}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-red-300 font-medium">{t("hh.remove_confirm_hdr", { name: member.name })}</p>
                  <p className="text-xs text-white/40">{t("hh.remove_notify_desc")}</p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 h-8 text-xs text-white/50 hover:text-white hover:bg-white/10"
                      onClick={() => setConfirmRemove(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-red-500 hover:bg-red-600 text-white border-0"
                      onClick={() => { onRemove?.(); onClose(); }}
                    >
                      {t("hh.remove_btn")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
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
  const { data: incomingInvites } = useListIncomingInvites();
  const { data: goals } = useListGoals();
  const { data: goalSummary } = useGetGoalsSummary({});

  const [createOpen, setCreateOpen]   = useState(false);
  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const [inviteOpen, setInviteOpen]         = useState(false);
  const [inviteResult, setInviteResult] = useState<"sent" | "no_user" | "in_household" | null>(null);
  const [deleteHouseholdOpen, setDeleteHouseholdOpen] = useState(false);
  const [deletingHousehold, setDeletingHousehold]     = useState(false);
  const [householdName, setHouseholdName]   = useState("");
  const [householdBudget, setHouseholdBudget] = useState("");
  const [editBudgetVal, setEditBudgetVal]   = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"head" | "parent" | "child">("child");
  const [copied, setCopied]           = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  // My role in the household
  const myMembership = members?.find(m => m.userId === me?.id);
  const myRole = myMembership?.role ?? "child";
  const iAmHead = isHeadRole(myRole);
  const iAmChild = isChildRole(myRole);

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
  const createInvite = useCreateInvite();
  const cancelInvite = useCancelInvite({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() }) },
  });
  const acceptIncoming = useAcceptInvite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListIncomingInvitesQueryKey() });
        invalidateHousehold(queryClient);
      },
    },
  });
  const declineIncoming = useDeclineInvite({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListIncomingInvitesQueryKey() }),
    },
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
  const updateMemberRole = useUpdateMemberRole({
    mutation: { onSuccess: () => invalidateHousehold(queryClient) },
  });

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await createInvite.mutateAsync({ data: { email: inviteEmail.trim(), role: inviteRole } });
      queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() });
      setInviteResult("sent");
    } catch (err: any) {
      const code = err?.data?.error;
      if (code === "USER_NOT_FOUND") {
        setInviteResult("no_user");
      } else if (code === "USER_IN_HOUSEHOLD") {
        setInviteResult("in_household");
      }
    }
  }

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

  async function handleRoleChange(targetUserId: number, newRole: string) {
    await updateMemberRole.mutateAsync({ userId: targetUserId, data: { role: newRole as any } });
  }

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

      {/* ── Household removal alert ── */}
      {(me as any)?.pendingHouseholdAlert && (
        <div className="px-4 mt-3">
          <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-4">
              <div className="w-9 h-9 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <X className="w-4 h-4 text-pink-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-pink-300">{t("hh.alert_removed_title")}</p>
                <p className="text-xs text-white/50 mt-0.5">
                  {t("hh.alert_removed_desc")} <span className="text-white/80 font-medium">{(me as any).pendingHouseholdAlert}</span>.
                </p>
              </div>
              <button
                className="text-white/30 hover:text-white/70 p-1 flex-shrink-0"
                onClick={() => updateMe.mutate({ data: { pendingHouseholdAlert: null } as any })}
                title={t("hh.alert_dismiss")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Incoming invitations ── */}
      {incomingInvites && incomingInvites.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-pink-500/20">
              <Mail className="w-4 h-4 text-pink-400" />
              <p className="text-sm font-semibold text-pink-300">
                {t("hh.incoming_invites")} <span className="text-pink-400/70 font-normal">({incomingInvites.length})</span>
              </p>
            </div>
            <div className="divide-y divide-pink-500/10">
              {incomingInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{inv.householdName}</p>
                      <RoleBadge role={(inv as any).role ?? "child"} />
                    </div>
                    <p className="text-xs text-white/40">{t("hh.invite_from")}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs bg-pink-500 hover:bg-pink-400 text-white border-0"
                      disabled={acceptIncoming.isPending || declineIncoming.isPending}
                      onClick={() => acceptIncoming.mutate({ token: inv.token })}
                    >
                      {t("hh.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs text-white/50 hover:text-white hover:bg-white/10"
                      disabled={acceptIncoming.isPending || declineIncoming.isPending}
                      onClick={() => declineIncoming.mutate({ token: inv.token })}
                    >
                      {t("hh.decline")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
              {iAmHead ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 h-7 text-xs"
                  onClick={() => setDeleteHouseholdOpen(true)}
                  data-testid="button-delete-household"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("hh.delete")}
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
                <span className="text-xs text-white/40">{t("hh.this_month")}</span>
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/30">
                    {totalSpent <= budget
                      ? prefs.language === "pl"
                        ? `${t("common.remaining")} ${fmt(budget - totalSpent)}`
                        : `${fmt(budget - totalSpent)} ${t("common.remaining")}`
                      : `${fmt(totalSpent - budget)} ${t("common.over_budget")}`}
                  </span>
                  {iAmHead && (
                    <button
                      className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 flex-shrink-0"
                      onClick={() => { setEditBudgetVal(String(budget ?? "")); setEditBudgetOpen(true); }}
                    >
                      <Pencil className="w-3 h-3" /> {t("hh.edit_budget")}
                    </button>
                  )}
                </div>
              )}
              {!budget && iAmHead && (
                <button
                  className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
                  onClick={() => { setEditBudgetVal(""); setEditBudgetOpen(true); }}
                >
                  <Plus className="w-3 h-3" /> {t("hh.set_budget")}
                </button>
              )}
            </div>
          </div>

          {/* ── My role badge ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-white/40">{t("hh.your_role")}</p>
              <div className="mt-1">
                <RoleBadge role={myRole} />
              </div>
            </div>
            <div className="text-xs text-white/30 text-right max-w-[60%]">
              {isHeadRole(myRole) && t("hh.your_role_head_desc")}
              {myRole === "parent" && t("hh.your_role_parent_desc")}
              {isChildRole(myRole) && t("hh.your_role_child_desc")}
            </div>
          </div>

          {/* ── Members ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-semibold">{t("hh.members")} <span className="text-white/40 font-normal">({members?.length ?? 0})</span></p>
              {iAmHead && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 h-7 text-xs text-white/60 hover:text-white"
                  onClick={() => setInviteOpen(true)}
                  data-testid="button-invite-member"
                >
                  <Mail className="w-3.5 h-3.5" /> {t("hh.invite_btn")}
                </Button>
              )}
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
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {m.name} {isMe && <span className="text-white/40 font-normal text-xs">{t("hh.you_label")}</span>}
                            </p>
                            {m.dashboardBlocked && !isMe && (
                              <span className="text-white/30 flex-shrink-0" title="Dashboard private">
                                <EyeOff className="w-3 h-3 inline" />
                              </span>
                            )}
                            <RoleBadge role={m.role} />
                          </div>
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

                      {!isMe && iAmHead && (
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
                          <p className="text-sm font-semibold tabular-nums">{fmtAmtRound(contributed, loadPrefs().currency)}</p>
                          <p className="text-xs text-white/40">{t("hh.of_goal")} {fmtAmtRound(goalBudget, loadPrefs().currency)}</p>
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

          {/* ── Privacy toggle — hidden for children ── */}
          {!iAmChild && (
            <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  {me?.dashboardBlocked ? <EyeOff className="w-4 h-4 text-white/60" /> : <Eye className="w-4 h-4 text-white/60" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("hh.private_dash_lbl")}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {me?.dashboardBlocked
                      ? myRole === "parent"
                        ? t("hh.privacy_parent_on")
                        : t("hh.privacy_head_on")
                      : myRole === "parent"
                        ? t("hh.privacy_parent_off")
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
          )}

          {/* ── Pending invites — head only ── */}
          {iAmHead && invites && invites.length > 0 && (
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm truncate">{inv.email}</p>
                        <RoleBadge role={(inv as any).role ?? "child"} />
                      </div>
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

      {/* ── Member sheet (spending + role edit for head) ── */}
      {selectedMember && (
        <MemberSheet
          member={selectedMember}
          isMe={selectedMember.userId === me?.id}
          viewerRole={myRole}
          onClose={() => setSelectedMember(null)}
          onRoleChange={async (newRole) => {
            await handleRoleChange(selectedMember.userId, newRole);
          }}
          onRemove={() => {
            removeMember.mutate({ userId: selectedMember.userId });
          }}
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

      {/* ── Invite dialog (head only) ── */}
      <Dialog open={inviteOpen} onOpenChange={open => {
        setInviteOpen(open);
        if (!open) { setInviteEmail(""); setInviteResult(null); setInviteRole("child"); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("hh.invite_title")}</DialogTitle></DialogHeader>

          {inviteResult === "sent" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-green-400">{t("hh.invite_sent")}</p>
                <p className="text-sm text-white/50 mt-1">{inviteEmail}</p>
                <p className="text-xs text-white/30 mt-0.5">{t("hh.invite_as_role", { role: roleLabelShort(inviteRole) })}</p>
              </div>
              <Button className="w-full" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteResult(null); setInviteRole("child"); }}>
                {t("common.done")}
              </Button>
            </div>
          ) : inviteResult === "no_user" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-red-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-red-400">{t("hh.not_found")}</p>
                <p className="text-sm text-white/50 mt-1">{t("hh.no_user_found")}</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteResult(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1" onClick={() => setInviteResult(null)}>{t("hh.try_again")}</Button>
              </div>
            </div>
          ) : inviteResult === "in_household" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-yellow-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-yellow-400">{t("hh.already_in_hh")}</p>
                <p className="text-sm text-white/50 mt-1">{t("hh.user_in_hh")}</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteResult(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1" onClick={() => setInviteResult(null)}>{t("hh.try_again")}</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit} className="space-y-4">
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

              <div className="space-y-1.5">
                <Label>{t("hh.role_invite_label")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["head", "parent", "child"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInviteRole(r)}
                      className={`flex flex-col items-center gap-1 rounded-lg py-2.5 px-1 border transition-colors text-xs font-medium ${
                        inviteRole === r
                          ? r === "head" ? "border-amber-400 bg-amber-400/10 text-amber-300"
                            : r === "parent" ? "border-sky-400 bg-sky-400/10 text-sky-300"
                            : "border-white/30 bg-white/10 text-white"
                          : "border-white/10 bg-transparent text-white/40 hover:text-white/70"
                      }`}
                    >
                      {r === "head" ? <Crown className="w-3.5 h-3.5" /> : r === "parent" ? <ShieldCheck className="w-3.5 h-3.5" /> : <Baby className="w-3.5 h-3.5" />}
                      {r === "head" ? t("hh.role_head") : r === "parent" ? t("hh.role_parent") : t("hh.role_child")}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-white/30 leading-relaxed">
                  {inviteRole === "head" && t("hh.invite_role_head_desc")}
                  {inviteRole === "parent" && t("hh.invite_role_parent_desc")}
                  {inviteRole === "child" && t("hh.invite_role_child_desc")}
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteResult(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" className="flex-1" disabled={createInvite.isPending} data-testid="button-send-invite">
                  {createInvite.isPending ? t("hh.sending") : t("hh.send_invite")}
                </Button>
              </div>
            </form>
          )}
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
                {t("common.cancel")}
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
