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
  getListTransactionsQueryKey,
  getListGoalContributionsQueryKey,
  getListBudgetStretchesQueryKey,
} from "@/lib/api-client";
import {
  currentMonthKey,
  getHomeMonthParams,
  getHomeTransactionParams,
  getRetainedHomeMonths,
  getTransactionMonthSummaryQueryOptions,
  HOME_TRANSACTION_INITIAL_LIMIT,
} from "@/lib/home-transaction-cache";

const STARTUP_REQUEST_TIMEOUT_MS = 6_000;
// Retry the wave as a unit from SplashScreen. Nested retries here can turn one
// slow endpoint into 3 × 6 seconds before the splash gets a chance to retry
// with the rest of the cache already warm.
const STARTUP_QUERY_OPTIONS = { retry: false as const } as any;
const STARTUP_REQUEST_OPTIONS = { timeoutMs: STARTUP_REQUEST_TIMEOUT_MS };

/** ISO date helpers for the current month */
function currentMonthParams() {
  return getHomeMonthParams(currentMonthKey());
}

/**
 * Wave 1 — prefetch the data required for the initial home paint.
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

  // Keep the splash critical path deliberately small. HomeSpending can render
  // its secondary controls with empty fallbacks while these queries warm in
  // the background; only the first transaction rows and authoritative summary
  // are needed for the initial home cards.
  await Promise.all([
    queryClient.fetchQuery(
      getListTransactionsQueryOptions(
        { startDate, endDate, limit: HOME_TRANSACTION_INITIAL_LIMIT } as any,
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    queryClient.fetchQuery({
      ...getTransactionMonthSummaryQueryOptions(month, STARTUP_REQUEST_TIMEOUT_MS),
      ...STARTUP_QUERY_OPTIONS,
    }),
  ]);

  // Secondary home data is useful immediately after the shell mounts, but it
  // must not keep the splash visible. The mounted queries share these
  // in-flight requests when they become visible.
  void Promise.all([
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
      getListBudgetStretchesQueryOptions(
        { month } as any,
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
  ]).catch(() => {
    // The mounted queries own secondary loading and retry/error states.
  });

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

  void prefetchHomeMonthWindow(queryClient, month).catch(() => {
    // Background month hydration must never hold the splash open.
  });
}

async function prefetchHomeMonthBundle(
  queryClient: QueryClient,
  month: string,
): Promise<void> {
  const { month: monthKey } = getHomeMonthParams(month);
  await Promise.all([
    queryClient.fetchQuery(
      getListTransactionsQueryOptions(
        getHomeTransactionParams(monthKey),
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    queryClient.fetchQuery({
      ...getTransactionMonthSummaryQueryOptions(monthKey, STARTUP_REQUEST_TIMEOUT_MS),
      ...STARTUP_QUERY_OPTIONS,
    }),
    queryClient.fetchQuery(
      getListGoalContributionsQueryOptions(
        { month: monthKey },
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
    queryClient.fetchQuery(
      getListBudgetStretchesQueryOptions(
        { month: monthKey } as any,
        { query: STARTUP_QUERY_OPTIONS, request: STARTUP_REQUEST_OPTIONS },
      ),
    ),
  ]);
}

function monthFromQueryKey(queryKey: readonly unknown[]): string | null {
  const params = queryKey[1];
  if (!params || typeof params !== "object") return null;
  const startDate = (params as { startDate?: unknown }).startDate;
  return typeof startDate === "string" ? startDate.slice(0, 7) : null;
}

function pruneHomeMonthCache(queryClient: QueryClient, retainedMonths: Set<string>): void {
  const currentMonth = currentMonthKey();
  for (const query of queryClient.getQueryCache().findAll()) {
    const key = query.queryKey;
    let month: string | null = null;
    if (key[0] === "/api/transactions") {
      month = monthFromQueryKey(key);
    } else if (key[0] === "home-transaction-month-summary") {
      month = typeof key[1] === "string" ? key[1] : null;
    } else if (key[0] === "/api/goal-contributions") {
      const params = key[1];
      month = params && typeof params === "object" && typeof (params as any).month === "string"
        ? (params as any).month
        : null;
    } else if (key[0] === "/api/budget-stretches") {
      const params = key[1];
      month = params && typeof params === "object" && typeof (params as any).month === "string"
        ? (params as any).month
        : null;
    }
    if (month && month !== currentMonth && !retainedMonths.has(month)) {
      queryClient.removeQueries({ queryKey: key, exact: true });
    }
  }
}

/**
 * Keep the current month pinned and hydrate the selected month plus its
 * two-month neighborhood. Bundles are loaded one month at a time so a deep
 * navigation does not create another request storm.
 */
export async function prefetchHomeMonthWindow(
  queryClient: QueryClient,
  selectedMonth: string,
): Promise<void> {
  const retainedMonths = getRetainedHomeMonths(selectedMonth);
  pruneHomeMonthCache(queryClient, new Set(retainedMonths));

  for (const month of retainedMonths) {
    const transactionKey = getListTransactionsQueryKey(getHomeTransactionParams(month));
    const hasFullTransactions = queryClient.getQueryData(transactionKey) !== undefined;
    const hasSummary = queryClient.getQueryData(
      getTransactionMonthSummaryQueryOptions(month).queryKey,
    ) !== undefined;
    if (hasFullTransactions && hasSummary) continue;
    try {
      await prefetchHomeMonthBundle(queryClient, month);
    } catch {
      // A later navigation or the active month query can retry this bundle.
    }
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
