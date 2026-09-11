-- Daily Devotional — Supabase schema
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- (GitHub 모드로 운영한다면 이 파일은 쓰지 않아도 됩니다.)

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

-- 2) 묵상집 (collections.json 과 같은 내용)
create table if not exists public.collections (
  slug        text primary key,       -- 'tozer', 'pastor' ...
  sort        int  not null default 0,
  source      text not null default 'manual'
              check (source in ('email','web','manual')),
  name        jsonb not null,         -- {"ko":"토저의 기독교 리더십","en":"Tozer on ..."}
  description jsonb,
  enabled     boolean not null default true
);

insert into public.collections (slug, sort, source, name, description) values
  ('tozer', 1, 'email',
   '{"ko":"토저의 기독교 리더십","en":"Tozer on Christian Leadership"}'::jsonb,
   '{"ko":"A.W. 토저의 글에서 길어 올린 사역자를 위한 묵상.","en":"Daily reflections for ministers drawn from A.W. Tozer."}'::jsonb),
  ('pastor', 2, 'manual',
   '{"ko":"목회자 칼럼","en":"Pastor''s Column"}'::jsonb,
   '{"ko":"직접 쓰는 묵상과 주간 칼럼.","en":"Devotionals and weekly columns written in house."}'::jsonb)
on conflict (slug) do nothing;

-- 3) 묵상 본문: 묵상집 × 날짜 × 언어 = 1건
create table if not exists public.devotionals (
  id             uuid primary key default gen_random_uuid(),
  collection     text not null references public.collections(slug) on update cascade,
  date           date not null,
  lang           text not null references public.languages(code),
  title          text not null,
  series         text,                -- 원문의 시리즈명
  source_label   text,                -- 원문에 적힌 날짜 표기
  scripture_ref  text,                -- '이사야 51:16'
  scripture_text text,
  body_md        text not null,       -- 묵상 내용 (Markdown)
  status         text not null default 'published'
                 check (status in ('draft','published')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (collection, date, lang)
);

create index if not exists devotionals_browse_idx
  on public.devotionals (collection, lang, date desc) where status = 'published';
create index if not exists devotionals_date_idx
  on public.devotionals (date, lang) where status = 'published';

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

-- 4) 접근 제어 (RLS)
--    - 누구나: 게시(published) 된 글과 묵상집·언어 목록 읽기
--    - 로그인한 관리자(authenticated): 모든 읽기/쓰기
alter table public.languages   enable row level security;
alter table public.collections enable row level security;
alter table public.devotionals enable row level security;

drop policy if exists "languages: public read" on public.languages;
create policy "languages: public read"
  on public.languages for select using (true);

drop policy if exists "collections: public read" on public.collections;
create policy "collections: public read"
  on public.collections for select using (enabled or auth.role() = 'authenticated');

drop policy if exists "collections: admin write" on public.collections;
create policy "collections: admin write"
  on public.collections for all to authenticated using (true) with check (true);

drop policy if exists "devotionals: public read published" on public.devotionals;
create policy "devotionals: public read published"
  on public.devotionals for select
  using (status = 'published' or auth.role() = 'authenticated');

drop policy if exists "devotionals: admin write" on public.devotionals;
create policy "devotionals: admin write"
  on public.devotionals for all to authenticated using (true) with check (true);

-- (선택) 특정 이메일만 관리자로 제한하려면 위 정책의 using/with check 를
--   (auth.jwt() ->> 'email') in ('baehs@mmcnyc.org')
-- 처럼 바꾸세요.
