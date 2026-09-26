import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.badiyos.merchant",
  appName: "badiyos Merchant",
  webDir: "dist",
  ios: {
    // We ship our own edge-swipe-back gesture, so the WebView must not bounce.
    scrollEnabled: true,
    contentInset: "always",
  },
  android: {
    // Keeps the keyboard from resizing the safe-area padding on every focus.
    webContentsDebuggingEnabled: false,
    backgroundColor: "#800080",
  },
  backgroundColor: "#800080",
  plugins: {
    SplashScreen: {
      backgroundColor: "#800080",
      // Hand over to the app as soon as it is ready — no fixed waiting time.
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
};

export default config;
