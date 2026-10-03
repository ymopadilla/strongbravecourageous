# Memorial wall: plan for approval (Oct 2, 2026)

Status: **waiting for Yvonne's approval. Nothing has been created in Supabase.**
Project: Supabase "StrongBraveCourageous" (`weaoqfeujfgakjogzepq`, ca-central-1). It is empty today: no public tables, no storage buckets.

## How it works
- The Memorial wall page talks to Supabase from the browser with the **public (publishable) key only**. Row-level security decides what that key can do.
- Visitors can read approved memories and approved comments, send a memory or a comment (both arrive as pending), and leave one heart per device.
- Becky and Yvonne sign in on a separate approval screen (Supabase login). Their signed-in session, not a secret key, is what allows approving and rejecting.
- **The service key is not used anywhere in this design.** It stays out of site code, and no Netlify function needs it.

## Tables (schema `public`, row-level security ON for all four)
| Table | Columns | Notes |
|---|---|---|
| `memories` | `id` uuid, `created_at`, `first_name` (1–40 chars), `memory` (1–4,000 chars), `photo_path` (optional), `youtube_id` (optional, 11 characters, checked), `photo_permission` boolean, `status` (`pending` / `approved` / `rejected`, default `pending`), `heart_count` int default 0, `reviewed_at`, `reviewed_by` | Rejected rows are kept, hidden, so a decision can be undone. |
| `comments` | `id`, `memory_id` → memories, `created_at`, `first_name` (1–40), `comment` (1–1,000), `status` (same three values) | Held for approval. |
| `hearts` | `memory_id` → memories, `device_id` uuid, `created_at`; primary key (`memory_id`, `device_id`) | One per device, no login. The device ID is a random value kept in the browser. A database trigger keeps `heart_count` current. |
| `wall_admins` | `user_id` → Supabase login user | The allow-list for the approval screen: Becky and Yvonne. |

No email addresses or last names are collected from visitors.

## Rules (explicit grants plus row-level security)
| Who | memories | comments | hearts | wall_admins |
|---|---|---|---|---|
| Public (key in site code) | Read approved rows only. Insert only the form columns; `status` is forced to `pending` and `heart_count` to 0. No update, no delete. | Read approved only. Insert as pending, and only on an approved memory. | Insert only, on an approved memory. Cannot read other devices' hearts. | No access |
| Signed-in admin (in `wall_admins`) | Read all, set status, delete | Read all, set status, delete | Read | Read own row |
| Signed-in but not on the list | Same as public | Same as public | Same as public | No access |

## Photos (storage)
- Bucket `memorial-pending`, private: the public may upload into it and nothing else (no read, no list, no overwrite). Limit 5 MB, JPEG/PNG/WebP only.
- Bucket `memorial-photos`, public read: only admins can write. Approving a memory copies its photo here; rejecting deletes the pending file.
- Photos are resized in the browser to about 1600px on the long side and re-saved as JPEG before upload, so a 10 MB phone photo arrives well under 1 MB and without location data.
- **Change from the brief:** two buckets, not one. A single public bucket would serve an unapproved photo to anyone holding its link. Say so if one bucket is preferred.

## Pages and switch
- `/memorial-wall.html`: header with the blossom cluster, the intro copy from the brief, the wall (newest first, photo, memory, first name, date, optional YouTube shown through youtube-nocookie, heart button, approved comments, comment form), and the form: first name, memory, photo, optional YouTube link, permission checkbox (required when a photo is attached), honeypot.
- `/wall-admin.html`: login, then pending memories and comments with Approve and Reject. Marked noindex, blocked in robots.txt, never in the sitemap or menu.
- `MEMORIAL_WALL = true` in `build.js`: one switch for the page, the nav link (after Fingerprints), and the sitemap entry. Off removes all three; the database is untouched.

## Netlify environment variables
- **Production site:** none added. Existing variables unchanged. PREVIEW is never set here.
- **Preview site:** none added (`PREVIEW=true` only, as today).
- The Supabase address and public key sit in `build.js`, like the Algolia search key.

## Tests (step 9e)
Submit, approve, heart (twice from one device: second is refused), comment, reject, a 10 MB photo, and the page with zero memories. Run locally against this project; every test row and file is removed afterward and the cleanup is reported.

## Decisions needed from Yvonne
1. **Approve this table design and the two-bucket change.**
2. **Logins.** Claude does not create accounts or handle passwords. Yvonne invites two users in Supabase (Authentication → Users → Invite): her own email and Becky's. Claude then adds both to `wall_admins`. Which email for Becky?
3. **Telling Becky a memory is waiting.** The plan above has no notification; the approval screen shows what is pending. An email alert is possible later through a Netlify function, and that is the one piece requiring a secret on the production site. Add it now or later?
4. **Preview site.** Preview and production would share this one database, so a memory sent from the preview is a real pending memory. Acceptable, or should the preview show the wall with the form turned off?
5. **Hearts.** One heart per device, permanent (no un-heart). Fine?
