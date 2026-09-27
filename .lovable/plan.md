# Camera fallback for the New Order scanner

## Problem
If camera permission is denied, the device has no camera, or the camera fails to start, the New order screen shows a dead scanner box ("cameraBlocked" text only) with no way forward. The merchant is stuck.

## Changes

### 1. `src/components/delivery/QrScanner.tsx`
- Add an `onFailed?: () => void` prop. When `getUserMedia` throws (permission denied, no device, start failure), call it once in addition to the existing internal `failed` state.
- Keep the existing in-box fallback UI as a safety net.

### 2. `src/routes/delivery.new.tsx`
- New state `cameraFailed` (default false).
- When `cameraFailed` is true:
  - Replace the scanner area with a clear message: "Camera nahi khul raha — number type karo" (Hindi-English mix as requested, with a Marathi equivalent in i18n).
  - A big primary **"Type number"** button that opens the existing manual-entry dialog (`typing` state) — opened automatically by default when the failure is first detected.
  - A small text link **"Try camera again"** that resets `cameraFailed` to false, remounting `QrScanner` (key change) so it retries `getUserMedia` — this also re-triggers the browser permission prompt where possible.
- Manual entry path is unchanged: typed codes go through the same `addCode(code, "manual")` → `sealCheck` → chips flow, so chips, receiver picker and Place order work fully without the camera.
- Pause scanning while the manual dialog is open (existing `paused` prop behavior preserved).

### 3. `src/lib/delivery/i18n.ts`
- New keys in English and Marathi:
  - `cameraFailedTitle` — "Camera nahi khul raha — number type karo" / "कॅमेरा उघडत नाही — नंबर टाइप करा"
  - `typeNumber` — "Type number" / "नंबर टाइप करा"
  - `tryCameraAgain` — "Try camera again" / "कॅमेरा पुन्हा प्रयत्न करा"

## Verification
- `bunx tsgo --noEmit` clean; build OK.
- Manual check not possible from here (no device camera control in this environment); user to test by denying camera permission on their phone.
