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
 * Household data is started in the background after the critical home data
 * is ready. Those queries are already enabled by the mounted home/layout
 * components, so they share the in-flight request instead of blocking startup.
 *
 * The critical helper rejects when a required request fails. The splash
 * retries the complete critical wave behind the pulsing logo instead of
 * exposing a partially-loaded page.
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
} from "@/lib/api-client";

const STARTUP_REQUEST_TIMEOUT_MS = 6_000;
// Retry the wave as a unit from SplashScreen. Nested retries here can turn one
// slow endpoint into 3 × 6 seconds before the splash gets a chance to retry
// with the rest of the cache already warm.
const STARTUP_QUERY_OPTIONS = { retry: false as const } as any;
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
  ]);

  // Household members and household recurring payments are useful immediately
  // after the home shell mounts, but are not required to paint the core home
  // cards. Start them now so the component queries can share the in-flight
  // work without making the splash wait for a second serialized wave.
  if (user?.householdId) {
    void prefetchHouseholdData(queryClient, user.householdId).catch(() => {
      // The mounted components own the visible retry/error state for these
      // secondary queries. A secondary failure must not hold the splash open.
    });
  }
}

/**
 * Background prefetch for queries that require knowing the user.
 * Call only after the critical home data has resolved.
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
