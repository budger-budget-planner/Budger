/**
 * useLiveActivity — automatically starts, updates, or ends a Budger
 * Live Activity based on the current month's spending summary.
 *
 * Call this once in Dashboard.tsx (or the top-level app shell for the
 * current month).  When running on a plain browser it is a complete no-op.
 * When running inside a Capacitor iOS native shell with the
 * @capacitor-community/live-activities plugin synced, it drives the
 * Dynamic Island / Lock Screen widget automatically.
 */
import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { liveActivityService, type BudgerActivityState, type BudgerActivityAttributes } from "@/lib/live-activity";

export type LiveActivityInput = {
  totalSpent: number;
  totalBudget: number;
  currencySymbol: string;
  topCategoryName: string;
  topCategoryColor: string;
  transactionCount: number;
  householdName: string;
  /** Only manage the activity for the current calendar month. */
  isCurrentMonth: boolean;
};

export function useLiveActivity(input: LiveActivityInput | null) {
  const prevRef = useRef<BudgerActivityState | null>(null);

  useEffect(() => {
    if (!liveActivityService.isSupported) return;
    if (!input) return;

    // Only run the Live Activity for the current month
    if (!input.isCurrentMonth) {
      // If we previously had an activity running, end it gracefully
      if (liveActivityService.activeId && prevRef.current) {
        liveActivityService.end(prevRef.current);
        prevRef.current = null;
      }
      return;
    }

    const state: BudgerActivityState = {
      totalSpent: Math.round(input.totalSpent * 100) / 100,
      totalBudget: Math.round(input.totalBudget * 100) / 100,
      currencySymbol: input.currencySymbol,
      topCategoryName: input.topCategoryName,
      topCategoryColor: input.topCategoryColor,
      transactionCount: input.transactionCount,
      lastUpdatedAt: new Date().toISOString(),
    };

    const attrs: BudgerActivityAttributes = {
      householdName: input.householdName,
      period: format(new Date(), "MMMM yyyy"),
    };

    liveActivityService.upsert(attrs, state);
    prevRef.current = state;
  }, [
    input?.totalSpent,
    input?.totalBudget,
    input?.transactionCount,
    input?.topCategoryName,
    input?.isCurrentMonth,
  ]);

  // Reconcile any orphaned activity on mount
  useEffect(() => {
    liveActivityService.reconcile();
  }, []);

  // End activity when the component unmounts (user logs out / navigates away)
  useEffect(() => {
    return () => {
      const last = prevRef.current;
      if (last) {
        liveActivityService.end(last);
      }
    };
  }, []);
}
