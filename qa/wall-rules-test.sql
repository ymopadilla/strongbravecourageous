-- Memorial wall: database rule tests.
-- Run in the Supabase SQL editor. The block ends by raising an error ON PURPOSE: the error text is the
-- list of results, and raising it rolls everything back, so no test row or file is left behind.
-- Every line should read as written ("want 0" shows 0, "refused" lines show a code, none say BAD).
do $$
declare v_id uuid; v_cnt int; r text := ''; t text; dev uuid := gen_random_uuid();
begin
  -- as the public (the key in site code)
  perform set_config('role', 'anon', true);
  perform public.submit_memory('Test <script>alert(1)</script>', '<img src=x onerror=alert(1)> hello', null, 'dQw4w9WgXcQ', false, 'Tester@Example.com');
  select count(*) into v_cnt from public.memories; r := r || E'\npublic sees a pending memory, want 0: ' || v_cnt;
  begin insert into public.memories (first_name, memory, status) values ('x', 'y', 'approved'); r := r || E'\npublic direct insert: ALLOWED (BAD)';
  exception when others then r := r || E'\npublic direct insert refused: ' || sqlstate; end;
  begin perform 1 from public.memory_contacts; r := r || E'\npublic reads private emails: ALLOWED (BAD)';
  exception when others then r := r || E'\npublic reads private emails refused: ' || sqlstate; end;
  begin perform 1 from public.hearts; r := r || E'\npublic reads hearts: ALLOWED (BAD)';
  exception when others then r := r || E'\npublic reads hearts refused: ' || sqlstate; end;
  begin perform public.submit_memory('a', 'b', '../evil.jpg', null, true, null); r := r || E'\nbad photo path: ALLOWED (BAD)';
  exception when others then r := r || E'\nbad photo path refused: ' || sqlstate; end;
  begin perform public.submit_memory('a', 'b', '11111111-1111-4111-8111-111111111111.jpg', null, true, null); r := r || E'\nphoto path with no uploaded file: ALLOWED (BAD)';
  exception when others then r := r || E'\nphoto path with no uploaded file refused: ' || sqlstate; end;
  begin perform public.submit_memory('a', 'b', null, 'not-a-video-id!!', false, null); r := r || E'\nbad YouTube id: ALLOWED (BAD)';
  exception when others then r := r || E'\nbad YouTube id refused: ' || sqlstate; end;
  begin perform public.submit_memory('a', 'b', null, null, false, 'not-an-email'); r := r || E'\nbad email: ALLOWED (BAD)';
  exception when others then r := r || E'\nbad email refused: ' || sqlstate; end;
  begin perform public.submit_memory('', 'b'); r := r || E'\nempty name: ALLOWED (BAD)';
  exception when others then r := r || E'\nempty name refused: ' || sqlstate; end;

  -- approve (the owner role stands in for a signed-in approver)
  perform set_config('role', 'postgres', true);
  select id into v_id from public.memories where first_name like 'Test%';
  perform set_config('role', 'anon', true);
  begin perform public.add_heart(v_id, dev); r := r || E'\nheart on a pending memory: ALLOWED (BAD)';
  exception when others then r := r || E'\nheart on a pending memory refused: ' || sqlstate; end;
  begin perform public.submit_comment(v_id, 'c', 'hi'); r := r || E'\ncomment on a pending memory: ALLOWED (BAD)';
  exception when others then r := r || E'\ncomment on a pending memory refused: ' || sqlstate; end;
  perform set_config('role', 'postgres', true);
  update public.memories set status = 'approved' where id = v_id;
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.memories; r := r || E'\npublic sees it after approval, want 1: ' || v_cnt;
  select (first_name like '%<script>%' and memory like '<img%')::text into t from public.memories where id = v_id;
  r := r || E'\nmarkup stored unchanged, as text: ' || t;
  r := r || E'\nheart, want 1: ' || public.add_heart(v_id, dev);
  r := r || E'\nheart again from the same device, want 1: ' || public.add_heart(v_id, dev);
  r := r || E'\nheart from another device, want 2: ' || public.add_heart(v_id, gen_random_uuid());
  perform public.submit_comment(v_id, 'Commenter', 'hello');
  select count(*) into v_cnt from public.comments; r := r || E'\npublic sees a pending comment, want 0: ' || v_cnt;
  perform set_config('role', 'postgres', true);
  update public.comments set status = 'approved' where memory_id = v_id;
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.comments; r := r || E'\npublic sees the approved comment, want 1: ' || v_cnt;

  -- reject
  perform set_config('role', 'postgres', true);
  update public.memories set status = 'rejected' where id = v_id;
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.memories; r := r || E'\npublic sees it after rejection, want 0: ' || v_cnt;
  select count(*) into v_cnt from public.comments; r := r || E'\npublic sees comments of a rejected memory, want 0: ' || v_cnt;

  -- a signed-in user who is NOT on the approval list
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.memories; r := r || E'\nsigned-in stranger sees hidden memories, want 0: ' || v_cnt;
  select count(*) into v_cnt from public.memory_contacts; r := r || E'\nsigned-in stranger sees private emails, want 0: ' || v_cnt;
  update public.memories set status = 'approved' where id = v_id; get diagnostics v_cnt = row_count;
  r := r || E'\nsigned-in stranger approves a memory, want 0: ' || v_cnt;

  -- flood cap
  perform set_config('role', 'postgres', true);
  select count(*) into v_cnt from public.memory_contacts; r := r || E'\nprivate email stored, want 1: ' || v_cnt;
  insert into public.memories (first_name, memory) select 'f', 'f' from generate_series(1, 199);
  perform set_config('role', 'anon', true);
  begin perform public.submit_memory('one more', 'm'); r := r || E'\nmemory number 200: accepted';
  exception when others then r := r || E'\nmemory number 200 refused (BAD): ' || sqlstate; end;
  begin perform public.submit_memory('over the cap', 'm'); r := r || E'\nmemory number 201: ALLOWED (BAD)';
  exception when others then r := r || E'\nmemory number 201 refused: ' || sqlstate || ' ' || sqlerrm; end;

  -- photo storage rules
  begin insert into storage.objects (bucket_id, name) values ('memorial-pending', 'evil.html'); r := r || E'\npublic uploads another file name: ALLOWED (BAD)';
  exception when others then r := r || E'\npublic uploads another file name refused: ' || sqlstate; end;
  begin insert into storage.objects (bucket_id, name) values ('memorial-photos', '33333333-3333-4333-8333-333333333333.jpg'); r := r || E'\npublic uploads to the approved bucket: ALLOWED (BAD)';
  exception when others then r := r || E'\npublic uploads to the approved bucket refused: ' || sqlstate; end;
  begin insert into storage.objects (bucket_id, name) values ('memorial-pending', '22222222-2222-4222-8222-222222222222.jpg'); r := r || E'\npublic uploads <uuid>.jpg to pending: allowed';
  exception when others then r := r || E'\npublic uploads <uuid>.jpg to pending refused (BAD): ' || sqlstate; end;
  select count(*) into v_cnt from storage.objects where bucket_id = 'memorial-pending'; r := r || E'\npublic lists pending files, want 0: ' || v_cnt;

  perform set_config('role', 'postgres', true);
  raise exception 'RESULTS (everything above was rolled back):%', r;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Follow-ups (Oct 3): tags, approval-date order, search, and the older page's six-value call.
-- Run this block separately. Same pattern: the error text is the results, and everything is rolled back.
do $$
declare r text := ''; v int; t text; a uuid; b uuid; c uuid;
begin
  perform set_config('role', 'anon', true);
  -- the page live before these changes: six named values, no tags
  perform public.submit_memory(p_first_name := 'Old page', p_memory := 'six values', p_photo_path := null, p_youtube_id := null, p_photo_permission := false, p_email := null);
  r := r || E'\nolder page call (six values): accepted';
  perform public.submit_memory('Tag none', 'We went fishing', null, null, false, null, '{}');
  perform public.submit_memory('Tag one', 'FISHING with Josh', null, null, false, null, array['josh']);
  perform public.submit_memory('Tag several', '100% true_story', null, null, false, null, array['steve', 'mason', 'family', 'steve']);
  begin perform public.submit_memory('Bad', 'x', null, null, false, null, array['josh', 'someone else']); r := r || E'\ntag outside the four: ALLOWED (BAD)';
  exception when others then r := r || E'\ntag outside the four refused: ' || sqlstate; end;
  begin update public.memories set tags = array['josh'] where first_name = 'Tag none'; r := r || E'\npublic edits tags: ALLOWED (BAD)';
  exception when others then r := r || E'\npublic edits tags refused: ' || sqlstate; end;
  select count(*) into v from public.wall_page(); r := r || E'\npublic sees pending rows through wall_page, want 0: ' || v;

  perform set_config('role', 'postgres', true);
  select string_agg(first_name || '=' || array_to_string(tags, '+'), ', ' order by first_name) into t from public.memories;
  r := r || E'\nstored tags (none, one, several without repeats): ' || t;
  select id into a from public.memories where first_name = 'Tag none';
  select id into b from public.memories where first_name = 'Tag one';
  select id into c from public.memories where first_name = 'Tag several';
  update public.memories set created_at = now() - interval '1 day' where id = a;   -- a was SUBMITTED later than b
  update public.memories set created_at = now() - interval '9 days' where id = b;
  update public.memories set status = 'approved' where id = a;
  perform pg_sleep(0.02);
  update public.memories set status = 'approved', approved_at = '2020-01-01' where id = c;  -- a request cannot choose the date
  begin insert into public.memories (first_name, memory, tags) values ('x', 'y', array['nope']); r := r || E'\ntable accepts a bad tag: (BAD)';
  exception when others then r := r || E'\ntable itself refuses a bad tag: ' || sqlstate; end;

  -- a signed-in user who is NOT on the approval list cannot edit tags
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  update public.memories set tags = array['josh'] where id = a; get diagnostics v = row_count;
  r := r || E'\nsigned-in stranger edits tags, want 0 rows: ' || v;

  perform set_config('role', 'postgres', true);
  perform pg_sleep(0.02);
  update public.memories set status = 'approved' where id = b;   -- b: submitted earliest, approved LAST
  perform set_config('role', 'anon', true);
  select string_agg(first_name, ' > ' order by ord) into t
    from public.wall_page() with ordinality as w(id, created_at, approved_at, first_name, memory, photo_path, youtube_id, heart_count, tags, ord);
  r := r || E'\norder, want Tag one > Tag several > Tag none (newest approved first): ' || t;
  select string_agg(first_name, ',' order by first_name) into t from public.wall_page('fishing'); r := r || E'\nsearch a word, any case, want Tag none,Tag one: ' || t;
  select string_agg(first_name, ',') into t from public.wall_page('tag sev'); r := r || E'\nsearch part of a name, want Tag several: ' || t;
  select count(*) into v from public.wall_page('zzzz'); r := r || E'\nsearch with no match, want 0: ' || v;
  select count(*) into v from public.wall_page('%'); r := r || E'\nsearch for a percent sign is literal, want 1: ' || v;
  select count(*) into v from public.wall_page('_'); r := r || E'\nsearch for an underscore is literal, want 1: ' || v;
  select string_agg(first_name, ',') into t from public.wall_page(null, 'josh'); r := r || E'\nfilter josh, want Tag one: ' || t;
  select string_agg(first_name, ',') into t from public.wall_page(null, 'family'); r := r || E'\nfilter family, want Tag several: ' || t;
  select count(*) into v from public.wall_page('fishing', 'josh'); r := r || E'\nfilter plus search (fishing within josh), want 1: ' || v;
  select count(*) into v from public.wall_page('fishing', 'mason'); r := r || E'\nfilter plus search with no match, want 0: ' || v;
  select count(*) into v from public.wall_page(null, null, 2, 0); r := r || E'\nfirst page of 2, want 2: ' || v;
  select count(*) into v from public.wall_page(null, null, 2, 2); r := r || E'\nnext page, want 1: ' || v;
  perform set_config('role', 'postgres', true);
  raise exception 'RESULTS (everything above was rolled back):%', r;
end $$;
