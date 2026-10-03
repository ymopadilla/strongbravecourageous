-- Memorial wall: the list and the search, as one database function.
-- Applied to Supabase project "StrongBraveCourageous" (weaoqfeujfgakjogzepq) on Oct 3, 2026.
-- wall_memories returns approved memories only, newest approved first, a page at a time. With p_query it
-- searches first name and memory text across the whole wall: partial matches, not case-sensitive. The
-- words typed are matched literally (%, _ and \ have no special meaning). It runs with the caller's own
-- rights, so the same row rules apply as for any other read. The page already live does not use it.
create function public.wall_memories(p_query text default null, p_limit integer default 21, p_offset integer default 0)
returns table (id uuid, created_at timestamptz, approved_at timestamptz, first_name text, memory text, photo_path text, youtube_id text, heart_count integer)
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select case when nullif(btrim(coalesce(p_query, '')), '') is null then null
      else '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  )
  select m.id, m.created_at, m.approved_at, m.first_name, m.memory, m.photo_path, m.youtube_id, m.heart_count
  from public.memories m, q
  where m.status = 'approved'
    and (q.pat is null or m.first_name ilike q.pat or m.memory ilike q.pat)
  order by m.approved_at desc nulls last, m.id desc
  limit least(greatest(coalesce(p_limit, 21), 1), 51) offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.wall_memories(text, integer, integer) from public;
grant execute on function public.wall_memories(text, integer, integer) to anon, authenticated;
notify pgrst, 'reload schema';
