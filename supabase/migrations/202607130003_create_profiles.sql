-- 사용자 프로필 테이블 및 기존 회원 이관
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 현재 auth.users에 존재하는 회원을 profiles에 이관합니다.
insert into public.profiles (id, display_name, created_at, updated_at)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(email, '@', 1), ''),
    '사용자'
  ),
  created_at,
  coalesce(updated_at, created_at)
from auth.users
on conflict (id) do update
set display_name = coalesce(
  nullif(public.profiles.display_name, ''),
  excluded.display_name
);

-- 신규 회원가입 시 프로필을 자동 생성합니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      '사용자'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profile_updated_at_trigger on public.profiles;
create trigger set_profile_updated_at_trigger
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();
