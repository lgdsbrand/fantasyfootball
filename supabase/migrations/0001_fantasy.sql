-- ===========================================================================
-- Fantasy Hub schema
--
-- Every object is prefixed ff_ and lives in the public schema alongside the
-- existing site tables. Nothing here alters or reads anything that is not ff_.
-- Safe to run more than once.
-- ===========================================================================

-- --- cached player index (from Sleeper, refreshed nightly) -----------------
create table if not exists public.ff_players (
  sleeper_id     text primary key,
  name           text not null,
  position       text,
  team           text,
  age            numeric,
  years_exp      integer,
  search_rank    integer,
  injury_status  text,
  active         boolean default true,
  updated_at     timestamptz default now()
);
create index if not exists ff_players_position_idx on public.ff_players (position);
create index if not exists ff_players_name_idx     on public.ff_players (lower(name));

-- --- trade values (from FantasyCalc, one row per player per format) --------
create table if not exists public.ff_values (
  sleeper_id     text not null,
  format         text not null,          -- e.g. dynasty_1qb_ppr1_12
  value          integer not null default 0,
  overall_rank   integer,
  position_rank  integer,
  trend_30d      integer default 0,
  redraft_value  integer default 0,
  name           text,
  position       text,
  updated_at     timestamptz default now(),
  primary key (sleeper_id, format),
  constraint ff_values_player_fk
    foreign key (sleeper_id) references public.ff_players (sleeper_id) on delete cascade
);
create index if not exists ff_values_board_idx on public.ff_values (format, overall_rank);

-- --- weekly projections ----------------------------------------------------
create table if not exists public.ff_projections (
  sleeper_id  text not null,
  season      integer not null,
  week        integer not null,
  points      numeric,
  updated_at  timestamptz default now(),
  primary key (sleeper_id, season, week)
);

-- --- news feed -------------------------------------------------------------
create table if not exists public.ff_news (
  url           text primary key,
  source        text not null,
  headline      text not null,
  body          text,
  published_at  timestamptz not null default now()
);
create index if not exists ff_news_recent_idx on public.ff_news (published_at desc);

-- --- trending adds ---------------------------------------------------------
create table if not exists public.ff_trending (
  sleeper_id  text primary key,
  name        text,
  position    text,
  team        text,
  adds        integer default 0,
  updated_at  timestamptz default now()
);

-- --- a signed-in user's saved leagues --------------------------------------
create table if not exists public.ff_user_leagues (
  user_id           uuid not null references auth.users (id) on delete cascade,
  league_id         text not null,
  league_name       text,
  sleeper_user_id   text,
  sleeper_username  text,
  roster_id         integer,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  primary key (user_id, league_id)
);

-- ===========================================================================
-- Row level security
--
-- Reference data is world-readable but writable only by the service role,
-- which is what the nightly job uses. Personal data is visible only to its
-- owner. Nothing here grants any access to non-ff_ tables.
-- ===========================================================================

alter table public.ff_players      enable row level security;
alter table public.ff_values       enable row level security;
alter table public.ff_projections  enable row level security;
alter table public.ff_news         enable row level security;
alter table public.ff_trending     enable row level security;
alter table public.ff_user_leagues enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ff_players','ff_values','ff_projections','ff_news','ff_trending']
  loop
    execute format(
      'drop policy if exists "%1$s read" on public.%1$s;
       create policy "%1$s read" on public.%1$s for select using (true);', t);
  end loop;
end $$;

drop policy if exists "own leagues" on public.ff_user_leagues;
create policy "own leagues" on public.ff_user_leagues
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
