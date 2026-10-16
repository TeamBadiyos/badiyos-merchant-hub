# Optional MRP on items

## What the merchant sees
- Add/Edit item: new optional "MRP ₹" box next to Price (Store and Food). If filled, it must be equal to or higher than Price; otherwise the form shows "MRP must be at least the price" and won't save. Variants keep their own prices; MRP applies to the main price.
- Item row: when MRP is set and higher than the price, show it struck through after the price, e.g. "₹90 ~~₹100~~".
- Staff can't change MRP (locked like prices).
- MRP changes go to Command Center approval like price changes, with the same "Will be live after approval" note.

## Backend (needs your OK)
- The items table has no MRP field today (only the existing MRP/Packaged toggle). Add one optional `mrp` number field to items, checked to be ≥ price when set.
- Update the existing item save step (`product_upsert_core`) so MRP is a reviewed field: new items and MRP edits on live items go into the pending changes for approval, then apply on approve.
- The customer-facing item list already has an `mrp` slot; point it at the new field so the Customer App can show it.

## Technical details
- Migration: `ALTER TABLE products ADD COLUMN mrp numeric NULL CHECK (mrp IS NULL OR mrp >= price)`; extend `product_upsert_core` payload handling + approval apply path; recreate `public_products` view to select `p.mrp`.
- `src/routes/products.tsx`: `mrp` state in ProductForm, validation, include in upsert payload, struck-through display in row (`line-through text-muted-foreground`), locked when `priceLocked`.
- i18n (English + Marathi): `pmMrp`, `pmMrpTooLow`.
