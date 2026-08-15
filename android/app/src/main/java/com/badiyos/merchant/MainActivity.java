package com.badiyos.merchant;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Capacitor host activity.
 *
 * Also the delivery point for decisions taken on the native full-screen ringing
 * alert: the decision is forwarded into the WebView, which calls the same
 * `merchant_decide_order` RPC the in-app Accept/Reject buttons use (merchant
 * orders have a real 'rejected' status, so Reject is a real RPC call — not a
 * local-only dismiss like the Partner App's booking broadcast).
 */
public class MainActivity extends BridgeActivity {

    public static final String EXTRA_DECISION = "decision";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleOrderAction(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOrderAction(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        MerchantAppState.setForeground(true);
    }

    @Override
    protected void onPause() {
        MerchantAppState.setForeground(false);
        super.onPause();
    }

    private void handleOrderAction(Intent intent) {
        if (intent == null) return;
        final String orderId = intent.getStringExtra(MerchantMessagingService.EXTRA_ORDER_ID);
        final String decision = intent.getStringExtra(EXTRA_DECISION);
        if (orderId == null || decision == null) return;
        intent.removeExtra(EXTRA_DECISION);

        final String js = "(function(){var d={order_id:'" + orderId + "',decision:'" + decision
                + "'};try{window.dispatchEvent(new CustomEvent('badiyos:orderAction',{detail:d}));}"
                + "catch(e){}window.__badiyosPendingOrderAction=window.__badiyosPendingOrderAction||d;})();";

        // Give the WebView a moment when cold-starting from the lockscreen.
        getBridge().getWebView().postDelayed(
                () -> getBridge().getWebView().evaluateJavascript(js, null), 1200);
    }
}
