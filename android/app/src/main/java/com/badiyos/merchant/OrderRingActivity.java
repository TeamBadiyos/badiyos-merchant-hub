package com.badiyos.merchant;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
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
 * Full-screen ringing screen for a new order. Shows over the lockscreen, turns
 * the screen on, loops the alert tone + vibration and auto-dismisses at
 * timeout_seconds.
 */
public class OrderRingActivity extends AppCompatActivity {

    private MediaPlayer player;
    private Vibrator vibrator;
    private CountDownTimer timer;
    private PowerManager.WakeLock wakeLock;
    private String orderId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        orderId = intent.getStringExtra(MerchantMessagingService.EXTRA_ORDER_ID);

        // Notification action buttons route straight through without ringing.
        String action = intent.getAction();
        if (MerchantMessagingService.ACTION_ACCEPT.equals(action)) {
            finishWithDecision("accepted");
            return;
        }
        if (MerchantMessagingService.ACTION_REJECT.equals(action)) {
            finishWithDecision("rejected");
            return;
        }

        showOverLockscreen();
        setContentView(R.layout.activity_order_ring);

        String title = intent.getStringExtra(MerchantMessagingService.EXTRA_TITLE);
        String body = intent.getStringExtra(MerchantMessagingService.EXTRA_BODY);
        String amount = intent.getStringExtra(MerchantMessagingService.EXTRA_AMOUNT);
        int timeout = intent.getIntExtra(MerchantMessagingService.EXTRA_TIMEOUT, 45);

        ((TextView) findViewById(R.id.ring_title)).setText(title != null ? title : "New order");
        ((TextView) findViewById(R.id.ring_body)).setText(body != null ? body : "Tap to accept");
        TextView amountView = findViewById(R.id.ring_amount);
        amountView.setText(amount != null && !amount.isEmpty() ? "₹" + amount : "");

        final TextView countdown = findViewById(R.id.ring_countdown);
        Button accept = findViewById(R.id.ring_accept);
        Button reject = findViewById(R.id.ring_reject);
        accept.setOnClickListener(v -> finishWithDecision("accepted"));
        reject.setOnClickListener(v -> finishWithDecision("rejected"));

        startAlert();

        timer = new CountDownTimer(timeout * 1000L, 250L) {
            @Override
            public void onTick(long remaining) {
                countdown.setText(String.valueOf(Math.max(0, remaining / 1000)) + "s");
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
            wakeLock.acquire(60_000L);
        }
    }

    private void startAlert() {
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this,
                    android.net.Uri.parse("android.resource://" + getPackageName() + "/raw/new_order_alert"));
            player.setLooping(true);
            player.prepare();
            AudioManager am = getSystemService(AudioManager.class);
            if (am != null) am.setStreamVolume(AudioManager.STREAM_ALARM,
                    am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            player.start();
        } catch (Exception ignored) {
            // keep vibrating even if the tone can't play
        }

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        long[] pattern = {0, 700, 500};
        if (vibrator != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
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
        super.onDestroy();
    }
}
