package com.badiyos.merchant;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Full-screen ringing screen for a new order (Expert App parity).
 *  - shows over the lockscreen and wakes the screen
 *  - loops res/raw/new_order_alert on the ALARM stream (plays through silent
 *    mode and DND), falls back to the device alarm / ringtone
 *  - boosts ALARM volume to max and restores the user's level when it stops
 *  - stops on Open, on the backend accept deadline (timeout_seconds), or when
 *    an "order taken / cancelled" push broadcasts ACTION_RING_DISMISS
 */
public class OrderRingActivity extends AppCompatActivity {

    public static final String ACTION_RING_DISMISS = "com.badiyos.merchant.RING_DISMISS";

    private MediaPlayer player;
    private Vibrator vibrator;
    private CountDownTimer timer;
    private PowerManager.WakeLock wakeLock;
    private BroadcastReceiver dismissReceiver;
    private int savedAlarmVolume = -1;
    private String orderId;

    /** Ask a showing ring screen (for this order, or any when id is empty) to close. */
    static void dismissIfShowing(Context ctx, String orderId) {
        Intent i = new Intent(ACTION_RING_DISMISS).setPackage(ctx.getPackageName());
        i.putExtra(MerchantMessagingService.EXTRA_ORDER_ID, orderId == null ? "" : orderId);
        ctx.sendBroadcast(i);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        orderId = intent.getStringExtra(MerchantMessagingService.EXTRA_ORDER_ID);

        if (MerchantMessagingService.ACTION_OPEN.equals(intent.getAction())) {
            finishWithDecision("open");
            return;
        }

        showOverLockscreen();
        setContentView(R.layout.activity_order_ring);

        String title = intent.getStringExtra(MerchantMessagingService.EXTRA_TITLE);
        String body = intent.getStringExtra(MerchantMessagingService.EXTRA_BODY);
        String amount = intent.getStringExtra(MerchantMessagingService.EXTRA_AMOUNT);
        int timeout = intent.getIntExtra(MerchantMessagingService.EXTRA_TIMEOUT, 300);
        if (timeout <= 0) timeout = 300;

        ((TextView) findViewById(R.id.ring_title)).setText(title != null ? title : "New order");
        ((TextView) findViewById(R.id.ring_body)).setText(body != null ? body : "Tap to accept");
        ((TextView) findViewById(R.id.ring_amount))
                .setText(amount != null && !amount.isEmpty() ? "₹" + amount : "");

        final TextView countdown = findViewById(R.id.ring_countdown);
        Button accept = findViewById(R.id.ring_accept);
        // Accept/Reject happen in-app (reject needs a reason).
        accept.setOnClickListener(v -> finishWithDecision("open"));

        dismissReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                String id = i.getStringExtra(MerchantMessagingService.EXTRA_ORDER_ID);
                if (id == null || id.isEmpty() || id.equals(orderId)) {
                    MerchantMessagingService.cancelAlert(OrderRingActivity.this);
                    stopAlert();
                    finish();
                }
            }
        };
        IntentFilter f = new IntentFilter(ACTION_RING_DISMISS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(dismissReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(dismissReceiver, f);
        }

        startAlert();

        timer = new CountDownTimer(timeout * 1000L, 250L) {
            @Override
            public void onTick(long remaining) {
                long s = Math.max(0, remaining / 1000);
                countdown.setText(s >= 60 ? (s / 60) + ":" + String.format("%02d", s % 60) : s + "s");
            }

            @Override
            public void onFinish() {
                countdown.setText("0s");
                MerchantMessagingService.cancelAlert(OrderRingActivity.this);
                stopAlert();
                finish();
            }
        }.start();
    }

    @SuppressWarnings("deprecation")
    private void showOverLockscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                    | PowerManager.ACQUIRE_CAUSES_WAKEUP, "badiyos:orderRing");
            wakeLock.acquire(10 * 60 * 1000L);
        }
    }

    private Uri alertUri() {
        int id = getResources().getIdentifier("new_order_alert", "raw", getPackageName());
        if (id != 0) return Uri.parse("android.resource://" + getPackageName() + "/" + id);
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        return u;
    }

    private void startAlert() {
        boostAlarmVolume();
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, alertUri());
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {
            // keep vibrating even if the tone can't play
        }

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        long[] pattern = {0, 700, 400, 700, 400};
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }
    }

    private void boostAlarmVolume() {
        try {
            AudioManager am = getSystemService(AudioManager.class);
            if (am == null || savedAlarmVolume >= 0) return;
            savedAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM);
            am.setStreamVolume(AudioManager.STREAM_ALARM,
                    am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
        } catch (Exception ignored) {
        }
    }

    private void restoreAlarmVolume() {
        try {
            AudioManager am = getSystemService(AudioManager.class);
            if (am != null && savedAlarmVolume >= 0) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVolume, 0);
            }
        } catch (Exception ignored) {
        } finally {
            savedAlarmVolume = -1;
        }
    }

    private void stopAlert() {
        if (timer != null) { timer.cancel(); timer = null; }
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            player.release();
            player = null;
        }
        if (vibrator != null) { vibrator.cancel(); vibrator = null; }
        restoreAlarmVolume();
        if (wakeLock != null && wakeLock.isHeld()) { wakeLock.release(); wakeLock = null; }
    }

    /** Hands the decision to the WebView, which runs merchant_decide_order. */
    private void finishWithDecision(String decision) {
        stopAlert();
        MerchantMessagingService.cancelAlert(this);
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MerchantMessagingService.EXTRA_ORDER_ID, orderId)
                .putExtra(MainActivity.EXTRA_DECISION, decision);
        startActivity(open);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Must be an explicit decision.
    }

    @Override
    protected void onDestroy() {
        stopAlert();
        if (dismissReceiver != null) {
            try { unregisterReceiver(dismissReceiver); } catch (Exception ignored) {}
            dismissReceiver = null;
        }
        super.onDestroy();
    }
}
