-- Run this once in your Supabase project's SQL editor (Dashboard ->
-- SQL Editor -> New query -> paste -> Run). Safe to re-run (uses
-- IF NOT EXISTS / OR REPLACE where possible).

create table if not exists progress (
  user_id uuid references auth.users (id) on delete cascade,
  stage_id text not null,
  puzzle_id int not null,
  solved_at timestamptz not null default now(),
  primary key (user_id, stage_id, puzzle_id)
);

alter table progress enable row level security;

drop policy if exists "select own progress" on progress;
create policy "select own progress"
  on progress for select
  using (auth.uid() = user_id);

drop policy if exists "insert own progress" on progress;
create policy "insert own progress"
  on progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own progress" on progress;
create policy "update own progress"
  on progress for update
  using (auth.uid() = user_id);
