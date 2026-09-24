# Show admin-hidden items in Products

## What the admin flag is
- `products.admin_hidden` (boolean) and `products.admin_hidden_reason` (text) already exist in the database — confirmed via schema query.
- No merchant-facing code references them today, so hidden items currently look like normal items.

## Changes (frontend only, `src/routes/products.tsx`)

1. **Badge on the product card** — when `product.admin_hidden` is true, show a small pill next to the product name: "Hidden by admin". If `admin_hidden_reason` is set, render the reason text under the price/stock line, styled like the existing low-stock pill (muted/warning tone).

2. **Disable the on/off switch** — for admin-hidden items the availability Switch gets `disabled`, and the label beside it is replaced with "Admin ne hide kiya hai — support se contact karein" instead of Active/Inactive. The switch still shows the current `is_active` state, but the merchant cannot change it.

3. **Everything else untouched** — edit (pencil / swipe), delete, price, stock, photo, CSV import, and the low-stock filter all keep working exactly as now.

4. **Translations** — add to `src/lib/i18n.tsx` (English + Marathi blocks):
   - `hiddenByAdmin`: "Hidden by admin" / "अ‍ॅडमिनने लपवले आहे"
   - `adminHiddenContact`: "Admin ne hide kiya hai — support se contact karein" / "अ‍ॅडमिनने लपवले आहे — सपोर्टशी संपर्क करा"

No database or RLS changes; no changes to POS, catalogue, or reports.

## Test
- Log in as the reviewer (9999900000), set one demo product's `admin_hidden = true` with a reason via the DB, and confirm on /products: badge + reason shown, switch disabled with the contact text, and edit/delete still open.
