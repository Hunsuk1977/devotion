-- Daily Devotional — Supabase schema
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

-- 1) 언어 목록 (앱의 i18n.ts LANGUAGES 와 동일하게 유지)
create table if not exists public.languages (
  code     text primary key,          -- 'ko', 'en', 'es' ...
  label    text not null,             -- '한국어', 'English'
  sort     int  not null default 0,
  enabled  boolean not null default true
);

insert into public.languages (code, label, sort) values
  ('ko', '한국어', 1),
  ('en', 'English', 2)
on conflict (code) do nothing;

-- 2) 묵상 본문: 날짜 × 언어 = 1건
create table if not exists public.devotionals (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  lang           text not null references public.languages(code),
  title          text not null,
  scripture_ref  text,                -- '요한복음 3:16'
  scripture_text text,                -- 성경 본문
  body_md        text not null,       -- 묵상 내용 (Markdown)
  status         text not null default 'published'
                 check (status in ('draft','published')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (date, lang)
);

create index if not exists devotionals_lang_date_idx
  on public.devotionals (lang, date desc) where status = 'published';

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists devotionals_set_updated_at on public.devotionals;
create trigger devotionals_set_updated_at
  before update on public.devotionals
  for each row execute function public.set_updated_at();

-- 3) 접근 제어 (RLS)
--    - 누구나: 게시(published) 된 글 읽기
--    - 로그인한 관리자(authenticated): 모든 읽기/쓰기
--    관리자 계정은 Supabase > Authentication > Users 에서 이메일/비밀번호로 생성.
alter table public.languages   enable row level security;
alter table public.devotionals enable row level security;

drop policy if exists "languages: public read" on public.languages;
create policy "languages: public read"
  on public.languages for select using (true);

drop policy if exists "devotionals: public read published" on public.devotionals;
create policy "devotionals: public read published"
  on public.devotionals for select
  using (status = 'published' or auth.role() = 'authenticated');

drop policy if exists "devotionals: admin write" on public.devotionals;
create policy "devotionals: admin write"
  on public.devotionals for all
  to authenticated
  using (true) with check (true);

-- (선택) 특정 이메일만 관리자로 제한하고 싶다면 위 정책의 using/with check 를
--   (auth.jwt() ->> 'email') in ('baehs@mmcnyc.org')
-- 처럼 바꾸세요.
