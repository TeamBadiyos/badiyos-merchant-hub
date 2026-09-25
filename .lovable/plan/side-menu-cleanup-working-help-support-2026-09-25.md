# Side menu cleanup + working Help & support

Make the side menu minimal and turn "Help & support" into a real, usable option.

## What changes

1. **Legal hat jayega side menu se**
   Privacy Policy aur Terms ka section side menu se nikal denge. Ye dono already Settings ke andar "Legal" section me hain, aur signup screen par bhi link hai — do jagah dikhane ki zaroorat nahi. Legal ke page waise hi kaam karte rahenge.

2. **Catalogue hat jayega**
   Catalogue sirf ek "coming soon" khaali screen hai — asli product add/edit/stock ka kaam Products me hi hota hai. Menu se Catalogue nikal denge taaki confusion na rahe.

3. **Help & support chalu**
   "Coming soon" tag hata kar ek chhota support screen banega, jisme:
   - Support number saaf dikhega: **8007444464**
   - **WhatsApp par chat karein** button — direct chat khulega
   - **Call karein** button — direct call lagega
   - Neeche ek line: shop ka naam aur registered number, taaki merchant support ko turant bata sake wo kaun hai
   Dono buttons English aur Marathi me kaam karenge.

## Baad ka side menu

```text
Products
Reports
Wallet
Rewards
Roles & staff
Settings
Help & support
Logout
```

## Technical notes

- `src/components/AppShell.tsx`: `legalLinks` block aur uska "LEGAL" heading hatao; `links` se `/catalogue` entry hatao; `menuItems` placeholder ki jagah `/support` ka normal Link.
- New route `src/routes/support.tsx` — AppShell ke andar simple card: number, `https://wa.me/918007444464` link, `tel:+918007444464` link, shop name + phone from `useAuth()`. Apna `head()` metadata.
- `src/routes/catalogue.tsx` delete; `catalogue` i18n key rehne do (koi harm nahi) ya hata do.
- i18n me naye keys: `supportTitle`, `supportSub`, `supportWhatsapp`, `supportCall`, `supportNumber` (en + mr).
