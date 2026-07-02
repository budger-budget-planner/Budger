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
