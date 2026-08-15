package com.badiyos.merchant;

/** Tracks whether the Capacitor WebView activity is currently in foreground. */
public final class MerchantAppState {
    private static volatile boolean foreground = false;

    private MerchantAppState() {}

    public static void setForeground(boolean value) {
        foreground = value;
    }

    public static boolean isForeground() {
        return foreground;
    }
}
