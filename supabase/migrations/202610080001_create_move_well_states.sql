-- Private per-account saved state for the Move Well planner.
create table if not exists public.move_well_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  place text not null default 'home' check (place in ('home','gym','outdoor','busy')),
  level text not null default 'beginner' check (level in ('beginner','regular','experienced')),
  minutes integer not null default 30 check (minutes between 10 and 90),
  days integer not null default 3 check (days between 1 and 7),
  habits text[] not null default '{}',
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  check_date date not null default current_date,
  updated_at timestamptz not null default now(),
  constraint move_well_habits_allowed check (habits <@ array['breakfast','late','sweet','portion']::text[])
);

alter table public.move_well_states enable row level security;
revoke all on public.move_well_states from anon, public;
grant select, insert, update, delete on public.move_well_states to authenticated;

drop policy if exists "Users can read their own move well state" on public.move_well_states;
create policy "Users can read their own move well state"
  on public.move_well_states for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their own move well state" on public.move_well_states;
create policy "Users can insert their own move well state"
  on public.move_well_states for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own move well state" on public.move_well_states;
create policy "Users can update their own move well state"
  on public.move_well_states for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own move well state" on public.move_well_states;
create policy "Users can delete their own move well state"
  on public.move_well_states for delete to authenticated using (auth.uid() = user_id);
