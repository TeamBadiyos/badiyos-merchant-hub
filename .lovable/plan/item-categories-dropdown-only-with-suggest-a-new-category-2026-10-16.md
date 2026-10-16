# Item categories: dropdown only, with "Suggest a new category"

## What the merchant sees
- Add/Edit item: Category is a dropdown of badiyos categories for the shop's type (Store or Food), names in the app language (Marathi name when set), "Other" always last. No typing a category anywhere.
- Choosing "Other" shows an optional "Suggest a new category" box (max 40 characters). Saving sends the suggestion to badiyos.
- The item then shows "Suggested: ___ · under review" in the editor and under the "Other" section on the list.
- When badiyos approves the suggestion, the item moves into the new category on its own and the owner gets a notification. If rejected, the item stays in "Other" and the note shows "Not approved".
- CSV import (Store): the category column is matched to a badiyos category by name; anything that doesn't match goes to "Other" (no new categories created).
- Old free-text category labels and any shop-made categories are no longer shown or editable, but the data is kept.

## Backend (needs your OK)
- `catalog_categories` already has `is_other` and `name_mr`; reuse them. Make sure each service type (store, food) has one "Other" row.
- New table `category_suggestions`: shop, item, service type, suggested name (≤40), status pending/approved/rejected, linked category once approved, reason, timestamps. Shop owner/staff can create and read their own; badiyos staff decide.
- New function for the app to submit/update a suggestion for an item (one open suggestion per item).
- New Command Center function `admin_decide_category_suggestion(id, approve, category_id or new name, reason)`: on approve, creates or links the category, moves every item that had this suggestion (same shop and same name) into it, and notifies the owner via the existing notification sender.
- Command Center approval screen itself must be built in the Command Center app.

## Technical details
- `products.tsx`: select `name_mr, is_other`; sort "Other" last; label by locale; store `category_id` = Other row id; suggestion input + status pill; read latest suggestion per product.
- Remove category_label search/grouping fallback from the editor; legacy uncategorised items show under "Other".
- `CsvImportDialog`/`csv.ts`: map label → category_id; stop writing `category_label`.
- i18n English + Marathi: pmSuggestCategory, pmSuggested, pmUnderReview, pmSuggestionRejected.
