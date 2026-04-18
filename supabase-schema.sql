-- ============================================================
-- RECIPE APP — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ── 1. CATEGORIES ───────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer default 99,
  created_at  timestamptz default now()
);

-- Seed the default categories
insert into categories (name, sort_order) values
  ('Starters',    1),
  ('Main dishes', 2),
  ('Desserts',    3),
  ('Drinks',      4),
  ('Prep Meals',  5)
on conflict (name) do nothing;


-- ── 2. RECIPES ──────────────────────────────────────────────
create table if not exists recipes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category_id     uuid references categories(id) on delete set null,

  -- Content
  image_url       text,
  source_url      text,
  servings        integer default 2,

  -- Ingredients and steps stored as arrays
  ingredients     text[]  default '{}',
  steps           text[]  default '{}',

  -- Nutrition scores 1-10
  score_vitamins  integer default 5 check (score_vitamins  between 1 and 10),
  score_proteins  integer default 5 check (score_proteins  between 1 and 10),
  score_carbs     integer default 5 check (score_carbs     between 1 and 10),

  -- Timestamps
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);


-- ── 3. INDEXES (for faster queries) ─────────────────────────
create index if not exists recipes_category_id_idx on recipes(category_id);
create index if not exists recipes_created_at_idx  on recipes(created_at desc);


-- ── 4. ROW LEVEL SECURITY ───────────────────────────────────
-- We use the service role key on the backend, so RLS is off.
-- This is fine since only your backend ever touches the DB.
alter table categories disable row level security;
alter table recipes    disable row level security;


-- ── 5. REALTIME (for sync across your devices) ───────────────
-- Enables live updates so all your devices stay in sync
alter publication supabase_realtime add table recipes;
alter publication supabase_realtime add table categories;


-- ── Done! ────────────────────────────────────────────────────
-- You should now see:
--   Tables: categories (5 rows), recipes (0 rows)
-- in Supabase → Table Editor
