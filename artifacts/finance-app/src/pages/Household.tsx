import { useState, useEffect, useRef } from "react";
import HouseholdDonutChart from "@/components/HouseholdDonutChart";
import { useToast } from "@/hooks/use-toast";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
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
} from "@/lib/api-client";
import { getCsrfToken } from "@/lib/api-client/custom-fetch";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Mail, X, LogOut,
  Eye, EyeOff, Pencil, Target, Trash2, CheckCircle, XCircle, AlertCircle, Crown, ShieldCheck, Baby,
  Scissors, GitFork, GitMerge, ChevronDown, ChevronRight,
  Warehouse, PiggyBank, ArrowRightCircle, TrendingUp, Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrefs, fmtAmtRound, fmtAmt, currencySymbol } from "@/lib/prefs";
import { AmtHero } from "@/components/AmtHero";
import { fetchRates, convertAmount } from "@/lib/rates";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

function GlSheet({
  title, open, onClose, children,
}: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 bg-[#111] border-t border-white/10 rounded-t-3xl px-5 pt-6 pb-10 max-h-[88vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <p className="text-lg font-bold text-white">{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center transition active:scale-95">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

const glInputCls = "w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-white/25";
const glLabelCls = "text-xs text-white/40 font-medium";

/** Order breakdown items: account currency first, then language-based order. */
function orderedBreakdown(
  breakdown: { currency: string; rawTotal: number }[],
  accountCurrency: string,
  language: string
): { currency: string; rawTotal: number }[] {
  const langOrder = language === "pl"
    ? ["PLN", "EUR", "USD", "GBP"]
    : ["EUR", "USD", "GBP", "PLN"];
  const nonZero = breakdown.filter(b => Math.abs(b.rawTotal) >= 0.005);
  const acct = nonZero.find(b => b.currency === accountCurrency);
  const rest = nonZero
    .filter(b => b.currency !== accountCurrency)
    .sort((a, b) => {
      const ai = langOrder.indexOf(a.currency);
      const bi = langOrder.indexOf(b.currency);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  return acct ? [acct, ...rest] : rest;
}

/** Currencies with a usable (>0) balance, for the "Asset" source-of-funds dropdown. */
function assetOptions(breakdown: { currency: string; rawTotal: number }[]): { currency: string; rawTotal: number }[] {
  return breakdown.filter(b => b.rawTotal > 0.005);
}

function AssetSelect({
  options, value, onChange,
}: { options: { currency: string; rawTotal: number }[]; value: string; onChange: (v: string) => void }) {
  if (options.length === 0) return null;
  const locked = options.length === 1;
  return (
    <div className="space-y-1.5">
      <Label>{t("larder.asset_label")}</Label>
      <div className="space-y-2">
        {options.map(o => {
          const isActive = !locked && value === o.currency;
          return locked ? (
            <div
              key={o.currency}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/6 bg-white/3 opacity-40 cursor-default select-none"
            >
              <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-white/50 leading-none">{o.currency[0]}</span>
              </div>
              <p className="text-sm text-white/40">{o.currency} · {fmtAmt(o.rawTotal, o.currency)}</p>
            </div>
          ) : (
            <button
              key={o.currency}
              type="button"
              onClick={() => onChange(o.currency)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition ${
                isActive ? "border-white/40 bg-white/10" : "border-white/10 bg-white/3"
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-white/60 leading-none">{o.currency[0]}</span>
              </div>
              <p className="text-sm font-medium truncate text-left text-white/80">{o.currency} · {fmtAmt(o.rawTotal, o.currency)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Small "≈ 12.50 USD" preview when the asset currency differs from the account currency. */
function ConversionPreview({
  amount, from, to, rates,
}: { amount: number; from: string; to: string; rates: Record<string, number> | null }) {
  if (!rates || !from || from === to || isNaN(amount) || amount <= 0) return null;
  const converted = convertAmount(amount, from, to, rates);
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      ≈ {fmtAmt(converted, to)}
    </p>
  );
}

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
  if (role === "household-spendings") return null;
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
  totalBudget: number | null;
  currency: string;
  dashboardBlocked: boolean;
  joinedAt: string;
};

type GoalContribRow = {
  goalId: number;
  goalName: string;
  goalColor: string;
  goalCurrency: string | null;
  budget: number;
  divideByMonths: boolean;
  monthlyTarget: number | null;
  allTimeAmount: number;
  currentMonthAmount: number;
  displayAmount: number;
  percentage: number;
};

type GoalMemberRow = {
  userId: number;
  name: string;
  memberColor: string;
  allTimeAmount: number;
  currentMonthAmount: number;
  goalCurrency: string | null;
};

function GoalBreakdownPanel({ goalId, divideByMonths, rates, viewerCurrency }: {
  goalId: number;
  divideByMonths: boolean;
  rates: Record<string, number> | null;
  viewerCurrency: string;
}) {
  const { data: breakdown, isLoading } = useQuery<GoalMemberRow[]>({
    queryKey: ["goal-member-breakdown-hh", goalId],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/${goalId}/member-breakdown`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!breakdown || breakdown.length === 0) {
    return <p className="text-xs text-white/30 text-center py-1">{t("goals.no_contributions_yet")}</p>;
  }
  return (
    <div className="space-y-2">
      {breakdown.map(m => {
        const gc = m.goalCurrency;
        const hasRates = !!rates && Object.keys(rates).length > 0;
        const dispTotal = gc && gc !== viewerCurrency && hasRates
          ? convertAmount(m.allTimeAmount, gc, viewerCurrency, rates!) : m.allTimeAmount;
        const dispMonth = gc && gc !== viewerCurrency && hasRates
          ? convertAmount(m.currentMonthAmount, gc, viewerCurrency, rates!) : m.currentMonthAmount;
        return (
          <div key={m.userId} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 border"
              style={{ backgroundColor: m.memberColor + "22", borderColor: m.memberColor }}
            />
            <span className="text-xs flex-1 truncate text-white/70">{m.name}</span>
            <div className="text-right flex-shrink-0">
              <span className="text-xs font-medium tabular-nums text-white/90">{fmtAmt(dispTotal, viewerCurrency)}</span>
              {divideByMonths && (
                <span className="text-[10px] text-white/30 ml-1">({fmtAmt(dispMonth, viewerCurrency)}/{t("goals.this_month")})</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MemberSheet({
  member,
  onClose,
  isMe,
  viewerRole,
  onRoleChange,
  onRemove,
  rates,
  anchorY,
}: {
  member: MemberRow;
  onClose: () => void;
  isMe: boolean;
  viewerRole: string;
  onRoleChange?: (newRole: string) => void;
  onRemove?: () => void;
  rates: Record<string, number> | null;
  anchorY: number;
}) {
  const isVirtual = member.userId === -1;

  // Real members use the generated hook; the virtual "Household Spendings"
  // member uses a separate endpoint that returns applied household RP items.
  const { data: realData, isLoading: realLoading, isError: realError } = useGetMemberSpending(
    member.userId,
    { query: { enabled: !isVirtual } },
  );
  const { data: virtualData, isLoading: virtualLoading } = useQuery<any[]>({
    queryKey: ["household-spendings-spending"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/households/members/household-spendings/spending`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isVirtual,
  });
  const data = isVirtual ? virtualData : realData;
  const isLoading = isVirtual ? virtualLoading : realLoading;
  const isError = isVirtual ? false : realError;
  const [savingRole, setSavingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(member.role);

  const viewerCurrency = loadPrefs().currency;
  /** Convert an amount from the member's own currency to the viewer's display currency. */
  function convertMemberAmt(amount: number): number {
    if (!rates || member.currency === viewerCurrency) return amount;
    return convertAmount(amount, member.currency, viewerCurrency, rates);
  }

  const { data: goalContribs, isLoading: contribsLoading } = useQuery<GoalContribRow[]>({
    queryKey: ["member-goal-contributions", member.userId],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/member-contributions/${member.userId}`, {
        credentials: "include",
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !isVirtual,
    staleTime: 30_000,
  });
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Always scroll back to the top when this panel opens or switches member.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [member.userId]);

  const isViewerHead = isHeadRole(viewerRole);
  const canEditRole = isViewerHead && !isMe && !isVirtual;
  const canRemove = isViewerHead && !isMe && !isHeadRole(member.role) && !isVirtual;

  // ── Fixed top positioning ────────────────────────────────────────────────
  // Always open from just below the top chrome (status bar / app header).
  // The panel fills as much vertical space as it needs. A scrollbar only
  // appears when the content genuinely exceeds the available room.
  const vpH = window.innerHeight;
  const TOP_CLEARANCE = 70;     // matches the app header h-[4.375rem] = 70 px
  const BOTTOM_CLEARANCE = 100; // nav bar (80) + breathing room

  const panelPositionStyle: React.CSSProperties = {
    top: TOP_CLEARANCE,
    maxHeight: vpH - TOP_CLEARANCE - BOTTOM_CLEARANCE,
  };

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

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        className="fixed left-0 right-0 z-50 bg-[#111] rounded-2xl overflow-y-auto"
        style={panelPositionStyle}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 sticky top-0 bg-[#111] z-10">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-black"
            style={{ backgroundColor: member.memberColor }}
          >
            {isVirtual
              ? <Home className="w-4 h-4 text-black" />
              : member.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">
                {isVirtual ? t("hh.virtual_member_name") : member.name}
                {isMe && !isVirtual && <span className="text-xs text-white/50 ml-1">{t("hh.you_label")}</span>}
              </p>
              {!isVirtual && <RoleBadge role={member.role} />}
            </div>
            <p className="text-xs text-white/50">
              {isVirtual ? t("hh.virtual_member_subtitle") : t("hh.this_month_breakdown")}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 pb-6">
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
                  {data.map(row => {
                    const isRP = (row as any).isRecurringPayment === true;
                    const rowKey = isRP
                      ? `rp-${(row as any).recurringPaymentId}`
                      : (row.categoryId ?? "uncategorized");
                    // For recurring payments: show 100% bar if applied, 0% if not
                    const barPct = isRP
                      ? (row.total > 0 ? 100 : 0)
                      : row.percentage;
                    return (
                    <div key={rowKey} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.categoryColor ?? "#94a3b8" }} />
                        <span className="text-sm flex-1">{(!row.categoryName || row.categoryName === "Uncategorized") ? t("common.uncategorized") : row.categoryName}</span>
                        {isRP && (
                          <span className="text-[10px] text-white/30 font-medium">↺</span>
                        )}
                        <span className="text-sm font-semibold tabular-nums">{fmt(convertMemberAmt(row.total))}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden ml-4">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: row.categoryColor ?? "#94a3b8" }}
                        />
                      </div>
                    </div>
                    );
                  })}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-sm text-white/50">{t("hh.total_month_txt")}</span>
                    <span className="font-bold tabular-nums">{fmt(data.reduce((s, r) => s + convertMemberAmt(r.total), 0))}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Goal contributions section — shown below spending */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">{t("hh.goal_contributions")}</p>
            {contribsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              </div>
            ) : !goalContribs?.length ? (
              <div className="text-center py-4 text-white/40 text-sm">{t("hh.no_goal_contributions")}</div>
            ) : (
              <div className="space-y-3">
                {goalContribs.map(g => {
                  const viewerCurrency = loadPrefs().currency;
                  const goalCurrency = g.goalCurrency ?? viewerCurrency;
                  const convertedAmount = rates && goalCurrency !== viewerCurrency
                    ? convertAmount(g.displayAmount, goalCurrency, viewerCurrency, rates)
                    : g.displayAmount;
                  const amtStr = fmtAmt(convertedAmount, viewerCurrency);
                  const pctStr = `${g.percentage.toFixed(1).replace(/\.0$/, "")}%`;
                  const contextLabel = g.divideByMonths ? t("hh.goal_contrib_monthly") : t("hh.goal_contrib_total");
                  return (
                    <div key={g.goalId} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.goalColor }} />
                        <span className="text-sm flex-1 truncate">{g.goalName}</span>
                        <span className="text-sm font-semibold tabular-nums text-right">
                          {amtStr}
                          <span className="text-white/40 font-normal ml-1">({pctStr})</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden ml-4">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(g.percentage, 100)}%`, backgroundColor: g.goalColor }}
                        />
                      </div>
                      <p className="text-[10px] text-white/30 ml-4">{contextLabel}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Role editor — only for head viewing non-self members, shown below spending */}
          {canEditRole && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">{t("hh.role_label")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["head", "parent"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRole(r)}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 px-1 border transition-colors text-xs font-medium ${
                      selectedRole === r
                        ? r === "head" ? "border-amber-400 bg-amber-400/10 text-amber-300"
                          : "border-sky-400 bg-sky-400/10 text-sky-300"
                        : "border-white/10 bg-transparent text-white/40 hover:text-white/70"
                    }`}
                  >
                    {r === "head" ? <Crown className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    {r === "head" ? t("hh.role_head") : t("hh.role_parent")}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-white/30 leading-relaxed">
                {selectedRole === "head" && t("hh.role_head_desc_editor")}
                {selectedRole === "parent" && t("hh.role_parent_desc_editor")}
                {/* child/ward kept in code, hidden from UI */}
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
    </>,
    document.body
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

  const prefs2 = loadPrefs();
  const sym2 = currencySymbol(prefs2.currency);

  // Exchange rates for split currency conversion
  const [splitRates, setSplitRates] = useState<Record<string, number> | null>(null);
  useEffect(() => { fetchRates().then(setSplitRates); }, []);

  /** Convert a split amount from issuerCurrency → recipient's display currency. */
  function convertSplitAmount(amount: number, issuerCurrency: string): number {
    if (!splitRates || issuerCurrency === prefs2.currency) return amount;
    return convertAmount(amount, issuerCurrency, prefs2.currency, splitRates);
  }

  const { data: incomingSplits, refetch: refetchIncoming } = useQuery<any[]>({
    queryKey: ["splits-incoming"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/splits/incoming`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const [splitActionLoading, setSplitActionLoading] = useState<number | null>(null);

  async function acceptSplit(id: number, split: any) {
    setSplitActionLoading(id);
    try {
      // Tell the server which currency the recipient's ledger entry should land in —
      // the server always computes the conversion itself using live rates (never
      // trusts a client-side amount), so this always matches what was requested.
      await apiFetch(`${import.meta.env.BASE_URL}api/splits/${id}/accept`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientCurrency: prefs2.currency }),
      });
      refetchIncoming();
      queryClient.invalidateQueries({ queryKey: ["splits-incoming-badge"] });
      queryClient.invalidateQueries({ queryKey: ["splits-declined-badge"] });
    } finally {
      setSplitActionLoading(null);
    }
  }

  async function declineSplit(id: number) {
    setSplitActionLoading(id);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/splits/${id}/decline`, { method: "PATCH" });
      refetchIncoming();
      queryClient.invalidateQueries({ queryKey: ["splits-incoming-badge"] });
    } finally {
      setSplitActionLoading(null);
    }
  }

  // ── Great Larder ─────────────────────────────────────────────────────────
  // _glEnabled is computed before iAmChild; canSeeGreatLarder is finalised after.
  const _glEnabled = !!household;

  const { data: pendingHeadRequests, refetch: refetchHeadRequests } = useQuery<{ id: number; requesterId: number; requesterName: string }[]>({
    queryKey: ["pending-head-requests"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/households/head-requests`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isHeadRole(members?.find(m => m.userId === (me as any)?.id)?.role ?? "") && !!household,
    staleTime: 30_000,
  });

  const { data: greatLarder, refetch: refetchGL } = useQuery<any>({
    queryKey: ["great-larder"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/great-larder`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: _glEnabled,
    refetchInterval: 30_000,
  });

  const [glFundOpen,        setGlFundOpen]        = useState(false);
  const [glFundDesc,        setGlFundDesc]        = useState("");
  const [glFundAmt,         setGlFundAmt]         = useState("");
  const [glFundAsset,       setGlFundAsset]       = useState("");
  const [glLoading,         setGlLoading]         = useState(false);
  const [glApproving,       setGlApproving]       = useState<number | null>(null);
  const [glDedicateOpen,    setGlDedicateOpen]    = useState(false);
  const [glDedicateGoalId,  setGlDedicateGoalId]  = useState<number | null>(null);
  const [glDedicateAmt,     setGlDedicateAmt]     = useState("");
  const [glDedicateAsset,   setGlDedicateAsset]   = useState("");
  const [glDedicateLoading, setGlDedicateLoading] = useState(false);

  const greatLarderRef = useRef<HTMLDivElement>(null);
  const [glVisible, setGlVisible] = useState(false);

  const glAssetOpts = assetOptions(greatLarder?.currencyBreakdown ?? []);
  const glFundAssetBalance = glAssetOpts.find(a => a.currency === glFundAsset)?.rawTotal ?? (greatLarder?.total ?? 0);
  const glDedicateAssetBalance = glAssetOpts.find(a => a.currency === glDedicateAsset)?.rawTotal ?? (greatLarder?.total ?? 0);

  useEffect(() => {
    if (glFundOpen && glAssetOpts.length > 0 && !glAssetOpts.some(a => a.currency === glFundAsset)) {
      setGlFundAsset(glAssetOpts[0].currency);
    }
  }, [glFundOpen, glAssetOpts]);
  useEffect(() => {
    if (glDedicateOpen && glAssetOpts.length > 0 && !glAssetOpts.some(a => a.currency === glDedicateAsset)) {
      setGlDedicateAsset(glAssetOpts[0].currency);
    }
  }, [glDedicateOpen, glAssetOpts]);

  async function handleGlFund(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(glFundAmt.replace(",", "."));
    if (!glFundDesc.trim() || isNaN(amt) || amt <= 0) return;
    if (amt > glFundAssetBalance + 0.005) return;
    setGlLoading(true);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/great-larder/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: glFundDesc.trim(), amount: amt, assetCurrency: glFundAsset || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      setGlFundOpen(false); setGlFundDesc(""); setGlFundAmt("");
      refetchGL();
    } catch (err: any) {
      alert(err.message ?? t("common.error"));
    } finally { setGlLoading(false); }
  }

  async function handleGlDedicate(e: React.FormEvent) {
    e.preventDefault();
    if (!glDedicateGoalId) return;
    const amt = parseFloat(glDedicateAmt.replace(",", "."));
    if (isNaN(amt) || amt <= 0) return;
    if (amt > glDedicateAssetBalance + 0.005) return;
    setGlDedicateLoading(true);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/great-larder/dedicate-to-goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: glDedicateGoalId, amount: amt, assetCurrency: glDedicateAsset || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      setGlDedicateOpen(false); setGlDedicateGoalId(null); setGlDedicateAmt("");
      refetchGL();
    } catch (err: any) {
      alert(err.message ?? t("common.error"));
    } finally { setGlDedicateLoading(false); }
  }

  async function handleGlApprove(id: number) {
    setGlApproving(id);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/great-larder/entries/${id}/approve`, {
        method: "POST",
      });
      refetchGL();
    } finally { setGlApproving(null); }
  }

  async function handleGlReject(id: number) {
    setGlApproving(id);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/great-larder/entries/${id}/reject`, {
        method: "POST",
      });
      refetchGL();
    } finally { setGlApproving(null); }
  }

  async function handleRequestHead() {
    setHeadRequestLoading(true);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/households/request-head`, { method: "POST" });
      setHeadRequestSent(true);
    } finally { setHeadRequestLoading(false); }
  }

  async function handleApproveHeadRequest(notifId: number) {
    setHeadActionLoading(notifId);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/households/head-requests/${notifId}/approve`, { method: "POST" });
      refetchHeadRequests();
      invalidateHousehold(queryClient);
    } finally { setHeadActionLoading(null); }
  }

  async function handleDeclineHeadRequest(notifId: number) {
    setHeadActionLoading(notifId);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/households/head-requests/${notifId}/decline`, { method: "POST" });
      refetchHeadRequests();
    } finally { setHeadActionLoading(null); }
  }

  const { toast } = useToast();
  const [createOpen, setCreateOpen]           = useState(false);
  const [budgetWarnDismissed, setBudgetWarnDismissed] = useState(false);
  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const [inviteOpen, setInviteOpen]         = useState(false);
  const [inviteResult, setInviteResult] = useState<"sent" | "in_household" | null>(null);
  const [deleteHouseholdOpen, setDeleteHouseholdOpen] = useState(false);
  const [deletingHousehold, setDeletingHousehold]     = useState(false);
  const [householdName, setHouseholdName]   = useState("");
  const [householdBudget, setHouseholdBudget] = useState("");
  const [editBudgetVal, setEditBudgetVal]   = useState("");
  const [budgetBreakdownOpen, setBudgetBreakdownOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"head" | "parent">("parent");
  const [headRequestSent, setHeadRequestSent] = useState(false);
  const [headRequestLoading, setHeadRequestLoading] = useState(false);
  const [headActionLoading, setHeadActionLoading] = useState<number | null>(null);
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [memberAnchorY, setMemberAnchorY] = useState(0);
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);

  // My role in the household
  const myMembership = members?.find(m => m.userId === me?.id);
  const myRole = myMembership?.role ?? "child";
  const iAmHead = isHeadRole(myRole);
  const iAmChild = isChildRole(myRole);
  const canSeeGreatLarder = !iAmChild && !!household;

  useEffect(() => {
    if (!canSeeGreatLarder) return;
    const el = greatLarderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setGlVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [canSeeGreatLarder]);

  // Signal Layout's nav wave to fade when GL card enters/leaves view
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('larder-reached', { detail: { visible: glVisible } }));
  }, [glVisible]);

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
  const removeMember = useRemoveHouseholdMember({
    mutation: { onSuccess: () => invalidateHousehold(queryClient) },
  });
  const leaveHousehold = useLeaveHousehold({
    mutation: {
      onSuccess: () => {
        // Immediately wipe the cached household so the empty state renders
        // without waiting for the async refetch round-trip.
        queryClient.setQueryData(getGetHouseholdQueryKey(), null);
        invalidateHousehold(queryClient);
      },
    },
  });
  const updateMe = useUpdateMe({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }) },
  });
  const updateMemberRole = useUpdateMemberRole({
    mutation: { onSuccess: () => invalidateHousehold(queryClient) },
  });

  async function handleAcceptIncomingInvite(token: string) {
    setInviteActionLoading(token);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/invites/${token}/accept`, {
        method: "POST",
      });
      if (r.ok) {
        await queryClient.invalidateQueries({ queryKey: getListIncomingInvitesQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetHouseholdQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getListHouseholdMembersQueryKey() });
      }
    } catch {
      // silently ignore — user sees no change, can retry
    } finally {
      setInviteActionLoading(null);
    }
  }

  async function handleDeclineIncomingInvite(token: string) {
    setInviteActionLoading(token);
    try {
      await apiFetch(`${import.meta.env.BASE_URL}api/invites/${token}/decline`, {
        method: "POST",
      });
      await queryClient.invalidateQueries({ queryKey: getListIncomingInvitesQueryKey() });
    } catch {
      // silently ignore
    } finally {
      setInviteActionLoading(null);
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await createInvite.mutateAsync({ data: { email: inviteEmail.trim(), role: inviteRole } });
      queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() });
      setInviteResult("sent");
    } catch (err: any) {
      const code = err?.data?.error;
      if (code === "USER_IN_HOUSEHOLD") {
        setInviteResult("in_household");
      } else {
        // Surface the actual server message (or a generic fallback) so the
        // user knows something went wrong instead of seeing a silent no-op.
        const serverMsg = typeof err?.data?.error === "string" ? err.data.error : null;
        toast({ title: t("hh.invite_error"), description: serverMsg ?? undefined });
      }
    }
  }

  async function handleDeleteHousehold() {
    setDeletingHousehold(true);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/households`, {
        method: "DELETE",
      });
      if (r.ok) {
        setDeleteHouseholdOpen(false);
        // Wipe cache immediately so empty state shows without waiting for refetch.
        queryClient.setQueryData(getGetHouseholdQueryKey(), null);
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

  /** Convert a member's monthlySpent from their own currency to the viewer's currency. */
  function memberSpentInViewerCurrency(m: { monthlySpent: number; currency: string }): number {
    if (!splitRates || m.currency === prefs.currency) return m.monthlySpent;
    return convertAmount(m.monthlySpent, m.currency, prefs.currency, splitRates);
  }

  const totalSpent = members?.reduce((s, m) => s + memberSpentInViewerCurrency(m), 0) ?? 0;
  const budget = household?.budget ?? null;
  const budgetCurrency = (household as any)?.budgetCurrency ?? null;
  const maxMemberSpent = members ? Math.max(...members.map(m => memberSpentInViewerCurrency(m)), 1) : 1;

  // When budgetCurrency is null (budget was set before currency tracking was added),
  // fall back to the household head's currency so conversion still works correctly.
  const headMember = members?.find(m => isHeadRole(m.role));
  const effectiveBudgetCurrency = budgetCurrency ?? headMember?.currency ?? null;

  // Convert the household budget from the currency it was set in to the viewer's currency
  const budgetInViewerCurrency = budget != null && effectiveBudgetCurrency && effectiveBudgetCurrency !== prefs.currency && splitRates
    ? convertAmount(budget, effectiveBudgetCurrency, prefs.currency, splitRates)
    : budget;

  // Sum of all members' individual budgets converted to the viewer's currency.
  // We must wait for exchange rates before showing any mismatch warning —
  // without rates we cannot tell whether the raw numbers are actually mismatched.
  const sumMemberBudgets: number | null = (members && splitRates)
    ? members.reduce((s, m) => {
        if (m.totalBudget == null) return s;
        const inViewerCurrency =
          m.currency === prefs.currency
            ? m.totalBudget
            : convertAmount(m.totalBudget, m.currency, prefs.currency, splitRates);
        return s + inViewerCurrency;
      }, 0)
    : null;

  // Warn the head if the household budget is set but less than the sum of individual budgets
  const showBudgetMismatch =
    iAmHead &&
    !budgetWarnDismissed &&
    budgetInViewerCurrency != null &&
    sumMemberBudgets != null &&
    sumMemberBudgets > 0 &&
    budgetInViewerCurrency < sumMemberBudgets;

  const isOnline = useOnlineStatus();

  function barPercent(spent: number) {
    if (budgetInViewerCurrency) return Math.min((spent / budgetInViewerCurrency) * 100, 100);
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
    <div className="pb-28 anim-in">
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

      {/* ── Pending split requests (recipient view) ── */}
      {incomingSplits && incomingSplits.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-pink-500/20">
              <Scissors className="w-4 h-4 text-pink-400" />
              <p className="text-sm font-semibold text-pink-300">
                {t("split.pending_title")} <span className="text-pink-400/70 font-normal">({incomingSplits.length})</span>
              </p>
            </div>
            <div className="divide-y divide-pink-500/10">
              {incomingSplits.map((split: any) => (
                <div key={split.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <GitMerge className="w-4 h-4 text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      <span className="text-pink-300">{split.issuerName}</span>{" "}
                      {t("split.wants_you_to_pay")}{" "}
                      <span className="font-bold">
                        {split.recipientAmount != null
                          ? fmtAmt(split.recipientAmount, split.recipientCurrency ?? prefs2.currency)
                          : fmtAmt(convertSplitAmount(split.splitAmount, split.issuerCurrency ?? prefs2.currency), prefs2.currency)}
                      </span>
                    </p>
                    <p className="text-xs text-white/50 mt-0.5 truncate">
                      {t("split.for")} &ldquo;{split.transactionDescription}&rdquo; · {split.transactionDate}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm"
                      className="h-8 px-3 text-xs bg-pink-500 hover:bg-pink-400 text-white border-0"
                      disabled={splitActionLoading === split.id}
                      onClick={() => acceptSplit(split.id, split)}>
                      {t("split.accept")}
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-8 px-3 text-xs text-white/50 hover:text-white hover:bg-white/10"
                      disabled={splitActionLoading === split.id}
                      onClick={() => declineSplit(split.id)}>
                      {t("split.decline")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Incoming household invitations ── */}
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
              {incomingInvites.map((inv: any) => (
                <div key={inv.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Users className="w-4 h-4 text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{inv.householdName ?? "—"}</p>
                    {inv.inviterName && (
                      <p className="text-xs text-pink-300/80 mt-0.5">
                        {t("invite.invited_by", { name: inv.inviterName })}
                      </p>
                    )}
                    <p className="text-xs text-white/40 mt-0.5">
                      {t("invite.expires", { date: new Date(inv.expiresAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs bg-pink-500 hover:bg-pink-400 text-white border-0"
                      disabled={inviteActionLoading === inv.token}
                      onClick={() => handleAcceptIncomingInvite(inv.token)}
                    >
                      {t("hh.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs text-white/50 hover:text-white hover:bg-white/10"
                      disabled={inviteActionLoading === inv.token}
                      onClick={() => handleDeclineIncomingInvite(inv.token)}
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
                  {budgetInViewerCurrency != null ? `${fmt(totalSpent)} / ${fmt(budgetInViewerCurrency)}` : fmt(totalSpent)}
                </span>
              </div>
              {budgetInViewerCurrency != null && (
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/70 transition-all"
                    style={{ width: `${Math.min((totalSpent / budgetInViewerCurrency) * 100, 100)}%` }}
                  />
                </div>
              )}
              {budgetInViewerCurrency != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/30">
                    {totalSpent <= budgetInViewerCurrency
                      ? prefs.language === "pl"
                        ? `${t("common.remaining")} ${fmt(budgetInViewerCurrency - totalSpent)}`
                        : `${fmt(budgetInViewerCurrency - totalSpent)} ${t("common.remaining")}`
                      : `${fmt(totalSpent - budgetInViewerCurrency)} ${t("common.over_budget")}`}
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
                <div className="space-y-2">
                  <button
                    className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
                    onClick={() => { setEditBudgetVal(""); setEditBudgetOpen(true); }}
                  >
                    <Plus className="w-3 h-3" /> {t("hh.set_budget")}
                  </button>
                  {sumMemberBudgets != null && sumMemberBudgets > 0 && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 space-y-2">
                      <p className="text-xs text-amber-200/70 leading-relaxed">
                        {prefs.language === "pl"
                          ? `Suma budżetów członków wynosi ${fmt(sumMemberBudgets)}. Czy chcesz użyć jej jako budżetu domowego?`
                          : `Your members' budgets sum to ${fmt(sumMemberBudgets)}. Use that as the household budget?`}
                      </p>
                      <Button
                        size="sm"
                        className="h-8 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs w-full"
                        onClick={async () => {
                          try {
                            await updateHousehold.mutateAsync({ data: { budget: sumMemberBudgets! } });
                          } catch {
                            // mutation failed — leave prompt visible
                          }
                        }}
                        disabled={updateHousehold.isPending}
                      >
                        {prefs.language === "pl"
                          ? `Ustaw ${fmt(sumMemberBudgets)} jako budżet domowy`
                          : `Set ${fmt(sumMemberBudgets)} as household budget`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Member budget breakdown (expandable) ── */}
            {sumMemberBudgets != null && members && members.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setBudgetBreakdownOpen(o => !o)}
                  data-testid="button-toggle-member-budgets"
                >
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    {budgetBreakdownOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {t("hh.member_budgets")}
                  </span>
                  <span className="text-xs text-white/50 font-medium tabular-nums">{fmt(sumMemberBudgets)}</span>
                </button>

                {budgetBreakdownOpen && (
                  <div className="mt-3 space-y-2">
                    {members.map(m => {
                      const inViewerCurrency =
                        m.totalBudget == null
                          ? null
                          : m.currency === prefs.currency
                          ? m.totalBudget
                          : splitRates
                          ? convertAmount(m.totalBudget, m.currency, prefs.currency, splitRates)
                          : null;
                      return (
                        <div key={m.userId} className="flex items-center gap-2.5" data-testid={`row-member-budget-${m.userId}`}>
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-black"
                            style={{ backgroundColor: m.memberColor }}
                          >
                            {m.userId === -1
                              ? <Home className="w-3 h-3 text-black" />
                              : m.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-white/60 flex-1 truncate">
                            {m.userId === -1 ? t("hh.virtual_member_name") : m.name}
                            {m.userId === me?.id && <span className="text-white/30 ml-1">{t("hh.you_label")}</span>}
                          </span>
                          <span className="text-xs font-medium tabular-nums">
                            {inViewerCurrency != null ? fmt(inViewerCurrency) : t("hh.no_budget_set")}
                          </span>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
                      <span className="text-xs font-semibold text-white/70">{t("hh.members_total")}</span>
                      <span className="text-xs font-semibold tabular-nums">{fmt(sumMemberBudgets)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Budget mismatch warning (head only) ── */}
          {showBudgetMismatch && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-300">{t("hh.budget_mismatch_title")}</p>
                  <p className="text-xs text-amber-200/70 leading-relaxed">
                    {t("hh.budget_mismatch_desc")
                      .replace("{sum}", fmt(sumMemberBudgets!))
                      .replace("{budget}", fmt(budgetInViewerCurrency!))}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-9 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs"
                  onClick={async () => {
                    try {
                      await updateHousehold.mutateAsync({ data: { budget: sumMemberBudgets! } });
                      setBudgetWarnDismissed(true);
                    } catch {
                      // mutation failed — leave warning visible
                    }
                  }}
                  disabled={updateHousehold.isPending}
                >
                  {t("hh.adjust_to_sum").replace("{sum}", fmt(sumMemberBudgets!))}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-9 text-xs text-amber-200/60 hover:text-amber-200 hover:bg-amber-500/10"
                  onClick={() => setBudgetWarnDismissed(true)}
                >
                  {t("hh.leave_as_is")}
                </Button>
              </div>
            </div>
          )}

          {/* ── My role badge ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
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
            {myRole === "parent" && (
              headRequestSent ? (
                <p className="text-xs text-emerald-400/70 text-center py-1">{t("hh.request_head_sent")}</p>
              ) : (
                <button
                  onClick={handleRequestHead}
                  disabled={headRequestLoading}
                  className="w-full py-2 rounded-xl text-xs font-medium border border-amber-400/20 bg-amber-400/5 text-amber-300/60 hover:bg-amber-400/15 hover:text-amber-300 transition-colors disabled:opacity-40"
                >
                  {headRequestLoading ? t("common.saving") : t("hh.request_head_btn")}
                </button>
              )
            )}
          </div>

          {/* ── Members — Household Donut ── */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            {/* Header row: count + invite button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-semibold">
                {t("hh.members")}{" "}
                <span className="text-white/40 font-normal">
                  ({members?.filter(m => m.userId !== -1).length ?? 0})
                </span>
              </p>
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

            {/* Donut chart */}
            <div className="px-4 py-4">
              <HouseholdDonutChart
                members={(members ?? []) as any[]}
                householdBudget={budgetInViewerCurrency}
                currency={prefs.currency}
                rates={splitRates}
                iAmHead={iAmHead}
                onMemberTap={(m) => {
                  setMemberAnchorY(Math.round(window.innerHeight * 0.55));
                  setSelectedMember(m as MemberRow);
                }}
              />
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
                  const contributedGoalCur = s?.totalContributed ?? 0;
                  const rawBudget = parseFloat(g.budget);
                  const hhViewerCur = prefs.currency;
                  const hhGoalCur: string = g.currency ?? hhViewerCur;
                  const hhHasRates = !!splitRates && Object.keys(splitRates).length > 0;
                  const goalBudgetDisplay = hhHasRates && hhGoalCur !== hhViewerCur
                    ? convertAmount(rawBudget, hhGoalCur, hhViewerCur, splitRates!)
                    : rawBudget;
                  const contributedDisplay = hhHasRates && hhGoalCur !== hhViewerCur
                    ? convertAmount(contributedGoalCur, hhGoalCur, hhViewerCur, splitRates!)
                    : contributedGoalCur;
                  const pct = rawBudget > 0 ? Math.min((contributedGoalCur / rawBudget) * 100, 100) : 0;
                  const isExpanded = expandedGoalId === g.id;
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
                          <p className="text-sm font-semibold tabular-nums">{fmtAmtRound(contributedDisplay, hhViewerCur)}</p>
                          <p className="text-xs text-white/40">{t("goals.total_target")}: {fmtAmtRound(goalBudgetDisplay, hhViewerCur)}</p>
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
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-white/30">
                          {pct >= 100 ? t("hh.goal_reached") : `${pct.toFixed(0)}% ${t("hh.combined")}`}
                        </p>
                        <button
                          onClick={() => setExpandedGoalId(isExpanded ? null : g.id)}
                          className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition active:opacity-70"
                        >
                          <Users className="w-3 h-3" />
                          {t("goals.member_contributions")}
                          {isExpanded
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronRight className="w-3 h-3" />}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="pt-1 border-t border-white/5">
                          <GoalBreakdownPanel
                            goalId={g.id}
                            divideByMonths={!!g.divideByMonths}
                            rates={splitRates}
                            viewerCurrency={hhViewerCur}
                          />
                        </div>
                      )}
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

          {/* ── Pending head-role requests — head only ── */}
          {iAmHead && !!pendingHeadRequests && pendingHeadRequests.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-amber-400/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Crown className="w-3.5 h-3.5 text-amber-400/60" />
                <p className="text-sm font-semibold">{t("hh.pending_head_requests")} <span className="text-white/40 font-normal">({pendingHeadRequests.length})</span></p>
              </div>
              <div className="divide-y divide-white/5">
                {pendingHeadRequests.map(req => (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-amber-400/10 flex items-center justify-center flex-shrink-0">
                      <Crown className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-sm flex-1 truncate">
                      {t("hh.head_request_wants_head").replace("{name}", req.requesterName)}
                    </p>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleDeclineHeadRequest(req.id)}
                        disabled={headActionLoading === req.id}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition-colors disabled:opacity-40"
                      >
                        {t("hh.head_request_decline")}
                      </button>
                      <button
                        onClick={() => handleApproveHeadRequest(req.id)}
                        disabled={headActionLoading === req.id}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                      >
                        {t("hh.head_request_approve")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Great Larder (Wielka Spiżarnia) — head + parent only ── */}
          {canSeeGreatLarder && (
            <div ref={greatLarderRef} className="relative overflow-hidden rounded-3xl touch-pan-y"
              style={{
                background: "linear-gradient(145deg, #030305 0%, #0c0b12 18%, #050408 35%, #0f0d18 52%, #040305 68%, #0a0910 82%, #030305 100%)",
                border: glVisible ? "1px solid rgba(255,255,255,0.48)" : "1px solid rgba(255,255,255,0.12)",
                boxShadow: glVisible
                  ? "0 0 55px 16px rgba(255,255,255,0.10), 0 0 80px 25px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.28)"
                  : "0 0 40px 6px rgba(255,255,255,0.04), 0 0 80px 10px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.08)",
                transition: "border-color 0.9s ease, box-shadow 0.9s ease",
              }}
            >
              <style>{`
                @keyframes gemFlashGL { 0%{opacity:0;transform:scale(0.15) rotate(0deg)} 25%{opacity:1;transform:scale(1) rotate(0deg)} 55%{opacity:0.4;transform:scale(0.8) rotate(45deg)} 75%{opacity:0.9;transform:scale(1) rotate(0deg)} 100%{opacity:0;transform:scale(0.15) rotate(0deg)} }
                @keyframes glEdge1 { 0%{transform:translateX(-110px);opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{transform:translateX(100vw);opacity:0} }
                @keyframes glEdge2 { 0%{transform:translateX(100vw);opacity:0} 15%{opacity:0.85} 85%{opacity:0.85} 100%{transform:translateX(-80px);opacity:0} }
                @keyframes glEdge3 { 0%{transform:translateX(8%);opacity:0.45} 45%{opacity:0.95;transform:translateX(62%)} 100%{transform:translateX(8%);opacity:0.45} }
              `}</style>
              {/* Border edge wave glow — hidden when animations disabled */}
              {!loadPrefs().disableAnimations && (
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none" style={{ zIndex:12, opacity: glVisible ? 1 : 0.72, transition:"opacity 0.9s ease" }}>
                <div style={{ position:"absolute", top:0, left:0, height:"2px", width:"140px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.90), transparent)", animation:"glEdge1 6s ease-in-out 0s infinite" }} />
                <div style={{ position:"absolute", top:0, left:0, height:"1px", width:"95px",  background:"linear-gradient(to right, transparent, rgba(255,255,255,0.65), transparent)", animation:"glEdge2 8.5s ease-in-out 1.5s infinite" }} />
                <div style={{ position:"absolute", top:0, left:0, height:"1px", width:"80px",  background:"linear-gradient(to right, transparent, rgba(255,255,255,0.72), transparent)", animation:"glEdge3 5s ease-in-out 3s infinite" }} />
                {glVisible && <>
                  <div style={{ position:"absolute", top:0, left:0, height:"2px", width:"150px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.95), transparent)", animation:"glEdge1 3.8s ease-in-out 0.4s infinite" }} />
                  <div style={{ position:"absolute", top:0, left:0, height:"1px", width:"105px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.80), transparent)", animation:"glEdge2 5.5s ease-in-out 0s infinite" }} />
                  <div style={{ position:"absolute", bottom:0, left:0, height:"1px", width:"115px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.65), transparent)", animation:"glEdge3 6.5s ease-in-out 2s infinite" }} />
                  <div style={{ position:"absolute", top:0, left:0, width:"1px", height:"100%", background:"linear-gradient(to bottom, rgba(255,255,255,0.60) 0%, transparent 60%)", animation:"glEdge2 7s ease-in-out 1s infinite" }} />
                </>}
              </div>
              )}
              {/* Gem sparkles — appear when GL card is in view, hidden when animations disabled */}
              {glVisible && !loadPrefs().disableAnimations && (
                <>
                  <div style={{ position:"absolute", top:8, left:"14%", width:18, height:18, pointerEvents:"none", zIndex:20, animation:"gemFlashGL 2.9s ease-in-out 0s infinite" }}>
                    <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.95), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.95), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:3, height:3, borderRadius:"50%", background:"white", boxShadow:"0 0 5px 2px rgba(255,255,255,0.9)" }} />
                  </div>
                  <div style={{ position:"absolute", top:6, right:"18%", width:13, height:13, pointerEvents:"none", zIndex:20, animation:"gemFlashGL 3.5s ease-in-out 1s infinite" }}>
                    <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.85), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.85), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 2px rgba(255,255,255,0.8)" }} />
                  </div>
                  <div style={{ position:"absolute", bottom:9, left:"28%", width:15, height:15, pointerEvents:"none", zIndex:20, animation:"gemFlashGL 3.2s ease-in-out 1.8s infinite" }}>
                    <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.80), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.80), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 1px rgba(255,255,255,0.7)" }} />
                  </div>
                  <div style={{ position:"absolute", top:"38%", right:7, width:11, height:11, pointerEvents:"none", zIndex:20, animation:"gemFlashGL 2.6s ease-in-out 2.5s infinite" }}>
                    <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.75), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.75), transparent)" }} />
                    <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 3px 1px rgba(255,255,255,0.6)" }} />
                  </div>
                </>
              )}

              <div className="relative z-10 px-5 pt-5 pb-4 space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Warehouse className="w-4.5 h-4.5 text-white/50" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-white/35">{t("gl.title")}</p>
                    <p className="text-[11px] text-white/25 -mt-0.5">{t("gl.subtitle_card")}</p>
                  </div>
                </div>

                {/* Total */}
                <div className="text-center py-2">
                  {greatLarder ? (
                    <>
                      <p className="text-4xl font-bold tracking-tight text-white"
                        style={{ textShadow: "0 0 24px rgba(255,255,255,0.25)" }}>
                        <AmtHero amount={greatLarder.total} currency={greatLarder.currency} />
                      </p>
                      {/* Currency breakdown — shown when savings span multiple currencies */}
                      {(() => {
                        const prefs = loadPrefs();
                        const breakdown: { currency: string; rawTotal: number }[] = greatLarder.currencyBreakdown ?? [];
                        const ordered = orderedBreakdown(breakdown, greatLarder.currency, prefs.language);
                        if (ordered.length === 0) return null;
                        if (ordered.length === 1) {
                          return (
                            <p className="mt-1.5 text-[11px] text-white/25 tabular-nums">
                              {t("larder.all_in_currency", { code: ordered[0].currency })}
                            </p>
                          );
                        }
                        return (
                          <div className="mt-2 flex flex-col items-center gap-0.5">
                            {ordered.map((item: { currency: string; rawTotal: number }) => (
                              <p key={item.currency} className="text-[11px] text-white/30 tabular-nums">
                                {fmtAmtRound(item.rawTotal, item.currency)}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-4xl font-bold text-white/20">—</p>
                  )}
                </div>

                {/* Action buttons — Fund for parents+head; Dedicate to HH goal for head only */}
                <div className={`grid gap-2 ${iAmHead ? "grid-cols-2" : "grid-cols-1"}`}>
                  <button
                    onClick={() => setGlFundOpen(true)}
                    disabled={!greatLarder || greatLarder.total <= 0}
                    className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border border-white/10 bg-white/5 text-white/70 active:bg-white/10 transition-colors disabled:opacity-30"
                  >
                    <PiggyBank className="w-4 h-4" />
                    {t("larder.fund")}
                    {!iAmHead && <span className="text-[10px] text-white/40 ml-1">· {t("larder.needs_approval")}</span>}
                  </button>
                  {iAmHead && (
                    <button
                      onClick={() => setGlDedicateOpen(true)}
                      disabled={!greatLarder || greatLarder.total <= 0}
                      className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border border-white/10 bg-white/5 text-white/70 active:bg-white/10 transition-colors disabled:opacity-30"
                    >
                      <Users className="w-4 h-4" />
                      {t("larder.support_btn")}
                    </button>
                  )}
                </div>

                {/* Pending fund approvals — head only */}
                {iAmHead && greatLarder?.entries?.filter((e: any) => e.status === "pending").length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                      {t("gl.pending_approvals", { n: greatLarder.entries.filter((e: any) => e.status === "pending").length })}
                    </p>
                    <div className="space-y-1.5">
                      {greatLarder.entries
                        .filter((e: any) => e.status === "pending")
                        .map((e: any) => (
                          <div key={e.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 border border-white/8">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{e.note || t("gl.fund_request")}</p>
                              <p className="text-xs text-white/40">{e.contributorName} · {fmtAmtRound(e.amount, e.currency)}</p>
                            </div>
                            <button
                              onClick={() => handleGlApprove(e.id)}
                              disabled={glApproving === e.id}
                              className="p-1.5 text-green-400/70 hover:text-green-400 active:text-green-400 transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleGlReject(e.id)}
                              disabled={glApproving === e.id}
                              className="p-1.5 text-red-400/50 hover:text-red-400 active:text-red-400 transition-colors"
                              title="Reject"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

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
          anchorY={memberAnchorY}
          onClose={() => setSelectedMember(null)}
          onRoleChange={async (newRole) => {
            await handleRoleChange(selectedMember.userId, newRole);
          }}
          onRemove={() => {
            removeMember.mutate({ userId: selectedMember.userId });
          }}
          rates={splitRates}
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
        if (!open) { setInviteEmail(""); setInviteResult(null); setInviteRole("parent"); }
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
              <Button className="w-full" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteResult(null); setInviteRole("parent"); }}>
                {t("common.done")}
              </Button>
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
                <div className="grid grid-cols-2 gap-1.5">
                  {(["head", "parent"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInviteRole(r)}
                      className={`flex flex-col items-center gap-1 rounded-lg py-2.5 px-1 border transition-colors text-xs font-medium ${
                        inviteRole === r
                          ? r === "head" ? "border-amber-400 bg-amber-400/10 text-amber-300"
                            : "border-sky-400 bg-sky-400/10 text-sky-300"
                          : "border-white/10 bg-transparent text-white/40 hover:text-white/70"
                      }`}
                    >
                      {r === "head" ? <Crown className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      {r === "head" ? t("hh.role_head") : t("hh.role_parent")}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-white/30 leading-relaxed">
                  {inviteRole === "head" && t("hh.invite_role_head_desc")}
                  {inviteRole === "parent" && t("hh.invite_role_parent_desc")}
                  {/* child/ward kept in code, hidden from UI */}
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

      {/* ── Great Larder: Fund (spend from GL into a transaction) ── */}
      <GlSheet title={t("gl.fund_sheet")} open={glFundOpen} onClose={() => { setGlFundOpen(false); setGlFundDesc(""); setGlFundAmt(""); }}>
        <form onSubmit={handleGlFund} className="space-y-4">
          <div className="space-y-1.5">
            <label className={glLabelCls}>{t("larder.description")}</label>
            <input
              className={glInputCls}
              placeholder={t("larder.description")}
              value={glFundDesc}
              onChange={e => setGlFundDesc(e.target.value)}
              required
              autoFocus
            />
          </div>
          <AssetSelect options={glAssetOpts} value={glFundAsset} onChange={setGlFundAsset} />
          <div className="space-y-1.5">
            <label className={glLabelCls}>
              {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(glFundAssetBalance, glFundAsset || (greatLarder?.currency ?? ""))}
            </label>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0.00"
              value={glFundAmt}
              onChange={e => setGlFundAmt(e.target.value)}
              required
              className={glInputCls}
            />
            <ConversionPreview
              amount={parseFloat(glFundAmt.replace(",", "."))}
              from={glFundAsset || (greatLarder?.currency ?? "")}
              to={prefs.currency}
              rates={splitRates}
            />
            {!iAmHead && (
              <p className="text-xs text-amber-400/70 leading-relaxed">{t("gl.fund_requires_approval")}</p>
            )}
            <p className="text-xs text-white/25 leading-relaxed">{t("gl.from_gl_desc")}</p>
          </div>
          {(() => {
            const amt = parseFloat(glFundAmt.replace(",", "."));
            if (!isNaN(amt) && amt > 0 && amt > glFundAssetBalance + 0.005) {
              return (
                <div className="px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
                  <p className="text-xs text-amber-300">{t("larder.insufficient_asset", { code: glFundAsset || (greatLarder?.currency ?? "") })}</p>
                </div>
              );
            }
            return null;
          })()}
          <button
            type="submit"
            disabled={glLoading || (() => { const a = parseFloat(glFundAmt.replace(",", ".")); return !isNaN(a) && a > 0 && a > glFundAssetBalance + 0.005; })()}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50"
          >
            {glLoading ? t("gl.submitting") : iAmHead ? t("gl.fund_btn") : t("gl.request_btn")}
          </button>
        </form>
      </GlSheet>

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

      {/* ── Great Larder: Dedicate to household goal ── */}
      <GlSheet title={t("gl.support_title")} open={glDedicateOpen} onClose={() => { setGlDedicateOpen(false); setGlDedicateGoalId(null); setGlDedicateAmt(""); }}>
        <form onSubmit={handleGlDedicate} className="space-y-4">
          <p className="text-sm text-white/50">
            {t("gl.support_desc")}
          </p>
          {sharedGoals.length === 0 ? (
            <p className="text-sm text-amber-400/80 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
              {t("gl.no_shared_goals")}
            </p>
          ) : (
            <div className="space-y-1.5">
              <label className={glLabelCls}>{t("gl.goal_label")}</label>
              <div className="space-y-2">
                {sharedGoals.map((g: any) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGlDedicateGoalId(g.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition ${
                      glDedicateGoalId === g.id
                        ? "border-white/40 bg-white/10"
                        : "border-white/10 bg-white/3 text-white/60 hover:bg-white/5"
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: g.color ?? "#818cf8" }} />
                    <p className="text-sm font-medium truncate text-left text-white/80">{g.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <AssetSelect options={glAssetOpts} value={glDedicateAsset} onChange={setGlDedicateAsset} />
          <div className="space-y-1.5">
            <label className={glLabelCls}>
              {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(glDedicateAssetBalance, glDedicateAsset || (greatLarder?.currency ?? ""))}
            </label>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0.00"
              value={glDedicateAmt}
              onChange={e => setGlDedicateAmt(e.target.value)}
              required
              className={glInputCls}
            />
            <ConversionPreview
              amount={parseFloat(glDedicateAmt.replace(",", "."))}
              from={glDedicateAsset || (greatLarder?.currency ?? "")}
              to={prefs.currency}
              rates={splitRates}
            />
            {glDedicateGoalId && (() => {
              const summary = (goalSummary ?? []).find((s: any) => s.goalId === glDedicateGoalId);
              if (!summary) return null;
              const remaining = summary.budget - summary.contributed;
              const goalObj = (sharedGoals ?? []).find((g: any) => g.id === glDedicateGoalId);
              const currency = (goalObj as any)?.currency ?? prefs.currency;
              if (remaining <= 0) return (
                <p className="text-xs text-emerald-400/80">{t("home.goal_completed")}</p>
              );
              return (
                <p className="text-xs text-white/45">{t("home.goal_remaining", { amt: fmtAmt(remaining, currency) })}</p>
              );
            })()}
          </div>
          {(() => {
            const amt = parseFloat(glDedicateAmt.replace(",", "."));
            if (!isNaN(amt) && amt > 0 && amt > glDedicateAssetBalance + 0.005) {
              return (
                <div className="px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
                  <p className="text-xs text-amber-300">{t("larder.insufficient_asset", { code: glDedicateAsset || (greatLarder?.currency ?? "") })}</p>
                </div>
              );
            }
            return null;
          })()}
          <button
            type="submit"
            disabled={glDedicateLoading || !glDedicateGoalId || sharedGoals.length === 0 || (() => { const a = parseFloat(glDedicateAmt.replace(",", ".")); return !isNaN(a) && a > 0 && a > glDedicateAssetBalance + 0.005; })()}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50"
          >
            {glDedicateLoading ? "…" : t("larder.support_btn")}
          </button>
        </form>
      </GlSheet>
    </div>
  );
}
