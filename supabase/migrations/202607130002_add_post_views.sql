-- 로그인 사용자별 게시글 조회수를 1회만 집계합니다.
-- 최초 게시판 마이그레이션을 이미 적용한 프로젝트도 안전하게 업그레이드합니다.
alter table public.posts
  add column if not exists view_count integer not null default 0
  check (view_count >= 0);

create table if not exists public.post_views (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_views enable row level security;

create or replace function public.record_post_view(p_post_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  current_count integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (
    select 1 from public.posts
    where id = p_post_id and (not is_secret or author_id = auth.uid())
  ) then raise exception '게시글을 찾을 수 없습니다.'; end if;

  insert into public.post_views (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    update public.posts set view_count = view_count + 1 where id = p_post_id;
  end if;

  select view_count into current_count from public.posts where id = p_post_id;
  return current_count;
end;
$$;

revoke all on function public.record_post_view(bigint) from public;
grant execute on function public.record_post_view(bigint) to authenticated;

-- 이미지, PDF, 문서 및 압축파일만 허용합니다. 파일당 제한은 10MB입니다.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip', 'application/x-zip-compressed',
      'application/x-7z-compressed', 'application/x-rar-compressed'
    ]
where id = 'board-files';
