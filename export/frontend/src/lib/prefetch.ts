/**
 * prefetch.ts
 *
 * Imperative prefetch helpers called from SplashScreen during the intro.
 * Using queryClient.fetchQuery() means results land in the React Query cache
 * before the splash exits — so every page renders with data already available.
 *
 * prefetchHomeData: the queries needed to render the initial home tab.
 * /me is resolved first so an unauthenticated splash never fires a burst of
 * guaranteed 401 requests.
 *
 * Wave 2 (prefetchHouseholdData): queries that require knowing the user's
 *   householdId. Called once useGetMe() resolves with a user object.
 *
 * Both return Promise<void>. A rejection is intentionally allowed to reach the
 * splash, which retries it behind the pulsing logo instead of exposing a
 * partially-loaded page.
 */

import { type QueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { fetchWithTimeout } from "@/lib/request-timeout";
import {
  getGetMeQueryOptions,
  getListCategoriesQueryOptions,
  getListRecurringPaymentsQueryOptions,
  getGetLarderQueryOptions,
  getListGoalsQueryOptions,
  getListGoalContributionsQueryOptions,
  getGetGoalsSummaryQueryOptions,
  getListBudgetStretchesQueryOptions,
  getListTransactionsQueryOptions,
  getListHouseholdMembersQueryOptions,
  getListIncomingInvitesQueryOptions,
} from "@/lib/api-client";

const STARTUP_REQUEST_TIMEOUT_MS = 7_000;
// Startup requests are retried automatically for transient network/5xx errors.
// Client errors (including 401) are not retried; /me handles 401 as the normal
// logged-out path below.
const STARTUP_QUERY_OPTIONS = {
  retry: (failureCount: number, error: unknown) => {
    const status = (error as any)?.status as number | undefined;
    if (
      status !== undefined &&
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 425 &&
      status !== 429
    ) return false;
    return failureCount < 2;
  },
} as any;
const STARTUP_REQUEST_OPTIONS = { timeoutMs: STARTUP_REQUEST_TIMEOUT_MS };

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

  // Resolve /me before any other authenticated startup request. This avoids a
  // burst of work on a cold Render instance and avoids firing every home query
  // at all when the browser has no valid session.
  const user = await queryClient
    .fetchQuery(
      getGetMeQueryOptions({
        query: STARTUP_QUERY_OPTIONS,
        request: STARTUP_REQUEST_OPTIONS,
      }),
    )
    .catch((error) => {
      if ((error as any)?.status === 401) return null;
      throw error;
    });
  if (!user) return;

  await Promise.all([
    // Static lists — no params
    queryClient.fetchQuery(
      getListCategoriesQueryOptions({
        query: STARTUP_QUERY_OPTIONS,
        request: STARTUP_REQUEST_OPTIONS,
      }),
    ),
    queryClient.fetchQuery(
      getListRecurringPaymentsQueryOptions({
        query: STARTUP_QUERY_OPTIONS,
        request: STARTUP_REQUEST_OPTIONS,
      }),
    ),
    queryClient.fetchQuery(
      getGetLarderQueryOptions({
        query: STARTUP_QUERY_OPTIONS,
        request: STARTUP_REQUEST_OPTIONS,
      }),
    ),
    queryClient.fetchQuery(
      getListGoalsQueryOptions({
        query: STARTUP_QUERY_OPTIONS,
        request: STARTUP_REQUEST_OPTIONS,
      }),
    ),
    queryClient.fetchQuery(
      getListGoalContributionsQueryOptions(
        { month },
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    // HomeSpending uses the no-params goal summary key. Keep the
    // no-params key so the initial home query is satisfied directly.
    queryClient.fetchQuery(
      getGetGoalsSummaryQueryOptions(
        {},
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    queryClient.fetchQuery(
      getListIncomingInvitesQueryOptions({
        query: STARTUP_QUERY_OPTIONS,
        request: STARTUP_REQUEST_OPTIONS,
      }),
    ),

    // Current-month parameterised queries
    queryClient.fetchQuery(
      getListBudgetStretchesQueryOptions(
        { month } as any,
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    queryClient.fetchQuery(
      getListTransactionsQueryOptions(
        { startDate, endDate } as any,
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    // Layout reads this badge immediately after the home route mounts.
    queryClient.fetchQuery({
      queryKey: ["notification-counts"],
      queryFn: async ({ signal }) => {
        const response = await fetchWithTimeout(
          `${import.meta.env.BASE_URL}api/notification-counts`,
          { credentials: "include", signal },
          STARTUP_REQUEST_TIMEOUT_MS,
        );
        if (!response.ok) throw new Error("Notification counts request failed");
        return response.json();
      },
      ...STARTUP_QUERY_OPTIONS,
    }),
  ]);

  // Once /me has settled, use its household identity to finish the second
  // wave before allowing the splash to play its exit animation. A failure
  // rejects the whole startup attempt so the splash can retry it.
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
  await queryClient.fetchQuery(
    getListHouseholdMembersQueryOptions({
      query: STARTUP_QUERY_OPTIONS,
      request: STARTUP_REQUEST_OPTIONS,
    }),
  );

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
    await queryClient.fetchQuery({
      queryKey: ["household-recurring-payments"],
      queryFn: async ({ signal }) => {
        const response = await fetchWithTimeout(
          `${import.meta.env.BASE_URL}api/household-recurring-payments`,
          { credentials: "include", signal },
          STARTUP_REQUEST_TIMEOUT_MS,
        );
        if (!response.ok) throw new Error("Household recurring payments request failed");
        return response.json();
      },
      ...STARTUP_QUERY_OPTIONS,
    });
  }
}
