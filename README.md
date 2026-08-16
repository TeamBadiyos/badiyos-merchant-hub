# Badiyos Merchant

Build a web app called "badiyos Merchant Portal" — a merchant-facing dashboard for shop owners on the badiyos platform (a local services + delivery marketplace based in Latur, Maharashtra).

Design: Clean, professional, mobile-friendly SaaS dashboard look — similar quality to Vyapar or Zoho, not a basic template. Primary brand color: Badiyo Green (#00B97A). Font: Nunito Sans. 8pt spacing grid.

Core screens for this first scaffold:

1. Splash screen with the badiyos wordmark

2. Login — mobile number + OTP (WhatsApp-based OTP, similar to a typical Indian business app login flow), followed by a 4-digit PIN setup for faster future logins

3. A simple Home dashboard placeholder — showing a greeting, a placeholder "no orders yet" state, and space reserved for order cards

4. Bottom tab bar with 3-4 tab placeholders (Home, Orders, and 1-2 more to be defined)

5. A hamburger/side menu placeholder for secondary navigation (Inventory, Reports, Settings, etc. — to be built later)

Language: Support English and Marathi (Devanagari script for Marathi UI, but keep all numbers/digits in Latin numerals, not Devanagari numerals) — set up a simple toggle in a Profile/Settings area, default to English.

This is the first scaffold only — build the shell, navigation, and login/auth screens with realistic-looking placeholder data. Don't connect to a real database yet; I'll provide backend requirements next.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://badiyos-merchant-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/981f7dd4-309e-4614-b96b-67bc34bd1fdd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
