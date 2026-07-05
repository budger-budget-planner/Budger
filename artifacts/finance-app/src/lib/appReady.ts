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
 * Call this to re-show the splash screen (e.g. on logout).
 * The splash will play its full animation sequence, detect no user,
 * and glide to the login screen — no hard page reload needed.
 */
export const SplashResetContext = createContext<() => void>(() => {});

export function useSplashReset(): () => void {
  return useContext(SplashResetContext);
}
