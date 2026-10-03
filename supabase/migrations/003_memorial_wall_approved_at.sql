-- Memorial wall: the wall sorts by the day a memory was APPROVED (newest approved first).
-- Applied to Supabase project "StrongBraveCourageous" (weaoqfeujfgakjogzepq) on Oct 3, 2026.
-- Each card still shows the day the memory was submitted (created_at).
-- Safe for the page already live: it adds a column and never changes what the older page reads.
alter table public.memories add column approved_at timestamptz;
update public.memories set approved_at = coalesce(reviewed_at, created_at) where status = 'approved' and approved_at is null;

-- approved_at is set by the database each time a memory becomes approved, so the page cannot set or fake it.
-- A memory rejected and later approved again moves back to the top.
create function public.wall_stamp_approval() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_at := now();
  end if;
  return new;
end $$;
revoke all on function public.wall_stamp_approval() from public, anon, authenticated;
create trigger memories_stamp_approval before insert or update of status on public.memories
  for each row execute function public.wall_stamp_approval();

grant select (approved_at) on public.memories to anon;
create index memories_approved_order on public.memories (approved_at desc, id desc) where status = 'approved';
notify pgrst, 'reload schema';
