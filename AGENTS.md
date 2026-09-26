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
