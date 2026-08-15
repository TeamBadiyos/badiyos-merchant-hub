# MANUAL MERGE BLOCK — android/app/src/main/AndroidManifest.xml

`npx cap add android` generates the manifest; the block below must be merged by
hand (same as the Partner App). Nothing else in the generated project changes.

## 1. Permissions — add inside `<manifest>`, before `<application>`

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.DISABLE_KEYGUARD" />
<uses-permission android:name="android.permission.TURN_SCREEN_ON" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

## 2. Service + activity — add inside `<application>`

```xml
<!-- Custom FCM receiver: full-screen alert when backgrounded, delegates to
     Capacitor when foreground. -->
<service
    android:name="com.badiyos.merchant.MerchantMessagingService"
    android:exported="false"
    android:directBootAware="true">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>

<!-- Full-screen ringing screen, shown over the lockscreen. -->
<activity
    android:name="com.badiyos.merchant.OrderRingActivity"
    android:exported="false"
    android:launchMode="singleInstance"
    android:excludeFromRecents="true"
    android:showOnLockScreen="true"
    android:turnScreenOn="true"
    android:showWhenLocked="true"
    android:taskAffinity=""
    android:theme="@style/Theme.AppCompat.NoActionBar" />
```

## 3. REMOVE Capacitor's default messaging service

`@capacitor/push-notifications` contributes its own
`com.capacitorjs.plugins.pushnotifications.MessagingService` with the
`com.google.firebase.MESSAGING_EVENT` filter. Two services with that filter
means Firebase may pick the wrong one, so disable the plugin's:

```xml
<service
    android:name="com.capacitorjs.plugins.pushnotifications.MessagingService"
    android:enabled="false"
    tools:replace="android:enabled"
    tools:node="remove" />
```

and make sure the root `<manifest>` tag has
`xmlns:tools="http://schemas.android.com/tools"`.

(Our service extends that class, so normal foreground push handling still works.)

## 4. Local steps, in order

1. Firebase Console → your existing badiyos project → **Add app → Android**
   with package name **`com.badiyos.merchant`** (a separate app entry from the
   Partner App). Download its own `google-services.json`.
2. `npm install && npx cap add android`
3. Copy `android/app/src/main/java/com/badiyos/merchant/*.java` and
   `android/app/src/main/res/layout/activity_order_ring.xml` from this repo over
   the generated project (overwrite the generated `MainActivity.java`).
4. Put `new_order_alert.mp3` in `android/app/src/main/res/raw/`.
5. Drop `google-services.json` into `android/app/`.
6. Merge the blocks above into `android/app/src/main/AndroidManifest.xml`.
7. `npm run build && npx cap sync android`
8. `npx cap open android` → run on a device. Test with the screen locked.
9. On Android 14+, ask the user to allow **"Full screen notifications"** for the
   app if the system prompts (Settings → Apps → badiyos Merchant → Notifications).

## 5. Server-side secrets

The push sender (`/api/public/merchant-send-push`) needs
`FIREBASE_SERVICE_ACCOUNT_JSON` (same service account JSON used by
`expert-send-push`) and `PUSH_TRIGGER_SECRET` (already set, matching the shared
`edge_runtime_config.push_trigger_secret`). Publish the app after adding secrets.
