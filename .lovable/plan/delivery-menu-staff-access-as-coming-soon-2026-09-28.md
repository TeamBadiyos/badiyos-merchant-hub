# Delivery menu — Staff access as "Coming soon"

## Goal
Delivery mode ke side menu me "Staff" item dikhe, par greyed out ho, saath me "Coming soon" badge ho, aur tap karne par kuch na khule (feature abhi live nahi hai).

## Changes

### 1. `src/components/delivery/DeliveryShell.tsx`
- Menu list me Staff item ko clickable `Link` se hata kar plain disabled row banao:
  - Grey text (`text-muted-foreground`), grey icon, no hover state, no chevron.
  - Right side par chhota pill badge: "Coming soon" (`bg-muted text-muted-foreground`, rounded-full, text-[10px]).
  - Tap par koi navigation nahi — row `<div>` rahega, `Link` nahi.
- Sabko dikhega (abhi sirf `can("manage_staff")` walo ko dikhta tha) — visibility condition hatao, kyunki ye sirf placeholder hai.
- Baaki menu items (Pickup points, Delivery proofs, Settings, Profile, Language, Logout) unchanged.

### 2. `src/lib/delivery/i18n.ts`
- Naya key `comingSoon`: en "Coming soon", mr "लवकरच येत आहे".

## Notes
- Store shell (AppShell) ka Staff menu item jaise hai waise hi rahega — wo kaam kar raha hai.
- Koi route/backend change nahi. `/staff` route untouched rehta hai.
- Verify: `bunx tsgo --noEmit` clean.
