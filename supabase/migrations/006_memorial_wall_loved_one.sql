-- Memorial wall rework (Oct 8, 2026): the wall is for everyone's losses, not only Steve, Mason, and Josh.
-- A visitor shares a photo of their own loved one: their first name, the loved one's name, an optional photo,
-- optional words, and an optional private email.
-- Applied to Supabase project "StrongBraveCourageous" (weaoqfeujfgakjogzepq) on Oct 8, 2026.
--
-- Written so the page already live (abe3d26) keeps working until the new code is pushed:
--   * nothing is dropped: no table, column, function, or grant the live page uses is removed or renamed;
--   * the new column allows NULL, so the older submit_memory calls still insert;
--   * wall_page and both forms of submit_memory stay as they are; the new page calls two new functions.
-- The tags column (migration 005) stays in place, unused by the new page.

-- The loved one's name, 1 to 80 characters after trimming. NULL only on rows sent by the older page.
alter table public.memories add column loved_one text
  constraint memories_loved_one_length check (loved_one is null or char_length(btrim(loved_one)) between 1 and 80);

-- A memory may now have no words (a name and a photo are enough). The memory column stops being required;
-- its existing rule (1 to 4000 characters after trimming) still applies whenever there are words.
alter table public.memories alter column memory drop not null;

grant select (loved_one) on public.memories to anon;           -- the public reads it on approved rows
grant update (loved_one) on public.memories to authenticated;  -- approvers correct it (row rule: wall_admins only)

-- The new page's only public write for a memory. Same checks as submit_memory, plus the loved one's name.
-- It forces 'pending' and returns nothing, so a pending row is never sent back to the visitor.
create function public.submit_wall_memory(
  p_first_name text, p_loved_one text, p_memory text default null, p_photo_path text default null,
  p_photo_permission boolean default false, p_email text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_loved text := nullif(btrim(coalesce(p_loved_one, '')), '');
  v_memory text := nullif(btrim(coalesce(p_memory, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_loved is null then
    raise exception 'need_loved_one' using errcode = 'WB006';
  end if;
  if v_photo is not null then
    if v_photo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then
      raise exception 'bad_photo' using errcode = 'WB002';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'memorial-pending' and o.name = v_photo) then
      raise exception 'bad_photo' using errcode = 'WB002';
    end if;
    if not coalesce(p_photo_permission, false) then
      raise exception 'photo_permission' using errcode = 'WB003';
    end if;
  end if;
  insert into public.memories (first_name, loved_one, memory, photo_path, photo_permission, status, heart_count)
  values (btrim(p_first_name), v_loved, v_memory, v_photo, coalesce(p_photo_permission, false), 'pending', 0)
  returning id into v_id;
  if v_email is not null then
    insert into public.memory_contacts (memory_id, email) values (v_id, v_email);
  end if;
end $$;
revoke all on function public.submit_wall_memory(text, text, text, text, boolean, text) from public;
grant execute on function public.submit_wall_memory(text, text, text, text, boolean, text) to anon, authenticated;

-- The new wall's list and search: approved memories only, newest approved first, a page at a time.
-- The search matches part of the loved one's name, the sharer's first name, or the words, not case-sensitive;
-- %, _ and \ are matched literally. It runs with the caller's own rights (the usual row rules apply).
create function public.wall_list(p_query text default null, p_limit integer default 21, p_offset integer default 0)
returns table (id uuid, created_at timestamptz, approved_at timestamptz, first_name text, loved_one text, memory text, photo_path text, heart_count integer)
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select case when nullif(btrim(coalesce(p_query, '')), '') is null then null
      else '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  )
  select m.id, m.created_at, m.approved_at, m.first_name, m.loved_one, m.memory, m.photo_path, m.heart_count
  from public.memories m, q
  where m.status = 'approved'
    and (q.pat is null or m.loved_one ilike q.pat or m.first_name ilike q.pat or m.memory ilike q.pat)
  order by m.approved_at desc nulls last, m.id desc
  limit least(greatest(coalesce(p_limit, 21), 1), 51) offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.wall_list(text, integer, integer) from public;
grant execute on function public.wall_list(text, integer, integer) to anon, authenticated;
notify pgrst, 'reload schema';
