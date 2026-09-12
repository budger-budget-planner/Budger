import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { apiFetch, BASE } from "@/lib/api";

export const HOME_TRANSACTION_PAGE_SIZE = 15;
export const HOME_TRANSACTION_PREFETCH_SIZE = HOME_TRANSACTION_PAGE_SIZE + 1;
export const HOME_TRANSACTION_CACHE_RADIUS = 2;

export type HomeTransactionMonthSummary = {
  entriesCount: number;
  spendingTotal: number;
  realizedGoalExcluded: number;
  lockedByCurrency: Record<string, number>;
};

export function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

export function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return format(addMonths(new Date(year, monthNumber - 1, 1), amount), "yyyy-MM");
}

export function getHomeMonthParams(month: string): {
  month: string;
  startDate: string;
  endDate: string;
} {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return {
    month,
    startDate: format(startOfMonth(date), "yyyy-MM-dd"),
    endDate: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export function getHomeTransactionParams(month: string, limit?: number) {
  const { startDate, endDate } = getHomeMonthParams(month);
  return {
    startDate,
    endDate,
    ...(limit === undefined ? {} : { limit }),
  };
}

export function getTransactionMonthSummaryQueryKey(month: string) {
  return ["home-transaction-month-summary", month] as const;
}

export function getTransactionMonthSummaryQueryOptions(
  month: string,
  timeoutMs = 6_000,
) {
  const { startDate, endDate } = getHomeMonthParams(month);
  return {
    queryKey: getTransactionMonthSummaryQueryKey(month),
    queryFn: async ({ signal }: { signal?: AbortSignal }) => {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await apiFetch(
        `${BASE}/api/summary/transactions?${query.toString()}`,
        { signal, timeoutMs },
      );
      if (!response.ok) throw new Error("Transaction month summary request failed");
      return response.json() as Promise<HomeTransactionMonthSummary>;
    },
  };
}

/**
 * The current month is pinned. Around the selected month, retain up to two
 * months on either side, but never include future months.
 */
export function getRetainedHomeMonths(
  selectedMonth: string,
  pinnedMonth = currentMonthKey(),
): string[] {
  const retained = new Set<string>([pinnedMonth]);
  for (let offset = -HOME_TRANSACTION_CACHE_RADIUS; offset <= HOME_TRANSACTION_CACHE_RADIUS; offset++) {
    const month = shiftMonth(selectedMonth, offset);
    if (month <= pinnedMonth) retained.add(month);
  }
  return [...retained].sort();
}
