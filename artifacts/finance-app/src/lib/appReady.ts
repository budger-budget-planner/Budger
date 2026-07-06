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
 * Use for any transition that isn't an app open or logout
 * (e.g. language/currency switching, future in-app transitions).
 */
export const WinkSplashContext = createContext<(afterDone?: () => void) => void>(() => {});

export function useWinkSplash(): (afterDone?: () => void) => void {
  return useContext(WinkSplashContext);
}
