/**
 * prefetch.ts
 *
 * Imperative prefetch helpers called from SplashScreen during the pulsing phase.
 * Using queryClient.prefetchQuery() means results land in the React Query cache
 * before the splash exits — so every page renders with data already available.
 *
 * Wave 1 (prefetchHomeData): all queries that don't need user data.
 *   Called as soon as the "showing" phase begins (~T=2000ms from mount).
 *
 * Wave 2 (prefetchHouseholdData): queries that require knowing the user's
 *   householdId. Called once useGetMe() resolves with a user object.
 *
 * Both return Promise<void>. Errors are swallowed — prefetchQuery never throws,
 * it just skips caching on failure, so the page falls back to its own fetch.
 */

import { type QueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  getGetMeQueryOptions,
  getListCategoriesQueryOptions,
  getListRecurringPaymentsQueryOptions,
  getGetLarderQueryOptions,
  getListGoalsQueryOptions,
  getGetGoalsSummaryQueryOptions,
  getGetSpendingSummaryQueryOptions,
  getGetMonthlySummaryQueryOptions,
  getGetRecentActivityQueryOptions,
  getListBudgetStretchesQueryOptions,
  getListTransactionsQueryOptions,
  getListHouseholdMembersQueryOptions,
} from "@/lib/api-client";
import { loadPrefs } from "@/lib/prefs";

/** ISO date helpers for the current month */
function currentMonthParams() {
  const now    = new Date();
  const month  = format(now, "yyyy-MM");
  const startDate = format(startOfMonth(now), "yyyy-MM-dd");
  const endDate   = format(endOfMonth(now),   "yyyy-MM-dd");
  return { month, startDate, endDate };
}

/**
 * Wave 1 — prefetch everything that doesn't need user data.
 * Safe to call as soon as the splash "showing" phase begins.
 */
export async function prefetchHomeData(queryClient: QueryClient): Promise<void> {
  const { month, startDate, endDate } = currentMonthParams();
  const { currency } = loadPrefs();

  await Promise.allSettled([
    // /api/auth/me — also fetched by the splash hook, but including here
    // ensures it's in cache for AuthGuard even if the hook hasn't resolved yet.
    queryClient.prefetchQuery(getGetMeQueryOptions()),

    // Static lists — no params
    queryClient.prefetchQuery(getListCategoriesQueryOptions()),
    queryClient.prefetchQuery(getListRecurringPaymentsQueryOptions()),
    queryClient.prefetchQuery(getGetLarderQueryOptions()),
    queryClient.prefetchQuery(getListGoalsQueryOptions()),
    queryClient.prefetchQuery(getGetMonthlySummaryQueryOptions()),

    // Current-month parameterised queries
    queryClient.prefetchQuery(
      getGetSpendingSummaryQueryOptions({ month, currency } as any),
    ),
    queryClient.prefetchQuery(
      getGetGoalsSummaryQueryOptions({ month } as any),
    ),
    queryClient.prefetchQuery(
      getListBudgetStretchesQueryOptions({ month } as any),
    ),
    queryClient.prefetchQuery(
      getListTransactionsQueryOptions({ startDate, endDate } as any),
    ),
    queryClient.prefetchQuery(
      getGetRecentActivityQueryOptions(),
    ),
  ]);
}

/**
 * Wave 2 — prefetch queries that require knowing the user.
 * Call only after useGetMe() has resolved with a non-null user.
 *
 * @param householdId  Pass user.householdId; if null/undefined this is a no-op.
 */
export async function prefetchHouseholdData(
  queryClient: QueryClient,
  householdId: number | null | undefined,
): Promise<void> {
  if (!householdId) return;
  await queryClient.prefetchQuery(getListHouseholdMembersQueryOptions());
}
