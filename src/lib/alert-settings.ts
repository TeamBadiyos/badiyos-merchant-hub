import { Capacitor, registerPlugin } from "@capacitor/core";

export type AlertStatus = {
  fullScreen: boolean;
  dnd: boolean;
  battery: boolean;
  notifications: boolean;
  manufacturer: string;
};

interface AlertSettingsPlugin {
  status(): Promise<AlertStatus>;
  openFullScreen(): Promise<{ opened: boolean }>;
  openDnd(): Promise<{ opened: boolean }>;
  openBattery(): Promise<{ opened: boolean }>;
  openAutostart(): Promise<{ opened: boolean }>;
  openNotifications(): Promise<{ opened: boolean }>;
}

const Plugin = registerPlugin<AlertSettingsPlugin>("AlertSettings");

export function isAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** Null on web, or on an older app build without the native bridge. */
export async function getAlertStatus(): Promise<AlertStatus | null> {
  if (!isAndroidApp()) return null;
  try {
    return await Plugin.status();
  } catch {
    return null;
  }
}

export type AlertSetting = "fullScreen" | "dnd" | "battery" | "autostart" | "notifications";

export async function openAlertSetting(which: AlertSetting): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    const fn = {
      fullScreen: () => Plugin.openFullScreen(),
      dnd: () => Plugin.openDnd(),
      battery: () => Plugin.openBattery(),
      autostart: () => Plugin.openAutostart(),
      notifications: () => Plugin.openNotifications(),
    }[which];
    const r = await fn();
    return r?.opened !== false;
  } catch {
    return false;
  }
}
