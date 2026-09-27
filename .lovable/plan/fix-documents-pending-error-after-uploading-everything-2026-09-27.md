# Fix "documents pending" error after uploading everything

## What's wrong
When a document is uploaded, the file itself gets saved, and the button turns green ("Uploaded"). The app then has to write down that the document was uploaded. If that second step fails, the app ignores the error. So the button looks done, but the Next check still thinks the document is missing and shows "Please upload all required documents".

We haven't confirmed the exact reason the second step fails yet. Likely causes: re-uploading a document that already has an entry, or a permission rule on the documents list.

## Fix
1. **Find the cause first:** reproduce the upload in onboarding and read the exact error from the documents list. Then fix the real cause: a permission rule, or a "replace old entry" behaviour when the same document is uploaded again.
2. **Stop hiding failures:** if saving the document entry fails, show a clear message ("Could not save Aadhaar. Please try again.") and keep the button as "Upload", not green.
3. **Button follows the saved list:** a document shows "Uploaded" only when it really appears in the shop's saved documents, so the button and the check always agree.
4. **Re-upload replaces:** uploading the same document again updates the existing entry instead of adding a new one.
5. Also apply the same "don't fake success" rule to the shop photo upload.

## Technical details
- `src/routes/onboarding.tsx` `recordDocument`: throw on insert error; for existing `doc_type`, delete old or update `file_url` (upsert on merchant_id+doc_type if a unique constraint exists).
- `src/components/DocumentUpload.tsx`: `setDone(true)` only after `onUploaded` succeeds; sync `done` from `existingUrl` via effect; use friendly error toast.
- Inspect `merchant_documents` RLS/constraints; add a migration only if a policy is missing.
