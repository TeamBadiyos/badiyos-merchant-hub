# Profile: full business details, properly editable

Abhi Profile par sirf shop ka naam, phone, city aur language hai. Iske badle Profile ek complete shop profile banega — saari business details dikhengi aur jo badalne layak hain wo wahin edit ho jayengi.

## Profile par kya dikhega

**1. Shop header**
Shop photo (tap karke badal sakte hain), shop ka naam, phone, city, aur status badge (Approved / Under review / Draft) — abhi ka hardcoded "Verified merchant" hata kar asli status.

**2. Shop details — editable**
Edit button dabane par ye fields khulengi, Save/Cancel ke saath:
- Shop ka naam
- Owner ka naam
- Poora pata, city, state, pincode
- Shop category (sirf tab tak jab tak shop approve nahi hui; approve ke baad dikhegi lekin lock)

**3. Bank details — editable**
Account holder name, account number, IFSC — edit ho sakte hain. Account number normally chhupa rahega (sirf last 4 digits), "Edit" par poora dikhega.

**4. GST & PAN — sirf display**
GSTIN, legal name, GST status aur PAN dikhenge par edit nahi honge. Neeche line: "Ye badalne ke liye badiyos support se sampark karein" (support screen ka link).

**5. Documents — sirf list**
Aapke upload kiye documents ki list (Aadhaar, PAN, GST, Shop licence, Cancelled cheque) type ke saath. Naya upload yahan se nahi.

**6. Language + Log out**
Jaise abhi hai, waise hi neeche.

Sab kuch English aur Marathi dono me.

## Validations

- Shop naam aur owner naam khaali nahi
- Pincode 6 digit
- IFSC sahi format (jaise SBIN0001234), account number 9–18 digit
- Galti par field ke neeche saaf message, Save tab tak block

## Technical notes

- `src/routes/profile.tsx` rewrite: `useQuery` se merchants row (id, store_name, owner_name, address, city, state, pincode, shop_photo_url, status, store_category_id, is_gst_registered, gstin, gst_legal_name, gst_status, pan, bank_account_number, bank_ifsc, bank_account_holder_name) + `store_categories` name + `merchant_documents` list.
- Saves: `supabase.from("merchants").update({...}).eq("id", merchant.id)` — sirf wahi columns jo `merchants_guard_privileged` allow karta hai (store_name, owner_name, address, city, state, pincode, shop_photo_url, bank_*). Status/commission/GST fields touch nahi honge.
- Photo upload: existing `merchant-documents` / shop photo bucket pattern onboarding step 3 se reuse; `DocumentUpload.tsx` ka logic reference.
- Zod schema for the form; `sonner` toasts for success/error; `queryClient.invalidateQueries` after save; `hapticImpact` on save.
- Naye i18n keys (en + mr) for har label, section heading, error message aur "contact support" line.
- Koi DB change nahi — na naya table, na naya column, na policy.
