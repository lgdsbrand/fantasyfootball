-- Weekly actual production, for "top producers".
-- Projections say what might happen; this says what did.

create table if not exists public.ff_stats (
  sleeper_id  text not null,
  season      integer not null,
  week        integer not null,
  points      numeric,
  updated_at  timestamptz default now(),
  primary key (sleeper_id, season, week)
);
create index if not exists ff_stats_week_idx on public.ff_stats (season, week, points desc);

alter table public.ff_stats enable row level security;

drop policy if exists "ff_stats read" on public.ff_stats;
create policy "ff_stats read" on public.ff_stats for select using (true);

-- Season-long projections reuse ff_projections with week 0, which means
-- "whole season" rather than any particular week. No schema change needed.
comment on table public.ff_projections is
  'Projected points. week > 0 is that week; week = 0 is the season total.';