create policy "Merchants manage own product images"
  on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = public.current_merchant_id()::text)
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = public.current_merchant_id()::text);

create policy "Authenticated can read product images"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images');