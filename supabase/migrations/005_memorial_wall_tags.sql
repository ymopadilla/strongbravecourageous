-- Memorial wall: tags for who a memory is about (Steve, Mason, Josh, the whole family).
-- Applied to Supabase project "StrongBraveCourageous" (weaoqfeujfgakjogzepq) on Oct 3, 2026.
--
-- Written so the page already live keeps working before the new code is pushed:
--   * the new column has a default, so older inserts are unaffected;
--   * the older six-value submit_memory stays and now hands over to the new one with no tags;
--   * nothing is dropped.
-- The new submit_memory takes a seventh value, p_tags. It has no default on purpose: two versions of one
-- function that could both answer a six-value call would be ambiguous. The new page always sends p_tags
-- (an empty list when nothing is ticked). Public writes still go through submit_memory only.
alter table public.memories add column tags text[] not null default '{}'
  constraint memories_tags_allowed check (tags <@ array['steve', 'mason', 'josh', 'family']::text[] and cardinality(tags) <= 4);
create index memories_tags on public.memories using gin (tags);
grant select (tags) on public.memories to anon;          -- the public reads tags on approved rows
grant update (tags) on public.memories to authenticated; -- approvers edit tags (row rule: wall_admins only)

create function public.submit_memory(
  p_first_name text, p_memory text, p_photo_path text, p_youtube_id text,
  p_photo_permission boolean, p_email text, p_tags text[]
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_tags text[] := coalesce((select array_agg(distinct t order by t) from unnest(coalesce(p_tags, '{}'::text[])) t), '{}'::text[]);
begin
  if not (v_tags <@ array['steve', 'mason', 'josh', 'family']::text[]) then
    raise exception 'bad_tag' using errcode = 'WB005';
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
  insert into public.memories (first_name, memory, photo_path, youtube_id, photo_permission, status, heart_count, tags)
  values (btrim(p_first_name), btrim(p_memory), v_photo, nullif(btrim(coalesce(p_youtube_id, '')), ''),
          coalesce(p_photo_permission, false), 'pending', 0, v_tags)
  returning id into v_id;
  if v_email is not null then
    insert into public.memory_contacts (memory_id, email) values (v_id, v_email);
  end if;
end $$;
revoke all on function public.submit_memory(text, text, text, text, boolean, text, text[]) from public;
grant execute on function public.submit_memory(text, text, text, text, boolean, text, text[]) to anon, authenticated;

-- The older six-value version (used by the page live before this change) now hands over to the new one.
create or replace function public.submit_memory(
  p_first_name text, p_memory text, p_photo_path text default null, p_youtube_id text default null,
  p_photo_permission boolean default false, p_email text default null
) returns void
language sql security definer set search_path = ''
as $$
  select public.submit_memory(p_first_name, p_memory, p_photo_path, p_youtube_id, p_photo_permission, p_email, '{}'::text[]);
$$;

-- The wall's list, search, and filter in one function. It replaces wall_memories (migration 004), which is
-- left in place but switched off for the public; it can be dropped once Yvonne confirms the drop.
create function public.wall_page(p_query text default null, p_tag text default null, p_limit integer default 21, p_offset integer default 0)
returns table (id uuid, created_at timestamptz, approved_at timestamptz, first_name text, memory text, photo_path text, youtube_id text, heart_count integer, tags text[])
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select case when nullif(btrim(coalesce(p_query, '')), '') is null then null
      else '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat,
      nullif(btrim(coalesce(p_tag, '')), '') as tag
  )
  select m.id, m.created_at, m.approved_at, m.first_name, m.memory, m.photo_path, m.youtube_id, m.heart_count, m.tags
  from public.memories m, q
  where m.status = 'approved'
    and (q.pat is null or m.first_name ilike q.pat or m.memory ilike q.pat)
    and (q.tag is null or m.tags @> array[q.tag])
  order by m.approved_at desc nulls last, m.id desc
  limit least(greatest(coalesce(p_limit, 21), 1), 51) offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.wall_page(text, text, integer, integer) from public;
grant execute on function public.wall_page(text, text, integer, integer) to anon, authenticated;
revoke execute on function public.wall_memories(text, integer, integer) from anon, authenticated;
notify pgrst, 'reload schema';
