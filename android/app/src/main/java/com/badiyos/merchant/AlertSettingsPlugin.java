package com.badiyos.merchant;

import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge used by the in-app "Ringing & battery" guide: reports whether
 * full-screen alerts, DND bypass and battery exemption are in place, and opens
 * the matching system / OEM settings pages.
 */
@CapacitorPlugin(name = "AlertSettings")
public class AlertSettingsPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        boolean fsi = true;
        if (Build.VERSION.SDK_INT >= 34 && nm != null) fsi = nm.canUseFullScreenIntent();
        boolean dnd = nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && nm.isNotificationPolicyAccessGranted();
        PowerManager pm = getContext().getSystemService(PowerManager.class);
        boolean battery = pm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        ret.put("fullScreen", fsi);
        ret.put("dnd", dnd);
        ret.put("battery", battery);
        ret.put("notifications", nm == null || nm.areNotificationsEnabled());
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        call.resolve(ret);
    }

    private Intent appDetails() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", getContext().getPackageName(), null));
    }

    @PluginMethod
    public void openFullScreen(PluginCall call) {
        Intent i = Build.VERSION.SDK_INT >= 34
                ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                    .setData(Uri.fromParts("package", getContext().getPackageName(), null))
                : null;
        resolve(call, startAny(new Intent[]{i, appDetails()}));
    }

    @PluginMethod
    public void openDnd(PluginCall call) {
        resolve(call, startAny(new Intent[]{
                new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS), appDetails()}));
    }

    @PluginMethod
    public void openBattery(PluginCall call) {
        resolve(call, startAny(new Intent[]{
                new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), appDetails()}));
    }

    @PluginMethod
    public void openAutostart(PluginCall call) {
        resolve(call, startAny(new Intent[]{
                component("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
                component("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
                component("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
                component("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
                component("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
                component("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
                component("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
                component("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
                appDetails()}));
    }

    @PluginMethod
    public void openNotifications(PluginCall call) {
        Intent i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                : null;
        resolve(call, startAny(new Intent[]{i, appDetails()}));
    }

    private Intent component(String pkg, String cls) {
        Intent i = new Intent();
        i.setClassName(pkg, cls);
        return i;
    }

    private boolean startAny(Intent[] list) {
        for (Intent i : list) {
            if (i == null) continue;
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (i.resolveActivity(getContext().getPackageManager()) == null) continue;
                getContext().startActivity(i);
                return true;
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private void resolve(PluginCall call, boolean opened) {
        JSObject r = new JSObject();
        r.put("opened", opened);
        call.resolve(r);
    }
}
