import { createContext, useContext } from "react";

/**
 * Tracks whether the splash screen has finished (i.e. the app is fully visible
 * and interactive). Anything that shouldn't start until the user can actually
 * see the underlying screen — e.g. hint animations — should gate on this.
 */
export const AppReadyContext = createContext(false);

export function useAppReady(): boolean {
  return useContext(AppReadyContext);
}

/**
 * Call this to re-show the full splash screen (sniff → lick → wink).
 * Only for app open and logout — use useWinkSplash() for all other cases.
 */
export const SplashResetContext = createContext<() => void>(() => {});

export function useSplashReset(): () => void {
  return useContext(SplashResetContext);
}

/**
 * Call this to show the wink-only splash screen.
 * afterDone may be async — the overlay stays in the DOM (invisible, non-blocking)
 * until the promise resolves, so callers can do async work (API calls, cache
 * warming) before the app becomes visible.
 */
export const WinkSplashContext = createContext<(afterDone?: () => void | Promise<void>) => void>(() => {});

export function useWinkSplash(): (afterDone?: () => void | Promise<void>) => void {
  return useContext(WinkSplashContext);
}

/**
 * Bumps a version key on the route tree, remounting all routes so they pick up
 * language/currency changes without a full page reload.  The query cache is
 * pre-warmed by the caller before this fires, so components see fresh data
 * from the cache immediately — no loading spinners.
 */
export const AppRefreshContext = createContext<() => void>(() => {});

export function useAppRefresh(): () => void {
  return useContext(AppRefreshContext);
}
