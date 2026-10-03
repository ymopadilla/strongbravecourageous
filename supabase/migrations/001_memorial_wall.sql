-- Memorial wall: tables, rules, and photo storage.
-- Applied to Supabase project "StrongBraveCourageous" (weaoqfeujfgakjogzepq) on Oct 3, 2026 (UTC).
--
-- Shape of the rules:
--   * The public (the key in site code) can READ approved memories and approved comments. Nothing else.
--   * The public never inserts into a table directly. Three functions do it: submit_memory, submit_comment,
--     add_heart. Each one checks its input, forces status 'pending', and returns nothing about pending rows.
--   * Admins are signed-in users listed in wall_admins. Sign-ups are off; users are invited by Yvonne.
--   * Visitor email (optional) lives in its own table, readable by admins only.

-- ---------- tables ----------
create table public.wall_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 40),
  memory text not null check (char_length(btrim(memory)) between 1 and 4000),
  -- file name in the memorial-pending bucket: <uuid>.jpg and nothing else
  photo_path text unique check (photo_path is null or photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'),
  youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  photo_permission boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  heart_count integer not null default 0 check (heart_count >= 0),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint photo_needs_permission check (photo_path is null or photo_permission)
);
create index memories_status_created on public.memories (status, created_at desc);

create table public.memory_contacts (
  memory_id uuid primary key references public.memories (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  created_at timestamptz not null default now(),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 40),
  comment text not null check (char_length(btrim(comment)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);
create index comments_memory_status on public.comments (memory_id, status, created_at);
create index comments_status on public.comments (status);

create table public.hearts (
  memory_id uuid not null references public.memories (id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (memory_id, device_id)
);

alter table public.wall_admins enable row level security;
alter table public.memories enable row level security;
alter table public.memory_contacts enable row level security;
alter table public.comments enable row level security;
alter table public.hearts enable row level security;

-- ---------- who is an admin ----------
create function public.is_wall_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.wall_admins a where a.user_id = (select auth.uid())); $$;
revoke all on function public.is_wall_admin() from public;
grant execute on function public.is_wall_admin() to anon, authenticated;

-- ---------- grants (new tables are not exposed until granted) ----------
revoke all on public.wall_admins, public.memories, public.memory_contacts, public.comments, public.hearts from anon, authenticated;

grant select (id, created_at, first_name, memory, photo_path, youtube_id, heart_count, status) on public.memories to anon;
grant select on public.memories to authenticated;
grant update (status, reviewed_at, reviewed_by, photo_path), delete on public.memories to authenticated;

grant select (id, memory_id, created_at, first_name, comment, status) on public.comments to anon;
grant select on public.comments to authenticated;
grant update (status, reviewed_at, reviewed_by), delete on public.comments to authenticated;

grant select on public.memory_contacts to authenticated;
grant select on public.hearts to authenticated;
grant select on public.wall_admins to authenticated;

-- ---------- row-level security ----------
create policy "read approved memories" on public.memories for select to anon, authenticated
  using (status = 'approved' or (select public.is_wall_admin()));
create policy "admins update memories" on public.memories for update to authenticated
  using ((select public.is_wall_admin())) with check ((select public.is_wall_admin()));
create policy "admins delete memories" on public.memories for delete to authenticated
  using ((select public.is_wall_admin()));

create policy "read approved comments" on public.comments for select to anon, authenticated
  using ((status = 'approved' and exists (select 1 from public.memories m where m.id = memory_id and m.status = 'approved'))
         or (select public.is_wall_admin()));
create policy "admins update comments" on public.comments for update to authenticated
  using ((select public.is_wall_admin())) with check ((select public.is_wall_admin()));
create policy "admins delete comments" on public.comments for delete to authenticated
  using ((select public.is_wall_admin()));

create policy "admins read contacts" on public.memory_contacts for select to authenticated
  using ((select public.is_wall_admin()));
create policy "admins read hearts" on public.hearts for select to authenticated
  using ((select public.is_wall_admin()));
create policy "admins read own row" on public.wall_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- flood cap: refuse new rows while too many are waiting ----------
create function public.wall_flood_cap() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'memories' then
    if (select count(*) from public.memories where status = 'pending') >= 200 then
      raise exception 'wall_busy' using errcode = 'WB001';
    end if;
  else
    if (select count(*) from public.comments where status = 'pending') >= 500 then
      raise exception 'wall_busy' using errcode = 'WB001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.wall_flood_cap() from public, anon, authenticated;
create trigger memories_flood_cap before insert on public.memories for each row execute function public.wall_flood_cap();
create trigger comments_flood_cap before insert on public.comments for each row execute function public.wall_flood_cap();

-- ---------- public entry points ----------
-- Each returns nothing (or only a public number), so a pending row is never sent back to the visitor.
create function public.submit_memory(
  p_first_name text, p_memory text, p_photo_path text default null, p_youtube_id text default null,
  p_photo_permission boolean default false, p_email text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
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
  insert into public.memories (first_name, memory, photo_path, youtube_id, photo_permission, status, heart_count)
  values (btrim(p_first_name), btrim(p_memory), v_photo, nullif(btrim(coalesce(p_youtube_id, '')), ''),
          coalesce(p_photo_permission, false), 'pending', 0)
  returning id into v_id;
  if v_email is not null then
    insert into public.memory_contacts (memory_id, email) values (v_id, v_email);
  end if;
end $$;

create function public.submit_comment(p_memory_id uuid, p_first_name text, p_comment text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.memories m where m.id = p_memory_id and m.status = 'approved') then
    raise exception 'no_memory' using errcode = 'WB004';
  end if;
  insert into public.comments (memory_id, first_name, comment, status)
  values (p_memory_id, btrim(p_first_name), btrim(p_comment), 'pending');
end $$;

-- One heart per device per memory. Returns the public heart count.
create function public.add_heart(p_memory_id uuid, p_device_id uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if p_device_id is null or not exists (select 1 from public.memories m where m.id = p_memory_id and m.status = 'approved') then
    raise exception 'no_memory' using errcode = 'WB004';
  end if;
  insert into public.hearts (memory_id, device_id) values (p_memory_id, p_device_id) on conflict do nothing;
  update public.memories m set heart_count = (select count(*) from public.hearts h where h.memory_id = p_memory_id)
  where m.id = p_memory_id returning m.heart_count into v_count;
  return v_count;
end $$;

revoke all on function public.submit_memory(text, text, text, text, boolean, text) from public;
revoke all on function public.submit_comment(uuid, text, text) from public;
revoke all on function public.add_heart(uuid, uuid) from public;
grant execute on function public.submit_memory(text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.submit_comment(uuid, text, text) to anon, authenticated;
grant execute on function public.add_heart(uuid, uuid) to anon, authenticated;

-- ---------- photo storage ----------
-- memorial-pending: private. The public may add a file named <uuid>.jpg and nothing else (no read, list, replace, or delete).
-- memorial-photos: public read. Only admins write. Approving a memory copies its photo here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('memorial-pending', 'memorial-pending', false, 5242880, array['image/jpeg']),
  ('memorial-photos', 'memorial-photos', true, 5242880, array['image/jpeg']);

create policy "wall: public adds a pending photo" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'memorial-pending'
              and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');
create policy "wall: admins read photos" on storage.objects for select to authenticated
  using (bucket_id in ('memorial-pending', 'memorial-photos') and (select public.is_wall_admin()));
create policy "wall: admins publish photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'memorial-photos' and (select public.is_wall_admin()));
create policy "wall: admins replace photos" on storage.objects for update to authenticated
  using (bucket_id = 'memorial-photos' and (select public.is_wall_admin()))
  with check (bucket_id = 'memorial-photos' and (select public.is_wall_admin()));
create policy "wall: admins remove photos" on storage.objects for delete to authenticated
  using (bucket_id in ('memorial-pending', 'memorial-photos') and (select public.is_wall_admin()));
