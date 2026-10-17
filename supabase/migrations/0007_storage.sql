-- Storage: private buckets with tenant-scoped policies.
-- Object paths start with the restaurant id:
--   menu-images/<restaurant_id>/menu/<file>
--   expense-receipts/<restaurant_id>/receipts/<file>
-- The app serves images through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-images', 'menu-images', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']),
  ('expense-receipts', 'expense-receipts', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Menu photos: every active member can see them; only managers change them.
create policy menu_images_select on storage.objects for select to authenticated
  using (bucket_id = 'menu-images' and public.is_member(public.safe_uuid((storage.foldername(name))[1])));
create policy menu_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and public.is_manager(public.safe_uuid((storage.foldername(name))[1]))
    and public.restaurant_writable(public.safe_uuid((storage.foldername(name))[1]))
  );
create policy menu_images_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'menu-images' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])));
create policy menu_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])));

-- Expense receipts: managers only, for every operation.
create policy expense_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])));
create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and public.is_manager(public.safe_uuid((storage.foldername(name))[1]))
    and public.restaurant_writable(public.safe_uuid((storage.foldername(name))[1]))
  );
create policy expense_receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'expense-receipts' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'expense-receipts' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])));
create policy expense_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and public.is_manager(public.safe_uuid((storage.foldername(name))[1])));
