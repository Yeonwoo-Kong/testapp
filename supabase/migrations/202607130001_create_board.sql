-- 게시판: 게시글, 첨부파일, 좋아요 및 보안 정책
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  title varchar(200) not null check (char_length(trim(title)) between 1 and 200),
  content text not null check (char_length(trim(content)) > 0),
  password_hash text not null,
  is_secret boolean not null default false,
  like_count integer not null default 0 check (like_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id bigint not null references public.posts(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type varchar(100),
  file_size bigint not null check (file_size >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists posts_title_search_idx on public.posts (title);
create index if not exists posts_author_name_search_idx on public.posts (author_name);
create index if not exists posts_visibility_idx on public.posts (is_secret, author_id, created_at desc);
create index if not exists post_attachments_post_id_idx on public.post_attachments (post_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);

alter table public.posts enable row level security;
alter table public.post_attachments enable row level security;
alter table public.post_likes enable row level security;

-- 공개글과 자신이 작성한 비밀글만 조회할 수 있습니다.
create policy "Authenticated users can view permitted posts"
  on public.posts for select to authenticated
  using (not is_secret or author_id = (select auth.uid()));

create policy "Authors can view attachments of permitted posts"
  on public.post_attachments for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (not p.is_secret or p.author_id = (select auth.uid()))
  ));

create policy "Authors can add attachments to their posts"
  on public.post_attachments for insert to authenticated
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ));

create policy "Authors can delete attachments from their posts"
  on public.post_attachments for delete to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ));

create policy "Users can view likes on permitted posts"
  on public.post_likes for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (not p.is_secret or p.author_id = (select auth.uid()))
  ));

create policy "Users can like permitted posts"
  on public.post_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and (not p.is_secret or p.author_id = (select auth.uid()))
    )
  );

create policy "Users can cancel their own likes"
  on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- 게시글 비밀번호를 서버에서 해시하여 저장합니다.
create or replace function public.create_post(
  p_title text,
  p_content text,
  p_password text,
  p_is_secret boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_post_id bigint;
  resolved_author_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if char_length(p_password) < 4 then raise exception '게시글 비밀번호는 4자 이상이어야 합니다.'; end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(auth.jwt() ->> 'email', ''), '사용자')
    into resolved_author_name
    from public.profiles p
    where p.id = auth.uid();
  resolved_author_name := coalesce(resolved_author_name, nullif(auth.jwt() ->> 'email', ''), '사용자');

  insert into public.posts (author_id, author_name, title, content, password_hash, is_secret)
  values (
    auth.uid(), resolved_author_name, trim(p_title), trim(p_content),
    crypt(p_password, gen_salt('bf')), coalesce(p_is_secret, false)
  )
  returning id into new_post_id;

  return new_post_id;
end;
$$;

create or replace function public.update_post(
  p_post_id bigint,
  p_title text,
  p_content text,
  p_password text,
  p_is_secret boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.posts
  set title = trim(p_title), content = trim(p_content),
      is_secret = coalesce(p_is_secret, false), updated_at = now()
  where id = p_post_id
    and author_id = auth.uid()
    and password_hash = crypt(p_password, password_hash);

  if not found then raise exception '게시글 비밀번호가 틀렸거나 수정 권한이 없습니다.'; end if;
end;
$$;

create or replace function public.delete_post(p_post_id bigint, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.posts
  where id = p_post_id
    and author_id = auth.uid()
    and password_hash = crypt(p_password, password_hash);

  if not found then raise exception '게시글 비밀번호가 틀렸거나 삭제 권한이 없습니다.'; end if;
end;
$$;

revoke all on function public.create_post(text, text, text, boolean) from public;
revoke all on function public.update_post(bigint, text, text, text, boolean) from public;
revoke all on function public.delete_post(bigint, text) from public;
grant execute on function public.create_post(text, text, text, boolean) to authenticated;
grant execute on function public.update_post(bigint, text, text, text, boolean) to authenticated;
grant execute on function public.delete_post(bigint, text) to authenticated;

-- 좋아요 테이블 변경 시 목록용 like_count를 자동 갱신합니다.
create or replace function public.sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

drop trigger if exists sync_post_like_count_trigger on public.post_likes;
create trigger sync_post_like_count_trigger
after insert or delete on public.post_likes
for each row execute function public.sync_post_like_count();

-- 첨부파일용 비공개 Storage 버킷입니다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-files', 'board-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy "Users can upload board files to their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'board-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users can read permitted board files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'board-files'
    and exists (
      select 1
      from public.post_attachments a
      join public.posts p on p.id = a.post_id
      where a.storage_path = name
        and (not p.is_secret or p.author_id = (select auth.uid()))
    )
  );

create policy "Users can delete their board files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'board-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
