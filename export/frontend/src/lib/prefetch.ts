/**
 * prefetch.ts
 *
 * Imperative prefetch helpers called from SplashScreen during the intro.
 * Using queryClient.prefetchQuery() means results land in the React Query cache
 * before the splash exits — so every page renders with data already available.
 *
 * Wave 1 (prefetchHomeData): all queries needed to render the initial home
 * tab, including the /me request that determines the destination.
 *   Called as soon as the splash mounts, underneath the banner/intro.
 *
 * Wave 2 (prefetchHouseholdData): queries that require knowing the user's
 *   householdId. Called once useGetMe() resolves with a user object.
 *
 * Both return Promise<void>. The splash treats this promise as a hard visual
 * boundary: it does not begin its exit sequence until every startup request
 * has either produced data or reached a terminal error state.
 */

import { type QueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  getGetMeQueryOptions,
  getListCategoriesQueryOptions,
  getListRecurringPaymentsQueryOptions,
  getGetLarderQueryOptions,
  getListGoalsQueryOptions,
  getListGoalContributionsQueryOptions,
  getGetGoalsSummaryQueryOptions,
  getGetSpendingSummaryQueryOptions,
  getGetMonthlySummaryQueryOptions,
  getGetRecentActivityQueryOptions,
  getListBudgetStretchesQueryOptions,
  getListTransactionsQueryOptions,
  getListHouseholdMembersQueryOptions,
  getListIncomingInvitesQueryOptions,
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
 * Wave 1 — prefetch everything needed by the initial home tab.
 * Safe to call as soon as the splash mounts.
 */
export async function prefetchHomeData(queryClient: QueryClient): Promise<void> {
  const { month, startDate, endDate } = currentMonthParams();
  const { currency } = loadPrefs();

  // Resolve /me independently from the parallel home wave. The household
  // wave cannot start until this request has reached a terminal state and its
  // user data is definitely in the cache.
  const userPromise = queryClient.fetchQuery(getGetMeQueryOptions());
  const homeWave = Promise.allSettled([
    // Static lists — no params
    queryClient.prefetchQuery(getListCategoriesQueryOptions()),
    queryClient.prefetchQuery(getListRecurringPaymentsQueryOptions()),
    queryClient.prefetchQuery(getGetLarderQueryOptions()),
    queryClient.prefetchQuery(getListGoalsQueryOptions()),
    queryClient.prefetchQuery(getListGoalContributionsQueryOptions({ month })),
    // HomeSpending uses the no-params goal summary key. Keep the
    // month-specific key below as well for the dashboard.
    queryClient.prefetchQuery(getGetGoalsSummaryQueryOptions({})),
    queryClient.prefetchQuery(getGetMonthlySummaryQueryOptions()),
    queryClient.prefetchQuery(getListIncomingInvitesQueryOptions()),

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
    // Layout reads this badge immediately after the home route mounts.
    queryClient.prefetchQuery({
      queryKey: ["notification-counts"],
      queryFn: async () => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}api/notification-counts`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error("Notification counts request failed");
        return response.json();
      },
    }),
  ]);

  // Wait for both waves. Promise.allSettled intentionally turns terminal API
  // errors into a settled startup state; it must not turn an in-flight request
  // into an early splash exit.
  await Promise.allSettled([userPromise, homeWave]);

  // Once /me has settled, use its household identity to finish the second
  // wave before allowing the splash to play its exit animation.
  const user = queryClient.getQueryData<any>(
    getGetMeQueryOptions().queryKey,
  );
  if (user?.householdId) {
    await prefetchHouseholdData(queryClient, user.householdId);
  }
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

  // HomeSpending only enables this endpoint for the current household head.
  // Prefetch it here so its enabled query cannot become the visible
  // post-splash loading state.
  const members = queryClient.getQueryData<any[]>(
    getListHouseholdMembersQueryOptions().queryKey,
  ) ?? [];
  const user = queryClient.getQueryData<any>(
    getGetMeQueryOptions().queryKey,
  );
  const currentMember = members.find((member) => member.userId === user?.id);
  const isHead = currentMember?.role === "head" || currentMember?.role === "owner";
  const { month } = currentMonthParams();

  if (isHead) {
    await queryClient.prefetchQuery({
      queryKey: ["household-recurring-payments"],
      queryFn: async () => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}api/household-recurring-payments`,
          { credentials: "include" },
        );
        if (!response.ok) return [];
        return response.json();
      },
    });
  }
}
