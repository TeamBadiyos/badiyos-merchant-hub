<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Performance rules

- React Query defaults live in `src/router.tsx` (`staleTime: 60s`, `gcTime: 10m`,
  no refetch-on-focus): mobile tab switches must render from cache, not refetch.
- Exactly one `useOrderRealtime` subscription per shell (`AppShell` /
  `DeliveryShell`); screens must not open their own channel.
- `fetchOrders` always takes a `since`/`limit` bound — never pull a shop's whole
  order history with nested items to compute a screen's numbers.
- Delivery trip packing state is device-local and keyed by courier order ID; the database remains the source for packing-list content.
- Parcel label format is device-local; every printed trip, drop, packet number, total, and code must come from `business_get_trip_otps`.

- Store app navigation lives in AppShell: top bar (store name, open/closed, avatar menu) + bottom tabs Home/Orders/Products(Menu for food)/Money(owner only); Billing (POS) route only redirects to /home — keeps one nav source.
- Merchant signup is the 8-step /onboarding wizard (onboarding_step = resume point); pending_review shops land on its status screen — reuse it instead of new gate screens.
