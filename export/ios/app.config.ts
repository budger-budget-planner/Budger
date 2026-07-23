/**
 * Expo app configuration for Budger — iOS App Store build.
 *
 * Usage:
 *   npx expo prebuild --platform ios   # generates the Xcode project
 *   npx expo build:ios                 # or use EAS Build
 *
 * This file lives in export/ios/ and should be copied to / (monorepo root
 * of the Expo project) or referenced via EXPO_CONFIG_FILE when you set up
 * the native wrapper. The PrivacyInfo.xcprivacy entries below are merged
 * into the generated Info.plist automatically by the Expo build pipeline.
 */

import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Budger",
  slug: "budger-budget-planner",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0f0f0f",
  },

  // ── iOS-specific configuration ──────────────────────────────────────────
  ios: {
    bundleIdentifier: "app.budger.planner",
    supportsTablet: false,
    requireFullScreen: true,
    buildNumber: "1",

    // Entitlements — APNs is required for budget alerts and Live Activities.
    entitlements: {
      "aps-environment": "production",
    },

    // Usage description strings shown in iOS permission dialogs.
    // Every permission your app requests MUST have a description or Apple
    // will reject the binary at upload time (automated check).
    infoPlist: {
      // Camera — used by the receipt scanner ("Scan receipt" button).
      NSCameraUsageDescription:
        "Budger uses the camera to photograph receipts and transaction documents for automatic data extraction.",

      // Photo library — used to import saved receipt photos and bank
      // app screenshots for transaction auto-fill.
      NSPhotoLibraryUsageDescription:
        "Budger reads photos from your library to import receipts and bank statement screenshots.",

      // Push notifications — budget alerts, spending summaries, household
      // member activity, and goal milestone notifications.
      NSUserNotificationUsageDescription:
        "Budger sends budget alerts, spending reminders, and household notifications to help you stay on track.",

      // Face ID — biometric lock for the app (future feature; including now
      // prevents a re-submission if added in an update).
      NSFaceIDUsageDescription:
        "Budger can use Face ID to protect access to your financial data.",

      // Background fetch — used to sync recurring payments and refresh
      // currency exchange rates while the app is in the background.
      UIBackgroundModes: ["fetch", "remote-notification"],

      // Prevents iOS from adding extra safe-area padding on top of the
      // app's own status-bar handling.
      UIViewControllerBasedStatusBarAppearance: false,

      // App Transport Security — all API calls already use HTTPS.
      // No exceptions needed; ATS is fully enforced.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
      },
    },

    // ── Privacy manifest (PrivacyInfo.xcprivacy) ────────────────────────
    // Expo merges these into the generated PrivacyInfo.xcprivacy.
    // Keep in sync with export/ios/PrivacyInfo.xcprivacy.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],

      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: ["E174.1"],
        },
      ],

      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeFinancialInfo",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhotosOrVideos",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeCrashData",
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAnalytics",
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePerformanceData",
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAnalytics",
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
      ],
    },
  },

  // ── Android — kept minimal here since this file focuses on iOS ──────────
  android: {
    package: "app.budger.planner",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f0f0f",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.VIBRATE",
    ],
  },

  // ── Expo / EAS metadata ─────────────────────────────────────────────────
  extra: {
    eas: {
      projectId: "REPLACE_WITH_EAS_PROJECT_ID",
    },
  },

  plugins: [
    // If you use expo-camera, expo-image-picker, expo-notifications, etc.,
    // add their config plugins here so Expo prebuild wires up the permissions
    // automatically.
    // ["expo-camera", { cameraPermission: "Budger uses the camera to scan receipts." }],
    // ["expo-image-picker", { photosPermission: "Budger reads photos to import receipts." }],
    // ["expo-notifications", { ...notificationConfig }],
  ],
};

export default config;
