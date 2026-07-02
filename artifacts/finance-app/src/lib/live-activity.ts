/**
 * Live Activity preparation layer for Budger iOS.
 *
 * This module defines the exact data shapes that a native Swift ActivityKit
 * implementation will use, and provides a JS service that wraps the
 * Capacitor plugin interface.
 *
 * ─── Swift side (to implement when adding the native Xcode target) ──────────
 *
 *  import ActivityKit
 *
 *  struct BudgerLiveActivityAttributes: ActivityAttributes {
 *    public struct ContentState: Codable, Hashable {
 *      var totalSpent: Double
 *      var totalBudget: Double
 *      var currencySymbol: String
 *      var topCategoryName: String
 *      var topCategoryColor: String   // hex "#rrggbb"
 *      var transactionCount: Int
 *      var lastUpdatedAt: Date
 *    }
 *    var householdName: String
 *    var period: String              // "July 2026"
 *  }
 *
 * ─── Capacitor plugin (install when wrapping in native shell) ───────────────
 *   pnpm add @capacitor-community/live-activities
 *   Sync with: npx cap sync ios
 *
 * The plugin name in Capacitor is "LiveActivities".
 * Method signatures matched below in CapLiveActivities interface.
 */

// ─── TypeScript types (1-to-1 with Swift structs above) ──────────────────────

export type BudgerActivityAttributes = {
  householdName: string;
  period: string;
};

export type BudgerActivityState = {
  totalSpent: number;
  totalBudget: number;
  currencySymbol: string;
  topCategoryName: string;
  topCategoryColor: string;
  transactionCount: number;
  lastUpdatedAt: string; // ISO 8601
};

// ─── Capacitor plugin interface (matches @capacitor-community/live-activities) ─

interface CapLiveActivities {
  startActivity(opts: {
    attributes: BudgerActivityAttributes;
    contentState: BudgerActivityState;
  }): Promise<{ activityId: string }>;

  updateActivity(opts: {
    activityId: string;
    contentState: BudgerActivityState;
  }): Promise<void>;

  endActivity(opts: {
    activityId: string;
    contentState: BudgerActivityState;
    dismissalPolicy?: "default" | "immediate" | "after";
    dismissAfter?: number; // seconds, used when dismissalPolicy = "after"
  }): Promise<void>;

  getAllActivities(): Promise<{ activities: { activityId: string }[] }>;
}

// ─── Session storage key ───────────────────────────────────────────────────────

const ACTIVITY_ID_KEY = "budger_live_activity_id_v1";

// ─── Service ──────────────────────────────────────────────────────────────────

class LiveActivityServiceImpl {
  private get plugin(): CapLiveActivities | null {
    const cap = (window as any)?.Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    return cap?.Plugins?.LiveActivities ?? null;
  }

  get isSupported(): boolean {
    return this.plugin !== null;
  }

  get activeId(): string | null {
    return sessionStorage.getItem(ACTIVITY_ID_KEY);
  }

  async start(
    attrs: BudgerActivityAttributes,
    state: BudgerActivityState,
  ): Promise<string | null> {
    const plugin = this.plugin;
    if (!plugin) return null;
    try {
      const { activityId } = await plugin.startActivity({
        attributes: attrs,
        contentState: state,
      });
      sessionStorage.setItem(ACTIVITY_ID_KEY, activityId);
      return activityId;
    } catch {
      return null;
    }
  }

  async update(state: BudgerActivityState): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    const activityId = this.activeId;
    if (!activityId) return;
    try {
      await plugin.updateActivity({ activityId, contentState: state });
    } catch {
      // ignore
    }
  }

  /**
   * Start the activity if none is running, otherwise update the existing one.
   * Use this as the primary call-site — it handles the common case.
   */
  async upsert(
    attrs: BudgerActivityAttributes,
    state: BudgerActivityState,
  ): Promise<void> {
    if (!this.isSupported) return;
    if (this.activeId) {
      await this.update(state);
    } else {
      await this.start(attrs, state);
    }
  }

  async end(state: BudgerActivityState): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    const activityId = this.activeId;
    if (!activityId) return;
    try {
      await plugin.endActivity({
        activityId,
        contentState: state,
        dismissalPolicy: "default",
      });
      sessionStorage.removeItem(ACTIVITY_ID_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Reconcile with OS: if a previous activity session was orphaned
   * (e.g. app crash), retrieve the activityId from the OS and restore it.
   */
  async reconcile(): Promise<void> {
    const plugin = this.plugin;
    if (!plugin || this.activeId) return;
    try {
      const { activities } = await plugin.getAllActivities();
      const first = activities[0];
      if (first?.activityId) {
        sessionStorage.setItem(ACTIVITY_ID_KEY, first.activityId);
      }
    } catch {
      // ignore
    }
  }
}

export const liveActivityService = new LiveActivityServiceImpl();
