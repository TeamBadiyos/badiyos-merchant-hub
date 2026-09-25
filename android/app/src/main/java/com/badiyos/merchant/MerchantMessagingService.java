package com.badiyos.merchant;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Data-only FCM receiver for merchant order alerts.
 *
 * When the app is NOT in the foreground we raise a full-screen, high-importance,
 * ongoing notification that launches {@link OrderRingActivity} even over the
 * lockscreen. When the app IS foreground we delegate to Capacitor's
 * MessagingService so the existing in-app chime + realtime handling
 * (use-order-realtime.ts) stays the single source of truth.
 */
public class MerchantMessagingService extends MessagingService {

    private static final String TAG = "MerchantMessaging";
    public static final String CHANNEL_ID = "new_order_alerts";
    public static final int NOTIFICATION_ID = 42001;

    public static final String EXTRA_ORDER_ID = "order_id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_AMOUNT = "amount";
    public static final String EXTRA_TIMEOUT = "timeout_seconds";

    public static final String ACTION_OPEN = "com.badiyos.merchant.ORDER_OPEN";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");

        if ("business_delivery".equals(type) && !MerchantAppState.isForeground()) {
            try {
                showDeliveryNotification(data);
            } catch (Exception e) {
                Log.e(TAG, "delivery notification failed", e);
            }
            return;
        }

        if (!"new_order".equals(type) || MerchantAppState.isForeground()) {
            // Foreground or unrelated push: normal Capacitor handling.
            super.onMessageReceived(message);
            return;
        }

        try {
            ensureChannel();
            showFullScreenAlert(data);
        } catch (Exception e) {
            Log.e(TAG, "full-screen alert failed", e);
            super.onMessageReceived(message);
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "New order alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Loud full-screen alert for new incoming orders");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 600, 400, 600, 400});
        channel.setBypassDnd(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/raw/new_order_alert");
        channel.setSound(sound, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        nm.createNotificationChannel(channel);
    }

    private void showFullScreenAlert(Map<String, String> data) {
        String orderId = data.get(EXTRA_ORDER_ID);
        String title = data.get(EXTRA_TITLE) != null ? data.get(EXTRA_TITLE) : "New order";
        String body = data.get(EXTRA_BODY) != null ? data.get(EXTRA_BODY) : "Tap to accept";
        String amount = data.get(EXTRA_AMOUNT);
        int timeout = parseInt(data.get(EXTRA_TIMEOUT), 45);

        Intent ring = new Intent(this, OrderRingActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(EXTRA_ORDER_ID, orderId)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body)
                .putExtra(EXTRA_AMOUNT, amount)
                .putExtra(EXTRA_TIMEOUT, timeout);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent fullScreen = PendingIntent.getActivity(this, 1001, ring, flags);

        PendingIntent open = PendingIntent.getActivity(this, 1002,
                new Intent(this, OrderRingActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .setAction(ACTION_OPEN)
                        .putExtra(EXTRA_ORDER_ID, orderId), flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(amount != null && !amount.isEmpty() ? body + "  ₹" + amount : body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setTimeoutAfter(timeout * 1000L)
                .setFullScreenIntent(fullScreen, true)
                .setContentIntent(fullScreen)
                .addAction(0, "Open", open);

        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, builder.build());
    }

    public static final String DELIVERY_CHANNEL_ID = "delivery_alerts";
    public static final String EXTRA_DEEP_LINK = "deep_link";

    /** Normal (non-ringing) notification for delivery alerts: low balance, failed drop. */
    private void showDeliveryNotification(Map<String, String> data) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(DELIVERY_CHANNEL_ID) == null) {
                nm.createNotificationChannel(new NotificationChannel(
                        DELIVERY_CHANNEL_ID, "Delivery alerts", NotificationManager.IMPORTANCE_HIGH));
            }
        }
        String tripId = data.get("courier_order_id");
        String link = tripId != null && !tripId.isEmpty() ? "/delivery/trip/" + tripId : "/delivery/wallet";
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_DEEP_LINK, link);
        PendingIntent pi = PendingIntent.getActivity(this, (int) (System.currentTimeMillis() & 0xffff), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, DELIVERY_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(data.get(EXTRA_TITLE) != null ? data.get(EXTRA_TITLE) : "badiyos")
                .setContentText(data.get(EXTRA_BODY))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(data.get(EXTRA_BODY)))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);
        NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() & 0xfffff), b.build());
    }

    static int parseInt(String value, int fallback) {
        try {
            return value == null ? fallback : Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    static void cancelAlert(Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }
}
