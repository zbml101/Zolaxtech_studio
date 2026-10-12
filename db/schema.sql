-- ZolaxTech Studio: database schema for Supabase (PostgreSQL)
--
-- How to use: Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
-- It is safe to run more than once.
--
-- Every table has a user_id column and row-level security, so each signed-in user
-- can only ever read or change their own rows. The hosted server never needs the
-- secret "service_role" key: it talks to the database with the signed-in user's own token.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- settings (one row per user)
create table if not exists public.settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  channel_name     text not null default 'ZolaxTech' check (char_length(channel_name) between 1 and 60),
  first_record_day date not null check (extract(isodow from first_record_day) = 2),  -- must be a Tuesday
  publish_offset   int  not null default 4 check (publish_offset between 1 and 6),   -- days after Tuesday (4 = Saturday)
  recording_method text not null default 'live' check (recording_method in ('live', 'voiceover')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- videos (the content calendar)
create table if not exists public.videos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position     int  not null check (position >= 1),            -- week number; dates are calculated from it
  series       text not null check (char_length(series) between 1 and 60),
  title        text not null check (char_length(title) between 1 and 200),
  title_am     text not null default '' check (char_length(title_am) <= 200),
  key_points   text not null default '' check (char_length(key_points) <= 2000),
  stage        text not null default 'planned'
               check (stage in ('planned', 'scripted', 'recorded', 'edited', 'thumbnail', 'scheduled', 'published')),
  script       jsonb not null default '{}'::jsonb,              -- { partId: { en: "...", am: "..." } }
  checklist    jsonb not null default '{}'::jsonb,              -- { itemId: true }
  views_7d     int check (views_7d is null or views_7d >= 0),
  video_url    text not null default '' check (char_length(video_url) <= 300),
  notes        text not null default '' check (char_length(notes) <= 10000),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists videos_user_position_idx on public.videos (user_id, position);

drop trigger if exists videos_updated_at on public.videos;
create trigger videos_updated_at before update on public.videos
  for each row execute function public.set_updated_at();

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- ideas
create table if not exists public.ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series     text not null default 'General' check (char_length(series) between 1 and 60),
  idea       text not null check (char_length(idea) between 1 and 300),
  format     text not null default 'Long' check (format in ('Long', 'Short', 'Series', 'Community', 'Setup')),
  priority   text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  why        text not null default '' check (char_length(why) <= 500),
  used       boolean not null default false,
  video_id   uuid references public.videos (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ideas_user_idx on public.ideas (user_id);

-- ---------------------------------------------------------------- to-dos (anything that is not in the weekly routine)
create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  due_date   date,
  done       boolean not null default false,
  done_at    timestamptz,
  video_id   uuid references public.videos (id) on delete set null,
  tag        text not null default '' check (char_length(tag) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos (user_id, done);

-- ---------------------------------------------------------------- weekly routine ticks
create table if not exists public.routine_done (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,                                      -- the Sunday of that week
  task_key   text not null check (char_length(task_key) between 1 and 60),
  done_at    timestamptz not null default now(),
  primary key (user_id, week_start, task_key)
);

-- ---------------------------------------------------------------- 4-week reviews
create table if not exists public.reviews (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block       int  not null check (block between 1 and 30),
  worked      text not null default '' check (char_length(worked) <= 5000),
  change_next text not null default '' check (char_length(change_next) <= 5000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, block)
);

drop trigger if exists reviews_updated_at on public.reviews;
create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- functions that keep week numbers consistent
-- They run as the signed-in user ("security invoker"), so row-level security still applies.

create or replace function public.add_video_at(
  p_position   int,
  p_series     text,
  p_title      text,
  p_key_points text default ''
)
returns public.videos
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_max int;
  v_pos int;
  v_row public.videos;
begin
  select coalesce(max(position), 0) into v_max from public.videos where user_id = auth.uid();
  v_pos := greatest(1, least(coalesce(p_position, v_max + 1), v_max + 1));

  update public.videos
     set position = position + 1
   where user_id = auth.uid() and position >= v_pos;

  insert into public.videos (position, series, title, key_points)
  values (v_pos, p_series, p_title, coalesce(p_key_points, ''))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_video(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pos int;
begin
  select position into v_pos from public.videos where id = p_id and user_id = auth.uid();
  if v_pos is null then
    return;
  end if;

  delete from public.videos where id = p_id and user_id = auth.uid();

  update public.videos
     set position = position - 1
   where user_id = auth.uid() and position > v_pos;
end;
$$;

create or replace function public.reorder_videos(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.videos where user_id = auth.uid();
  if coalesce(array_length(p_ids, 1), 0) <> v_count then
    raise exception 'reorder_videos needs every video id exactly once (% given, % expected)',
      coalesce(array_length(p_ids, 1), 0), v_count;
  end if;

  update public.videos v
     set position = o.ord
    from unnest(p_ids) with ordinality as o (id, ord)
   where v.id = o.id and v.user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------- row-level security
alter table public.settings     enable row level security;
alter table public.videos       enable row level security;
alter table public.ideas        enable row level security;
alter table public.todos        enable row level security;
alter table public.routine_done enable row level security;
alter table public.reviews      enable row level security;

drop policy if exists "own rows" on public.settings;
drop policy if exists "own rows" on public.videos;
drop policy if exists "own rows" on public.ideas;
drop policy if exists "own rows" on public.todos;
drop policy if exists "own rows" on public.routine_done;
drop policy if exists "own rows" on public.reviews;

create policy "own rows" on public.settings     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.videos       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.ideas        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.todos        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.routine_done for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.reviews      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- permissions
-- Only signed-in users may use the tables and functions. Visitors who are not signed in get nothing.
revoke all on public.settings, public.videos, public.ideas, public.todos, public.routine_done, public.reviews from anon;
grant select, insert, update, delete on public.settings, public.videos, public.ideas, public.todos, public.routine_done, public.reviews to authenticated;

revoke all on function public.add_video_at(int, text, text, text) from public, anon;
revoke all on function public.delete_video(uuid) from public, anon;
revoke all on function public.reorder_videos(uuid[]) from public, anon;
grant execute on function public.add_video_at(int, text, text, text) to authenticated;
grant execute on function public.delete_video(uuid) to authenticated;
grant execute on function public.reorder_videos(uuid[]) to authenticated;

-- ---------------------------------------------------------------- Google Workspace connection (added after the first release; safe to run again)
alter table public.settings add column if not exists google_sheet_id text check (google_sheet_id is null or char_length(google_sheet_id) <= 200);
alter table public.videos   add column if not exists doc_id  text check (doc_id  is null or char_length(doc_id)  <= 200);
alter table public.videos   add column if not exists doc_url text check (doc_url is null or char_length(doc_url) <= 400);

-- The refresh token is stored encrypted by the server (AES-256-GCM, key kept in the server's environment variables),
-- so reading this table from the browser reveals nothing usable.
create table if not exists public.google_connections (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  refresh_token_enc   text not null,
  google_email        text not null default '',
  folder_id           text,
  calendar_synced_at  timestamptz,
  created_at          timestamptz not null default now()
);
alter table public.google_connections enable row level security;
drop policy if exists "own rows" on public.google_connections;
create policy "own rows" on public.google_connections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.google_connections from anon;
grant select, insert, update, delete on public.google_connections to authenticated;
