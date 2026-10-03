-- Memorial wall: email alert when a memory or a comment is waiting.
-- Applied to Supabase project "StrongBraveCourageous" (weaoqfeujfgakjogzepq) on Oct 3, 2026 (UTC).
--
-- How it works: a new memory or comment makes the database call the Netlify function "memorial-alert" on the
-- live site, at most once every 10 minutes. The call carries a shared secret. The function checks it against
-- the Netlify variable WALL_ALERT_SECRET, then files a "memorial-alert" Netlify form entry, and Netlify's own
-- form notifications send the email to Becky and Yvonne. No visitor text or email travels in the alert.
--
-- The secret is generated inside the database and stored in Supabase Vault (name: wall_alert_secret).
-- It is never written in this repository.
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'wall_alert_secret',
  'Memorial wall: shared secret between the database alert and the Netlify function memorial-alert (Netlify variable WALL_ALERT_SECRET)');

create table public.wall_alert_state (
  id boolean primary key default true check (id),
  last_sent timestamptz
);
insert into public.wall_alert_state (id, last_sent) values (true, null);
alter table public.wall_alert_state enable row level security;
revoke all on public.wall_alert_state from anon, authenticated;

create function public.wall_alert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_secret text; v_due boolean;
begin
  begin
    -- at most one alert every 10 minutes, however many arrive
    update public.wall_alert_state set last_sent = now()
      where id and (last_sent is null or last_sent < now() - interval '10 minutes')
      returning true into v_due;
    if v_due then
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'wall_alert_secret';
      perform net.http_post(
        url := 'https://strongbravecourageous.com/.netlify/functions/memorial-alert',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-wall-secret', v_secret),
        body := jsonb_build_object(
          'kind', tg_table_name,
          'waiting_memories', (select count(*) from public.memories where status = 'pending'),
          'waiting_comments', (select count(*) from public.comments where status = 'pending')),
        timeout_milliseconds := 5000);
    end if;
  exception when others then
    null; -- an alert problem must never stop a memory or a comment from being saved
  end;
  return null;
end $$;
revoke all on function public.wall_alert() from public, anon, authenticated;
create trigger memories_alert after insert on public.memories for each row execute function public.wall_alert();
create trigger comments_alert after insert on public.comments for each row execute function public.wall_alert();
